// What every engine module gets: its dependencies plus the shared actions built on them
// (outbound messages, booking transitions, the decision log).
import type { AiUsage } from "./ai/types";
import { canTransition, code, type Actor, type BookingStatus } from "./booking-state";
import { sms160 } from "./format";
import type { BookingPatch } from "./repo";
import type { Booking, Channel, Contact, Decision, EngineDeps } from "./types";

/** Below this confidence the assistant hands the message to Noor instead of acting on it. */
export const CONF_MIN = 0.75;

export interface SendOptions {
  booking_id?: number | null | undefined;
  text_translated?: string | null | undefined;
  thread_ref?: string | null | undefined;
}

export interface Ctx extends EngineDeps {
  /** What this unit of work is about; AI usage is logged against it. */
  trace: { message_id: string | null; booking_id: number | null };
  /** Writes the AI calls made since the last flush to the usage log, linked to `trace`. */
  flushUsage(source: "inbound" | "timers" | "insights" | "import"): Promise<void>;
  /** The only way a message leaves the system. Phase 1 writes it for the simulator; Phase 2 swaps the transport here. */
  sendMessage(channel: Channel, to: Contact, text: string, opts?: SendOptions): Promise<void>;
  /** English gloss of a non-English message, for operators and reviewers. */
  englishOf(text: string, lang: string): Promise<string | null>;
  smsNoor(text: string, bookingId?: number | null): Promise<void>;
  /** Writes in English; the guest receives it in their language. */
  emailGuest(guest: Contact, english: string, bookingId?: number | null): Promise<void>;
  /** Moves a booking to a new status, if the state machine allows it for this actor. */
  transition(b: Booking, to: BookingStatus, actor: Actor, patch?: BookingPatch): Promise<Booking>;
  log(messageId: string, decision: Decision): Promise<void>;
}

/** One context per unit of work (an inbound message, a timer run), so usage is never mixed up. */
export function createContext(deps: EngineDeps): Ctx {
  const { repo, now } = deps;
  const usage: AiUsage[] = [];
  const ai = deps.ai.withUsage((u) => usage.push(u));
  const trace: Ctx["trace"] = { message_id: null, booking_id: null };

  async function flushUsage(source: "inbound" | "timers" | "insights" | "import") {
    const calls = usage.splice(0);
    if (!calls.length) return;
    await repo.logAiCalls(calls.map((u) => ({ ...u, source, ...trace }))).catch(() => undefined);
  }

  async function englishOf(text: string, lang: string) {
    if (lang === "en" || !/[a-zA-Z\u00C0-\uFFFF]{3,}/.test(text)) return null;
    return ai.translate(text, lang, "en").catch(() => null);
  }

  async function sendMessage(channel: Channel, to: Contact, text: string, opts: SendOptions = {}) {
    const body = channel === "sms" ? sms160(text) : text;
    const text_en =
      to.language === "en" ? null : (opts.text_translated ?? (await englishOf(body, to.language)));
    await repo.insertMessage({
      direction: "out",
      channel,
      contact_id: to.id,
      booking_id: opts.booking_id ?? null,
      provider_msg_id: `sim-out-${crypto.randomUUID()}`,
      thread_ref: opts.thread_ref ?? null,
      text_original: body,
      lang: to.language,
      text_translated: opts.text_translated ?? null,
      text_en,
    });
  }

  async function host() {
    const s = await repo.settings();
    return repo.contact(s.host_id!);
  }

  async function smsNoor(text: string, bookingId?: number | null) {
    await sendMessage("sms", await host(), text, { booking_id: bookingId });
  }

  async function emailGuest(guest: Contact, english: string, bookingId?: number | null) {
    const localized = await ai.translate(english, "en", guest.language).catch(() => english);
    await sendMessage("email", guest, localized, {
      booking_id: bookingId,
      text_translated: guest.language === "en" ? null : english,
      thread_ref: bookingId ? code(bookingId) : null,
    });
  }

  async function transition(b: Booking, to: BookingStatus, actor: Actor, patch: BookingPatch = {}) {
    if (!canTransition(b.status as BookingStatus, to, actor)) {
      throw new Error(`Transition ${b.status} → ${to} not allowed for ${actor}`);
    }
    return repo.updateBooking(b.id, { ...patch, status: to, updated_at: now().toISOString() });
  }

  return {
    ...deps,
    ai,
    trace,
    flushUsage,
    englishOf,
    sendMessage,
    smsNoor,
    emailGuest,
    transition,
    log: (messageId, decision) => repo.logDecision(messageId, decision),
  };
}
