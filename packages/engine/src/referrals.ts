// After a visit: thank every reviewer; give happy guests a code to pass on, and link the bookings
// it brings in.
import type { Ctx } from "./context";
import type { IngestedReview } from "./feedback";
import { firstName } from "./format";
import type { Booking, Contact } from "./types";

const THANKS = "Thank you so much for your feedback — Noor will read every word.";
const APOLOGY =
  "We are sorry your visit was not all you hoped for. Noor will read your message carefully.";
const inviteWithCode = (code: string) =>
  `Your personal code is ${code}. If you know friends who would enjoy a visit, pass it on: when they mention it in their email, Noor will know you sent them.\n\nAnd we would love to welcome you back one day, to see a different stage of the coffee.`;

/** No 0, O, 1 or I: codes get read out and typed by hand. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_IN_TEXT = /\b[A-Z]{2,12}-[A-HJ-NP-Z2-9]{3}\b/gi;
/** Latin letters that accent-stripping leaves alone, as a visitor would spell them in ASCII. */
const SPECIAL_LETTERS: Record<string, string> = {
  Æ: "AE",
  Œ: "OE",
  Ø: "O",
  Đ: "D",
  Ð: "D",
  Ł: "L",
  Þ: "TH",
};
const ATTEMPTS = 5;
const FRIEND_OF = ", rafiki wa ";
const SMS_LENGTH = 160; // one segment, as in sms160
/** Booking statuses once the visit has happened. */
const AFTER_VISIT = ["VISITED", "FEEDBACK_REQUESTED", "CLOSED"];

/** The reply to a review: always one email. Happy guests also get a code and an invitation back. */
export async function followUpFeedback(
  ctx: Ctx,
  guest: Contact,
  booking: Booking | null,
  review: IngestedReview,
): Promise<void> {
  let extra = "";
  if (review.sentiment === "positive") extra = await inviteBack(ctx, guest, booking);
  else if (review.sentiment === "negative") extra = APOLOGY;
  await ctx.emailGuest(guest, extra ? `${THANKS}\n\n${extra}` : THANKS, booking?.id);
}

/**
 * The code and an invitation back: once per booking after the visit, or once per guest when
 * there's no booking. A thank-you before the visit gets neither, and keeps the booking's invite.
 */
async function inviteBack(ctx: Ctx, guest: Contact, booking: Booking | null): Promise<string> {
  if (booking ? !AFTER_VISIT.includes(booking.status) : guest.referral_code) return "";
  const code = await ensureReferralCode(ctx, guest);
  if (booking && !(await ctx.repo.recordReminder(booking.id, "referral_invite"))) return "";
  return inviteWithCode(code);
}

/** "Zoë Müller" -> "ZOE-K7P": the first name's Latin letters, or FRIEND if under two. */
export function referralCode(name: string, random: () => number = Math.random): string {
  const letters = firstName(name)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, (c) => SPECIAL_LETTERS[c] ?? "")
    .slice(0, 12);
  const suffix = Array.from({ length: 3 }, () =>
    ALPHABET.charAt(Math.floor(random() * ALPHABET.length)),
  ).join("");
  // At least two letters, so the code is found again in a message.
  return `${letters.length >= 2 ? letters : "FRIEND"}-${suffix}`;
}

/** The guest's referral code; one that nobody has yet is made and saved if they have none. */
export async function ensureReferralCode(
  ctx: Ctx,
  guest: Contact,
  random: () => number = Math.random,
): Promise<string> {
  if (guest.referral_code) return guest.referral_code;
  for (let i = 0; i < ATTEMPTS; i++) {
    const code = referralCode(guest.name, random);
    if (await ctx.repo.contactByReferralCode(code)) continue;
    // Two reviews at once: the code stored first is kept, and both replies give that one.
    return ctx.repo.claimReferralCode(guest.id, code);
  }
  throw new Error(`No free referral code for ${guest.id}`);
}

/** The guest whose referral code appears in a new guest's message, if any. */
export async function findReferrer(
  ctx: Ctx,
  guest: Contact,
  text: string,
): Promise<Contact | null> {
  const codes = new Set(Array.from(text.matchAll(CODE_IN_TEXT), (m) => m[0].toUpperCase()));
  // The text is a stranger's: look up a few codes at most.
  for (const code of [...codes].slice(0, 5)) {
    const referrer = await ctx.repo.contactByReferralCode(code);
    if (referrer && referrer.id !== guest.id) return referrer;
  }
  return null;
}

/**
 * Noor's approval SMS, with ", rafiki wa Anna" ("friend of Anna") between its two halves when a
 * friend sent the guest. The note is shortened, then left out, so the whole stays in one SMS:
 * the reply options in `tail` are never cut.
 */
export function withReferralNote(head: string, referrer: Contact | null, tail: string): string {
  const name = friendInSms(head, referrer, tail);
  return name ? head + FRIEND_OF + name + tail : head + tail;
}

/** The friend's first name as far as it fits in that SMS; "" when none does. */
export function friendInSms(head: string, referrer: Contact | null, tail: string): string {
  const room = SMS_LENGTH - head.length - tail.length - FRIEND_OF.length;
  return referrer ? firstName(referrer.name).slice(0, Math.max(0, room)) : "";
}
