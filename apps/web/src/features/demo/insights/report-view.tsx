import type { InsightReport } from "@daraja/engine";
import { HowItsMade } from "./how-its-made";
import { InsightSection } from "./insight-section";
import { plural } from "./report";
import { SmsPanel } from "./sms-panel";

const SENTIMENT = [
  { key: "positive", dot: "bg-success" },
  { key: "neutral", dot: "bg-muted-foreground/40" },
  { key: "negative", dot: "bg-accent" },
] as const;

function Sentiment({ counts }: { counts: InsightReport["sentiment"] }) {
  const total = counts.positive + counts.neutral + counts.negative;
  if (total === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        How visitors felt
      </p>
      {/* Decorative: the legend beside it says the same in words. */}
      <div
        aria-hidden="true"
        className="flex h-1.5 w-40 gap-px overflow-hidden rounded-full bg-secondary"
      >
        {SENTIMENT.filter((s) => counts[s.key] > 0).map((s) => (
          <div
            key={s.key}
            className={s.dot}
            style={{ width: `${(counts[s.key] / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {SENTIMENT.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${s.dot}`} />
            <span className="tabular-nums">
              {counts[s.key]} {s.key}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The report itself: three answers, what Noor received, and why it can be trusted. */
export function ReportView(props: {
  report: InsightReport;
  /** The SMS lines stored with the report, used only if the report has none of its own. */
  smsFallback: string[];
  /** Reviews that arrived after the report was written; it doesn't cover them. */
  newReviews: number;
}) {
  const { report, newReviews } = props;
  const smsSw = report.sms_sw.some(Boolean) ? report.sms_sw : props.smsFallback;
  return (
    <div className="space-y-8">
      {newReviews > 0 && (
        <p
          role="status"
          className="rounded-md border border-warning/50 bg-warning/10 px-4 py-3 text-sm"
        >
          {plural(newReviews, "review")} arrived after this report was written. Generate insights to
          include {newReviews === 1 ? "it" : "them"}.
        </p>
      )}
      <Sentiment counts={report.sentiment} />
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <InsightSection tone="keep" items={report.keep} reviewCount={report.review_count} />
        <InsightSection tone="improve" items={report.improve} reviewCount={report.review_count} />
        <InsightSection tone="next" items={report.next} reviewCount={report.review_count} />
      </div>
      <SmsPanel sw={smsSw} en={report.sms_en} />
      <HowItsMade report={report} />
    </div>
  );
}
