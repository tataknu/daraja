// The AI tasks the engine uses. Each keeps its prompt and output schema together; the transport
// is passed in, so the same tasks run on Lovable's gateway, OpenAI, or a test fake.
import { analyzeReview, groupIdeas, writeInsightsSms } from "./review-tasks";
import type {
  Ai,
  CallTool,
  FeedbackAnalysis,
  GuestClassification,
  HostClassification,
  UsageListener,
} from "./types";

export async function classifyGuest(
  call: CallTool,
  text: string,
  ctx: { today: string; slots: string[]; booking: string },
): Promise<GuestClassification> {
  return call<GuestClassification>(
    `You classify emails sent to a small coffee-farm tour operator. Today is ${ctx.today}. Tour slots: ${ctx.slots.join(", ")} (morning = first slot, afternoon = second). Current booking of this guest: ${ctx.booking}.
Rules: dates as ISO YYYY-MM-DD (assume the next future occurrence). slot must be one of the listed slots or null. "missing" lists which of date_from, party_size are still unknown for a booking_request (consider the existing booking). translation_for_noor: faithful Swahili translation of the email. feedback_text: if ANY part of the email expresses an opinion, praise, complaint or suggestion about the farm, tour, host or service (even alongside a question, booking or cancellation), copy that part verbatim in the original language; otherwise null. Choose intent by the main purpose of the email; use "feedback" only when giving feedback is its main purpose. Never invent prices, availability or directions. If unsure, use lower confidence.`,
    text,
    "classify_guest",
    {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: ["booking_request", "modify", "cancel", "question", "feedback", "unknown"],
        },
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
        missing: {
          type: "array",
          items: { type: "string", enum: ["date_from", "party_size", "slot"] },
        },
        translation_for_noor: { type: "string" },
        feedback_text: { type: ["string", "null"] },
      },
      required: [
        "intent",
        "confidence",
        "language",
        "entities",
        "missing",
        "translation_for_noor",
        "feedback_text",
      ],
    },
  );
}

export async function classifyHost(
  call: CallTool,
  text: string,
  ctx: { today: string; openPrompts: string },
): Promise<HostClassification> {
  return call<HostClassification>(
    `You interpret SMS replies (usually Swahili) from Noor, a coffee-farm tour host. Today is ${ctx.today}. Her OPEN prompts:\n${ctx.openPrompts}\n"booking" must be one of the open prompt IDs like "B14", or null. proposed_date as YYYY-MM-DD. answer_text_for_guest: her answer in English, only for answer_question. If unclear use intent unknown.`,
    text,
    "classify_host",
    {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: ["approve", "decline", "propose_other_date", "answer_question", "unknown"],
        },
        booking: { type: ["string", "null"] },
        confidence: { type: "number" },
        proposed_date: { type: ["string", "null"] },
        answer_text_for_guest: { type: ["string", "null"] },
      },
      required: ["intent", "booking", "confidence"],
    },
  );
}

export async function translate(
  call: CallTool,
  text: string,
  from: string,
  to: string,
): Promise<string> {
  if (from === to) return text;
  const r = await call<{ translation: string }>(
    `Translate the user's text from ${from} to ${to}. Keep IDs like B14, times, numbers and names unchanged. Output only the translation.`,
    text,
    "translate",
    { type: "object", properties: { translation: { type: "string" } }, required: ["translation"] },
  );
  return r.translation;
}

export async function analyzeFeedback(call: CallTool, text: string): Promise<FeedbackAnalysis> {
  return call<FeedbackAnalysis>(
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

export async function summarizeFeedback(
  call: CallTool,
  items: string,
): Promise<{ lines: string[] }> {
  return call<{ lines: string[] }>(
    "Summarise guest feedback for Noor in Swahili: 2-3 lines, each under 160 characters: main themes, then what to improve. Use only the given feedback.",
    items,
    "summarize_feedback",
    {
      type: "object",
      properties: { lines: { type: "array", items: { type: "string" } } },
      required: ["lines"],
    },
  );
}

/** An Ai over any transport. `onUsage` hears about every call; `withUsage` makes a metered copy. */
export function createAi(transport: CallTool, model: string, onUsage?: UsageListener): Ai {
  const call: CallTool = (system, user, name, parameters) =>
    transport(system, user, name, parameters, onUsage);
  return {
    model,
    withUsage: (listener) => createAi(transport, model, listener),
    classifyGuest: (text, ctx) => classifyGuest(call, text, ctx),
    classifyHost: (text, ctx) => classifyHost(call, text, ctx),
    translate: (text, from, to) => translate(call, text, from, to),
    analyzeFeedback: (text) => analyzeFeedback(call, text),
    summarizeFeedback: (items) => summarizeFeedback(call, items),
    analyzeReview: (text) => analyzeReview(call, text),
    groupIdeas: (ideas) => groupIdeas(call, ideas),
    writeInsightsSms: (summary) => writeInsightsSms(call, summary),
  };
}
