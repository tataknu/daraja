// Review insights: what visitors keep returning to, what they wish were different, what to build
// next. Counts come from code; every quote is checked against its review. This tab reads the
// latest report and the review counts live, and offers the two actions that feed it.
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@daraja/ui/components/button";
import { generateInsights, loadSampleReviews } from "@/lib/sim.functions";
import { formatRelative, plural, reviewsLabel, type Corpus } from "./insights/report";
import { ReportView } from "./insights/report-view";
import { ErrorState, LoadingState, NoReportState, NoReviewsState } from "./insights/states";
import { useInsights, type LatestReport } from "./insights/use-insights";

type Busy = "samples" | "generate" | null;

const BUSY_TEXT = {
  samples: "Adding the sample reviews and reading each one…",
  generate: "Counting what visitors mention, checking quotes, writing Noor’s SMS…",
} as const;

/** Re-renders now and then, so "updated 2 min ago" keeps up. */
function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}

function Spinner() {
  return (
    <svg className="animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

const messageOf = (e: unknown): string =>
  e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.";

/** How many reviews a server action says it added, if it says. */
function importedCount(result: unknown): number | null {
  if (typeof result !== "object" || result === null || !("imported" in result)) return null;
  return typeof result.imported === "number" ? result.imported : null;
}

/** "11 reviews · 7 languages · updated 2 min ago" */
function Subtitle(props: { corpus: Corpus; latest: LatestReport | null; now: number }) {
  const { corpus, latest } = props;
  if (corpus.total === 0 && !latest) return <>No reviews yet</>;
  // The report says when it was written; the row's own timestamp is the fallback.
  const updatedAt =
    [latest?.report.generated_at, latest?.createdAt].find(
      (t) => t && !Number.isNaN(Date.parse(t)),
    ) ?? "";
  const reviews =
    corpus.total > 0 ? reviewsLabel(corpus) : plural(latest?.report.review_count ?? 0, "review");
  const rest: ReactNode[] = [];
  if (corpus.languages > 0) rest.push(plural(corpus.languages, "language"));
  if (!latest) rest.push("no report yet");
  else if (updatedAt)
    rest.push(
      <>
        updated{" "}
        <time dateTime={updatedAt} title={new Date(updatedAt).toLocaleString()}>
          {formatRelative(updatedAt, props.now)}
        </time>
      </>,
    );
  // One line from sm up. On a phone the reviews and the rest take a line each, so a separator is
  // never left dangling at the end of a line.
  return (
    <>
      <span className="block sm:inline">{reviews}</span>
      <span aria-hidden="true" className="hidden sm:inline">
        {" · "}
      </span>
      <span className="block sm:inline">
        {rest.map((part, i) => (
          <span key={i}>
            {i > 0 && <span aria-hidden="true"> · </span>}
            {part}
          </span>
        ))}
      </span>
    </>
  );
}

export function InsightsView() {
  const { state, reload, retry } = useInsights();
  const loadSamples = useServerFn(loadSampleReviews);
  const generate = useServerFn(generateInsights);
  const [busy, setBusy] = useState<Busy>(null);
  const now = useNow();

  const act = async (kind: Exclude<Busy, null>, work: () => Promise<void>, failure: string) => {
    if (busy) return;
    setBusy(kind);
    try {
      await work();
    } catch (e) {
      toast.error(failure, { description: messageOf(e) });
    } finally {
      setBusy(null);
      await reload();
    }
  };

  const onLoadSamples = () =>
    act(
      "samples",
      async () => {
        const n = importedCount(await loadSamples());
        toast.success(
          n === null ? "Sample reviews loaded" : `${plural(n, "sample review")} loaded`,
        );
      },
      "Couldn’t load the sample reviews",
    );

  const onGenerate = () =>
    act(
      "generate",
      async () => {
        await generate();
        toast.success("Insights ready", { description: "The summary is on Noor’s phone." });
      },
      "Couldn’t generate insights",
    );

  const data = state.status === "ready" ? state.data : null;
  const hasReviews = (data?.corpus.total ?? 0) > 0;
  const busyText = busy ? BUSY_TEXT[busy] : null;

  let body: ReactNode;
  if (state.status === "loading") body = <LoadingState />;
  else if (state.status === "error") body = <ErrorState message={state.message} onRetry={retry} />;
  else if (state.data.latest)
    body = (
      <ReportView
        report={state.data.latest.report}
        smsFallback={state.data.latest.smsLines}
        newReviews={state.data.newReviews}
      />
    );
  else if (state.data.corpus.total === 0)
    body = <NoReviewsState busy={busy !== null} onLoadSamples={onLoadSamples} />;
  else
    body = (
      <NoReportState corpus={state.data.corpus} busy={busy !== null} onGenerate={onGenerate} />
    );

  return (
    <div
      className="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-y-auto px-6 py-8"
      aria-busy={busy !== null || state.status === "loading"}
    >
      {/* A div, not a header: the demo page already has the page banner. */}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold text-primary sm:text-3xl">What visitors say</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {busyText ??
              (data ? (
                <Subtitle corpus={data.corpus} latest={data.latest} now={now} />
              ) : state.status === "error" ? (
                "Couldn’t read the reviews"
              ) : (
                "Loading…"
              ))}
          </p>
          {/* Announces the same text the subtitle swaps to, without the clock's ticking. */}
          <span role="status" className="sr-only">
            {busyText}
          </span>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            variant="outline"
            className="flex-1 sm:min-w-44 sm:flex-none"
            disabled={busy !== null}
            onClick={onLoadSamples}
          >
            {busy === "samples" && <Spinner />}
            {busy === "samples" ? "Loading samples…" : "Load sample reviews"}
          </Button>
          <Button
            className="flex-1 sm:min-w-40 sm:flex-none"
            disabled={busy !== null || !hasReviews}
            onClick={onGenerate}
          >
            {busy === "generate" && <Spinner />}
            {busy === "generate" ? "Generating…" : "Generate insights"}
          </Button>
        </div>
      </div>
      <div className="mt-8">{body}</div>
    </div>
  );
}
