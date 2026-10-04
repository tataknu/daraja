import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@daraja/ui/components/button";
import { Textarea } from "@daraja/ui/components/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@daraja/ui/components/select";
import { splitDirections } from "./directions";
import { arrived } from "./pending";
import { MapCard } from "./map-card";
import { NewGuestDialog } from "./new-guest-dialog";
import type { Booking, Contact, Message, Pending } from "./types";

export function GuestInbox(props: {
  guests: Contact[];
  guest: Contact | undefined;
  messages: Message[];
  bookings: Booking[];
  busy: boolean;
  onPick: (id: string) => void;
  onCreate: (n: string, e: string) => void;
  onSend: (t: string, thread: string | null) => void;
  /** This guest's email while the server handles it. */
  pending?: Pending | null;
}) {
  const { guests, guest, messages } = props;
  const [text, setText] = useState("");
  const thread = useMemo(
    () => messages.filter((m) => m.contact_id === guest?.id && m.channel === "email"),
    [messages, guest],
  );
  const latest = props.bookings.find((b) => b.guest_id === guest?.id);
  // Keep the newest email in view by scrolling the list itself (scrollIntoView would move the page).
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, props.pending]);
  const first = guest?.name.split(" ")[0] ?? "the guest";
  const pendingShown = props.pending && !arrived(props.pending, thread) ? props.pending : null;

  return (
    <section
      className="paper flex min-w-0 flex-col overflow-hidden lg:h-full lg:min-h-0"
      aria-labelledby="inbox-title"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 id="inbox-title" className="text-lg font-semibold">
          Guest inbox
        </h2>
        <Select value={guest?.id ?? ""} onValueChange={props.onPick}>
          <SelectTrigger className="w-full min-w-0 sm:w-64" aria-label="Guest">
            <SelectValue placeholder="Pick a guest" />
          </SelectTrigger>
          <SelectContent>
            {guests.map((g) => (
              <SelectItem key={g.id} value={g.id}>
                {g.name} · {g.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="sm:ml-auto">
          <NewGuestDialog busy={props.busy} onCreate={props.onCreate} />
        </div>
      </div>
      <div
        ref={listRef}
        className="h-[420px] space-y-3 overflow-y-auto bg-background/50 px-4 py-4 sm:px-5 lg:h-auto lg:min-h-0 lg:flex-1"
      >
        {thread.length === 0 && (
          <p className="pt-16 text-center text-sm text-muted-foreground">
            No emails yet. Write to Noor in any language.
          </p>
        )}
        {thread.map((m) => {
          // A confirmation's directions link shows as a map, not as a long URL.
          const { text, map } = splitDirections(m.text_original);
          return (
            <div key={m.id} className={m.direction === "in" ? "ml-6 sm:ml-12" : "mr-6 sm:mr-12"}>
              <div
                className={`rounded-lg border px-4 py-3 text-sm ${m.direction === "in" ? "border-primary/20 bg-secondary" : "border-border bg-card"}`}
              >
                <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="font-medium">
                    {m.direction === "in" ? `From ${guest?.name}` : "From Noor's Farm Visits"}
                  </span>
                  <span className="tabular-nums">
                    {new Date(m.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="whitespace-pre-wrap break-words">{text}</p>
                {map && <MapCard {...map} />}
                {m.text_en && (
                  <p className="mt-2 border-t border-border pt-2 text-xs italic text-muted-foreground">
                    EN: {splitDirections(m.text_en).text}
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {pendingShown && (
          <div className="ml-6 sm:ml-12">
            <div className="rounded-lg border border-primary/20 bg-secondary px-4 py-3 text-sm opacity-80">
              <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="font-medium">From {guest?.name}</span>
                <span>Sending…</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{pendingShown.text}</p>
            </div>
          </div>
        )}
        {props.pending && (
          <p aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
            Daraja is reading {first}'s email and writing to Noor…
          </p>
        )}
      </div>
      <form
        className="space-y-2 border-t border-border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            props.onSend(text, latest ? `B${latest.id}` : null);
            setText("");
          }
        }}
      >
        <Textarea
          rows={3}
          aria-label="Email text"
          placeholder={guest ? `Email as ${guest.name}…` : "Pick a guest first"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!guest}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={props.busy || !guest || !text.trim()}>
            Send email
          </Button>
        </div>
      </form>
    </section>
  );
}
