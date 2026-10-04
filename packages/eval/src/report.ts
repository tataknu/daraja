// Results files and the generated part of docs/eval.md. Files are written through Prettier with the
// repo's settings, so `make check` (format:check) stays green after an eval run.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AiUsage } from "@daraja/engine/ai";
import type { ModelPrice } from "@daraja/engine/metrics";
import { format, resolveConfig } from "prettier";
import type { ScenarioResult } from "./safety";
import type { Metric } from "./score";
import type { ModelSuiteName } from "./suites";

export interface CaseRecord extends Record<string, unknown> {
  id: string;
  cached: boolean;
  error: string | null;
  usage: AiUsage[];
}

export interface SuiteResult {
  kind: "model";
  suite: ModelSuiteName;
  task: string;
  title: string;
  model: string;
  effort: string;
  /** When the newest answer in this run came from the model (cached answers keep their date). */
  answered_at: string;
  dataset: { source: string; sha256: string; cases: number; total: number };
  /** Run on part of the dataset (--limit): kept out of the docs. */
  partial: boolean;
  /** USD per 1M tokens the cost was computed at; null: no price, no cost. */
  prices: ModelPrice | null;
  /** Where `prices` came from: the engine's dated price table, or AI_PRICE_* settings. */
  price_source: string | null;
  metrics: Metric[];
  usage: Metric[];
  cases: CaseRecord[];
}

export interface SafetyReport {
  kind: "safety";
  passed: number;
  total: number;
  scenarios: ScenarioResult[];
}

export const START = "<!-- eval:results:start -->";
export const END = "<!-- eval:results:end -->";

export async function writeFormatted(path: string, text: string): Promise<void> {
  const options = (await resolveConfig(path)) ?? {};
  writeFileSync(path, await format(text, { ...options, filepath: path }));
}

export const writeJson = (path: string, value: unknown) =>
  writeFormatted(path, JSON.stringify(value, null, 2));

export function loadResults(dir: string): { runs: SuiteResult[]; safety: SafetyReport | null } {
  const runs: SuiteResult[] = [];
  let safety: SafetyReport | null = null;
  for (const name of existsSync(dir) ? readdirSync(dir).sort() : []) {
    if (!name.endsWith(".json")) continue;
    const r = JSON.parse(readFileSync(join(dir, name), "utf8")) as SuiteResult | SafetyReport;
    if (r.kind === "safety") safety = r;
    else if (r.kind === "model" && !r.partial) runs.push(r);
  }
  return { runs, safety };
}

/** A bound of an interval in percent: one decimal, except a bound that is exactly 0 or 100. */
const bound = (x: number) => (x <= 0 ? "0" : x >= 1 ? "100" : (x * 100).toFixed(1));

export function formatMetric(m: Metric | undefined): string {
  if (!m || m.value === null) return m?.den === 0 ? "not scored" : "–";
  const v = m.value;
  switch (m.format) {
    case "pct": {
      const pct = `${(v * 100).toFixed(1)}%`;
      if (m.den === undefined) return pct;
      const ci = m.ci ? `; 95% CI ${bound(m.ci[0])}–${bound(m.ci[1])}%` : "";
      return `${pct} (${m.num}/${m.den}${ci})`;
    }
    case "int":
      return Math.round(v).toLocaleString("en-US");
    case "ms":
      return `${Math.round(v).toLocaleString("en-US")} ms`;
    case "usd":
      return `$${v < 1 ? v.toFixed(4) : v.toFixed(2)}`;
  }
}

const runLabel = (r: SuiteResult) => `${r.model}, effort ${r.effort}`;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const table = (head: string[], rows: string[][]) =>
  [head, head.map(() => "---"), ...rows].map((r) => `| ${r.map(cell).join(" | ")} |`).join("\n");

/** Rows are metrics, columns are runs (model and effort), so runs compare side by side. */
function metricsTable(runs: SuiteResult[]): string {
  const keys: { key: string; label: string }[] = [];
  for (const r of runs)
    for (const m of r.metrics)
      if (!keys.some((k) => k.key === m.key)) keys.push({ key: m.key, label: m.label });
  return table(
    ["Metric", ...runs.map(runLabel)],
    keys.map(({ key, label }) => [
      label,
      ...runs.map((r) => formatMetric(r.metrics.find((m) => m.key === key))),
    ]),
  );
}

const USAGE_COLUMNS = [
  "calls",
  "failed",
  "input_tokens",
  "output_tokens",
  "reasoning_tokens",
  "latency_p50",
  "latency_p95",
  "cost_per_1k",
];

function usageTable(runs: SuiteResult[]): string {
  const label = (key: string) => runs[0]?.usage.find((m) => m.key === key)?.label ?? key;
  return table(
    ["Run", ...USAGE_COLUMNS.map(label)],
    runs.map((r) => [
      `${r.suite}: ${runLabel(r)}`,
      ...USAGE_COLUMNS.map((key) => {
        const m = r.usage.find((u) => u.key === key);
        return key === "cost_per_1k" && m?.value === null ? "no prices set" : formatMetric(m);
      }),
    ]),
  );
}

const perMillion = (usd: number) =>
  `$${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;

/** Which price each run's cost uses, once per model and source. */
function priceNote(runs: SuiteResult[]): string {
  const lines = new Set(
    runs.flatMap((r) =>
      r.prices
        ? [
            `\`${r.model}\`: ${perMillion(r.prices.input)} input, ${perMillion(r.prices.cachedInput)} cached input, ${perMillion(r.prices.output)} output per 1M tokens (${r.price_source ?? "source not recorded"})`,
          ]
        : [],
    ),
  );
  return lines.size
    ? `Per model call, not per booking. Cost at ${[...lines].join("; ")}.`
    : "Per model call, not per booking.";
}

const confirmedBy = (c: { booking: string; by: string }) =>
  `${c.booking} on a message from ${c.by === "Noor" ? "Noor's phone" : c.by}`;

const SUITE_ORDER: ModelSuiteName[] = ["guest", "host", "reviews"];

/** The markdown between the markers in docs/eval.md. */
export function renderResults(runs: SuiteResult[], safety: SafetyReport | null): string {
  const out: string[] = [
    "_Generated by `make eval` from `packages/eval/results/*.json`. Edit outside the markers._",
    "Each rate shows its counts. A rate over independent cases (one per email, reply or review) also shows its exact (Clopper–Pearson) 95% confidence interval: the true rates these counts are consistent with. Points and quotes, several per review, get none.",
  ];
  const sorted = [...runs].sort(
    (a, b) =>
      SUITE_ORDER.indexOf(a.suite) - SUITE_ORDER.indexOf(b.suite) ||
      a.model.localeCompare(b.model) ||
      a.effort.localeCompare(b.effort),
  );
  for (const suite of SUITE_ORDER) {
    const rs = sorted.filter((r) => r.suite === suite);
    const first = rs[0];
    if (!first) continue;
    const dates = rs.map((r) => r.answered_at.slice(0, 10)).sort();
    out.push(
      `### ${first.title} (\`${first.task}\`)`,
      `${first.dataset.total} labelled cases from \`${first.dataset.source}\`; model answers from ${dates.at(-1)}.`,
      metricsTable(rs),
    );
  }
  if (sorted.length) out.push("### Cost and speed", priceNote(sorted), usageTable(sorted));
  else out.push("No model results yet: run `make eval`.");
  if (safety) {
    out.push(
      "### Safety (no model calls)",
      [
        safety.passed === safety.total
          ? `${safety.passed} of ${safety.total} scenarios pass: whatever the AI claimed, every write that set a booking to CONFIRMED was made on a message from Noor's own phone.`
          : `${safety.total - safety.passed} of ${safety.total} scenarios FAIL: see below.`,
        "The engine's rule: no booking reaches CONFIRMED unless Noor approved it, or the guest accepted a date Noor herself offered (that acceptance is read by the AI).",
        "The AI's reading of a guest's answer to a date Noor offered is scored in the guest table (7 written replies).",
      ].join(" "),
      table(
        [
          "Scenario",
          "Attack, and what the AI claims",
          "What the engine did",
          "Writes to CONFIRMED",
          "Bookings after",
          "Result",
        ],
        safety.scenarios.map((s) => [
          s.title,
          s.attack,
          s.actions.map((a) => `\`${a}\``).join(" → "),
          s.confirmations.map(confirmedBy).join(", ") || "none",
          s.bookings,
          s.pass ? "pass" : `FAIL: ${s.failure}`,
        ]),
      ),
    );
  }
  return out.join("\n\n");
}

/** Replaces the generated block of the docs page, leaving the hand-written text alone. */
export function replaceBlock(doc: string, block: string): string {
  const start = doc.indexOf(START);
  const end = doc.indexOf(END);
  if (start < 0 || end < start)
    throw new Error(`docs/eval.md needs the ${START} and ${END} markers`);
  return `${doc.slice(0, start + START.length)}\n\n${block}\n\n${doc.slice(end)}`;
}

export async function updateDocs(docsFile: string, resultsDir: string): Promise<void> {
  const { runs, safety } = loadResults(resultsDir);
  const doc = readFileSync(docsFile, "utf8");
  await writeFormatted(docsFile, replaceBlock(doc, renderResults(runs, safety)));
}
