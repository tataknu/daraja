// Single model-adapter module. Every AI call in the app goes through here so a
// local stack (MASSIVE-trained intent classifier + NLLB-200 for translation)
// can replace these implementations later without touching workflow code.

// Lovable's AI gateway by default. Any OpenAI Responses-compatible endpoint works too, which is how
// local runs use OpenAI directly: AI_GATEWAY_URL=https://api.openai.com/v1/responses + AI_MODEL + OPENAI_API_KEY.
const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/responses";
const GATEWAY = process.env["AI_GATEWAY_URL"] || LOVABLE_GATEWAY;
export const MODEL = process.env["AI_MODEL"] || "openai/gpt-6-astra";

function authHeaders(): Record<string, string> {
  if (GATEWAY === LOVABLE_GATEWAY) {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) throw new Error("AI key missing");
    return { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "fetch" };
  }
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new Error("AI key missing");
  return { Authorization: `Bearer ${key}` };
}

export type GuestIntent = "booking_request" | "modify" | "cancel" | "question" | "feedback" | "unknown";
export type HostIntent = "approve" | "decline" | "propose_other_date" | "answer_question" | "unknown";

export interface GuestClassification {
  intent: GuestIntent;
  confidence: number;
  language: string;
  entities: { date_from: string | null; date_to: string | null; party_size: number | null; slot: string | null };
  missing: string[];
  translation_for_noor: string;
  feedback_text: string | null;
}
export interface HostClassification {
  intent: HostIntent;
  booking: string | null;
  confidence: number;
  proposed_date: string | null;
  answer_text_for_guest: string | null;
}

// Strict structured output: every object has additionalProperties:false and all keys required.
function strict(schema: any): any {
  if (schema?.type === "object" || (Array.isArray(schema?.type) && schema.type.includes("object"))) {
    const props = schema.properties ?? {};
    for (const k of Object.keys(props)) props[k] = strict(props[k]);
    return { ...schema, properties: props, required: Object.keys(props), additionalProperties: false };
  }
  if (schema?.type === "array" && schema.items) return { ...schema, items: strict(schema.items) };
  return schema;
}

async function callTool<T>(system: string, user: string, name: string, parameters: object): Promise<T> {
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      instructions: system,
      input: [{ role: "user", content: user }],
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      text: { format: { type: "json_schema", name, strict: true, schema: strict(parameters) } },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`AI error ${res.status}: ${await res.text()}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let ev: any;
      try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === "response.output_text.delta") out += ev.delta ?? "";
      else if (ev.type === "error" || ev.type === "response.failed")
        throw new Error(`AI stream error: ${JSON.stringify(ev.error ?? ev.response?.error ?? ev)}`);
    }
  }
  if (!out) throw new Error("AI returned empty output");
  return JSON.parse(out) as T;
}

export async function classifyGuest(text: string, ctx: { today: string; slots: string[]; booking: string }): Promise<GuestClassification> {
  return callTool<GuestClassification>(
    `You classify emails sent to a small coffee-farm tour operator. Today is ${ctx.today}. Tour slots: ${ctx.slots.join(", ")} (morning = first slot, afternoon = second). Current booking of this guest: ${ctx.booking}.
Rules: dates as ISO YYYY-MM-DD (assume the next future occurrence). slot must be one of the listed slots or null. "missing" lists which of date_from, party_size are still unknown for a booking_request (consider the existing booking). translation_for_noor: faithful Swahili translation of the email. feedback_text: if ANY part of the email expresses an opinion, praise, complaint or suggestion about the farm, tour, host or service (even alongside a question, booking or cancellation), copy that part verbatim in the original language; otherwise null. Choose intent by the main purpose of the email; use "feedback" only when giving feedback is its main purpose. Never invent prices, availability or directions. If unsure, use lower confidence.`,
    text,
    "classify_guest",
    {
      type: "object",
      properties: {
        intent: { type: "string", enum: ["booking_request", "modify", "cancel", "question", "feedback", "unknown"] },
        confidence: { type: "number" },
        language: { type: "string", description: "ISO 639-1 code of the email" },
        entities: {
          type: "object",
          properties: {
            date_from: { type: ["string", "null"] },
            date_to: { type: ["string", "null"] },
            party_size: { type: ["integer", "null"] },
            slot: { type: ["string", "null"] },
          },
        },
        missing: { type: "array", items: { type: "string", enum: ["date_from", "party_size", "slot"] } },
        translation_for_noor: { type: "string" },
        feedback_text: { type: ["string", "null"] },
      },
      required: ["intent", "confidence", "language", "entities", "missing", "translation_for_noor", "feedback_text"],
    },
  );
}

export async function classifyHost(text: string, ctx: { today: string; openPrompts: string }): Promise<HostClassification> {
  return callTool<HostClassification>(
    `You interpret SMS replies (usually Swahili) from Noor, a coffee-farm tour host. Today is ${ctx.today}. Her OPEN prompts:\n${ctx.openPrompts}\n"booking" must be one of the open prompt IDs like "B14", or null. proposed_date as YYYY-MM-DD. answer_text_for_guest: her answer in English, only for answer_question. If unclear use intent unknown.`,
    text,
    "classify_host",
    {
      type: "object",
      properties: {
        intent: { type: "string", enum: ["approve", "decline", "propose_other_date", "answer_question", "unknown"] },
        booking: { type: ["string", "null"] },
        confidence: { type: "number" },
        proposed_date: { type: ["string", "null"] },
        answer_text_for_guest: { type: ["string", "null"] },
      },
      required: ["intent", "booking", "confidence"],
    },
  );
}

export async function translate(text: string, from: string, to: string): Promise<string> {
  if (from === to) return text;
  const r = await callTool<{ translation: string }>(
    `Translate the user's text from ${from} to ${to}. Keep IDs like B14, times, numbers and names unchanged. Output only the translation.`,
    text,
    "translate",
    { type: "object", properties: { translation: { type: "string" } }, required: ["translation"] },
  );
  return r.translation;
}

export async function analyzeFeedback(text: string) {
  return callTool<{ translation_en: string; themes: string[]; sentiment: "positive" | "neutral" | "negative" }>(
    "Analyse guest feedback for a coffee-farm tour. Give an English translation, 1-4 short lowercase themes, and sentiment.",
    text,
    "analyze_feedback",
    {
      type: "object",
      properties: {
        translation_en: { type: "string" },
        themes: { type: "array", items: { type: "string" } },
        sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
      },
      required: ["translation_en", "themes", "sentiment"],
    },
  );
}

export async function summarizeFeedback(items: string) {
  return callTool<{ lines: string[] }>(
    "Summarise guest feedback for Noor in Swahili: 2-3 lines, each under 160 characters: main themes, then what to improve. Use only the given feedback.",
    items,
    "summarize_feedback",
    { type: "object", properties: { lines: { type: "array", items: { type: "string" } } }, required: ["lines"] },
  );
}
