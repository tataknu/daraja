// The three model suites: which task each one calls, on which labelled cases, and how it is scored.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  Ai,
  GuestClassification,
  HostClassification,
  ReviewAnalysis,
} from "@daraja/engine/ai";
import { SAMPLE_REVIEWS, type SampleReview } from "@daraja/engine/samples";
import {
  parseGuestDataset,
  parseHostDataset,
  renderOpenPrompts,
  type Dataset,
  type GuestCase,
  type HostCase,
} from "./labels";
import {
  guestMetrics,
  hostMetrics,
  reviewMetrics,
  scoreGuest,
  scoreHost,
  scoreReview,
  type GuestScore,
  type HostScore,
  type Metric,
  type ReviewScore,
} from "./score";

export type ModelSuiteName = "guest" | "host" | "reviews";

export interface Suite<C, O, S> {
  name: ModelSuiteName;
  /** The structured-output schema name of the call, e.g. "classify_guest". */
  task: string;
  title: string;
  /** Where the labelled cases come from, for the docs. */
  source: string;
  /** Labelled cases, plus a hash of them for the results file. */
  load(): { cases: C[]; sha256: string };
  id(c: C): string;
  /** The one model call a case makes. */
  call(ai: Ai, c: C): Promise<O>;
  score(c: C, out: O | null): S;
  metrics(cases: C[], scores: S[]): Metric[];
  /** What the results file keeps per case, besides id, usage and errors. */
  record(c: C, out: O | null, score: S): Record<string, unknown>;
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function readDataset<C>(
  dataDir: string,
  file: string,
  parse: (raw: unknown, file: string) => Dataset<C>,
) {
  const text = readFileSync(join(dataDir, file), "utf8");
  return { dataset: parse(JSON.parse(text), file), sha256: sha256(text) };
}

export function guestSuite(dataDir: string): Suite<GuestCase, GuestClassification, GuestScore> {
  const { dataset, sha256 } = readDataset(dataDir, "guest.json", parseGuestDataset);
  const { today, slots } = dataset;
  return {
    name: "guest",
    task: "classify_guest",
    title: "Guest emails",
    source: "packages/eval/data/guest.json",
    load: () => ({ cases: dataset.cases, sha256 }),
    id: (c) => c.id,
    call: (ai, c) => ai.classifyGuest(c.text, { today, slots, booking: c.booking }),
    score: (c, out) => scoreGuest(c, out, slots),
    metrics: guestMetrics,
    record: (c, out, score) => ({
      text: c.text,
      booking: c.booking,
      expected: c.labels,
      got: out,
      score,
      ...(c.note ? { note: c.note } : {}),
    }),
  };
}

export function hostSuite(dataDir: string): Suite<HostCase, HostClassification, HostScore> {
  const { dataset, sha256 } = readDataset(dataDir, "host.json", parseHostDataset);
  const { today } = dataset;
  return {
    name: "host",
    task: "classify_host",
    title: "Noor's SMS replies",
    source: "packages/eval/data/host.json",
    load: () => ({ cases: dataset.cases, sha256 }),
    id: (c) => c.id,
    call: (ai, c) => ai.classifyHost(c.text, { today, openPrompts: renderOpenPrompts(c.open) }),
    score: scoreHost,
    metrics: (_cases, scores) => hostMetrics(scores),
    record: (c, out, score) => ({
      text: c.text,
      open: renderOpenPrompts(c.open),
      expected: c.labels,
      got: out,
      score,
      ...(c.note ? { note: c.note } : {}),
    }),
  };
}

export function reviewSuite(): Suite<SampleReview, ReviewAnalysis, ReviewScore> {
  // The labels only: a stored `analysis` is a model output itself, so it is not used here.
  const cases = SAMPLE_REVIEWS;
  return {
    name: "reviews",
    task: "analyze_review",
    title: "Reviews",
    source: "SAMPLE_REVIEWS in packages/engine/src/samples",
    load: () => ({
      cases,
      sha256: sha256(JSON.stringify(cases.map(({ id, text, labels }) => ({ id, text, labels })))),
    }),
    id: (r) => r.id,
    call: (ai, r) => ai.analyzeReview(r.text),
    score: scoreReview,
    metrics: (_cases, scores) => reviewMetrics(scores),
    record: (r, out, score) => ({ text: r.text, expected: r.labels, got: out, score }),
  };
}
