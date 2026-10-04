// How the Metrics tab writes numbers, and plain names for tasks and sources.

export const NONE = "—";

const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const fractionOfACent = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumSignificantDigits: 2,
  maximumSignificantDigits: 2,
});

/** 1,284 */
export const fmtInt = (n: number | null) => (n === null ? NONE : whole.format(n));

/** 1.5: an average count. */
export const fmtAvg = (n: number | null) => (n === null ? NONE : n.toFixed(1));

/** $0.0012, $0.50, $12.40. `atLeast` marks a lower bound (some calls have no price). */
export function fmtUsd(n: number | null, atLeast = false): string {
  if (n === null) return NONE;
  const text = n === 0 ? "$0" : Math.abs(n) >= 1 ? cents.format(n) : fractionOfACent.format(n);
  return atLeast ? `≥\u00A0${text}` : text;
}

/** 850 ms, 1.4 s */
export function fmtLatency(ms: number | null): string {
  if (ms === null) return NONE;
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** 3.2 s, 45 s, 4.5 min, 2.3 h, 1.5 d */
export function fmtDuration(ms: number | null): string {
  if (ms === null) return NONE;
  const short = (v: number, unit: string) => `${v < 10 ? v.toFixed(1) : Math.round(v)} ${unit}`;
  const s = ms / 1000;
  if (s < 60) return short(s, "s");
  if (s < 3600) return short(s / 60, "min");
  if (s < 48 * 3600) return short(s / 3600, "h");
  return short(s / 86400, "d");
}

/** 8%, <1%, 100% */
export function fmtPct(x: number | null): string {
  if (x === null) return NONE;
  if (x > 0 && x < 0.01) return "<1%";
  if (x > 0.99 && x < 1) return ">99%";
  return `${Math.round(x * 100)}%`;
}

/** "1 booking", "3 bookings" */
export const count = (n: number, one: string, many = `${one}s`) =>
  `${fmtInt(n)} ${n === 1 ? one : many}`;

const TASKS: Record<string, string> = {
  classify_guest: "Read a guest's email",
  classify_host: "Read Noor's free text",
  translate: "Translate",
  analyze_feedback: "Analyse feedback",
  summarize_feedback: "Summarise feedback",
  analyze_review: "Analyse a review",
  group_ideas: "Group review ideas",
  write_insights_sms: "Write the insights SMS",
};
export const taskName = (task: string) => TASKS[task] ?? task;

const SOURCES: Record<string, string> = {
  inbound: "Inbound messages",
  timers: "Timers",
  insights: "Review insights",
  import: "Review import",
};
export const sourceName = (source: string) => SOURCES[source] ?? source;
