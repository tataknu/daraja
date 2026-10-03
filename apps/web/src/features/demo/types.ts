import type { Tables } from "@turflow/db/types";

export type Contact = Tables<"contacts">;
export type Message = Tables<"messages">;
export type Booking = Tables<"bookings">;

/** A visitor arriving from the landing-page wizard, and how far their email has got. */
export interface Arrival {
  name: string;
  language: string;
  status: "sending" | "sent" | "error";
  bookingId?: number | undefined;
}
