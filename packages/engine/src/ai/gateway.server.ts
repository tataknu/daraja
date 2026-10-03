// Transport for every AI call: an OpenAI Responses-compatible endpoint with strict JSON output.
// A local stack (e.g. an intent classifier + NLLB-200 for translation) can replace it later
// without touching workflow code.
import { createAi } from "./tasks";

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

export async function callTool<T>(system: string, user: string, name: string, parameters: object): Promise<T> {
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

export const gatewayAi = createAi(callTool, MODEL);
