import type { Ai, Aspect, ReviewAnalysis } from "./ai/types";
import type { Repo } from "./repo";

export type Channel = "email" | "sms";

/** One inbound message, from a webhook or the simulator. */
export interface InboundInput {
  channel: Channel;
  sender: string; // email address or phone number
  text: string;
  provider_msg_id: string;
  thread_ref?: string | null | undefined;
  sender_name?: string | null | undefined;
}

export interface Contact {
  id: string;
  role: string;
  name: string;
  email: string | null;
  phone: string | null;
  language: string;
  /** Given to happy guests to pass on; a new guest who quotes it is linked to them. */
  referral_code?: string | null;
}

export interface Booking {
  id: number;
  guest_id: string;
  status: string;
  date_from: string | null;
  date_to: string | null;
  slot: string | null;
  party_size: number | null;
  notes_original: string | null;
  notes_translated: string | null;
  /** The guest whose referral code brought this booking in. */
  referred_by?: string | null;
}

export interface FarmSettings {
  host_id: string | null;
  slots: string[];
  max_per_slot: number;
  price_per_person: number;
  currency: string;
  directions: string;
}

export type PromptKind =
  | "approve_booking"
  | "answer_question"
  | "confirm_cancellation"
  | "confirm_readback"
  | "ask_other_date";

/** A question the system is waiting for Noor to answer. */
export interface Prompt {
  id: string;
  booking_id: number | null;
  kind: string;
  options: unknown;
  sent_at: string;
  nudged_at: string | null;
}

/** One row of the audit trail: what the assistant decided and why. */
export interface Decision {
  intent: string;
  confidence: number | null;
  entities?: unknown;
  model: string;
  action: string;
  routed: boolean;
}

export interface EngineDeps {
  repo: Repo;
  ai: Ai;
  now: () => Date;
}

export type InboundResult = { ignored: true } | { booking_id?: number | null | undefined };

/** A review to import: real feedback from elsewhere, or a sample. A precomputed analysis skips the AI. */
export interface ReviewInput {
  text: string;
  lang?: string | undefined;
  analysis?: ReviewAnalysis | undefined;
}

/** One quote behind an insight, checked to appear verbatim in its review. */
export interface InsightQuote {
  feedback_id: string;
  lang: string;
  quote: string;
  quote_en: string;
}

/** One line of the report: how many reviews say it, and what they said. */
export interface InsightItem {
  /** An aspect for "keep" and "improve"; an idea group's English label for "next". */
  key: Aspect | string;
  label_en: string;
  label_sw: string;
  /** Distinct reviews that mention it. */
  count: number;
  /** count / review_count. */
  share: number;
  quotes: InsightQuote[];
}

/** The brief's three questions, answered from reviews: counts from code, wording from the AI. */
export interface InsightReport {
  review_count: number;
  sentiment: { positive: number; neutral: number; negative: number };
  /** What visitors keep returning to. */
  keep: InsightItem[];
  /** What they wish had been different. */
  improve: InsightItem[];
  /** What to build next, from visitors' own suggestions. */
  next: InsightItem[];
  /** The SMS Noor receives, and its English. */
  sms_sw: string[];
  sms_en: string[];
  /** Quotes the AI returned that weren't found in the review text, and were dropped. */
  dropped_quotes: number;
  generated_at: string;
}
