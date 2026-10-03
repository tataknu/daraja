// Noor's replies by SMS: keypad answers act directly; free text is read by the AI and read back to
// her before anything happens.
import { code } from "./booking-state";
import { CONF_MIN, type Ctx } from "./context";
import { addDays, firstName, localDate, swDate } from "./format";
import { parseHostReply } from "./host-replies";
import type { InboundResult, Prompt } from "./types";

export const SORRY = "Samahani, sikuelewa. Jibu mf. 'B14 1'.";

export async function handleHost(ctx: Ctx, messageId: string, text: string): Promise<InboundResult> {
  const open = await ctx.repo.openPrompts(ctx.now());
  const cmd = parseHostReply(text, open);

  switch (cmd.kind) {
    case "readback":
      return resolveReadback(ctx, cmd.prompt, cmd.yes, messageId);

    case "propose_date":
      await ctx.log(messageId, { intent: "propose_other_date", confidence: 1, entities: { date: cmd.date }, model: "regex", action: "counter_offer", routed: false });
      await executeHostAction(ctx, cmd.bookingId, "propose_other_date", { proposed_date: cmd.date });
      return { booking_id: cmd.bookingId };

    case "ask_which":
      await ctx.log(messageId, { intent: "unknown", confidence: 1, entities: { choice: cmd.choice, waiting: cmd.codes }, model: "regex", action: "asked_which_booking", routed: true });
      await ctx.smsNoor(`Maombi ${cmd.codes.length} yanasubiri: ${cmd.codes.join(", ")}. Jibu mf. '${cmd.codes[0]} ${cmd.choice}'.`);
      return {};

    case "no_open_request":
      await ctx.log(messageId, { intent: "unknown", confidence: 1, entities: { booking: cmd.bookingId, choice: cmd.choice }, model: "regex", action: "no_open_prompt", routed: true });
      await ctx.smsNoor(SORRY);
      return { booking_id: cmd.bookingId };

    case "act":
      await ctx.log(messageId, { intent: cmd.action, confidence: 1, entities: { booking: cmd.bookingId, choice: cmd.choice }, model: "regex", action: cmd.action, routed: false });
      await executeHostAction(ctx, cmd.bookingId, cmd.action, {});
      return { booking_id: cmd.bookingId };

    case "free_text":
      return readFreeText(ctx, open, messageId, text);
  }
}

/** Free text: the AI interprets it, then Noor confirms the read-back with 1 or 2. */
async function readFreeText(ctx: Ctx, open: Prompt[], messageId: string, text: string): Promise<InboundResult> {
  const openLines = open.length ? open.map((p) => `${code(p.booking_id!)} (${p.kind})`).join("\n") : "(none)";
  let r;
  try {
    r = await ctx.ai.classifyHost(text, { today: localDate(ctx.now()), openPrompts: openLines });
  } catch (e) {
    await ctx.log(messageId, { intent: "error", confidence: null, model: ctx.ai.model, action: `ai_error: ${String(e).slice(0, 120)}`, routed: true });
    await ctx.smsNoor(SORRY);
    return {};
  }
  const bid = r.booking ? Number(String(r.booking).replace(/\D/g, "")) : NaN;
  const valid = open.some((p) => p.booking_id === bid && p.kind !== "confirm_readback");
  if (r.confidence < CONF_MIN || r.intent === "unknown" || !valid) {
    await ctx.log(messageId, { intent: r.intent, confidence: r.confidence, entities: r, model: ctx.ai.model, action: "asked_to_rephrase", routed: true });
    await ctx.smsNoor(SORRY);
    return {};
  }

  const summary =
    r.intent === "approve" ? "kubali"
    : r.intent === "decline" ? "kataa"
    : r.intent === "propose_other_date" ? `pendekeza ${swDate(r.proposed_date ?? null)}`
    : `jibu: "${(r.answer_text_for_guest ?? "").slice(0, 60)}"`;
  await ctx.repo.resolvePrompts(bid, "superseded", ctx.now(), ["confirm_readback"]);
  await ctx.repo.createPrompt(bid, "confirm_readback", {
    action: r.intent, proposed_date: r.proposed_date ?? null, answer: r.answer_text_for_guest ?? null, original: text,
  });
  await ctx.log(messageId, { intent: r.intent, confidence: r.confidence, entities: r, model: ctx.ai.model, action: "readback_sent", routed: false });
  await ctx.smsNoor(`Nimeelewa: ${summary} kwa ${code(bid)}. Jibu 1 kutuma, 2 kughairi.`, bid);
  return { booking_id: bid };
}

interface ReadbackOptions {
  action: string;
  proposed_date: string | null;
  answer: string | null;
}

async function resolveReadback(ctx: Ctx, p: Prompt, yes: boolean, messageId: string): Promise<InboundResult> {
  await ctx.repo.resolvePrompt(p.id, yes ? "confirmed" : "cancelled", ctx.now());
  const o = p.options as ReadbackOptions;
  await ctx.log(messageId, { intent: yes ? "confirm_readback" : "reject_readback", confidence: 1, entities: o, model: "regex", action: yes ? o.action : "readback_cancelled", routed: false });
  if (!yes) {
    await ctx.smsNoor(`Sawa, ${code(p.booking_id!)} haijatumwa.`, p.booking_id);
    return { booking_id: p.booking_id };
  }
  await executeHostAction(ctx, p.booking_id!, o.action, o);
  return { booking_id: p.booking_id };
}

/** What happens once Noor has decided. Every guest message is written in English and sent in their language. */
async function executeHostAction(
  ctx: Ctx,
  id: number,
  action: string,
  o: { proposed_date?: string | null | undefined; answer?: string | null | undefined },
) {
  const b = await ctx.repo.booking(id);
  const guest = await ctx.repo.contact(b.guest_id);
  const s = await ctx.repo.settings();
  const now = ctx.now();
  const when = `${b.date_from} at ${b.slot ?? s.slots[0]}`;
  const first = firstName(guest.name);

  if (action === "approve") {
    await ctx.transition(b, "CONFIRMED", "noor");
    await ctx.repo.resolvePrompts(id, "approved", now);
    await ctx.emailGuest(guest,
      `Dear ${first},\n\nGreat news — Noor has confirmed your coffee farm visit (${code(id)}) on ${when} for ${b.party_size} people. The price is ${s.price_per_person} ${s.currency} per person.\n\nHow to get there: ${s.directions}\n\nSee you soon!\nNoor's Farm Visits`, id);
    await ctx.smsNoor(`${code(id)} imethibitishwa. Mgeni ametumiwa maelekezo.`, id);
  } else if (action === "decline") {
    await ctx.transition(b, "DECLINED", "noor");
    await ctx.repo.resolvePrompts(id, "declined", now);
    await ctx.emailGuest(guest,
      `Dear ${first},\n\nThank you for your interest in visiting our coffee farm. Unfortunately Noor cannot host you on ${when} (${code(id)}). We are sorry and hope to welcome you another time.\n\nNoor's Farm Visits`, id);
    await ctx.smsNoor(`${code(id)} imekataliwa. Mgeni amejulishwa.`, id);
  } else if (action === "ask_other_date") {
    await ctx.repo.resolvePrompts(id, "other_day", now, ["approve_booking"]);
    await ctx.repo.createPrompt(id, "ask_other_date");
    await ctx.smsNoor(`${code(id)}: Siku gani nyingine? Jibu mf. '${code(id)} ${addDays(b.date_from ?? localDate(now), 1)}'`, id);
  } else if (action === "propose_other_date") {
    const date = o.proposed_date;
    if (!date) return ctx.smsNoor(SORRY);
    await ctx.transition(b, "COUNTER_OFFERED", "noor", { date_from: date, date_to: date });
    await ctx.repo.resolvePrompts(id, "counter_offered", now);
    await ctx.emailGuest(guest,
      `Dear ${first},\n\nNoor cannot host you on the date you asked for, but she can offer ${date} at ${b.slot ?? s.slots[0]} for ${b.party_size} people (${code(id)}). Please reply "yes" to accept, or let us know if it does not suit you.\n\nNoor's Farm Visits`, id);
    await ctx.smsNoor(`${code(id)}: pendekezo ${swDate(date)} limetumwa kwa mgeni.`, id);
  } else if (action === "answer_question") {
    await ctx.repo.resolvePrompts(id, "answered", now, ["answer_question"]);
    await ctx.emailGuest(guest, `Dear ${first},\n\nNoor replied to your question:\n\n"${o.answer ?? ""}"\n\nNoor's Farm Visits`, id);
    await ctx.smsNoor(`${code(id)}: jibu lako limetumwa.`, id);
  }
}
