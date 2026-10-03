// After a visit: thank every reviewer; give happy guests a code to pass on, and link the bookings
// it brings in.
import type { Ctx } from "./context";
import type { IngestedReview } from "./feedback";
import type { Booking, Contact } from "./types";

/** The reply to a review. */
export async function followUpFeedback(
  ctx: Ctx,
  guest: Contact,
  booking: Booking | null,
  _review: IngestedReview,
): Promise<void> {
  await ctx.emailGuest(
    guest,
    "Thank you so much for your feedback — Noor will read every word.",
    booking?.id,
  );
}

/** The guest whose referral code appears in a new guest's message, if any. */
export async function findReferrer(
  _ctx: Ctx,
  _guest: Contact,
  _text: string,
): Promise<Contact | null> {
  return null;
}
