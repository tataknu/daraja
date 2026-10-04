// Everything the engine reads or writes. The Supabase implementation is repo.supabase.server.ts;
// tests use testing/memory-repo.ts.
import type { AiUsage, ReviewIdea, ReviewPoint } from "./ai/types";
import type {
  Booking,
  Channel,
  Contact,
  Decision,
  FarmSettings,
  InsightReport,
  Prompt,
} from "./types";

export interface NewMessage {
  direction: "in" | "out";
  channel: Channel;
  contact_id: string;
  booking_id?: number | null;
  provider_msg_id: string;
  thread_ref?: string | null;
  text_original: string;
  lang: string;
  text_translated?: string | null;
  text_en?: string | null;
}

export interface MessagePatch {
  lang?: string;
  text_en?: string | null;
  text_translated?: string | null;
  booking_id?: number | null;
}

export type BookingPatch = Partial<Omit<Booking, "id" | "guest_id">> & { updated_at?: string };

export interface NewFeedback {
  booking_id: number | null;
  text_original: string;
  lang: string;
  text_translated: string;
  themes: string[];
  sentiment: string;
  points?: ReviewPoint[];
  ideas?: ReviewIdea[];
  /** "guest" for feedback emails, "sample" for imported sample reviews. */
  source?: "guest" | "sample";
  /** Quotes the AI returned that weren't in the review, and were dropped. */
  quotes_dropped?: number;
}

/** A stored review, as the insights report reads it. */
export interface FeedbackRow {
  id: string;
  created_at: string;
  booking_id: number | null;
  lang: string | null;
  text_original: string;
  text_translated: string | null;
  sentiment: string | null;
  points: ReviewPoint[];
  ideas: ReviewIdea[];
  source: string;
  quotes_dropped: number;
}

/** One model call, linked to what triggered it. */
export interface NewAiCall extends AiUsage {
  /** "inbound", "timers", "insights" or "import". */
  source: string;
  message_id: string | null;
  booking_id: number | null;
}

export interface FeedbackSummaryRow {
  text_translated: string | null;
  themes: string[];
  sentiment: string | null;
}

export interface Repo {
  settings(): Promise<FarmSettings>;

  contact(id: string): Promise<Contact>;
  findContact(by: "email" | "phone", value: string): Promise<Contact | null>;
  createGuest(guest: {
    name: string;
    email?: string;
    phone?: string;
    language: string;
  }): Promise<Contact>;
  setContactLanguage(id: string, language: string): Promise<void>;

  messageSeen(providerMsgId: string): Promise<boolean>;
  /** Returns null when the provider message id is already stored (a repeated webhook). */
  insertMessage(message: NewMessage): Promise<{ id: string } | null>;
  updateMessage(id: string, patch: MessagePatch): Promise<void>;

  booking(id: number): Promise<Booking>;
  /** The guest's booking with this id, if it is theirs. */
  guestBooking(guestId: string, id: number): Promise<Booking | null>;
  /** The guest's newest booking that is still open (not declined, expired, cancelled or closed). */
  activeBooking(guestId: string): Promise<Booking | null>;
  latestBooking(guestId: string): Promise<Booking | null>;
  createBooking(guestId: string, notes: string): Promise<Booking>;
  updateBooking(id: number, patch: BookingPatch): Promise<Booking>;
  /** People already confirmed or waiting for Noor in this slot, excluding one booking. */
  partySizeBooked(date: string, slot: string, excludeId: number): Promise<number>;
  bookingsWithStatus(status: string): Promise<Booking[]>;

  /** Unresolved, unexpired prompts, newest first. */
  openPrompts(now: Date, bookingId?: number): Promise<Prompt[]>;
  /** Unresolved prompts of one kind, expired or not (the timers decide what to do with them). */
  unresolvedPrompts(kind: string): Promise<Prompt[]>;
  createPrompt(bookingId: number, kind: string, options?: Record<string, unknown>): Promise<void>;
  resolvePrompt(id: string, resolution: string, now: Date): Promise<void>;
  resolvePrompts(bookingId: number, resolution: string, now: Date, kinds?: string[]): Promise<void>;
  markNudged(id: string, now: Date): Promise<void>;

  logDecision(messageId: string, decision: Decision): Promise<void>;
  saveFeedback(feedback: NewFeedback): Promise<{ id: string }>;
  recentFeedback(limit: number): Promise<FeedbackSummaryRow[]>;
  /** The newest reviews with their points and ideas, newest first. */
  feedbackForInsights(limit: number): Promise<FeedbackRow[]>;
  saveInsightReport(report: InsightReport): Promise<{ id: string }>;

  /** Gives the contact `code` only if they have none yet; returns the code they end up with. */
  claimReferralCode(contactId: string, code: string): Promise<string>;
  /** Case-insensitive. */
  contactByReferralCode(code: string): Promise<Contact | null>;

  /** Never throws: usage logging must not break a workflow. */
  logAiCalls(calls: NewAiCall[]): Promise<void>;
  /** False when this reminder was already sent for the booking. */
  recordReminder(bookingId: number, kind: string): Promise<boolean>;
  resetDemo(): Promise<void>;
}
