import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import RotatingText from "@/components/reactbits/RotatingText";
import TextType from "@/components/reactbits/TextType";
import Stepper, { Step } from "@/components/reactbits/Stepper";
import { PhoneShell } from "@/components/phone-shell";
import { PERSONAS, personaById } from "@/lib/personas";
import { Button } from "@turflow/ui/components/button";
import { Label } from "@turflow/ui/components/label";
import { Textarea } from "@turflow/ui/components/textarea";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Noor's Farm Visits — an AI front desk for a smallholder coffee farm" },
      {
        name: "description",
        content:
          "Visitors write in any language. Noor answers from her basic phone by SMS in Swahili. Nothing is confirmed until she says yes.",
      },
      { property: "og:title", content: "Noor's Farm Visits" },
      { property: "og:description", content: "Visitors write in any language. Noor answers from her basic phone." },
    ],
  }),
  component: Landing,
});

const LANGUAGES = ["German", "French", "Japanese", "Spanish", "Dutch", "Italian"];
// Real messages from a local end-to-end run of this app.
const SAMPLE_EMAIL = "Hallo! Wir sind 3 Personen und möchten am Samstag, 10. Oktober, morgens die Kaffeetour machen. Viele Grüße, Lena";
const SAMPLE_SMS = "B14: Lena (Ujerumani), watu 3, Jumamosi 10 Okt asubuhi. Jibu 1=Ndiyo 2=Hapana 3=Siku nyingine";
const TYPING_SPEED = 32;
const TYPING_DELAY = 900;

function Landing() {
  return (
    <div className="min-h-screen overflow-x-clip">
      <Nav />
      <main>
        <Hero />
        <HowItWorks />
        <Principles />
        <TryIt />
      </main>
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Link to="/" className="font-display text-lg font-bold text-primary">Noor's Farm Visits</Link>
      <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
        <a href="#how" className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:text-foreground sm:inline-block">How it works</a>
        <Button asChild variant="outline" size="sm"><Link to="/demo">Open the demo</Link></Button>
      </nav>
    </header>
  );
}

function Hero() {
  const reduce = useReducedMotion();
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-6 pb-20 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-12">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Coffee-farm visits · Ondera highlands</p>
        <h1 className="mt-4 text-4xl font-bold leading-[1.08] text-primary text-balance sm:text-5xl lg:text-6xl">
          Visitors write in{" "}
          {reduce ? (
            <span className="text-accent">any language</span>
          ) : (
            <RotatingText
              texts={LANGUAGES}
              mainClassName="inline-flex overflow-hidden text-accent"
              splitLevelClassName="overflow-hidden pb-1"
              staggerFrom="last"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "-120%" }}
              staggerDuration={0.02}
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              rotationInterval={2200}
            />
          )}
          .
          <br />
          Noor answers from her basic phone.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
          An AI front desk for a smallholder coffee farm. It reads every email in the visitor's language and sends Noor
          one short SMS in Swahili. Nothing is confirmed until she replies.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg"><a href="#try">Try it with a real message</a></Button>
          <Button asChild size="lg" variant="ghost"><Link to="/demo">Open the demo</Link></Button>
        </div>
        <p className="mt-6 text-sm text-muted-foreground">No app for Noor. No form for visitors. Just email and SMS.</p>
      </div>
      <HeroVisual reduce={!!reduce} />
    </section>
  );
}

function HeroVisual({ reduce }: { reduce: boolean }) {
  const [replied, setReplied] = useState(reduce);
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => setReplied(true), TYPING_DELAY + SAMPLE_SMS.length * TYPING_SPEED + 900);
    return () => clearTimeout(t);
  }, [reduce]);

  return (
    <div className="relative mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end">
      {/* The card overlaps only the phone's top edge, never its screen. */}
      <figure className="paper relative z-10 mr-10 p-4 text-sm sm:mr-24 lg:-ml-8 lg:mr-0 lg:w-72">
        <figcaption className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Lena · email in German</span>
          <span>09:41</span>
        </figcaption>
        <p className="leading-relaxed">{SAMPLE_EMAIL}</p>
      </figure>
      <PhoneShell className="relative -mt-6 ml-auto" screenClassName="h-[300px]" label="Noor's SMS: a booking request and her reply">
        <div className="text-sm opacity-70">&lt; Msaidizi</div>
        {reduce ? (
          <p className="whitespace-pre-wrap">{SAMPLE_SMS}</p>
        ) : (
          <TextType
            as="p"
            text={SAMPLE_SMS}
            typingSpeed={TYPING_SPEED}
            initialDelay={TYPING_DELAY}
            loop={false}
            showCursor={!replied}
            cursorCharacter="▌"
            className="font-lcd"
          />
        )}
        <AnimatePresence>
          {replied && (
            <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
              <div className="mt-3 text-sm opacity-70">&gt; Mimi</div>
              <p className="pl-3">1</p>
              <div className="mt-3 text-sm opacity-70">&lt; Msaidizi</div>
              <p>B14 imethibitishwa. Mgeni ametumiwa maelekezo.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </PhoneShell>
      <p className="mt-3 text-right text-xs text-muted-foreground">Real messages from a test run of this demo.</p>
    </div>
  );
}

const STEPS = [
  {
    title: "The visitor writes",
    body: "In any language, by email. No form, no account.",
    sample: "Hallo! Wir sind 3 Personen…",
    lcd: false,
  },
  {
    title: "The assistant reads it",
    body: "It finds the date, group size and time of day, and translates the message for Noor.",
    sample: "3 people · Sat 10 Oct · morning",
    lcd: false,
  },
  {
    title: "Noor decides",
    body: "One SMS in Swahili. She replies 1 to accept, 2 to decline, or 3 to offer another day.",
    sample: "Jibu 1=Ndiyo 2=Hapana 3=Siku nyingine",
    lcd: true,
  },
  {
    title: "The visitor hears back",
    body: "In their own language, with directions once Noor confirms.",
    sample: "Tolle Neuigkeiten — Noor hat deinen Besuch bestätigt.",
    lcd: false,
  },
];

function HowItWorks() {
  return (
    <section id="how" className="border-y border-border bg-card/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="max-w-2xl text-3xl font-bold text-primary text-balance sm:text-4xl">One email in, one SMS out</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Noor works on the slope all day and her phone stays at the house. The assistant does the reading and
          translating, so a request costs her one short message.
        </p>
        <ol className="mt-12 grid gap-10 md:grid-cols-4 md:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative min-w-0 md:pt-8">
              <div className="flex items-center gap-3 md:absolute md:inset-x-0 md:top-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
                  {i + 1}
                </span>
                {i < STEPS.length - 1 && <span className="hidden h-px flex-1 bg-border md:block" aria-hidden="true" />}
              </div>
              <h3 className="mt-4 text-lg font-semibold md:mt-3">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              <p className={`mt-4 rounded-md px-3 py-2 text-sm ${s.lcd ? "lcd-screen text-base leading-tight" : "border border-border bg-background"}`}>
                {s.sample}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Principles() {
  const items = [
    ["Only Noor confirms a booking.", "The booking rules live in code. The AI reads and translates; it can't say yes for her."],
    ["Nothing gets lost between languages.", "Every message keeps the original and a translation, for Noor and for anyone reviewing later."],
    ["Reviews become a plan.", "After the visit, feedback in any language turns into a short monthly summary for Noor, in Swahili."],
  ];
  return (
    <section className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
      <h2 className="text-3xl font-bold text-primary text-balance sm:text-4xl">AI reads. Noor decides.</h2>
      <dl className="divide-y divide-border border-y border-border">
        {items.map(([t, d]) => (
          <div key={t} className="grid gap-1 py-5 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] sm:gap-6">
            <dt className="font-semibold">{t}</dt>
            <dd className="text-muted-foreground">{d}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TryIt() {
  const navigate = useNavigate();
  const [personaId, setPersonaId] = useState(PERSONAS[0]!.id);
  const persona = personaById(personaId) ?? PERSONAS[0]!;
  const [message, setMessage] = useState(persona.message);
  const first = persona.name.split(" ")[0];

  const pick = (id: string) => {
    setPersonaId(id);
    setMessage(personaById(id)?.message ?? "");
  };

  return (
    <section id="try" className="border-t border-border bg-secondary/40 scroll-mt-4">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <h2 className="text-3xl font-bold text-primary text-balance sm:text-4xl">Try it with a real message</h2>
          <p className="mt-3 text-muted-foreground">
            Pick a visitor, edit their email, and watch it reach Noor's phone in the live demo. Then answer as Noor.
          </p>
        </div>
        <Stepper
          initialStep={1}
          backButtonText="Back"
          nextButtonText="Continue"
          completeButtonText="Send and open the demo"
          nextButtonProps={{ disabled: !message.trim() }}
          onFinalStepCompleted={() => navigate({ to: "/demo", search: { persona: persona.id, message: message.trim() } })}
        >
          <Step>
            <fieldset>
              <legend className="text-lg font-semibold">Who's writing to Noor?</legend>
              <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Visitor">
                {PERSONAS.map((p) => {
                  const selected = p.id === personaId;
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      key={p.id}
                      onClick={() => pick(p.id)}
                      className={`rounded-lg border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected ? "border-accent bg-accent/10" : "border-border bg-background hover:border-primary/40"
                      }`}
                    >
                      <span className="block font-medium">{p.name}</span>
                      <span className="block text-sm text-muted-foreground">Writes in {p.language}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </Step>
          <Step>
            <Label htmlFor="wizard-message" className="text-lg font-semibold">{first}'s email, in {persona.language}</Label>
            <Textarea
              id="wizard-message"
              rows={7}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-3 bg-background"
            />
            {message.trim() === persona.message.trim() ? (
              <p className="mt-2 text-sm text-muted-foreground">In English: {persona.english}</p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Write anything, in any language. The assistant will read it.</p>
            )}
          </Step>
          <Step>
            <h3 className="text-lg font-semibold">What happens next</h3>
            <ol className="mt-4 space-y-3 text-sm">
              {[
                `${first}'s email goes to the assistant, which reads it in ${persona.language}.`,
                "Noor's phone gets one SMS in Swahili with the date and group size.",
                "In the demo, tap 1 on her phone, then TUMA, to accept.",
                `${first} gets the confirmation in ${persona.language}, with directions to the farm.`,
              ].map((t, i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">{i + 1}</span>
                  <span className="pt-0.5">{t}</span>
                </li>
              ))}
            </ol>
          </Step>
        </Stepper>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm text-muted-foreground sm:px-6">
      <p className="max-w-2xl">
        Built for the Hack-Nation × World Bank Youth Summit, Small AI for Development. Phase 1 simulator: messages stay
        inside the demo; no real SMS or email is sent.
      </p>
      <Link to="/demo" className="font-medium text-foreground underline-offset-4 hover:underline">Open the demo →</Link>
    </footer>
  );
}
