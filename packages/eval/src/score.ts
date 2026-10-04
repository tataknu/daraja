// Scoring: pure functions from labels and model output to per-case outcomes, and from those to the
// metrics in docs/eval.md. Model output is read the way the engine reads it (a slot that isn't one
// of the farm's slots counts as none, "b14" is B14), so a score means what the product would do.
import type {
  AiUsage,
  GuestClassification,
  HostClassification,
  ReviewAnalysis,
} from "@daraja/engine/ai";
import type { SampleReview } from "@daraja/engine/samples";
import { MISSING_FIELDS, options, type GuestCase, type HostCase, type OneOf } from "./labels";

/**
 * Below this confidence the engine hands the message to Noor instead of acting on it. A copy of
 * CONF_MIN in packages/engine/src/context.ts (not exported to tools); keep the two in sync.
 */
export const CONF_MIN = 0.75;

// ---- reading model output like the engine does ------------------------------------------------

/** "zh-CN" and "ZH" are both zh: only the primary ISO 639-1 subtag is compared. */
export function normLang(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return v.trim().toLowerCase().split(/[-_]/)[0] || null;
}

/** The YYYY-MM-DD part of a date; "" is no date (the engine asks the guest for it). */
export function normDate(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  return /^\d{4}-\d{2}-\d{2}/.exec(v.trim())?.[0] ?? v.trim();
}

/** guest.ts keeps a slot only if it is one of the farm's slots; anything else counts as none. */
export function normSlot(v: unknown, slots: string[]): string | null {
  return typeof v === "string" && slots.includes(v) ? v : null;
}

export function normParty(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** host.ts reads a booking reference by its digits, so "b14", "14" and "B14" are the same. */
export function normBooking(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const digits = String(v).replace(/\D/g, "");
  return digits ? `B${Number(digits)}` : null;
}

/** The fields still needed, as a sorted list. "slot" is ignored: it is optional (morning by default). */
export function normMissing(v: unknown): string {
  if (!Array.isArray(v)) return "";
  const known = (v as unknown[]).filter((x) => (MISSING_FIELDS as readonly unknown[]).includes(x));
  return [...new Set(known)].sort().join(",");
}

/** Whether `got` (already normalised) equals one of the label's options, normalised the same way. */
export function acceptsBy<T>(
  label: OneOf<T>,
  got: string | number | null,
  norm: (option: T) => string | number | null,
): boolean {
  return options(label).some((o) => norm(o) === got);
}

/** Lowercase, Unicode-normalised, whitespace collapsed. */
export function normText(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Whether a quote appears in the original text, ignoring case, spacing and punctuation at its ends. */
export function isVerbatim(quote: string, original: string): boolean {
  const q = normText(quote).replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "");
  return q.length > 0 && normText(original).includes(q);
}

// ---- per-case scores -----------------------------------------------------------------------------

/** null = not scored for this case (no label). */
export interface GuestScore {
  intent: boolean;
  language: boolean | null;
  date_from: boolean | null;
  party_size: boolean | null;
  slot: boolean | null;
  missing: boolean | null;
  /** Every scored field right. */
  exact: boolean;
  confidence: number | null;
  /** The engine would pass the message to Noor instead of acting on it. */
  handoff: boolean;
  /** The engine would act on it, and the intent, date, party size or slot is wrong. */
  wrong_but_confident: boolean;
}

export function scoreGuest(
  c: GuestCase,
  out: GuestClassification | null,
  slots: string[],
): GuestScore {
  const { labels } = c;
  const e = out?.entities;
  const ent = labels.entities;
  const ok = out !== null;
  const intent = ok && options(labels.intent).includes(out.intent);
  const language =
    labels.language === undefined
      ? null
      : ok && acceptsBy(labels.language, normLang(out.language), normLang);
  const date_from = ent ? ok && acceptsBy(ent.date_from, normDate(e?.date_from), normDate) : null;
  const party_size = ent
    ? ok && acceptsBy(ent.party_size, normParty(e?.party_size), normParty)
    : null;
  const slot = ent
    ? ok && acceptsBy(ent.slot, normSlot(e?.slot, slots), (o) => normSlot(o, slots))
    : null;
  const missing =
    labels.missing === undefined
      ? null
      : ok && acceptsBy(labels.missing, normMissing(out.missing), normMissing);
  const exact = [intent, language, date_from, party_size, slot, missing].every((x) => x !== false);
  // guest.ts: below CONF_MIN or "unknown" goes to Noor as a question; an AI error goes to her as is.
  const handoff = !ok || out.confidence < CONF_MIN || out.intent === "unknown";
  const wrong = !intent || date_from === false || party_size === false || slot === false;
  return {
    intent,
    language,
    date_from,
    party_size,
    slot,
    missing,
    exact,
    confidence: ok ? out.confidence : null,
    handoff,
    wrong_but_confident: !handoff && wrong,
  };
}

export interface HostScore {
  intent: boolean;
  booking: boolean;
  proposed_date: boolean | null;
  exact: boolean;
  confidence: number | null;
  /** The engine would ask Noor to rephrase instead of reading the action back to her. */
  handoff: boolean;
  /** The engine would read a wrong action back to Noor for her 1 (yes) or 2 (no). */
  wrong_but_confident: boolean;
}

export function scoreHost(c: HostCase, out: HostClassification | null): HostScore {
  const { labels } = c;
  const ok = out !== null;
  const intent = ok && options(labels.intent).includes(out.intent);
  const booking = ok && acceptsBy(labels.booking, normBooking(out.booking), normBooking);
  const proposed_date =
    labels.proposed_date === undefined
      ? null
      : ok && acceptsBy(labels.proposed_date, normDate(out.proposed_date), normDate);
  // host.ts readFreeText: acts only on a confident, known intent for a booking with an open prompt.
  const bid = normBooking(out?.booking);
  const valid = c.open.some((p) => normBooking(p.booking) === bid && p.kind !== "confirm_readback");
  const handoff = !ok || out.confidence < CONF_MIN || out.intent === "unknown" || !valid;
  const exact = intent && booking && proposed_date !== false;
  return {
    intent,
    booking,
    proposed_date,
    exact,
    confidence: ok ? out.confidence : null,
    handoff,
    wrong_but_confident: !handoff && !exact,
  };
}

export interface ReviewScore {
  sentiment: boolean;
  /** (aspect, polarity) pairs: found and labelled, found, labelled. */
  points_tp: number;
  points_predicted: number;
  points_gold: number;
  has_idea: boolean;
  idea_labelled: boolean;
  quotes: number;
  verbatim: number;
}

export function scoreReview(r: SampleReview, out: ReviewAnalysis | null): ReviewScore {
  const gold = new Set([
    ...r.labels.loved.map((a) => `${a}:loved`),
    ...r.labels.wished.map((a) => `${a}:wished`),
  ]);
  const points = out?.points ?? [];
  const ideas = out?.ideas ?? [];
  const predicted = new Set(points.map((p) => `${p.aspect}:${p.polarity}`));
  const quotes = [...points.map((p) => p.quote), ...ideas.map((i) => i.quote)];
  return {
    sentiment: out !== null && out.sentiment === r.labels.sentiment,
    points_tp: [...predicted].filter((k) => gold.has(k)).length,
    points_predicted: predicted.size,
    points_gold: gold.size,
    has_idea: ideas.length > 0,
    idea_labelled: r.labels.ideas.length > 0,
    quotes: quotes.length,
    verbatim: quotes.filter((q) => isVerbatim(q, r.text)).length,
  };
}

// ---- metrics --------------------------------------------------------------------------------------

export type Format = "pct" | "int" | "ms" | "usd";

export interface Metric {
  key: string;
  label: string;
  format: Format;
  value: number | null;
  /** For rates: the counts behind the value, shown next to it. */
  num?: number;
  den?: number;
}

export function ratio(key: string, label: string, num: number, den: number): Metric {
  return { key, label, format: "pct", value: den ? num / den : null, num, den };
}

/** The share of `true` among the scored (non-null) values. */
export function rate(key: string, label: string, xs: (boolean | null)[]): Metric {
  const scored = xs.filter((x): x is boolean => x !== null);
  return ratio(key, label, scored.filter(Boolean).length, scored.length);
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

/** Nearest-rank percentile of an ascending list. */
export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i] ?? null;
}

export function guestMetrics(cases: GuestCase[], scores: GuestScore[]): Metric[] {
  const pick = <K extends keyof GuestScore>(k: K) => scores.map((s) => s[k]);
  const byIntent = [...new Set(cases.map((c) => options(c.labels.intent)[0]))].map((intent) =>
    rate(
      `intent:${intent}`,
      `Intent, labelled ${intent}`,
      scores.filter((_, i) => options(cases[i]!.labels.intent)[0] === intent).map((s) => s.intent),
    ),
  );
  return [
    rate("intent", "Intent", pick("intent")),
    rate("language", "Language", pick("language")),
    rate("date_from", "Date", pick("date_from")),
    rate("party_size", "Party size", pick("party_size")),
    rate("slot", "Slot (morning / afternoon)", pick("slot")),
    rate("missing", "Missing fields", pick("missing")),
    rate("exact", "Every field right", pick("exact")),
    rate("handoff", "Handed to Noor (unsure)", pick("handoff")),
    rate("wrong_but_confident", "Wrong but confident", pick("wrong_but_confident")),
    ...byIntent,
  ];
}

export function hostMetrics(scores: HostScore[]): Metric[] {
  return [
    rate(
      "intent",
      "Intent",
      scores.map((s) => s.intent),
    ),
    rate(
      "booking",
      "Booking id",
      scores.map((s) => s.booking),
    ),
    rate(
      "proposed_date",
      "Proposed date",
      scores.map((s) => s.proposed_date),
    ),
    rate(
      "exact",
      "Every field right",
      scores.map((s) => s.exact),
    ),
    rate(
      "handoff",
      "Asked to rephrase",
      scores.map((s) => s.handoff),
    ),
    rate(
      "wrong_but_confident",
      "Wrong but confident",
      scores.map((s) => s.wrong_but_confident),
    ),
  ];
}

export function reviewMetrics(scores: ReviewScore[]): Metric[] {
  const tp = sum(scores.map((s) => s.points_tp));
  const predicted = sum(scores.map((s) => s.points_predicted));
  const gold = sum(scores.map((s) => s.points_gold));
  const precision = predicted ? tp / predicted : null;
  const recall = gold ? tp / gold : null;
  const f1 =
    precision !== null && recall !== null && precision + recall > 0
      ? (2 * precision * recall) / (precision + recall)
      : null;
  const ideaTp = scores.filter((s) => s.has_idea && s.idea_labelled).length;
  return [
    rate(
      "sentiment",
      "Sentiment",
      scores.map((s) => s.sentiment),
    ),
    ratio("points_precision", "Points precision", tp, predicted),
    ratio("points_recall", "Points recall", tp, gold),
    { key: "points_f1", label: "Points F1", format: "pct", value: f1 },
    ratio(
      "idea_precision",
      "Idea detection precision",
      ideaTp,
      scores.filter((s) => s.has_idea).length,
    ),
    ratio(
      "idea_recall",
      "Idea detection recall",
      ideaTp,
      scores.filter((s) => s.idea_labelled).length,
    ),
    ratio(
      "quote_verbatim",
      "Quotes found verbatim",
      sum(scores.map((s) => s.verbatim)),
      sum(scores.map((s) => s.quotes)),
    ),
  ];
}

export interface Prices {
  /** USD per million input tokens. */
  in: number;
  /** USD per million output tokens (reasoning tokens are billed as output). */
  out: number;
}

/** Calls, tokens, latency and cost. `perCase` holds the usage of each case's call(s). */
export function usageMetrics(perCase: AiUsage[][], prices: Prices | null): Metric[] {
  const calls = perCase.flat();
  const ok = calls.filter((u) => u.ok);
  const latency = ok.map((u) => u.latency_ms).sort((a, b) => a - b);
  const avg = (k: "input_tokens" | "cached_tokens" | "output_tokens" | "reasoning_tokens") =>
    mean(ok.map((u) => u[k]));
  const costPerMessage = prices
    ? mean(
        perCase.map((us) =>
          sum(us.map((u) => (u.input_tokens * prices.in + u.output_tokens * prices.out) / 1e6)),
        ),
      )
    : null;
  return [
    { key: "calls", label: "Model calls", format: "int", value: calls.length },
    { key: "failed", label: "Failed calls", format: "int", value: calls.length - ok.length },
    { key: "input_tokens", label: "Avg input tokens", format: "int", value: avg("input_tokens") },
    { key: "cached_tokens", label: "Avg cached input", format: "int", value: avg("cached_tokens") },
    {
      key: "output_tokens",
      label: "Avg output tokens",
      format: "int",
      value: avg("output_tokens"),
    },
    {
      key: "reasoning_tokens",
      label: "Avg reasoning tokens",
      format: "int",
      value: avg("reasoning_tokens"),
    },
    { key: "latency_avg", label: "Latency avg", format: "ms", value: mean(latency) },
    { key: "latency_p50", label: "Latency p50", format: "ms", value: percentile(latency, 0.5) },
    { key: "latency_p95", label: "Latency p95", format: "ms", value: percentile(latency, 0.95) },
    {
      key: "cost_per_1k",
      label: "Cost per 1,000 messages",
      format: "usd",
      value: costPerMessage === null ? null : costPerMessage * 1000,
    },
  ];
}
