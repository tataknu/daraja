import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@turflow/db/types";
import { postInbound, createGuest, runTimersNow, generateInsights, resetDemo } from "@/lib/sim.functions";
import { PhoneShell } from "@/components/phone-shell";
import { demoEmail, personaById } from "@/lib/personas";
import { Button } from "@turflow/ui/components/button";
import { Input } from "@turflow/ui/components/input";
import { Label } from "@turflow/ui/components/label";
import { Textarea } from "@turflow/ui/components/textarea";
import { Badge } from "@turflow/ui/components/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@turflow/ui/components/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@turflow/ui/components/dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@turflow/ui/components/sheet";

interface DemoSearch {
  persona?: string | undefined;
  message?: string | undefined;
}

export const Route = createFileRoute("/demo")({
  validateSearch: (s: Record<string, unknown>): DemoSearch => ({
    persona: typeof s["persona"] === "string" ? s["persona"] : undefined,
    message: typeof s["message"] === "string" ? s["message"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Live demo — Noor's Farm Visits" },
      { name: "description", content: "Guests email in any language; Noor approves coffee-farm tours by SMS. Live simulator of the booking assistant." },
      { property: "og:title", content: "Live demo — Noor's Farm Visits" },
      { property: "og:description", content: "Guests email in any language; Noor approves coffee-farm tours by SMS." },
    ],
  }),
  component: Simulator,
});

type Contact = Tables<"contacts">;
type Message = Tables<"messages">;
type Booking = Tables<"bookings">;

const uid = () => `sim-in-${crypto.randomUUID()}`;

function useLive() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const load = async () => {
    const [c, m, b] = await Promise.all([
      supabase.from("contacts").select("*").order("created_at"),
      supabase.from("messages").select("*").order("created_at"),
      supabase.from("bookings").select("*").order("id", { ascending: false }),
    ]);
    setContacts(c.data ?? []); setMessages(m.data ?? []); setBookings(b.data ?? []);
  };
  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => { clearTimeout(t); t = setTimeout(load, 150); };
    const ch = supabase.channel("sim")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, debounced)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, []);
  return { contacts, messages, bookings, reload: load };
}

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: "bg-success text-primary-foreground",
  PENDING_NOOR: "bg-warning text-foreground",
  COUNTER_OFFERED: "bg-accent text-accent-foreground",
  INCOMPLETE: "bg-secondary text-secondary-foreground",
};

interface Arrival {
  name: string;
  language: string;
  status: "sending" | "sent" | "error";
  bookingId?: number | undefined;
}

function Simulator() {
  const live = useLive();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/demo" });
  const post = useServerFn(postInbound);
  const mkGuest = useServerFn(createGuest);
  const timers = useServerFn(runTimersNow);
  const insights = useServerFn(generateInsights);
  const reset = useServerFn(resetDemo);
  const [busy, setBusy] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string>("");
  const [arrival, setArrival] = useState<Arrival | null>(null);

  const host = live.contacts.find((c) => c.role === "host");
  const guests = live.contacts.filter((c) => c.role === "guest");
  const guest = guests.find((g) => g.id === guestId) ?? guests[0];

  const run = async <T,>(label: string, fn: () => Promise<T>) => {
    setBusy(label);
    try { return await fn(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); await live.reload(); }
    return undefined;
  };

  const sendEmail = (g: Pick<Contact, "email" | "name">, text: string, thread?: string | null) =>
    post({ data: { channel: "email", sender: g.email!, sender_name: g.name, text, provider_msg_id: uid(), thread_ref: thread ?? null } });
  const sendSms = (text: string) =>
    post({ data: { channel: "sms", sender: host!.phone!, text, provider_msg_id: uid() } });

  // Arriving from the landing-page wizard: send the visitor's email once, then clear the URL.
  const arrived = useRef(false);
  useEffect(() => {
    const persona = personaById(search.persona);
    const message = search.message?.trim();
    if (arrived.current || !persona || !message) return;
    arrived.current = true;
    navigate({ search: {}, replace: true });
    setArrival({ name: persona.name, language: persona.language, status: "sending" });
    (async () => {
      try {
        const email = demoEmail(persona);
        const g = await mkGuest({ data: { name: persona.name, email } });
        setGuestId(g.id);
        const r = await sendEmail({ name: persona.name, email }, message);
        await live.reload();
        const bookingId = r && "booking_id" in r && typeof r.booking_id === "number" ? r.booking_id : undefined;
        setArrival({ name: persona.name, language: persona.language, status: "sent", bookingId });
      } catch (e) {
        setArrival({ name: persona.name, language: persona.language, status: "error" });
        toast.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [search.persona, search.message]);

  const playDemo = () => run("demo", async () => {
    setArrival(null);
    await reset();
    await live.reload();
    const { data: anna } = await supabase.from("contacts").select("*").eq("email", "anna@example.de").single();
    if (!anna || !host) throw new Error("Seed data missing");
    setGuestId(anna.id);
    const year = new Date().getMonth() > 9 || (new Date().getMonth() === 9 && new Date().getDate() > 12) ? new Date().getFullYear() + 1 : new Date().getFullYear();
    toast("1/4 Anna emails in German…");
    const r1 = await sendEmail(anna, `Hallo Noor,\n\nwir würden gerne am 12. Oktober ${year} vormittags mit 3 Personen eure Kaffeefarm besuchen. Geht das?\n\nViele Grüße\nAnna`);
    await live.reload();
    const id = r1 && "booking_id" in r1 ? r1.booking_id : 14;
    await new Promise((r) => setTimeout(r, 1500));
    toast("2/4 Noor replies \"1\"…");
    await sendSms("1");
    await live.reload();
    await new Promise((r) => setTimeout(r, 1500));
    toast("3/4 Anna sends feedback…");
    await sendEmail(anna, "Der Besuch war wunderbar! Die Röstung war das Highlight und Noor erklärt sehr lebendig. Nur der Weg zur Farm war schwer zu finden – ein Schild an der Hauptstraße wäre toll.", `B${id}`);
    await live.reload();
    toast("4/4 Monthly insights for Noor…");
    await insights();
    toast.success("Demo complete");
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <Link to="/" className="text-sm text-muted-foreground transition hover:text-foreground">← Noor's Farm Visits</Link>
            <h1 className="text-2xl font-bold text-primary sm:text-3xl">Live demo</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={playDemo} disabled={!!busy}>{busy === "demo" ? "Playing…" : "Play scripted demo"}</Button>
            <ToolsSheet
              busy={!!busy}
              onTimers={(asOf) => run("timers", async () => {
                const log = await timers({ data: { asOf } });
                toast(log.length ? log.join(" · ") : "Timers ran: nothing due");
              })}
              onInsights={() => run("insights", async () => { await insights(); toast.success("Insights sent to Noor's phone"); })}
              onReset={() => run("reset", async () => { setArrival(null); await reset(); toast("Demo reset"); })}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-6 sm:py-8">
        {arrival && <ArrivalBanner arrival={arrival} bookings={live.bookings} onDismiss={() => setArrival(null)} />}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          <GuestInbox
            guests={guests} guest={guest} messages={live.messages} bookings={live.bookings} busy={!!busy}
            onPick={setGuestId}
            onCreate={(name, email) => run("guest", async () => { const r = await mkGuest({ data: { name, email } }); if (r) setGuestId(r.id); })}
            onSend={(text, thread) => guest && run("email", () => sendEmail(guest, text, thread))}
          />
          <NoorPhone host={host} messages={live.messages} busy={!!busy} onSend={(t) => host && run("sms", () => sendSms(t))} />
        </div>
        <BookingsTable bookings={live.bookings} contacts={live.contacts} />
      </main>
    </div>
  );
}

function ArrivalBanner({ arrival, bookings, onDismiss }: { arrival: Arrival; bookings: Booking[]; onDismiss: () => void }) {
  const booking = bookings.find((b) => b.id === arrival.bookingId);
  const first = arrival.name.split(" ")[0];
  let text: string;
  let tone = "border-border bg-card";
  if (arrival.status === "sending") text = `Sending ${first}'s email. The assistant is reading it…`;
  else if (arrival.status === "error") { text = `${first}'s email couldn't be sent. Try again from the inbox.`; tone = "border-destructive/40 bg-destructive/5"; }
  else if (booking?.status === "PENDING_NOOR") { text = `B${booking.id} is waiting for Noor. On her phone, tap 1 and then TUMA to accept.`; tone = "border-warning/60 bg-warning/10"; }
  else if (booking?.status === "CONFIRMED") { text = `B${booking.id} is confirmed. ${first} got the confirmation in ${arrival.language}.`; tone = "border-success/50 bg-success/10"; }
  else if (booking?.status === "DECLINED") text = `Noor declined B${booking.id}. ${first} was told in ${arrival.language}.`;
  else text = `The assistant answered ${first} in ${arrival.language}. See the inbox.`;
  return (
    <div role="status" className={`flex items-start justify-between gap-4 rounded-lg border px-4 py-3 text-sm ${tone}`}>
      <p className="font-medium">{text}</p>
      <button type="button" onClick={onDismiss} className="shrink-0 text-muted-foreground transition hover:text-foreground" aria-label="Dismiss">✕</button>
    </div>
  );
}

function ToolsSheet(props: { busy: boolean; onTimers: (asOf: string | null) => void; onInsights: () => void; onReset: () => void }) {
  const [asOf, setAsOf] = useState("");
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Tools</Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col gap-6">
        <SheetHeader>
          <SheetTitle>Demo tools</SheetTitle>
          <SheetDescription>Move time forward, send Noor her monthly summary, or start over.</SheetDescription>
        </SheetHeader>
        <section className="space-y-2 px-4">
          <Label htmlFor="as-of">Pretend it is</Label>
          <Input id="as-of" type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <p className="text-xs text-muted-foreground">Leave empty for now. Reminders go out after 24 h, requests expire after 48 h.</p>
          <Button variant="outline" className="w-full" disabled={props.busy}
            onClick={() => props.onTimers(asOf ? new Date(asOf).toISOString() : null)}>Run timers</Button>
        </section>
        <section className="space-y-2 px-4">
          <p className="text-sm font-medium">Monthly insights</p>
          <p className="text-xs text-muted-foreground">Summarises visitor feedback into a short Swahili SMS for Noor.</p>
          <Button variant="outline" className="w-full" disabled={props.busy} onClick={props.onInsights}>Send insights to Noor</Button>
        </section>
        <section className="mt-auto space-y-2 border-t border-border px-4 pt-4 pb-4">
          <p className="text-xs text-muted-foreground">Clears every message and booking, and restores the starting data.</p>
          <Button variant="ghost" className="w-full text-destructive hover:text-destructive" disabled={props.busy} onClick={props.onReset}>Reset demo</Button>
        </section>
      </SheetContent>
    </Sheet>
  );
}

function NewGuestDialog({ busy, onCreate }: { busy: boolean; onCreate: (n: string, e: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">New guest</Button>
      </DialogTrigger>
      <DialogContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (name && email) { onCreate(name, email); setName(""); setEmail(""); setOpen(false); } }}>
          <DialogHeader>
            <DialogTitle>New guest</DialogTitle>
            <DialogDescription>Write to Noor as someone new. They can write in any language.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="guest-name">Name</Label>
            <Input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lena Schulz" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guest-email">Email</Label>
            <Input id="guest-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="lena@example.de" required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !name || !email}>Add guest</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GuestInbox(props: {
  guests: Contact[]; guest: Contact | undefined; messages: Message[]; bookings: Booking[]; busy: boolean;
  onPick: (id: string) => void; onCreate: (n: string, e: string) => void; onSend: (t: string, thread: string | null) => void;
}) {
  const { guests, guest, messages } = props;
  const [text, setText] = useState("");
  const thread = useMemo(() => messages.filter((m) => m.contact_id === guest?.id && m.channel === "email"), [messages, guest]);
  const latest = props.bookings.find((b) => b.guest_id === guest?.id);
  // Keep the newest email in view by scrolling the list itself (scrollIntoView would move the page).
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; }, [thread.length]);

  return (
    <section className="paper flex min-w-0 flex-col overflow-hidden" aria-labelledby="inbox-title">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        <h2 id="inbox-title" className="text-lg font-semibold">Guest inbox</h2>
        <Select value={guest?.id ?? ""} onValueChange={props.onPick}>
          <SelectTrigger className="w-full min-w-0 sm:w-64" aria-label="Guest"><SelectValue placeholder="Pick a guest" /></SelectTrigger>
          <SelectContent>
            {guests.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} · {g.email}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="sm:ml-auto"><NewGuestDialog busy={props.busy} onCreate={props.onCreate} /></div>
      </div>
      <div ref={listRef} className="h-[420px] space-y-3 overflow-y-auto bg-background/50 px-4 py-4 sm:px-5">
        {thread.length === 0 && <p className="pt-16 text-center text-sm text-muted-foreground">No emails yet. Write to Noor in any language.</p>}
        {thread.map((m) => (
          <div key={m.id} className={m.direction === "in" ? "ml-6 sm:ml-12" : "mr-6 sm:mr-12"}>
            <div className={`rounded-lg border px-4 py-3 text-sm ${m.direction === "in" ? "border-primary/20 bg-secondary" : "border-border bg-card"}`}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="font-medium">{m.direction === "in" ? `From ${guest?.name}` : "From Noor's Farm Visits"}</span>
                <span className="tabular-nums">{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="whitespace-pre-wrap break-words">{m.text_original}</p>
              {m.text_en && (
                <p className="mt-2 border-t border-border pt-2 text-xs italic text-muted-foreground">EN: {m.text_en}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      <form className="space-y-2 border-t border-border p-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { props.onSend(text, latest ? `B${latest.id}` : null); setText(""); } }}>
        <Textarea rows={3} aria-label="Email text" placeholder={guest ? `Email as ${guest.name}…` : "Pick a guest first"} value={text} onChange={(e) => setText(e.target.value)} disabled={!guest} />
        <div className="flex justify-end"><Button type="submit" disabled={props.busy || !guest || !text.trim()}>Send email</Button></div>
      </form>
    </section>
  );
}

function NoorPhone(props: { host: Contact | undefined; messages: Message[]; busy: boolean; onSend: (t: string) => void }) {
  const [text, setText] = useState("");
  const sms = props.messages.filter((m) => m.contact_id === props.host?.id && m.channel === "sms");
  const screenRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = screenRef.current; if (el) el.scrollTop = el.scrollHeight; }, [sms.length]);
  return (
    <section className="flex flex-col items-center gap-3" aria-labelledby="phone-title">
      <div className="text-center">
        <h2 id="phone-title" className="text-lg font-semibold">Noor's phone</h2>
        <p className="text-xs text-muted-foreground">Basic phone · SMS in Swahili, English below each message</p>
      </div>
      <PhoneShell
        screenRef={screenRef}
        label="Noor's SMS messages"
        footer={
          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { props.onSend(text); setText(""); } }}>
            <input
              aria-label="Noor's reply"
              className="lcd-screen w-full rounded-sm border-2 border-phone-bezel px-2 py-1 text-lg outline-none focus-visible:border-accent"
              placeholder="Andika… e.g. 1" value={text} maxLength={160} onChange={(e) => setText(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3"].map((k) => (
                <button type="button" key={k} onClick={() => setText((t) => (t + " " + k).trim())}
                  className="rounded-full bg-phone-bezel py-2 font-lcd text-xl text-primary-foreground transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">{k}</button>
              ))}
            </div>
            <button type="submit" disabled={props.busy || !text.trim()}
              className="w-full rounded-full bg-success py-2 font-lcd text-xl text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-40">TUMA ✉</button>
          </form>
        }
      >
        {sms.length === 0 && <p className="pt-10 text-center opacity-70">Hakuna ujumbe</p>}
        {sms.map((m) => (
          <div key={m.id} className="mb-2">
            <div className="text-sm opacity-70">{m.direction === "in" ? "> Mimi" : "< Msaidizi"} {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            <p className={`whitespace-pre-wrap break-words ${m.direction === "in" ? "pl-3" : ""}`}>{m.text_original}</p>
            {m.text_en && <p className="mt-0.5 border-l-2 border-lcd-ink/40 pl-2 font-sans text-xs italic opacity-80">EN: {m.text_en}</p>}
          </div>
        ))}
      </PhoneShell>
    </section>
  );
}

function BookingsTable({ bookings, contacts }: { bookings: Booking[]; contacts: Contact[] }) {
  return (
    <section className="paper overflow-hidden" aria-labelledby="bookings-title">
      <h2 id="bookings-title" className="border-b border-border px-4 py-3 text-lg font-semibold sm:px-5">Bookings</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-2 sm:px-5">ID</th><th className="px-4 py-2 sm:px-5">Guest</th><th className="px-4 py-2 sm:px-5">Date</th>
              <th className="hidden px-5 py-2 sm:table-cell">Slot</th><th className="hidden px-5 py-2 sm:table-cell">Party</th><th className="px-4 py-2 sm:px-5">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">No bookings yet</td></tr>}
            {bookings.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono font-semibold sm:px-5">B{b.id}</td>
                <td className="px-4 py-2 sm:px-5">{contacts.find((c) => c.id === b.guest_id)?.name}</td>
                <td className="px-4 py-2 tabular-nums sm:px-5">{b.date_from ?? "—"}</td>
                <td className="hidden px-5 py-2 tabular-nums sm:table-cell">{b.slot ?? "—"}</td>
                <td className="hidden px-5 py-2 tabular-nums sm:table-cell">{b.party_size ?? "—"}</td>
                <td className="px-4 py-2 sm:px-5"><Badge className={STATUS_STYLE[b.status] ?? "bg-muted text-muted-foreground"}>{b.status.replace("_", " ")}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
