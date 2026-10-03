import type { ReactNode } from "react";

// Each step shows the real artefact at that point: what was sent, on which channel, in which
// language. Samples come from a test run of the demo (Noor's farm, the example host).
const STEPS: { title: string; body: string; label: string; sample: ReactNode }[] = [
  {
    title: "The visitor writes",
    body: "By email, in their own language. No form, no account.",
    label: "Email · German",
    sample: (
      <Artefact gloss="“Hi! We're 3 people and would like the coffee tour on Saturday morning…”">
        Hallo! Wir sind 3 Personen und möchten am Samstag morgens die Kaffeetour machen…
      </Artefact>
    ),
  },
  {
    title: "Daraja reads it",
    body: "It pulls out the date, group size and time of day, and translates the message for the host.",
    label: "What Daraja found",
    sample: (
      <div className="flex h-full flex-wrap content-start gap-1.5 rounded-lg border border-border bg-background p-3">
        {["3 people", "Sat 10 Oct", "Morning", "Writes in German"].map((f) => (
          <span key={f} className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
            {f}
          </span>
        ))}
      </div>
    ),
  },
  {
    title: "The host decides",
    body: "One short SMS on any phone. Reply 1 to accept, 2 to decline, or 3 to offer another day.",
    label: "SMS to Noor · Swahili",
    sample: (
      <div className="lcd-screen h-full rounded-lg px-3 py-2.5 text-[17px] leading-tight">
        <p>B14: Lena, watu 3, Jumamosi asubuhi. Jibu 1=Ndiyo 2=Hapana 3=Siku nyingine</p>
        <p className="mt-2 opacity-80">› Noor: 1</p>
      </div>
    ),
  },
  {
    title: "The visitor hears back",
    body: "In their own language, with directions once the host confirms.",
    label: "Email · German",
    sample: (
      <Artefact gloss="“Great news — Noor has confirmed your visit.”">
        Tolle Neuigkeiten — Noor hat deinen Besuch bestätigt.
      </Artefact>
    ),
  },
];

function Artefact({ children, gloss }: { children: ReactNode; gloss: string }) {
  return (
    <div className="h-full rounded-lg border border-border bg-background p-3 text-sm">
      <p className="leading-snug">{children}</p>
      <p className="mt-2 text-xs leading-snug text-muted-foreground">{gloss}</p>
    </div>
  );
}

export function HowItWorks() {
  return (
    <section id="how" className="border-y border-border bg-card/60">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="max-w-2xl text-3xl font-bold text-primary text-balance sm:text-4xl">
          One email in, one SMS out
        </h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Hosts are out working all day, often with only a basic phone. Daraja does the reading and
          translating, so each booking request costs them one short SMS.
        </p>
        {/* Subgrid rows keep titles, text and samples aligned across the four columns. */}
        <ol className="mt-12 grid gap-x-6 gap-y-10 md:grid-cols-4">
          {STEPS.map((s, i) => (
            <li
              key={s.title}
              className="relative grid min-w-0 gap-y-1 md:row-span-3 md:grid-rows-subgrid md:pt-10"
            >
              <div className="mb-3 flex items-center gap-3 md:absolute md:inset-x-0 md:top-0 md:mb-0">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground tabular-nums">
                  {i + 1}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="hidden h-px flex-1 bg-border md:block" aria-hidden="true" />
                )}
              </div>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{s.body}</p>
              <figure className="mt-3 flex min-w-0 flex-col gap-1.5">
                <figcaption className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {s.label}
                </figcaption>
                <div className="flex-1">{s.sample}</div>
              </figure>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
