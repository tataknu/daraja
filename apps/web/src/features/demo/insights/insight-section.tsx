import type { InsightItem, InsightQuote } from "@daraja/engine";
import { languageName, MAX_QUOTES, needsTranslation, plural } from "./report";
import { TONES, type Tone } from "./tones";

export function InsightSection(props: { tone: Tone; items: InsightItem[]; reviewCount: number }) {
  const t = TONES[props.tone];
  const titleId = `insights-${props.tone}`;
  return (
    <section aria-labelledby={titleId} className="paper flex min-w-0 flex-col overflow-hidden">
      <header className="border-b border-border px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${t.dot}`} />
          <h3 id={titleId} className="text-xl font-semibold">
            {t.title}
          </h3>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{t.question}</p>
      </header>
      {props.items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">{t.empty}</p>
      ) : (
        <ul className="divide-y divide-border px-4 sm:px-5">
          {props.items.map((item, i) => (
            <InsightRow
              key={`${item.key}:${i}`}
              item={item}
              reviewCount={props.reviewCount}
              bar={t.bar}
              rule={t.rule}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

// From md to xl the section is full width, so the row splits: the point on the left, its proof on
// the right. Below md and from xl (three columns) it stacks.
function InsightRow(props: { item: InsightItem; reviewCount: number; bar: string; rule: string }) {
  const { item } = props;
  const quotes = item.quotes.slice(0, MAX_QUOTES);
  const total = Math.max(props.reviewCount, item.count);
  const width = total > 0 ? Math.min(100, (item.count / total) * 100) : 0;
  return (
    <li className="py-5 md:max-xl:grid md:max-xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:max-xl:gap-x-8">
      <div className="min-w-0">
        <h4 className="text-[15px] font-semibold leading-snug">{item.label_en}</h4>
        {item.label_sw && (
          <p lang="sw" className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {item.label_sw}
          </p>
        )}
        <p className="mt-3 text-xs tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{item.count}</span> of{" "}
          {plural(total, "review")}
        </p>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden="true">
          <div className={`h-full rounded-full ${props.bar}`} style={{ width: `${width}%` }} />
        </div>
      </div>
      {quotes.length > 0 && (
        <ul className="mt-4 space-y-3.5 md:max-xl:mt-0">
          {quotes.map((q, i) => (
            <Quote key={`${q.feedback_id}:${i}`} quote={q} rule={props.rule} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Quote({ quote: q, rule }: { quote: InsightQuote; rule: string }) {
  return (
    <li className={`min-w-0 border-l-2 pl-3 ${rule}`}>
      <span className="inline-block rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium leading-none text-secondary-foreground">
        {languageName(q.lang)}
      </span>
      <blockquote
        lang={q.lang || undefined}
        className="mt-1.5 text-sm leading-snug [overflow-wrap:anywhere]"
      >
        “{q.quote}”
      </blockquote>
      {needsTranslation(q) && (
        <p
          lang="en"
          className="mt-1 text-xs italic leading-snug text-muted-foreground [overflow-wrap:anywhere]"
        >
          <span className="sr-only">In English: </span>“{q.quote_en}”
        </p>
      )}
    </li>
  );
}
