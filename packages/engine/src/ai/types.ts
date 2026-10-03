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

/** Aspects of a farm visit a review can talk about. Counted in code, so they are a fixed list. */
export const ASPECTS = [
  "host", // the host or guide: warmth, knowledge, stories
  "coffee_process", // picking, pulping, drying, roasting: how coffee is made
  "tasting", // the coffee itself, cupping, tasting
  "food", // meals, snacks, drinks other than the tasting
  "landscape", // views, the walk, nature, the slope
  "farm_life", // daily life, other crops, the cooperative, culture
  "value", // price, worth it
  "timing", // length, start time, pace
  "access", // directions, the road, finding the farm, transport
  "communication", // booking, replies, language
  "group", // group size, children, crowding
  "facilities", // toilets, shade, seating, rain cover
  "other",
] as const;
export type Aspect = (typeof ASPECTS)[number];

/** Something a visitor loved, or wished had been different. */
export interface ReviewPoint {
  aspect: Aspect;
  polarity: "loved" | "wished";
  /** A verbatim excerpt of the original review. Code drops points whose quote isn't in the text. */
  quote: string;
  quote_en: string;
}

/** Something the visitor suggests the farm could offer or build. */
export interface ReviewIdea {
  /** Short English label, e.g. "let visitors roast their own beans". */
  idea: string;
  /** A verbatim excerpt of the original review. */
  quote: string;
  quote_en: string;
}

export interface ReviewAnalysis {
  /** ISO 639-1 code of the review. */
  language: string;
  translation_en: string;
  sentiment: "positive" | "neutral" | "negative";
  points: ReviewPoint[];
  ideas: ReviewIdea[];
}

/** Ideas from many reviews, grouped by meaning. `ids` refer to the ids passed in. */
export interface IdeaGroups {
  groups: { label_en: string; label_sw: string; ids: string[] }[];
}

/** The SMS lines Noor receives about her reviews, and their English for reviewers. */
export interface InsightsSms {
  lines_sw: string[];
  lines_en: string[];
}

/** Token usage and latency of one model call. */
export interface AiUsage {
  /** The structured-output schema name, e.g. "classify_guest" or "translate". */
  task: string;
  model: string;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  latency_ms: number;
  ok: boolean;
}
export type UsageListener = (usage: AiUsage) => void;

export interface Ai {
  /** Recorded in the decision log. */
  model: string;
  /** The same AI, reporting every call's token usage to `listener`. */
  withUsage(listener: UsageListener): Ai;
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
  /** One review, any language: what the visitor loved, wished, and suggests. */
  analyzeReview(text: string): Promise<ReviewAnalysis>;
  /** Groups ideas from many reviews by meaning. */
  groupIdeas(ideas: { id: string; idea: string }[]): Promise<IdeaGroups>;
  /** Phrases a computed insights summary as 2-3 Swahili SMS lines for Noor. */
  writeInsightsSms(summary: string): Promise<InsightsSms>;
}

/**
 * One structured-output call: system prompt, user text, schema name, JSON schema. The transport
 * reports token usage to `onUsage` when given.
 */
export type CallTool = <T>(
  system: string,
  user: string,
  name: string,
  parameters: object,
  onUsage?: UsageListener,
) => Promise<T>;
