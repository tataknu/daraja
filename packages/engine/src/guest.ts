// Guests' emails: the AI classifies and translates; this module decides what happens.
import type { GuestClassification } from "./ai/types";
import { code, canTransition, type BookingStatus } from "./booking-state";
import { CONF_MIN, type Ctx } from "./context";
import { firstName, localDate, swDate, swOrigin, swSlot } from "./format";
import type { Booking, Contact, FarmSettings, InboundResult } from "./types";

/** The booking a guest's email is about: the one in the thread, else their newest open booking. */
async function findActiveBooking(ctx: Ctx, guest: Contact, threadRef: string | null): Promise<Booking | null> {
  if (threadRef) {
    const n = Number(threadRef.replace(/\D/g, ""));
    if (n) {
      const b = await ctx.repo.guestBooking(guest.id, n);
      if (b) return b;
    }
  }
  return ctx.repo.activeBooking(guest.id);
}

function describe(b: Booking | null) {
  if (!b) return "none";
  return `${code(b.id)} status=${b.status} date=${b.date_from ?? "?"} slot=${b.slot ?? "?"} party=${b.party_size ?? "?"}`;
}

async function saveFeedback(ctx: Ctx, bookingId: number | null, text: string, lang: string) {
  const a = await ctx.ai
    .analyzeFeedback(text)
    .catch(() => ({ translation_en: text, themes: [] as string[], sentiment: "neutral" as const }));
  await ctx.repo.saveFeedback({
    booking_id: bookingId, text_original: text, lang, text_translated: a.translation_en, themes: a.themes, sentiment: a.sentiment,
  });
}

export async function handleGuest(
  ctx: Ctx,
  guestIn: Contact,
  messageId: string,
  text: string,
  threadRef: string | null,
): Promise<InboundResult> {
  let guest = guestIn;
  const s = await ctx.repo.settings();
  let booking = await findActiveBooking(ctx, guest, threadRef);
  const newBooking = () => ctx.repo.createBooking(guest.id, text);

  let r: GuestClassification;
  try {
    r = await ctx.ai.classifyGuest(text, { today: localDate(ctx.now()), slots: s.slots, booking: describe(booking) });
  } catch (e) {
    // The AI is down: hand the raw message to Noor so nobody is left without an answer.
    await ctx.log(messageId, { intent: "error", confidence: null, model: ctx.ai.model, action: `ai_error: ${String(e).slice(0, 120)}`, routed: true });
    booking = booking ?? (await newBooking());
    await ctx.smsNoor(`${code(booking.id)} ujumbe kutoka ${firstName(guest.name)} (haukutafsiriwa): ${text}`, booking.id);
    await ctx.sendMessage("email", guest, "Thank you — Noor will get back to you.", { booking_id: booking.id });
    return { booking_id: booking.id };
  }

  if (r.language && r.language !== guest.language) {
    await ctx.repo.setContactLanguage(guest.id, r.language);
    guest = { ...guest, language: r.language };
  }
  const text_en = await ctx.englishOf(text, r.language);
  await ctx.repo.updateMessage(messageId, {
    lang: r.language, text_translated: r.translation_for_noor, text_en, booking_id: booking?.id ?? null,
  });
  const log = (action: string, routed = false) =>
    ctx.log(messageId, { intent: r.intent, confidence: r.confidence, entities: { ...r.entities, missing: r.missing }, model: ctx.ai.model, action, routed });

  // Any message may also carry feedback: save it, then continue with the main intent.
  if (r.intent !== "feedback" && r.feedback_text?.trim()) {
    const fbBooking = booking ?? (await ctx.repo.latestBooking(guest.id));
    await saveFeedback(ctx, fbBooking?.id ?? null, r.feedback_text.trim(), r.language);
    await ctx.log(messageId, { intent: "feedback", confidence: r.confidence, entities: { feedback_text: r.feedback_text }, model: ctx.ai.model, action: "side_feedback_saved", routed: false });
  }

  // Low confidence or unknown: a human decides.
  if (r.confidence < CONF_MIN || r.intent === "unknown") {
    booking = booking ?? (await newBooking());
    await ctx.repo.createPrompt(booking.id, "answer_question", { question: r.translation_for_noor });
    await ctx.smsNoor(`${code(booking.id)} ${firstName(guest.name)}: ${r.translation_for_noor}`, booking.id);
    await ctx.emailGuest(guest, "Thank you for your message. Noor will get back to you.", booking.id);
    await log("forwarded_to_noor", true);
    return { booking_id: booking.id };
  }

  switch (r.intent) {
    case "booking_request":
    case "modify":
      return requestBooking(ctx, s, guest, text, r, booking, log);

    case "cancel": {
      if (!booking || !canTransition(booking.status as BookingStatus, "CANCELLED", "guest")) {
        await ctx.emailGuest(guest, "We could not find an active booking to cancel. Noor will get back to you if needed.");
        await log("cancel_no_booking");
        return {};
      }
      await ctx.transition(booking, "CANCELLED", "guest");
      await ctx.repo.resolvePrompts(booking.id, "cancelled_by_guest", ctx.now());
      await ctx.smsNoor(`${code(booking.id)} imefutwa na mgeni.`, booking.id);
      await ctx.emailGuest(guest, `Your booking ${code(booking.id)} has been cancelled. We hope to welcome you another time.`, booking.id);
      await log("cancelled");
      return { booking_id: booking.id };
    }

    case "question": {
      booking = booking ?? (await newBooking());
      await ctx.repo.createPrompt(booking.id, "answer_question", { question: r.translation_for_noor });
      await ctx.smsNoor(`${code(booking.id)} swali: ${r.translation_for_noor}`, booking.id);
      await ctx.emailGuest(guest, "Thank you for your question. Noor will get back to you personally.", booking.id);
      await log("question_forwarded", true);
      return { booking_id: booking.id };
    }

    case "feedback": {
      const fb = booking ?? (await ctx.repo.latestBooking(guest.id));
      await saveFeedback(ctx, fb?.id ?? null, r.feedback_text?.trim() || text, r.language);
      if (fb?.status === "FEEDBACK_REQUESTED") await ctx.transition(fb, "CLOSED", "system");
      await ctx.emailGuest(guest, "Thank you so much for your feedback — Noor will read every word.", fb?.id);
      await log("feedback_saved");
      return { booking_id: fb?.id };
    }
  }
  return {};
}

/** A booking request or change: ask for what's missing, or send it to Noor for a yes or no. */
async function requestBooking(
  ctx: Ctx,
  s: FarmSettings,
  guest: Contact,
  text: string,
  r: GuestClassification,
  existing: Booking | null,
  log: (action: string, routed?: boolean) => Promise<void>,
): Promise<InboundResult> {
  let booking = existing;

  // Guest accepting a counter-offer (Noor already chose the date).
  if (booking?.status === "COUNTER_OFFERED" && (!r.entities.date_from || r.entities.date_from === booking.date_from)) {
    await ctx.transition(booking, "CONFIRMED", "guest");
    await ctx.repo.resolvePrompts(booking.id, "accepted", ctx.now());
    await ctx.emailGuest(guest, `Wonderful — your visit (${code(booking.id)}) on ${booking.date_from} at ${booking.slot ?? s.slots[0]} is confirmed.\n\nHow to get there: ${s.directions}\n\nNoor's Farm Visits`, booking.id);
    await ctx.smsNoor(`${code(booking.id)}: mgeni amekubali ${swDate(booking.date_from)}. Imethibitishwa.`, booking.id);
    await log("counter_offer_accepted");
    return { booking_id: booking.id };
  }

  const e = r.entities;
  const patch = {
    date_from: e.date_from ?? booking?.date_from ?? null,
    date_to: e.date_to ?? e.date_from ?? booking?.date_to ?? null,
    slot: e.slot && s.slots.includes(e.slot) ? e.slot : (booking?.slot ?? null),
    party_size: e.party_size ?? booking?.party_size ?? null,
    notes_original: text,
    notes_translated: r.translation_for_noor,
  };
  if (!booking) booking = await ctx.repo.createBooking(guest.id, text);

  const missing = [!patch.date_from && "date", !patch.party_size && "number of people"].filter(Boolean) as string[];
  if (missing.length) {
    if ((booking.status as BookingStatus) === "INCOMPLETE") {
      await ctx.repo.updateBooking(booking.id, { ...patch, updated_at: ctx.now().toISOString() });
    }
    await ctx.emailGuest(guest, `Thank you for your interest in visiting Noor's coffee farm! To pass your request to Noor, could you please tell us the ${missing.join(" and ")} for your visit? Tours run at ${s.slots.join(" and ")}.`, booking.id);
    await log(`asked_for_${missing.join("+").replace(/ /g, "_")}`);
    return { booking_id: booking.id };
  }

  if (!patch.slot) patch.slot = s.slots[0] ?? "09:00";
  booking = await ctx.transition(booking, "PENDING_NOOR", "system", patch);
  await ctx.repo.resolvePrompts(booking.id, "superseded", ctx.now());
  await ctx.repo.createPrompt(booking.id, "approve_booking", { 1: "approve", 2: "decline", 3: "other_day" });

  // Capacity is checked by code against the configured maximum and shown to Noor; AI never decides it.
  const taken = await ctx.repo.partySizeBooked(patch.date_from!, patch.slot, booking.id);
  const over = taken + patch.party_size! > s.max_per_slot ? " ZIDI!" : "";
  await ctx.smsNoor(`${code(booking.id)}: ${firstName(guest.name)} (${swOrigin(guest.language)}), watu ${patch.party_size}, ${swDate(patch.date_from)} ${swSlot(patch.slot)}${over}. Jibu 1=Ndiyo 2=Hapana 3=Siku nyingine`, booking.id);
  await ctx.emailGuest(guest, `Thank you! Your request (${code(booking.id)}) for ${patch.party_size} people on ${patch.date_from} at ${patch.slot} has been received. This is not yet a confirmation — Noor will confirm personally soon.`, booking.id);
  await log(r.intent === "modify" ? "modified_sent_to_noor" : "request_sent_to_noor", true);
  return { booking_id: booking.id };
}
