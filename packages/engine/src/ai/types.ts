// What the engine needs from a language model. The gateway implementation is in gateway.server.ts;
// tests pass a scripted fake.
export type GuestIntent =
  "booking_request" | "modify" | "cancel" | "question" | "feedback" | "unknown";
export type HostIntent =
  "approve" | "decline" | "propose_other_date" | "answer_question" | "unknown";

export interface GuestClassification {
  intent: GuestIntent;
  confidence: number;
  language: string;
  entities: {
    date_from: string | null;
    date_to: string | null;
    party_size: number | null;
    slot: string | null;
  };
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

export interface FeedbackAnalysis {
  translation_en: string;
  themes: string[];
  sentiment: "positive" | "neutral" | "negative";
}

export interface Ai {
  /** Recorded in the decision log. */
  model: string;
  classifyGuest(
    text: string,
    ctx: { today: string; slots: string[]; booking: string },
  ): Promise<GuestClassification>;
  classifyHost(
    text: string,
    ctx: { today: string; openPrompts: string },
  ): Promise<HostClassification>;
  translate(text: string, from: string, to: string): Promise<string>;
  analyzeFeedback(text: string): Promise<FeedbackAnalysis>;
  summarizeFeedback(items: string): Promise<{ lines: string[] }>;
}

/** One structured-output call: system prompt, user text, schema name, JSON schema. */
export type CallTool = <T>(
  system: string,
  user: string,
  name: string,
  parameters: object,
) => Promise<T>;
