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

export function parseHostReply(text: string, open: Prompt[]): HostCommand {
  // "1"/"2" confirm or cancel a read-back first.
  const bare = /^\s*([12])\s*$/.exec(text);
  const readback = open.find((p) => p.kind === "confirm_readback");
  if (bare && readback) return { kind: "readback", prompt: readback, yes: bare[1] === "1" };

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
    return { kind: "ask_which", codes: waiting.map((p) => code(p.booking_id!)), choice: bareChoice[1]! };
  }
  const only = waiting.length === 1 ? waiting[0] : undefined;
  const coded = /^\s*B?\s*(\d+)[\s\-:.,/]*([1-3])\b/i.exec(text);
  const pick =
    bareChoice && only?.booking_id
      ? { bookingId: only.booking_id, choice: Number(bareChoice[1]) }
      : coded
        ? { bookingId: Number(coded[1]), choice: Number(coded[2]) }
        : null;
  if (!pick) return { kind: "free_text" };

  const mine = open.filter((p) => p.booking_id === pick.bookingId);
  const mineReadback = mine.find((p) => p.kind === "confirm_readback");
  if (mineReadback && pick.choice <= 2) return { kind: "readback", prompt: mineReadback, yes: pick.choice === 1 };
  if (!mine.some((p) => p.kind === "approve_booking")) return { kind: "no_open_request", ...pick };
  return { kind: "act", ...pick, action: ACTIONS[pick.choice]! };
}
