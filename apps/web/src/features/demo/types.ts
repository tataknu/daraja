import type { Tables } from "@daraja/db/types";

export type Contact = Tables<"contacts">;

/** A message the page has sent and the server is still handling: shown at once, not after it. */
export interface Pending {
  channel: "email" | "sms";
  contactId: string;
  text: string;
  /** Date.now() when it was sent. */
  since: number;
}
export type Message = Tables<"messages">;
export type Booking = Tables<"bookings">;

/** A visitor arriving from the landing-page wizard, and how far their email has got. */
export interface Arrival {
  name: string;
  language: string;
  status: "sending" | "sent" | "error";
  bookingId?: number | undefined;
}
