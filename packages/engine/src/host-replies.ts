// What Noor's SMS means, decided without AI whenever the reply follows the keypad format.
// Pure: given her text and the open prompts, returns what to do.
import { code } from "./booking-state";
import type { Prompt } from "./types";

export type HostAction = "approve" | "decline" | "ask_other_date";

export type HostCommand =
  /** Confirms (1) or cancels (2) what the assistant read back to her. */
  | { kind: "readback"; prompt: Prompt; yes: boolean }
  /** "B14 2026-10-12" after she was asked for another day. */
  | { kind: "propose_date"; bookingId: number; date: string }
  /** A bare number while several requests wait: ask which one. */
  | { kind: "ask_which"; codes: string[]; choice: string }
  /** A keypad answer for one booking. */
  | { kind: "act"; bookingId: number; choice: number; action: HostAction }
  /** A keypad answer for a booking that has nothing waiting. */
  | { kind: "no_open_request"; bookingId: number; choice: number }
  /** Anything else: needs the AI to read it. */
  | { kind: "free_text" };

const ACTIONS: Record<number, HostAction> = { 1: "approve", 2: "decline", 3: "ask_other_date" };

/** When she was last asked: a reminder asks again. */
const askedAt = (p: Prompt) =>
  Math.max(Date.parse(p.sent_at), p.nudged_at ? Date.parse(p.nudged_at) : 0);

/** `open` is newest first, as the repo returns it. */
export function parseHostReply(text: string, open: Prompt[]): HostCommand {
  // A bare "1"/"2" answers a read-back only if it is the last thing she was asked: an older one
  // must not catch her answer to a newer request or reminder. (A stable sort: ties stay in order.)
  const bare = /^\s*([12])\s*$/.exec(text);
  const [last] = [...open].sort((a, b) => askedAt(b) - askedAt(a));
  if (bare && last?.kind === "confirm_readback")
    return { kind: "readback", prompt: last, yes: bare[1] === "1" };

  const dated = /^\s*B?(\d+)\s+(\d{4}-\d{2}-\d{2})\s*$/i.exec(text);
  if (dated) {
    const id = Number(dated[1]);
    if (open.some((p) => p.booking_id === id && p.kind === "ask_other_date")) {
      return { kind: "propose_date", bookingId: id, date: dated[2]! };
    }
  }

  // A bare "1"/"2"/"3" answers the request waiting for her; no booking code needed when there is
  // exactly one. With several waiting, ask which one instead of failing.
  const bareChoice = /^\s*([1-3])\s*$/.exec(text);
  const waiting = open.filter((p) => p.kind === "approve_booking");
  if (bareChoice && waiting.length > 1) {
    return {
      kind: "ask_which",
      codes: waiting.map((p) => code(p.booking_id!)),
      choice: bareChoice[1]!,
    };
  }
  const only = waiting.length === 1 ? waiting[0] : undefined;
  // (?!\d): never split a booking number to find a choice ("B141 …" is not B14 + 1).
  const coded = /^\s*B?\s*(\d+)(?!\d)[\s\-:.,/]*([1-3])\b/i.exec(text);
  const pick =
    bareChoice && only?.booking_id
      ? { bookingId: only.booking_id, choice: Number(bareChoice[1]) }
      : coded
        ? { bookingId: Number(coded[1]), choice: Number(coded[2]) }
        : null;
  if (!pick) return { kind: "free_text" };

  // "B14 1" is always B14's keypad answer (1 = Ndiyo), even while a read-back for B14 waits.
  if (!open.some((p) => p.booking_id === pick.bookingId && p.kind === "approve_booking"))
    return { kind: "no_open_request", ...pick };
  return { kind: "act", ...pick, action: ACTIONS[pick.choice]! };
}
