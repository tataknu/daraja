// In-memory Repo with the same semantics as the Supabase one, for tests.
import type {
  BookingPatch,
  FeedbackRow,
  FeedbackSummaryRow,
  MessagePatch,
  NewAiCall,
  NewFeedback,
  NewMessage,
  Repo,
} from "../repo";
import type { Booking, Contact, Decision, FarmSettings, InsightReport, Prompt } from "../types";

const CLOSED = ["DECLINED", "EXPIRED", "CANCELLED", "CLOSED"];
const HOURS_48 = 48 * 3600e3;

type Stored<T> = T & { seq: number; created_at: string };
interface StoredPrompt extends Prompt {
  seq: number;
  expires_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

export const NOOR_PHONE = "+255700000001";

const FARM: FarmSettings = {
  host_id: null,
  slots: ["09:00", "14:00"],
  max_per_slot: 8,
  price_per_person: 25000,
  currency: "TZS",
  directions: "From Moshi town take the Kibosho road 12 km north.",
};

export function memoryRepo(clock: () => Date) {
  let seq = 0;
  let nextBooking = 14;
  const data = {
    settings: { ...FARM } as FarmSettings,
    contacts: [] as Contact[],
    bookings: [] as Stored<Booking>[],
    messages: [] as Stored<NewMessage & { id: string }>[],
    prompts: [] as StoredPrompt[],
    decisions: [] as (Decision & { message_id: string })[],
    feedback: [] as Stored<NewFeedback & { id: string }>[],
    insightReports: [] as Stored<InsightReport & { id: string }>[],
    aiCalls: [] as NewAiCall[],
    reminders: new Set<string>(),
  };
  const id = () => crypto.randomUUID();
  const stamp = () => ({ seq: ++seq, created_at: clock().toISOString() });
  const copy = <T>(v: T): T => structuredClone(v);
  const newestFirst = <T extends { seq: number }>(rows: T[]) =>
    [...rows].sort((a, b) => b.seq - a.seq);
  const find = <T>(rows: T[], pred: (r: T) => boolean, what: string) => {
    const row = rows.find(pred);
    if (!row) throw new Error(`${what} not found`);
    return row;
  };
  const toBooking = ({ seq: _s, created_at: _c, ...b }: Stored<Booking>): Booking => copy(b);
  const toPrompt = ({
    seq: _s,
    expires_at: _e,
    resolved_at: _r,
    resolution: _res,
    ...p
  }: StoredPrompt): Prompt => copy(p);

  const repo: Repo = {
    async settings() {
      return copy(data.settings);
    },

    async contact(cid) {
      return copy(find(data.contacts, (c) => c.id === cid, "contact"));
    },
    async findContact(by, value) {
      const c = data.contacts.find((x) => x[by] === value);
      return c ? copy(c) : null;
    },
    async createGuest(g) {
      const c: Contact = {
        id: id(),
        role: "guest",
        name: g.name,
        email: g.email ?? null,
        phone: g.phone ?? null,
        language: g.language,
        referral_code: null,
      };
      data.contacts.push(c);
      return copy(c);
    },
    async setContactLanguage(cid, language) {
      find(data.contacts, (c) => c.id === cid, "contact").language = language;
    },

    async messageSeen(pid) {
      return data.messages.some((m) => m.provider_msg_id === pid);
    },
    async insertMessage(m) {
      if (data.messages.some((x) => x.provider_msg_id === m.provider_msg_id)) return null;
      const row = { ...copy(m), id: id(), ...stamp() };
      data.messages.push(row);
      return { id: row.id };
    },
    async updateMessage(mid, patch: MessagePatch) {
      Object.assign(
        find(data.messages, (m) => m.id === mid, "message"),
        patch,
      );
    },

    async booking(bid) {
      return toBooking(find(data.bookings, (b) => b.id === bid, "booking"));
    },
    async guestBooking(guestId, bid) {
      const b = data.bookings.find((x) => x.id === bid && x.guest_id === guestId);
      return b ? toBooking(b) : null;
    },
    async activeBooking(guestId) {
      const b = newestFirst(data.bookings).find(
        (x) => x.guest_id === guestId && !CLOSED.includes(x.status),
      );
      return b ? toBooking(b) : null;
    },
    async latestBooking(guestId) {
      const b = newestFirst(data.bookings).find((x) => x.guest_id === guestId);
      return b ? toBooking(b) : null;
    },
    async createBooking(guestId, notes) {
      const b: Stored<Booking> = {
        id: nextBooking++,
        guest_id: guestId,
        status: "INCOMPLETE",
        date_from: null,
        date_to: null,
        slot: null,
        party_size: null,
        notes_original: notes,
        notes_translated: null,
        referred_by: null,
        ...stamp(),
      };
      data.bookings.push(b);
      return toBooking(b);
    },
    async updateBooking(bid, patch: BookingPatch) {
      const { updated_at: _u, ...fields } = patch;
      const b = find(data.bookings, (x) => x.id === bid, "booking");
      Object.assign(b, fields);
      return toBooking(b);
    },
    async partySizeBooked(date, slot, excludeId) {
      return data.bookings
        .filter(
          (b) =>
            b.date_from === date &&
            b.slot === slot &&
            ["CONFIRMED", "PENDING_NOOR"].includes(b.status) &&
            b.id !== excludeId,
        )
        .reduce((sum, b) => sum + (b.party_size ?? 0), 0);
    },
    async bookingsWithStatus(status) {
      return data.bookings.filter((b) => b.status === status).map(toBooking);
    },

    async openPrompts(now, bookingId) {
      return newestFirst(data.prompts)
        .filter(
          (p) =>
            !p.resolved_at &&
            p.expires_at > now.toISOString() &&
            (!bookingId || p.booking_id === bookingId),
        )
        .map(toPrompt);
    },
    async unresolvedPrompts(kind) {
      return data.prompts.filter((p) => !p.resolved_at && p.kind === kind).map(toPrompt);
    },
    async createPrompt(bookingId, kind, options = {}) {
      const sent = clock();
      data.prompts.push({
        id: id(),
        booking_id: bookingId,
        kind,
        options: copy(options),
        sent_at: sent.toISOString(),
        nudged_at: null,
        seq: ++seq,
        expires_at: new Date(sent.getTime() + HOURS_48).toISOString(),
        resolved_at: null,
        resolution: null,
      });
    },
    async resolvePrompt(pid, resolution, now) {
      Object.assign(
        find(data.prompts, (p) => p.id === pid, "prompt"),
        { resolved_at: now.toISOString(), resolution },
      );
    },
    async resolvePrompts(bookingId, resolution, now, kinds) {
      for (const p of data.prompts) {
        if (p.booking_id === bookingId && !p.resolved_at && (!kinds || kinds.includes(p.kind))) {
          Object.assign(p, { resolved_at: now.toISOString(), resolution });
        }
      }
    },
    async markNudged(pid, now) {
      find(data.prompts, (p) => p.id === pid, "prompt").nudged_at = now.toISOString();
    },

    async logDecision(messageId, d) {
      data.decisions.push({ ...copy(d), message_id: messageId });
    },
    async saveFeedback(f) {
      const row = { ...copy(f), id: id(), ...stamp() };
      data.feedback.push(row);
      return { id: row.id };
    },
    async recentFeedback(limit): Promise<FeedbackSummaryRow[]> {
      return newestFirst(data.feedback)
        .slice(0, limit)
        .map((f) => ({
          text_translated: f.text_translated,
          themes: f.themes,
          sentiment: f.sentiment,
        }));
    },
    async feedbackForInsights(limit): Promise<FeedbackRow[]> {
      return newestFirst(data.feedback)
        .slice(0, limit)
        .map((f) => ({
          id: f.id,
          created_at: f.created_at,
          booking_id: f.booking_id,
          lang: f.lang,
          text_original: f.text_original,
          text_translated: f.text_translated,
          sentiment: f.sentiment,
          points: copy(f.points ?? []),
          ideas: copy(f.ideas ?? []),
          source: f.source ?? "guest",
          quotes_dropped: f.quotes_dropped ?? 0,
        }));
    },
    async saveInsightReport(report) {
      const row = { ...copy(report), id: id(), ...stamp() };
      data.insightReports.push(row);
      return { id: row.id };
    },
    async claimReferralCode(cid, code) {
      const contact = find(data.contacts, (c) => c.id === cid, "contact");
      contact.referral_code ??= code.toUpperCase();
      return contact.referral_code;
    },
    async contactByReferralCode(code) {
      const c = data.contacts.find((x) => x.referral_code === code.toUpperCase());
      return c ? copy(c) : null;
    },
    async logAiCalls(calls) {
      // As in Postgres with the retry: a link to a booking or message that doesn't exist is dropped.
      const linked = <T>(id: T | null, rows: { id: T }[]) =>
        id !== null && rows.some((r) => r.id === id) ? id : null;
      data.aiCalls.push(
        ...copy(calls).map((c) => ({
          ...c,
          booking_id: linked(c.booking_id, data.bookings),
          message_id: linked(c.message_id, data.messages),
        })),
      );
    },
    async recordReminder(bookingId, kind) {
      const key = `${bookingId}:${kind}`;
      if (data.reminders.has(key)) return false;
      data.reminders.add(key);
      return true;
    },
    async resetDemo() {
      data.bookings.length =
        data.messages.length =
        data.prompts.length =
        data.decisions.length =
        data.feedback.length =
        data.insightReports.length =
        data.aiCalls.length =
          0;
      data.reminders.clear();
      nextBooking = 14;
      data.contacts = data.contacts.filter((c) => c.role !== "guest");
    },
  };

  /** The host contact and the farm settings the migrations seed. */
  const noor: Contact = {
    id: id(),
    role: "host",
    name: "Noor",
    email: null,
    phone: NOOR_PHONE,
    language: "sw",
    referral_code: null,
  };
  data.contacts.push(noor);
  data.settings.host_id = noor.id;

  return { repo, data, noor };
}
