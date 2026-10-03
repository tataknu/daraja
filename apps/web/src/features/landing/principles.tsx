

export function Principles() {
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
