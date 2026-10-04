// While the server handles a message, the page shows it straight away; once the stored copy
// arrives (realtime or reload), that copy replaces the placeholder.
import type { Message, Pending } from "./types";

/** True once `messages` holds the stored copy of the pending message. */
export function arrived(pending: Pending, messages: Message[]): boolean {
  const text = pending.text.trim();
  return messages.some(
    (m) =>
      m.direction === "in" &&
      m.contact_id === pending.contactId &&
      m.text_original.trim() === text &&
      new Date(m.created_at).getTime() >= pending.since - 60_000,
  );
}
