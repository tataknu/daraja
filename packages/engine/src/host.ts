// Noor's replies by SMS: keypad answers act directly; free text is read by the AI and read back to
// her before anything happens.
import { code } from "./booking-state";
import { CONF_MIN, type Ctx } from "./context";
import { addDays, enDate, firstName, localDate, swDate } from "./format";
import { parseHostReply } from "./host-replies";
import type { Contact, InboundResult, Prompt } from "./types";

export const SORRY = "Samahani, sikuelewa. Jibu mf. 'B14 1'.";
const SORRY_EN = "Sorry, I didn't understand. Reply e.g. 'B14 1'.";

export async function handleHost(
  ctx: Ctx,
  noor: Contact,
  messageId: string,
  text: string,
): Promise<InboundResult> {
  const open = await ctx.repo.openPrompts(ctx.now());
  const cmd = parseHostReply(text, open);
  // Free text gets its English from the AI that reads it; a keypad reply needs one only with words.
  if (cmd.kind !== "free_text") {
    const en = await ctx.englishOf(text, noor.language);
    if (en) await ctx.repo.updateMessage(messageId, { text_en: en });
  }

  switch (cmd.kind) {
    case "readback":
      return resolveReadback(ctx, cmd.prompt, cmd.yes, messageId);

    case "propose_date":
      await ctx.log(messageId, {
        intent: "propose_other_date",
        confidence: 1,
        entities: { date: cmd.date },
        model: "regex",
        action: "counter_offer",
        routed: false,
      });
      await executeHostAction(ctx, cmd.bookingId, "propose_other_date", {
        proposed_date: cmd.date,
      });
      return { booking_id: cmd.bookingId };

    case "ask_which":
      await ctx.log(messageId, {
        intent: "unknown",
        confidence: 1,
        entities: { choice: cmd.choice, waiting: cmd.codes },
        model: "regex",
        action: "asked_which_booking",
        routed: true,
      });
      await ctx.smsNoor(
        `Maombi ${cmd.codes.length} yanasubiri: ${cmd.codes.join(", ")}. Jibu mf. '${cmd.codes[0]} ${cmd.choice}'.`,
        `${cmd.codes.length} requests are waiting: ${cmd.codes.join(", ")}. Reply e.g. '${cmd.codes[0]} ${cmd.choice}'.`,
      );
      return {};

    case "no_open_request":
      await ctx.log(messageId, {
        intent: "unknown",
        confidence: 1,
        entities: { booking: cmd.bookingId, choice: cmd.choice },
        model: "regex",
        action: "no_open_prompt",
        routed: true,
      });
      await ctx.smsNoor(SORRY, SORRY_EN);
      return { booking_id: cmd.bookingId };

    case "act":
      await ctx.log(messageId, {
        intent: cmd.action,
        confidence: 1,
        entities: { booking: cmd.bookingId, choice: cmd.choice },
        model: "regex",
        action: cmd.action,
        routed: false,
      });
      await executeHostAction(ctx, cmd.bookingId, cmd.action, {});
      return { booking_id: cmd.bookingId };

    case "free_text":
      return readFreeText(ctx, open, messageId, text);
  }
}

/** Free text: the AI interprets it, then Noor confirms the read-back with 1 or 2. */
async function readFreeText(
  ctx: Ctx,
  open: Prompt[],
  messageId: string,
  text: string,
): Promise<InboundResult> {
  const openLines = open.length
    ? open.map((p) => `${code(p.booking_id!)} (${p.kind})`).join("\n")
    : "(none)";
  let r;
  try {
    r = await ctx.ai.classifyHost(text, { today: localDate(ctx.now()), openPrompts: openLines });
  } catch (e) {
    await ctx.log(messageId, {
      intent: "error",
      confidence: null,
      model: ctx.ai.model,
      action: `ai_error: ${String(e).slice(0, 120)}`,
      routed: true,
    });
    await ctx.smsNoor(SORRY, SORRY_EN);
    return {};
  }
  if (r.translation_en) await ctx.repo.updateMessage(messageId, { text_en: r.translation_en });
  const bid = r.booking ? Number(String(r.booking).replace(/\D/g, "")) : NaN;
  const valid = open.some((p) => p.booking_id === bid && p.kind !== "confirm_readback");
  if (r.confidence < CONF_MIN || r.intent === "unknown" || !valid) {
    await ctx.log(messageId, {
      intent: r.intent,
      confidence: r.confidence,
      entities: r,
      model: ctx.ai.model,
      action: "asked_to_rephrase",
      routed: true,
    });
    await ctx.smsNoor(SORRY, SORRY_EN);
    return {};
  }

  const date = r.proposed_date ?? null;
  const answer = `"${(r.answer_text_for_guest ?? "").slice(0, 60)}"`;
  const [summary, summaryEn] =
    r.intent === "approve"
      ? ["kubali", "approve"]
      : r.intent === "decline"
        ? ["kataa", "decline"]
        : r.intent === "propose_other_date"
          ? [`pendekeza ${swDate(date)}`, `propose ${enDate(date)}`]
          : [`jibu: ${answer}`, `reply: ${answer}`];
  await ctx.repo.resolvePrompts(bid, "superseded", ctx.now(), ["confirm_readback"]);
  await ctx.repo.createPrompt(bid, "confirm_readback", {
    action: r.intent,
    proposed_date: r.proposed_date ?? null,
    answer: r.answer_text_for_guest ?? null,
    original: text,
  });
  await ctx.log(messageId, {
    intent: r.intent,
    confidence: r.confidence,
    entities: r,
    model: ctx.ai.model,
    action: "readback_sent",
    routed: false,
  });
  await ctx.smsNoor(
    `Nimeelewa: ${summary} kwa ${code(bid)}. Jibu 1 kutuma, 2 kughairi.`,
    `Understood: ${summaryEn} for ${code(bid)}. Reply 1 to send, 2 to cancel.`,
    bid,
  );
  return { booking_id: bid };
}

interface ReadbackOptions {
  action: string;
  proposed_date: string | null;
  answer: string | null;
}

async function resolveReadback(
  ctx: Ctx,
  p: Prompt,
  yes: boolean,
  messageId: string,
): Promise<InboundResult> {
  await ctx.repo.resolvePrompt(p.id, yes ? "confirmed" : "cancelled", ctx.now());
  const o = p.options as ReadbackOptions;
  await ctx.log(messageId, {
    intent: yes ? "confirm_readback" : "reject_readback",
    confidence: 1,
    entities: o,
    model: "regex",
    action: yes ? o.action : "readback_cancelled",
    routed: false,
  });
  if (!yes) {
    await ctx.smsNoor(
      `Sawa, ${code(p.booking_id!)} haijatumwa.`,
      `OK, ${code(p.booking_id!)} was not sent.`,
      p.booking_id,
    );
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
    await ctx.emailGuest(
      guest,
      `Dear ${first},\n\nGreat news — Noor has confirmed your coffee farm visit (${code(id)}) on ${when} for ${b.party_size} people. The price is ${s.price_per_person} ${s.currency} per person.\n\nHow to get there: ${s.directions}\n\nSee you soon!\nNoor's Farm Visits`,
      id,
    );
    await ctx.smsNoor(
      `${code(id)} imethibitishwa. Mgeni ametumiwa maelekezo.`,
      `${code(id)} is confirmed. The guest has been sent directions.`,
      id,
    );
  } else if (action === "decline") {
    await ctx.transition(b, "DECLINED", "noor");
    await ctx.repo.resolvePrompts(id, "declined", now);
    await ctx.emailGuest(
      guest,
      `Dear ${first},\n\nThank you for your interest in visiting our coffee farm. Unfortunately Noor cannot host you on ${when} (${code(id)}). We are sorry and hope to welcome you another time.\n\nNoor's Farm Visits`,
      id,
    );
    await ctx.smsNoor(
      `${code(id)} imekataliwa. Mgeni amejulishwa.`,
      `${code(id)} is declined. The guest has been told.`,
      id,
    );
  } else if (action === "ask_other_date") {
    await ctx.repo.resolvePrompts(id, "other_day", now, ["approve_booking"]);
    await ctx.repo.createPrompt(id, "ask_other_date");
    const example = `${code(id)} ${addDays(b.date_from ?? localDate(now), 1)}`;
    await ctx.smsNoor(
      `${code(id)}: Siku gani nyingine? Jibu mf. '${example}'`,
      `${code(id)}: Which other day? Reply e.g. '${example}'`,
      id,
    );
  } else if (action === "propose_other_date") {
    const date = o.proposed_date;
    if (!date) return ctx.smsNoor(SORRY, SORRY_EN);
    await ctx.transition(b, "COUNTER_OFFERED", "noor", { date_from: date, date_to: date });
    await ctx.repo.resolvePrompts(id, "counter_offered", now);
    await ctx.emailGuest(
      guest,
      `Dear ${first},\n\nNoor cannot host you on the date you asked for, but she can offer ${date} at ${b.slot ?? s.slots[0]} for ${b.party_size} people (${code(id)}). Please reply "yes" to accept, or let us know if it does not suit you.\n\nNoor's Farm Visits`,
      id,
    );
    await ctx.smsNoor(
      `${code(id)}: pendekezo ${swDate(date)} limetumwa kwa mgeni.`,
      `${code(id)}: the offer of ${enDate(date)} has been sent to the guest.`,
      id,
    );
  } else if (action === "answer_question") {
    await ctx.repo.resolvePrompts(id, "answered", now, ["answer_question"]);
    await ctx.emailGuest(
      guest,
      `Dear ${first},\n\nNoor replied to your question:\n\n"${o.answer ?? ""}"\n\nNoor's Farm Visits`,
      id,
    );
    await ctx.smsNoor(
      `${code(id)}: jibu lako limetumwa.`,
      `${code(id)}: your reply has been sent.`,
      id,
    );
  }
}
