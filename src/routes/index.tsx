import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { postInbound, createGuest, runTimersNow, generateInsights, resetDemo } from "@/lib/sim.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Noor's Farm Visits — booking simulator" },
      { name: "description", content: "Guests email in any language; Noor approves coffee-farm tours by SMS. Live simulator of the booking assistant." },
      { property: "og:title", content: "Noor's Farm Visits — booking simulator" },
      { property: "og:description", content: "Guests email in any language; Noor approves coffee-farm tours by SMS." },
    ],
  }),
  component: Simulator,
});

type Contact = Tables<"contacts">;
type Message = Tables<"messages">;
type Booking = Tables<"bookings">;
type Decision = Tables<"decisions">;

const uid = () => `sim-in-${crypto.randomUUID()}`;

function useLive() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const load = async () => {
    const [c, m, b, d] = await Promise.all([
      supabase.from("contacts").select("*").order("created_at"),
      supabase.from("messages").select("*").order("created_at"),
      supabase.from("bookings").select("*").order("id", { ascending: false }),
      supabase.from("decisions").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    setContacts(c.data ?? []); setMessages(m.data ?? []); setBookings(b.data ?? []); setDecisions(d.data ?? []);
  };
  useEffect(() => {
    load();
    let t: ReturnType<typeof setTimeout> | undefined;
    const debounced = () => { clearTimeout(t); t = setTimeout(load, 150); };
    const ch = supabase.channel("sim")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "decisions" }, debounced)
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, debounced)
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, []);
  return { contacts, messages, bookings, decisions, reload: load };
}

const STATUS_STYLE: Record<string, string> = {
  CONFIRMED: "bg-success text-primary-foreground",
  PENDING_NOOR: "bg-warning text-foreground",
  COUNTER_OFFERED: "bg-accent text-accent-foreground",
  INCOMPLETE: "bg-secondary text-secondary-foreground",
};

function Simulator() {
  const live = useLive();
  const post = useServerFn(postInbound);
  const mkGuest = useServerFn(createGuest);
  const timers = useServerFn(runTimersNow);
  const insights = useServerFn(generateInsights);
  const reset = useServerFn(resetDemo);
  const [busy, setBusy] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string>("");
  const [asOf, setAsOf] = useState("");

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

  const sendEmail = (g: Contact, text: string, thread?: string | null) =>
    post({ data: { channel: "email", sender: g.email!, sender_name: g.name, text, provider_msg_id: uid(), thread_ref: thread ?? null } });
  const sendSms = (text: string) =>
    post({ data: { channel: "sms", sender: host!.phone!, text, provider_msg_id: uid() } });

  const playDemo = () => run("demo", async () => {
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
    toast(`2/4 Noor replies "b${id} 1"…`);
    await sendSms(`b${id} 1`);
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
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-6 py-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Simulator · Phase 1</p>
            <h1 className="text-3xl font-bold text-primary md:text-4xl">Noor's Farm Visits</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Guests email in their language. Noor answers by SMS in Swahili. Nothing is confirmed until she says yes.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="default" onClick={playDemo} disabled={!!busy}>{busy === "demo" ? "Playing…" : "▶ Play demo"}</Button>
            <Input type="datetime-local" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-52 bg-card" title="Pretend it is this time (optional)" />
            <Button variant="outline" disabled={!!busy} onClick={() => run("timers", async () => {
              const log = await timers({ data: { asOf: asOf ? new Date(asOf).toISOString() : null } });
              toast(log.length ? log.join(" · ") : "Timers ran — nothing due");
            })}>Run timers now</Button>
            <Button variant="outline" disabled={!!busy} onClick={() => run("insights", async () => { await insights(); toast.success("Insights sent to Noor's phone"); })}>
              Generate monthly insights
            </Button>
            <Button variant="ghost" disabled={!!busy} onClick={() => run("reset", async () => { await reset(); toast("Reset"); })}>Reset</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <GuestInbox
            guests={guests} guest={guest} messages={live.messages} bookings={live.bookings} busy={!!busy}
            onPick={setGuestId}
            onCreate={(name, email) => run("guest", async () => { const r = await mkGuest({ data: { name, email } }); if (r) setGuestId(r.id); })}
            onSend={(text, thread) => guest && run("email", () => sendEmail(guest, text, thread))}
          />
          <NoorPhone host={host} messages={live.messages} busy={!!busy} onSend={(t) => host && run("sms", () => sendSms(t))} />
        </div>
        {busy && busy !== "demo" && <p className="text-center text-sm text-muted-foreground">Working…</p>}
        <BookingsTable bookings={live.bookings} contacts={live.contacts} />
        <DecisionLog decisions={live.decisions} messages={live.messages} />
      </main>
    </div>
  );
}

function GuestInbox(props: {
  guests: Contact[]; guest: Contact | undefined; messages: Message[]; bookings: Booking[]; busy: boolean;
  onPick: (id: string) => void; onCreate: (n: string, e: string) => void; onSend: (t: string, thread: string | null) => void;
}) {
  const { guests, guest, messages } = props;
  const [text, setText] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const thread = useMemo(() => messages.filter((m) => m.contact_id === guest?.id && m.channel === "email"), [messages, guest]);
  const latest = props.bookings.find((b) => b.guest_id === guest?.id);
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [thread.length]);

  return (
    <section className="paper flex flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <h2 className="text-lg font-semibold">Guest inbox</h2>
        <Select value={guest?.id ?? ""} onValueChange={props.onPick}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Pick a guest" /></SelectTrigger>
          <SelectContent>
            {guests.map((g) => <SelectItem key={g.id} value={g.id}>{g.name} · {g.email}</SelectItem>)}
          </SelectContent>
        </Select>
        <form className="ml-auto flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newName && newEmail) { props.onCreate(newName, newEmail); setNewName(""); setNewEmail(""); } }}>
          <Input placeholder="New guest name" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-36" />
          <Input placeholder="email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="w-44" />
          <Button type="submit" variant="secondary" disabled={props.busy}>Add</Button>
        </form>
      </div>
      <div className="h-[420px] space-y-3 overflow-y-auto bg-background/50 px-5 py-4">
        {thread.length === 0 && <p className="pt-16 text-center text-sm text-muted-foreground">No emails yet. Write to Noor in any language.</p>}
        {thread.map((m) => (
          <div key={m.id} className={m.direction === "in" ? "ml-12" : "mr-12"}>
            <div className={`rounded-lg border px-4 py-3 text-sm ${m.direction === "in" ? "border-primary/20 bg-secondary" : "border-border bg-card"}`}>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-medium">{m.direction === "in" ? `From ${guest?.name}` : "From Noor's Farm Visits"}</span>
                <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p className="whitespace-pre-wrap">{m.text_original}</p>
              {m.text_translated && m.direction === "out" && (
                <p className="mt-2 border-t border-border pt-2 text-xs italic text-muted-foreground">EN: {m.text_translated}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="space-y-2 border-t border-border p-4" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { props.onSend(text, latest ? `B${latest.id}` : null); setText(""); } }}>
        <Textarea rows={3} placeholder={guest ? `Email as ${guest.name}…` : "Pick a guest first"} value={text} onChange={(e) => setText(e.target.value)} disabled={!guest} />
        <div className="flex justify-end"><Button type="submit" disabled={props.busy || !guest || !text.trim()}>Send email</Button></div>
      </form>
    </section>
  );
}

function NoorPhone(props: { host: Contact | undefined; messages: Message[]; busy: boolean; onSend: (t: string) => void }) {
  const [text, setText] = useState("");
  const sms = props.messages.filter((m) => m.contact_id === props.host?.id && m.channel === "sms");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [sms.length]);
  return (
    <section className="mx-auto w-full max-w-[340px]">
      <div className="rounded-[2.5rem] bg-phone-body p-5 shadow-phone">
        <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-phone-bezel" />
        <div className="rounded-md bg-phone-bezel p-2">
          <div className="lcd-screen h-[380px] overflow-y-auto rounded-sm p-3 text-lg leading-tight">
            <div className="mb-2 flex justify-between border-b border-lcd-ink/40 pb-1 text-base">
              <span>▮▮▮▯ Noor</span><span>SMS</span>
            </div>
            {sms.length === 0 && <p className="pt-10 text-center opacity-70">Hakuna ujumbe</p>}
            {sms.map((m) => (
              <div key={m.id} className="mb-2">
                <div className="text-sm opacity-70">{m.direction === "in" ? "> Mimi" : "< Msaidizi"} {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
                <p className={`whitespace-pre-wrap break-words ${m.direction === "in" ? "pl-3" : ""}`}>{m.text_original}</p>
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>
        <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); if (text.trim()) { props.onSend(text); setText(""); } }}>
          <input
            className="lcd-screen w-full rounded-sm border-2 border-phone-bezel px-2 py-1 text-lg outline-none focus:border-accent"
            placeholder="Andika… e.g. B14 1" value={text} maxLength={160} onChange={(e) => setText(e.target.value)}
          />
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3"].map((k) => (
              <button type="button" key={k} onClick={() => setText((t) => (t + " " + k).trim())}
                className="rounded-full bg-phone-bezel py-2 font-lcd text-xl text-primary-foreground transition hover:bg-accent">{k}</button>
            ))}
          </div>
          <button type="submit" disabled={props.busy || !text.trim()}
            className="w-full rounded-full bg-success py-2 font-lcd text-xl text-primary-foreground transition hover:opacity-90 disabled:opacity-40">TUMA ✉</button>
        </form>
      </div>
    </section>
  );
}

function BookingsTable({ bookings, contacts }: { bookings: Booking[]; contacts: Contact[] }) {
  return (
    <section className="paper overflow-hidden">
      <h2 className="border-b border-border px-5 py-3 text-lg font-semibold">Bookings</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-5 py-2">ID</th><th className="px-5 py-2">Guest</th><th className="px-5 py-2">Date</th><th className="px-5 py-2">Slot</th><th className="px-5 py-2">Party</th><th className="px-5 py-2">Status</th></tr>
          </thead>
          <tbody>
            {bookings.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">No bookings yet</td></tr>}
            {bookings.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-5 py-2 font-mono font-semibold">B{b.id}</td>
                <td className="px-5 py-2">{contacts.find((c) => c.id === b.guest_id)?.name}</td>
                <td className="px-5 py-2">{b.date_from ?? "—"}</td>
                <td className="px-5 py-2">{b.slot ?? "—"}</td>
                <td className="px-5 py-2">{b.party_size ?? "—"}</td>
                <td className="px-5 py-2"><Badge className={STATUS_STYLE[b.status] ?? "bg-muted text-muted-foreground"}>{b.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DecisionLog({ decisions, messages }: { decisions: Decision[]; messages: Message[] }) {
  return (
    <section className="paper overflow-hidden">
      <h2 className="border-b border-border px-5 py-3 text-lg font-semibold">Decision log</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-5 py-2">Message</th><th className="px-5 py-2">Intent</th><th className="px-5 py-2">Confidence</th><th className="px-5 py-2">Action</th><th className="px-5 py-2">Model</th><th className="px-5 py-2">To human</th></tr>
          </thead>
          <tbody>
            {decisions.length === 0 && <tr><td colSpan={6} className="px-5 py-6 text-center text-muted-foreground">No decisions yet</td></tr>}
            {decisions.map((d) => {
              const m = messages.find((x) => x.id === d.message_id);
              return (
                <tr key={d.id} className="border-t border-border align-top">
                  <td className="max-w-xs truncate px-5 py-2" title={m?.text_original}>{m?.channel === "sms" ? "📱 " : "✉ "}{m?.text_original}</td>
                  <td className="px-5 py-2 font-mono">{d.intent}</td>
                  <td className="px-5 py-2">{d.confidence != null ? Number(d.confidence).toFixed(2) : "—"}</td>
                  <td className="px-5 py-2">{d.action_taken}</td>
                  <td className="px-5 py-2 text-xs text-muted-foreground">{d.model}</td>
                  <td className="px-5 py-2">{d.routed_to_human ? <Badge className="bg-accent text-accent-foreground">yes</Badge> : "no"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
