

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

export function HowItWorks() {
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
