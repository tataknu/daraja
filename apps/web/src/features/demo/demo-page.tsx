import { getRouteApi, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { postInbound, createGuest, runTimersNow, generateInsights, resetDemo } from "@/lib/sim.functions";
import { demoEmail, personaById } from "@/lib/personas";
import { Button } from "@turflow/ui/components/button";
import { ArrivalBanner } from "./arrival-banner";
import { DataView } from "./data-view";
import { GuestInbox } from "./guest-inbox";
import { NoorPhone } from "./noor-phone";
import { ToolsSheet } from "./tools-sheet";
import type { Arrival, Contact } from "./types";
import { useLive } from "./use-live";

const route = getRouteApi("/demo");
const uid = () => `sim-in-${crypto.randomUUID()}`;

/** The live simulator: a guest inbox, Noor's phone, and the data behind them. */
export function DemoPage() {
  const live = useLive();
  const search = route.useSearch();
  const navigate = useNavigate({ from: "/demo" });
  const post = useServerFn(postInbound);
  const mkGuest = useServerFn(createGuest);
  const timers = useServerFn(runTimersNow);
  const insights = useServerFn(generateInsights);
  const reset = useServerFn(resetDemo);
  const [busy, setBusy] = useState<string | null>(null);
  const [guestId, setGuestId] = useState<string>("");
  const [arrival, setArrival] = useState<Arrival | null>(null);
  const [tab, setTab] = useState<"demo" | "data">("demo");

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
    <div className="flex min-h-screen flex-col lg:h-screen lg:overflow-hidden">
      <header className="shrink-0 border-b border-border bg-card/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 flex-wrap items-end gap-x-6 gap-y-3">
            <div className="min-w-0">
              <Link to="/" className="text-sm text-muted-foreground transition hover:text-foreground">← Noor's Farm Visits</Link>
              <h1 className="text-2xl font-bold text-primary sm:text-3xl">Live demo</h1>
            </div>
            <div role="tablist" aria-label="View" className="flex rounded-lg border border-border bg-background p-0.5">
              {(["demo", "data"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "demo" ? "Conversation" : "Data"}
                </button>
              ))}
            </div>
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

      {tab === "data" ? <DataView /> : (
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:min-h-0">
        {arrival && <ArrivalBanner arrival={arrival} bookings={live.bookings} onDismiss={() => setArrival(null)} />}
        <div className="grid gap-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[minmax(0,1fr)]">
          <GuestInbox
            guests={guests} guest={guest} messages={live.messages} bookings={live.bookings} busy={!!busy}
            onPick={setGuestId}
            onCreate={(name, email) => run("guest", async () => { const r = await mkGuest({ data: { name, email } }); if (r) setGuestId(r.id); })}
            onSend={(text, thread) => guest && run("email", () => sendEmail(guest, text, thread))}
          />
          <NoorPhone host={host} messages={live.messages} busy={!!busy} onSend={(t) => host && run("sms", () => sendSms(t))} />
        </div>
      </main>
      )}
    </div>
  );
}
