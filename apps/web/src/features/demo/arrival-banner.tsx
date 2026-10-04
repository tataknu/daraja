import type { Arrival, Booking } from "./types";

export function ArrivalBanner({
  arrival,
  bookings,
  onDismiss,
}: {
  arrival: Arrival;
  bookings: Booking[];
  onDismiss: () => void;
}) {
  const booking = bookings.find((b) => b.id === arrival.bookingId);
  const first = arrival.name.split(" ")[0];
  let text: string;
  let tone = "border-border bg-card";
  if (arrival.status === "sending") text = `Sending ${first}'s email. Daraja is reading it…`;
  else if (arrival.status === "error") {
    text = `${first}'s email couldn't be sent. Try again from the inbox.`;
    tone = "border-destructive/40 bg-destructive/5";
  } else if (booking?.status === "PENDING_NOOR") {
    // A bare "1" only works when this is the only request waiting; otherwise Noor names the booking.
    const others = bookings.filter(
      (b) => b.status === "PENDING_NOOR" && b.id !== booking.id,
    ).length;
    text = others
      ? `B${booking.id} is waiting for Noor, with ${others} other request${others === 1 ? "" : "s"}. On her phone, type "B${booking.id} 1" and then TUMA to accept.`
      : `B${booking.id} is waiting for Noor. On her phone, tap 1 and then TUMA to accept.`;
    tone = "border-warning/60 bg-warning/10";
  } else if (booking?.status === "CONFIRMED") {
    text = `B${booking.id} is confirmed. ${first} got the confirmation in ${arrival.language}.`;
    tone = "border-success/50 bg-success/10";
  } else if (booking?.status === "DECLINED")
    text = `Noor declined B${booking.id}. ${first} was told in ${arrival.language}.`;
  else text = `Daraja answered ${first} in ${arrival.language}. See the inbox.`;
  return (
    <div
      role="status"
      className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${tone}`}
    >
      <p className="font-medium">{text}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 text-muted-foreground transition hover:text-foreground"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
