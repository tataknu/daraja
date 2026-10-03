// Deterministic workflow engine. AI only classifies/translates (via ai-adapter);
// every state change and outbound message is decided here in plain code.
import { supabaseAdmin as db } from "@/integrations/supabase/client.server";
import * as ai from "./ai-adapter.server";
import { canTransition, code, type Actor, type BookingStatus } from "./booking-state";

const TZ = "Africa/Dar_es_Salaam";
const CONF_MIN = 0.75;

export interface InboundInput {
  channel: "email" | "sms";
  sender: string; // email address or phone number
  text: string;
  provider_msg_id: string;
  thread_ref?: string | null | undefined;
  sender_name?: string | null | undefined;
}

type Contact = { id: string; role: string; name: string; email: string | null; phone: string | null; language: string };
type Booking = {
  id: number; guest_id: string; status: string; date_from: string | null; date_to: string | null;
  slot: string | null; party_size: number | null; notes_original: string | null; notes_translated: string | null;
};

// ---------- helpers ----------
const localDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
const localHour = (d: Date) => Number(d.toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }));
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const SW_DAYS = ["Jumapili", "Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi"];
const SW_MONTHS = ["Jan", "Feb", "Mac", "Apr", "Mei", "Jun", "Jul", "Ago", "Sep", "Okt", "Nov", "Des"];
const SW_ORIGIN: Record<string, string> = {
  de: "Ujerumani", en: "Uingereza", fr: "Ufaransa", nl: "Uholanzi", it: "Italia", es: "Uhispania", sw: "Tanzania", zh: "China", ja: "Japani",
};
function swDate(iso: string | null) {
  if (!iso) return "?";
  const d = new Date(iso + "T12:00:00Z");
  return `${SW_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${SW_MONTHS[d.getUTCMonth()]}`;
}
const swSlot = (s: string | null) => (s === "09:00" ? "asubuhi" : s === "14:00" ? "mchana" : s ?? "");
const sms160 = (s: string) => (s.length <= 160 ? s : s.slice(0, 157) + "...");
const firstName = (n: string) => n.split(" ")[0];

async function settings() {
  const { data, error } = await db.from("farm_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}
async function host(): Promise<Contact> {
  const s = await settings();
  const { data, error } = await db.from("contacts").select("*").eq("id", s.host_id!).single();
  if (error) throw error;
  return data as Contact;
}

// ---------- outbound (single choke point; Phase 2 swaps the transport) ----------
export async function sendMessage(
  channel: "email" | "sms",
  to: Contact,
  text: string,
  opts: { booking_id?: number | null | undefined; text_translated?: string | null | undefined; thread_ref?: string | null | undefined } = {},
) {
  // Phase 1: the simulator IS the transport — writing the row makes it appear in the inbox/phone.
  const { error } = await db.from("messages").insert({
    direction: "out", channel, contact_id: to.id, booking_id: opts.booking_id ?? null,
    provider_msg_id: `sim-out-${crypto.randomUUID()}`, thread_ref: opts.thread_ref ?? null,
    text_original: channel === "sms" ? sms160(text) : text, lang: to.language, text_translated: opts.text_translated ?? null,
  });
  if (error) throw error;
}

async function smsNoor(text: string, booking_id?: number | null | undefined) {
  await sendMessage("sms", await host(), text, { booking_id });
}

async function emailGuest(guest: Contact, english: string, booking_id?: number | null | undefined) {
  const localized = await ai.translate(english, "en", guest.language).catch(() => english);
  await sendMessage("email", guest, localized, {
    booking_id, text_translated: guest.language === "en" ? null : english, thread_ref: booking_id ? code(booking_id) : null,
  });
}

async function transition(b: Booking, to: BookingStatus, actor: Actor, patch: Partial<Booking> = {}) {
  if (!canTransition(b.status as BookingStatus, to, actor)) {
    throw new Error(`Transition ${b.status} → ${to} not allowed for ${actor}`);
  }
  const { data, error } = await db.from("bookings")
    .update({ ...patch, status: to, updated_at: new Date().toISOString() })
    .eq("id", b.id).select("*").single();
  if (error) throw error;
  return data as Booking;
}

async function openPrompts(booking_id?: number) {
  let q = db.from("pending_prompts").select("*").is("resolved_at", null).gt("expires_at", new Date().toISOString())
    .order("sent_at", { ascending: false });
  if (booking_id) q = q.eq("booking_id", booking_id);
  const { data } = await q;
  return data ?? [];
}
async function resolvePrompts(booking_id: number, resolution: string, kinds?: string[]) {
  let q = db.from("pending_prompts").update({ resolved_at: new Date().toISOString(), resolution })
    .eq("booking_id", booking_id).is("resolved_at", null);
  if (kinds) q = q.in("kind", kinds);
  await q;
}
async function createPrompt(booking_id: number, kind: string, options: Record<string, unknown> = {}) {
  await db.from("pending_prompts").insert({ booking_id, kind, options: options as never });
}

async function logDecision(message_id: string, d: {
  intent: string; confidence: number | null; entities?: unknown; model: string; action: string; routed: boolean;
}) {
  await db.from("decisions").insert({
    message_id, intent: d.intent, confidence: d.confidence, entities: (d.entities ?? null) as never,
    model: d.model, action_taken: d.action, routed_to_human: d.routed,
  });
}

// ---------- entry point (simulator + future webhooks) ----------
export async function handleInbound(input: InboundInput) {
  const { data: seen } = await db.from("messages").select("id").eq("provider_msg_id", input.provider_msg_id).maybeSingle();
  if (seen) return { ignored: true as const };

  const key = input.channel === "email" ? "email" : "phone";
  const sender = input.sender.trim().toLowerCase();
  let { data: contact } = await db.from("contacts").select("*").eq(key, sender).maybeSingle();
  if (!contact) {
    const name = input.sender_name?.trim() || sender.split("@")[0];
    const ins = await db.from("contacts").insert({ role: "guest", name, [key]: sender, language: "en" }).select("*").single();
    if (ins.error) throw ins.error;
    contact = ins.data;
  }
  const { data: msg, error } = await db.from("messages").insert({
    direction: "in", channel: input.channel, contact_id: contact!.id, provider_msg_id: input.provider_msg_id,
    thread_ref: input.thread_ref ?? null, text_original: input.text, lang: contact!.language,
  }).select("*").single();
  if (error) {
    if (error.code === "23505") return { ignored: true as const };
    throw error;
  }
  if (contact!.role === "host") return handleHost(contact as Contact, msg.id, input.text);
  return handleGuest(contact as Contact, msg.id, input.text, input.thread_ref ?? null);
}

// ---------- host (Noor) ----------
const SORRY = "Samahani, sikuelewa. Jibu mf. 'B14 1'.";

async function handleHost(noor: Contact, message_id: string, text: string) {
  const open = await openPrompts();

  // a. Deterministic paths — no AI.
  const bare = /^\s*([12])\s*$/.exec(text);
  if (bare) {
    const rb = open.find((p) => p.kind === "confirm_readback");
    if (rb) return resolveReadback(rb, bare[1] === "1", message_id);
  }
  const dateRe = /^\s*B?(\d+)\s+(\d{4}-\d{2}-\d{2})\s*$/i.exec(text);
  if (dateRe) {
    const p = open.find((x) => x.booking_id === Number(dateRe[1]) && x.kind === "ask_other_date");
    if (p) {
      await logDecision(message_id, { intent: "propose_other_date", confidence: 1, entities: { date: dateRe[2] }, model: "regex", action: "counter_offer", routed: false });
      await executeHostAction(p.booking_id!, "propose_other_date", { proposed_date: dateRe[2] });
      return { booking_id: p.booking_id };
    }
  }
  const m = /^\s*B?(\d+)\s*([1-3])\b/i.exec(text);
  if (m) {
    const id = Number(m[1]);
    const choice = Number(m[2]);
    const mine = open.filter((p) => p.booking_id === id);
    const rb = mine.find((p) => p.kind === "confirm_readback");
    if (rb && choice <= 2) return resolveReadback(rb, choice === 1, message_id);
    const ap = mine.find((p) => p.kind === "approve_booking");
    if (!ap) {
      await logDecision(message_id, { intent: "unknown", confidence: 1, entities: { booking: id, choice }, model: "regex", action: "no_open_prompt", routed: true });
      await smsNoor(SORRY);
      return { booking_id: id };
    }
    const action = choice === 1 ? "approve" : choice === 2 ? "decline" : "ask_other_date";
    await logDecision(message_id, { intent: action, confidence: 1, entities: { booking: id, choice }, model: "regex", action, routed: false });
    await executeHostAction(id, action, {});
    return { booking_id: id };
  }

  // b. AI path with open prompts as context.
  const ctxLines = open.length
    ? open.map((p) => `${code(p.booking_id!)} (${p.kind})`).join("\n")
    : "(none)";
  let r: ai.HostClassification;
  try {
    r = await ai.classifyHost(text, { today: localDate(new Date()), openPrompts: ctxLines });
  } catch (e) {
    await logDecision(message_id, { intent: "error", confidence: null, model: ai.MODEL, action: `ai_error: ${String(e).slice(0, 120)}`, routed: true });
    await smsNoor(SORRY);
    return {};
  }
  const bid = r.booking ? Number(String(r.booking).replace(/\D/g, "")) : NaN;
  const valid = open.some((p) => p.booking_id === bid && p.kind !== "confirm_readback");
  if (r.confidence < CONF_MIN || r.intent === "unknown" || !valid) {
    await logDecision(message_id, { intent: r.intent, confidence: r.confidence, entities: r, model: ai.MODEL, action: "asked_to_rephrase", routed: true });
    await smsNoor(SORRY);
    return {};
  }
  // c. Read back before acting.
  const summary =
    r.intent === "approve" ? "kubali" :
    r.intent === "decline" ? "kataa" :
    r.intent === "propose_other_date" ? `pendekeza ${swDate(r.proposed_date ?? null)}` :
    `jibu: "${(r.answer_text_for_guest ?? "").slice(0, 60)}"`;
  await resolvePrompts(bid, "superseded", ["confirm_readback"]);
  await createPrompt(bid, "confirm_readback", {
    action: r.intent, proposed_date: r.proposed_date ?? null, answer: r.answer_text_for_guest ?? null, original: text,
  });
  await logDecision(message_id, { intent: r.intent, confidence: r.confidence, entities: r, model: ai.MODEL, action: "readback_sent", routed: false });
  await smsNoor(`Nimeelewa: ${summary} kwa ${code(bid)}. Jibu 1 kutuma, 2 kughairi.`, bid);
  return { booking_id: bid };
}

async function resolveReadback(p: { id: string; booking_id: number | null; options: unknown }, yes: boolean, message_id: string) {
  await db.from("pending_prompts").update({ resolved_at: new Date().toISOString(), resolution: yes ? "confirmed" : "cancelled" }).eq("id", p.id);
  const o = p.options as { action: string; proposed_date: string | null; answer: string | null };
  await logDecision(message_id, { intent: yes ? "confirm_readback" : "reject_readback", confidence: 1, entities: o, model: "regex", action: yes ? o.action : "readback_cancelled", routed: false });
  if (!yes) {
    await smsNoor(`Sawa, ${code(p.booking_id!)} haijatumwa.`, p.booking_id);
    return { booking_id: p.booking_id };
  }
  await executeHostAction(p.booking_id!, o.action, o);
  return { booking_id: p.booking_id };
}

async function loadBooking(id: number) {
  const { data: b, error } = await db.from("bookings").select("*").eq("id", id).single();
  if (error) throw error;
  const { data: g } = await db.from("contacts").select("*").eq("id", b.guest_id).single();
  return { b: b as Booking, guest: g as Contact };
}

async function executeHostAction(id: number, action: string, o: { proposed_date?: string | null | undefined; answer?: string | null | undefined }) {
  const { b, guest } = await loadBooking(id);
  const s = await settings();
  const when = `${b.date_from} at ${b.slot ?? s.slots[0]}`;
  if (action === "approve") {
    await transition(b, "CONFIRMED", "noor");
    await resolvePrompts(id, "approved");
    await emailGuest(guest,
      `Dear ${firstName(guest.name)},\n\nGreat news — Noor has confirmed your coffee farm visit (${code(id)}) on ${when} for ${b.party_size} people. The price is ${s.price_per_person} ${s.currency} per person.\n\nHow to get there: ${s.directions}\n\nSee you soon!\nNoor's Farm Visits`, id);
    await smsNoor(`${code(id)} imethibitishwa. Mgeni ametumiwa maelekezo.`, id);
  } else if (action === "decline") {
    await transition(b, "DECLINED", "noor");
    await resolvePrompts(id, "declined");
    await emailGuest(guest,
      `Dear ${firstName(guest.name)},\n\nThank you for your interest in visiting our coffee farm. Unfortunately Noor cannot host you on ${when} (${code(id)}). We are sorry and hope to welcome you another time.\n\nNoor's Farm Visits`, id);
    await smsNoor(`${code(id)} imekataliwa. Mgeni amejulishwa.`, id);
  } else if (action === "ask_other_date") {
    await resolvePrompts(id, "other_day", ["approve_booking"]);
    await createPrompt(id, "ask_other_date");
    await smsNoor(`${code(id)}: Siku gani nyingine? Jibu mf. '${code(id)} ${addDays(b.date_from ?? localDate(new Date()), 1)}'`, id);
  } else if (action === "propose_other_date") {
    const date = o.proposed_date;
    if (!date) return smsNoor(SORRY);
    await transition(b, "COUNTER_OFFERED", "noor", { date_from: date, date_to: date });
    await resolvePrompts(id, "counter_offered");
    await emailGuest(guest,
      `Dear ${firstName(guest.name)},\n\nNoor cannot host you on the date you asked for, but she can offer ${date} at ${b.slot ?? s.slots[0]} for ${b.party_size} people (${code(id)}). Please reply "yes" to accept, or let us know if it does not suit you.\n\nNoor's Farm Visits`, id);
    await smsNoor(`${code(id)}: pendekezo ${swDate(date)} limetumwa kwa mgeni.`, id);
  } else if (action === "answer_question") {
    const answer = o.answer ?? "";
    await resolvePrompts(id, "answered", ["answer_question"]);
    await emailGuest(guest, `Dear ${firstName(guest.name)},\n\nNoor replied to your question:\n\n"${answer}"\n\nNoor's Farm Visits`, id);
    await smsNoor(`${code(id)}: jibu lako limetumwa.`, id);
  }
}

// ---------- guest ----------
async function findActiveBooking(guest: Contact, thread_ref: string | null): Promise<Booking | null> {
  if (thread_ref) {
    const n = Number(thread_ref.replace(/\D/g, ""));
    if (n) {
      const { data } = await db.from("bookings").select("*").eq("id", n).eq("guest_id", guest.id).maybeSingle();
      if (data) return data as Booking;
    }
  }
  const { data } = await db.from("bookings").select("*").eq("guest_id", guest.id)
    .not("status", "in", "(DECLINED,EXPIRED,CANCELLED,CLOSED)").order("created_at", { ascending: false }).limit(1);
  return (data?.[0] as Booking) ?? null;
}

function describe(b: Booking | null) {
  if (!b) return "none";
  return `${code(b.id)} status=${b.status} date=${b.date_from ?? "?"} slot=${b.slot ?? "?"} party=${b.party_size ?? "?"}`;
}

async function handleGuest(guest: Contact, message_id: string, text: string, thread_ref: string | null) {
  const s = await settings();
  let booking = await findActiveBooking(guest, thread_ref);
  let r: ai.GuestClassification;
  try {
    r = await ai.classifyGuest(text, { today: localDate(new Date()), slots: s.slots, booking: describe(booking) });
  } catch (e) {
    await logDecision(message_id, { intent: "error", confidence: null, model: ai.MODEL, action: `ai_error: ${String(e).slice(0, 120)}`, routed: true });
    booking = booking ?? (await newBooking(guest, text));
    await smsNoor(`${code(booking.id)} ujumbe kutoka ${firstName(guest.name)} (haukutafsiriwa): ${text}`, booking.id);
    await sendMessage("email", guest, "Thank you — Noor will get back to you.", { booking_id: booking.id });
    return { booking_id: booking.id };
  }

  if (r.language && r.language !== guest.language) {
    await db.from("contacts").update({ language: r.language }).eq("id", guest.id);
    guest = { ...guest, language: r.language };
  }
  await db.from("messages").update({ lang: r.language, text_translated: r.translation_for_noor, booking_id: booking?.id ?? null }).eq("id", message_id);
  const log = (action: string, routed = false) =>
    logDecision(message_id, { intent: r.intent, confidence: r.confidence, entities: { ...r.entities, missing: r.missing }, model: ai.MODEL, action, routed });

  // Low confidence / unknown → human.
  if (r.confidence < CONF_MIN || r.intent === "unknown") {
    booking = booking ?? (await newBooking(guest, text));
    await createPrompt(booking.id, "answer_question", { question: r.translation_for_noor });
    await smsNoor(`${code(booking.id)} ${firstName(guest.name)}: ${r.translation_for_noor}`, booking.id);
    await emailGuest(guest, "Thank you for your message. Noor will get back to you.", booking.id);
    await log("forwarded_to_noor", true);
    return { booking_id: booking.id };
  }

  switch (r.intent) {
    case "booking_request":
    case "modify": {
      // Guest accepting a counter-offer (Noor already chose the date).
      if (booking?.status === "COUNTER_OFFERED" && (!r.entities.date_from || r.entities.date_from === booking.date_from)) {
        await transition(booking, "CONFIRMED", "guest");
        await resolvePrompts(booking.id, "accepted");
        await emailGuest(guest, `Wonderful — your visit (${code(booking.id)}) on ${booking.date_from} at ${booking.slot ?? s.slots[0]} is confirmed.\n\nHow to get there: ${s.directions}\n\nNoor's Farm Visits`, booking.id);
        await smsNoor(`${code(booking.id)}: mgeni amekubali ${swDate(booking.date_from)}. Imethibitishwa.`, booking.id);
        await log("counter_offer_accepted");
        return { booking_id: booking.id };
      }
      const e = r.entities;
      const patch = {
        date_from: e.date_from ?? booking?.date_from ?? null,
        date_to: e.date_to ?? e.date_from ?? booking?.date_to ?? null,
        slot: e.slot && s.slots.includes(e.slot) ? e.slot : booking?.slot ?? null,
        party_size: e.party_size ?? booking?.party_size ?? null,
        notes_original: text, notes_translated: r.translation_for_noor,
      };
      if (!booking) booking = await newBooking(guest, text);
      const missing = [!patch.date_from && "date", !patch.party_size && "number of people"].filter(Boolean) as string[];
      if (missing.length) {
        const st = booking.status as BookingStatus;
        if (st === "INCOMPLETE") {
          await db.from("bookings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", booking.id);
        }
        await emailGuest(guest, `Thank you for your interest in visiting Noor's coffee farm! To pass your request to Noor, could you please tell us the ${missing.join(" and ")} for your visit? Tours run at ${s.slots.join(" and ")}.`, booking.id);
        await log(`asked_for_${missing.join("+").replace(/ /g, "_")}`);
        return { booking_id: booking.id };
      }
      if (!patch.slot) patch.slot = s.slots[0];
      booking = await transition(booking, "PENDING_NOOR", "system", patch);
      await resolvePrompts(booking.id, "superseded");
      await createPrompt(booking.id, "approve_booking", { 1: "approve", 2: "decline", 3: "other_day" });
      // Capacity check uses seeded max only — informational for Noor, never decided by AI.
      const { data: same } = await db.from("bookings").select("party_size").eq("date_from", patch.date_from!).eq("slot", patch.slot)
        .in("status", ["CONFIRMED", "PENDING_NOOR"]).neq("id", booking.id);
      const taken = (same ?? []).reduce((a, x) => a + (x.party_size ?? 0), 0);
      const over = taken + patch.party_size! > s.max_per_slot ? " ZIDI!" : "";
      const origin = SW_ORIGIN[guest.language] ?? guest.language.toUpperCase();
      await smsNoor(`${code(booking.id)}: ${firstName(guest.name)} (${origin}), watu ${patch.party_size}, ${swDate(patch.date_from)} ${swSlot(patch.slot)}${over}. Jibu 1=Ndiyo 2=Hapana 3=Siku nyingine`, booking.id);
      await emailGuest(guest, `Thank you! Your request (${code(booking.id)}) for ${patch.party_size} people on ${patch.date_from} at ${patch.slot} has been received. This is not yet a confirmation — Noor will confirm personally soon.`, booking.id);
      await log(r.intent === "modify" ? "modified_sent_to_noor" : "request_sent_to_noor", true);
      return { booking_id: booking.id };
    }
    case "cancel": {
      if (!booking || !canTransition(booking.status as BookingStatus, "CANCELLED", "guest")) {
        await emailGuest(guest, "We could not find an active booking to cancel. Noor will get back to you if needed.");
        await log("cancel_no_booking");
        return {};
      }
      await transition(booking, "CANCELLED", "guest");
      await resolvePrompts(booking.id, "cancelled_by_guest");
      await smsNoor(`${code(booking.id)} imefutwa na mgeni.`, booking.id);
      await emailGuest(guest, `Your booking ${code(booking.id)} has been cancelled. We hope to welcome you another time.`, booking.id);
      await log("cancelled");
      return { booking_id: booking.id };
    }
    case "question": {
      booking = booking ?? (await newBooking(guest, text));
      await createPrompt(booking.id, "answer_question", { question: r.translation_for_noor });
      await smsNoor(`${code(booking.id)} swali: ${r.translation_for_noor}`, booking.id);
      await emailGuest(guest, "Thank you for your question. Noor will get back to you personally.", booking.id);
      await log("question_forwarded", true);
      return { booking_id: booking.id };
    }
    case "feedback": {
      const { data: last } = await db.from("bookings").select("*").eq("guest_id", guest.id).order("created_at", { ascending: false }).limit(1);
      const fb = booking ?? ((last?.[0] as Booking) ?? null);
      const a = await ai.analyzeFeedback(text).catch(() => ({ translation_en: text, themes: [], sentiment: "neutral" as const }));
      await db.from("feedback").insert({ booking_id: fb?.id ?? null, text_original: text, lang: r.language, text_translated: a.translation_en, themes: a.themes, sentiment: a.sentiment });
      if (fb?.status === "FEEDBACK_REQUESTED") await transition(fb, "CLOSED", "system");
      await emailGuest(guest, "Thank you so much for your feedback — Noor will read every word.", fb?.id);
      await log("feedback_saved");
      return { booking_id: fb?.id };
    }
  }
  return {};
}

async function newBooking(guest: Contact, text: string): Promise<Booking> {
  const { data, error } = await db.from("bookings").insert({ guest_id: guest.id, status: "INCOMPLETE", notes_original: text }).select("*").single();
  if (error) throw error;
  return data as Booking;
}

// ---------- timers ----------
export async function runTimers(asOf = new Date()) {
  const log: string[] = [];
  const iso = asOf.toISOString();
  const { data: prompts } = await db.from("pending_prompts").select("*").is("resolved_at", null).eq("kind", "approve_booking");
  for (const p of prompts ?? []) {
    const age = asOf.getTime() - new Date(p.sent_at).getTime();
    if (age >= 48 * 3600e3) {
      const { b, guest } = await loadBooking(p.booking_id!);
      await db.from("pending_prompts").update({ resolved_at: iso, resolution: "expired" }).eq("id", p.id);
      if (canTransition(b.status as BookingStatus, "EXPIRED", "system")) {
        await transition(b, "EXPIRED", "system");
        await emailGuest(guest, `We are very sorry — Noor was not able to answer your request (${code(b.id)}) in time, so it has expired. You are welcome to send a new request.`, b.id);
        log.push(`${code(b.id)} expired`);
      }
    } else if (age >= 24 * 3600e3 && !p.nudged_at) {
      await db.from("pending_prompts").update({ nudged_at: iso }).eq("id", p.id);
      await smsNoor(`Kumbusho: ${code(p.booking_id!)} bado inasubiri jibu. Jibu 1=Ndiyo 2=Hapana 3=Siku nyingine`, p.booking_id);
      log.push(`${code(p.booking_id!)} nudged`);
    }
  }

  const today = localDate(asOf);
  const { data: confirmed } = await db.from("bookings").select("*").eq("status", "CONFIRMED");
  for (const b of (confirmed ?? []) as Booking[]) {
    if (!b.date_from) continue;
    const { data: g } = await db.from("contacts").select("*").eq("id", b.guest_id).single();
    if (b.date_from === addDays(today, 1) && localHour(asOf) >= 18) {
      const { error } = await db.from("reminders_sent").insert({ booking_id: b.id, kind: "day_before" });
      if (!error) {
        const extra = (b.party_size ?? 1) - 1;
        await smsNoor(`Kesho ${b.slot}: ${firstName(g!.name)}${extra > 0 ? ` +${extra}` : ""}, ${code(b.id)}`, b.id);
        log.push(`${code(b.id)} reminder`);
      }
    }
    if ((b.date_to ?? b.date_from) < today) {
      const v = await transition(b, "VISITED", "system");
      await transition(v, "FEEDBACK_REQUESTED", "system");
      await emailGuest(g as Contact, `Thank you for visiting Noor's coffee farm! How was your visit? Just reply to this email — Noor would love to hear what you enjoyed and what we could do better.`, b.id);
      log.push(`${code(b.id)} feedback requested`);
    }
  }
  return log;
}

export async function monthlyInsights() {
  const { data } = await db.from("feedback").select("text_translated, themes, sentiment").order("created_at", { ascending: false }).limit(200);
  if (!data?.length) {
    await smsNoor("Bado hakuna maoni ya wageni mwezi huu.");
    return [];
  }
  const items = data.map((f, i) => `${i + 1}. [${f.sentiment}] ${f.text_translated} (themes: ${f.themes.join(", ")})`).join("\n");
  const r = await ai.summarizeFeedback(items);
  for (const line of r.lines.slice(0, 3)) await smsNoor(line);
  return r.lines;
}

export async function resetDemo() {
  const { error } = await db.rpc("reset_demo");
  if (error) throw error;
}
