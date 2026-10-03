export type BookingStatus =
  | "INCOMPLETE"
  | "PENDING_NOOR"
  | "CONFIRMED"
  | "DECLINED"
  | "COUNTER_OFFERED"
  | "EXPIRED"
  | "CANCELLED"
  | "VISITED"
  | "FEEDBACK_REQUESTED"
  | "CLOSED";

export type Actor = "system" | "noor" | "guest";

const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  INCOMPLETE: ["INCOMPLETE", "PENDING_NOOR", "CANCELLED"],
  PENDING_NOOR: [
    "PENDING_NOOR",
    "CONFIRMED",
    "DECLINED",
    "COUNTER_OFFERED",
    "EXPIRED",
    "CANCELLED",
  ],
  COUNTER_OFFERED: ["CONFIRMED", "CLOSED", "PENDING_NOOR", "CANCELLED"],
  CONFIRMED: ["CANCELLED", "VISITED", "PENDING_NOOR"],
  VISITED: ["FEEDBACK_REQUESTED"],
  FEEDBACK_REQUESTED: ["CLOSED"],
  DECLINED: [],
  EXPIRED: [],
  CANCELLED: [],
  CLOSED: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus, actor: Actor): boolean {
  if (!ALLOWED[from]?.includes(to)) return false;
  // Only Noor's approval confirms. COUNTER_OFFERED → CONFIRMED is the guest accepting a date Noor already proposed.
  if (to === "CONFIRMED")
    return (
      (from === "PENDING_NOOR" && actor === "noor") ||
      (from === "COUNTER_OFFERED" && actor === "guest")
    );
  return true;
}

export const ACTIVE: BookingStatus[] = [
  "INCOMPLETE",
  "PENDING_NOOR",
  "COUNTER_OFFERED",
  "CONFIRMED",
  "VISITED",
  "FEEDBACK_REQUESTED",
];

export const code = (id: number) => `B${id}`;
