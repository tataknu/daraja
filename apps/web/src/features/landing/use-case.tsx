// Noor is the example host the product is designed and tested against, not the product itself.
const FACTS = [
  ["Phone", "Basic, SMS only"],
  ["Reads", "Swahili"],
  ["Tours", "Two a day, up to 8 people (demo settings)"],
  ["Visitors write in", "German, French, Japanese, Spanish (in the demo)"],
];

const FITS = [
  {
    problem: "Her phone stays at the house while she works the slope.",
    answer:
      "Requests wait for her. After 24 hours she gets one reminder; after 48 the visitor is told kindly instead of being left waiting.",
  },
  {
    problem: "She reads Swahili. Her visitors don't.",
    answer:
      "Each request reaches her as one Swahili SMS, and her answer reaches the visitor in their own language.",
  },
  {
    problem: "A keypad, not apps.",
    answer:
      "She replies 1, 2 or 3. If she writes in her own words, Daraja reads it back to her before anything is sent.",
  },
  {
    problem: "A small farm can only take so many people.",
    answer:
      "Daraja checks the tour's capacity before it asks her, and flags requests that would go over.",
  },
];

export function UseCase() {
  return (
    <section id="use-case" className="scroll-mt-4">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-accent">Use case</p>
          <h2 className="mt-3 text-3xl font-bold text-primary text-balance sm:text-4xl">
            Noor's coffee farm
          </h2>
          <p className="mt-3 text-muted-foreground">
            Noor is 38 and farms two hectares in the Ondera highlands: coffee on the upper slope,
            maize and beans below. Daraja isn't built for one farm. Noor is the host we design and
            test it against.
          </p>
          <dl className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-2 text-sm">
            {FACTS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <a
            href="#try"
            className="mt-6 inline-block text-sm font-medium text-foreground underline-offset-4 hover:underline"
          >
            Try it as Noor's farm →
          </a>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {FITS.map((f) => (
            <li key={f.problem} className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-display text-lg font-bold leading-snug text-primary">
                {f.problem}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.answer}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
