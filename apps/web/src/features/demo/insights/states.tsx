import type { ReactNode } from "react";
import { Button } from "@daraja/ui/components/button";
import { Skeleton } from "@daraja/ui/components/skeleton";
import { TONES } from "./tones";
import { plural, type Corpus } from "./report";

/** Placeholder shaped like the report while it loads. */
export function LoadingState() {
  return (
    <div role="status" className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <span className="sr-only">Loading insights…</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="paper space-y-4 p-5" aria-hidden="true">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ))}
    </div>
  );
}

function StateCard(props: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={props.id} className="paper p-6 sm:p-8">
      <h3 id={props.id} className="text-xl font-semibold">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

export function ErrorState(props: { message: string; onRetry: () => void }) {
  return (
    <StateCard id="insights-error" title="Couldn’t load the insights">
      <p role="alert" className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {props.message}
      </p>
      <Button variant="outline" className="mt-5" onClick={props.onRetry}>
        Try again
      </Button>
    </StateCard>
  );
}

/** The three questions the report answers, so an empty tab still says what it is for. */
function Questions() {
  return (
    <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {(["keep", "improve", "next"] as const).map((tone, i) => (
        <li key={tone} className="rounded-lg border border-border bg-background/60 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${TONES[tone].dot}`} />
            {i + 1}. {TONES[tone].title}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{TONES[tone].question}</p>
        </li>
      ))}
    </ol>
  );
}

export function NoReviewsState(props: { busy: boolean; onLoadSamples: () => void }) {
  return (
    <StateCard id="insights-empty" title="Nothing to summarise yet">
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Visitors’ reviews arrive by email after their visit, in whatever language they write. From
        them Daraja answers three questions for Noor, and texts her the short version in Swahili.
      </p>
      <Questions />
      <p className="mt-6 max-w-2xl text-sm leading-relaxed">
        To see it now, load a set of sample reviews written for Noor’s farm, in several languages.
      </p>
      <Button className="mt-4" disabled={props.busy} onClick={props.onLoadSamples}>
        Load sample reviews
      </Button>
    </StateCard>
  );
}

export function NoReportState(props: { corpus: Corpus; busy: boolean; onGenerate: () => void }) {
  const { corpus } = props;
  return (
    <StateCard id="insights-empty" title="No report yet">
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        {plural(corpus.total, "review")}
        {corpus.languages > 0 && <> in {plural(corpus.languages, "language")}</>}{" "}
        {corpus.total === 1 ? "is" : "are"} waiting. Generating insights counts what visitors
        mention, checks every quote against its review, and texts Noor a short summary in Swahili.
      </p>
      <Questions />
      <Button className="mt-6" disabled={props.busy} onClick={props.onGenerate}>
        Generate insights
      </Button>
    </StateCard>
  );
}
