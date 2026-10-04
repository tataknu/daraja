import type { InsightReport } from "@daraja/engine";
import { quoteCount } from "./report";

const droppedSentence = (n: number): string =>
  n === 0
    ? "None of the quotes the AI returned had to be dropped."
    : n === 1
      ? "One quote the AI returned was not found there, and was dropped."
      : `${n} quotes the AI returned were not found there, and were dropped.`;

/** Why the numbers can be trusted: where the AI is used, where code takes over, what was dropped. */
export function HowItsMade({ report }: { report: InsightReport }) {
  const shown = quoteCount(report);
  const dropped = report.dropped_quotes;
  const top = report.keep[0] ?? report.improve[0] ?? report.next[0];
  const figure = top
    ? `a figure like “${top.count} of ${report.review_count} reviews”`
    : "every figure here";
  return (
    <section
      aria-labelledby="insights-how"
      className="rounded-lg border border-dashed border-border bg-secondary/40 p-4 sm:p-6"
    >
      <h3 id="insights-how" className="text-lg font-semibold">
        How this report is made
      </h3>
      <ul className="mt-4 grid grid-cols-1 gap-5 text-sm md:grid-cols-3 md:gap-8">
        <li>
          <p className="font-semibold">Counted in code</p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            Each review is read once, and what the visitor loved, wished for or suggested is stored
            with it. Plain code counts those points, so {figure} is arithmetic, not an estimate.
          </p>
        </li>
        <li>
          <p className="font-semibold">The AI extracts and phrases</p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            It reads each review in its own language, pulls out the points, translates the quotes
            and writes the Swahili SMS. It does none of the counting.
          </p>
        </li>
        <li>
          <p className="font-semibold">Every quote is checked</p>
          <p className="mt-1 leading-relaxed text-muted-foreground">
            Code looks for each quote, word for word, in the visitor’s original review.{" "}
            {droppedSentence(dropped)}
          </p>
          <p className="mt-2 flex gap-5 text-xs tabular-nums text-muted-foreground">
            <span>
              <strong className="text-sm font-semibold text-foreground">{shown}</strong> shown
            </span>
            <span>
              <strong className="text-sm font-semibold text-foreground">{dropped}</strong> dropped
            </span>
          </p>
        </li>
      </ul>
    </section>
  );
}
