import type { Ai } from "./ai/types";
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
}

export interface FarmSettings {
  host_id: string | null;
  slots: string[];
  max_per_slot: number;
  price_per_person: number;
  currency: string;
  directions: string;
}

export type PromptKind = "approve_booking" | "answer_question" | "confirm_cancellation" | "confirm_readback" | "ask_other_date";

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
