// Time-based work, run by the cron hook: nudge Noor after 24 h, expire requests after 48 h, remind
// her the evening before a visit, and ask guests for feedback after their visit.
import { canTransition, code, type BookingStatus } from "./booking-state";
import type { Ctx } from "./context";
import { addDays, firstName, localDate, localHour } from "./format";

const HOUR = 3600e3;

export async function runTimers(ctx: Ctx, asOf: Date): Promise<string[]> {
  const { repo } = ctx;
  const log: string[] = [];

  for (const p of await repo.unresolvedPrompts("approve_booking")) {
    ctx.trace.booking_id = p.booking_id;
    const age = asOf.getTime() - new Date(p.sent_at).getTime();
    if (age >= 48 * HOUR) {
      const b = await repo.booking(p.booking_id!);
      const guest = await repo.contact(b.guest_id);
      await repo.resolvePrompt(p.id, "expired", asOf);
      if (canTransition(b.status as BookingStatus, "EXPIRED", "system")) {
        await ctx.transition(b, "EXPIRED", "system");
        await ctx.emailGuest(
          guest,
          `We are very sorry — Noor was not able to answer your request (${code(b.id)}) in time, so it has expired. You are welcome to send a new request.`,
          b.id,
        );
        log.push(`${code(b.id)} expired`);
      }
    } else if (age >= 24 * HOUR && !p.nudged_at) {
      await repo.markNudged(p.id, asOf);
      await ctx.smsNoor(
        `Kumbusho: ${code(p.booking_id!)} bado inasubiri jibu. Jibu 1=Ndiyo 2=Hapana 3=Siku nyingine`,
        `Reminder: ${code(p.booking_id!)} is still waiting for your reply. Reply 1=Yes 2=No 3=Other day`,
        p.booking_id,
      );
      log.push(`${code(p.booking_id!)} nudged`);
    }
    await ctx.flushUsage("timers");
  }

  const today = localDate(asOf);
  for (const b of await repo.bookingsWithStatus("CONFIRMED")) {
    if (!b.date_from) continue;
    ctx.trace.booking_id = b.id;
    const guest = await repo.contact(b.guest_id);
    if (
      b.date_from === addDays(today, 1) &&
      localHour(asOf) >= 18 &&
      (await repo.recordReminder(b.id, "day_before"))
    ) {
      const extra = (b.party_size ?? 1) - 1;
      const who = `${firstName(guest.name)}${extra > 0 ? ` +${extra}` : ""}, ${code(b.id)}`;
      await ctx.smsNoor(`Kesho ${b.slot}: ${who}`, `Tomorrow ${b.slot}: ${who}`, b.id);
      log.push(`${code(b.id)} reminder`);
    }
    if ((b.date_to ?? b.date_from) < today) {
      const visited = await ctx.transition(b, "VISITED", "system");
      await ctx.transition(visited, "FEEDBACK_REQUESTED", "system");
      await ctx.emailGuest(
        guest,
        `Thank you for visiting Noor's coffee farm! How was your visit? Just reply to this email — Noor would love to hear what you enjoyed and what we could do better.`,
        b.id,
      );
      log.push(`${code(b.id)} feedback requested`);
    }
    await ctx.flushUsage("timers");
  }
  return log;
}
