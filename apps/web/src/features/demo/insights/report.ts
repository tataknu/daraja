// Pure helpers for the Insights tab: reading a stored report defensively, and small formatters.
// No React and no network here, so everything is unit-tested.
import type { InsightItem, InsightQuote, InsightReport } from "@daraja/engine";

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const count = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
/** Keeps positions, so a Swahili line and its English gloss stay paired. */
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(text) : []);

function parseQuote(v: unknown): InsightQuote | null {
  if (!isRec(v)) return null;
  const quote = text(v["quote"]);
  if (!quote) return null;
  return {
    feedback_id: text(v["feedback_id"]),
    lang: text(v["lang"]),
    quote,
    quote_en: text(v["quote_en"]),
  };
}

function parseItems(v: unknown, reviewCount: number): InsightItem[] {
  if (!Array.isArray(v)) return [];
  const items: InsightItem[] = [];
  for (const raw of v) {
    if (!isRec(raw)) continue;
    const key = text(raw["key"]);
    const label_en = text(raw["label_en"]) || key;
    if (!label_en) continue;
    const n = count(raw["count"]);
    const quotes = Array.isArray(raw["quotes"])
      ? raw["quotes"].flatMap((q) => parseQuote(q) ?? [])
      : [];
    items.push({
      key,
      label_en,
      label_sw: text(raw["label_sw"]),
      count: n,
      share: reviewCount > 0 ? n / reviewCount : 0,
      quotes,
    });
  }
  // Most mentioned first. The sort is stable, so the engine's order decides ties.
  return items.sort((a, b) => b.count - a.count);
}

/**
 * Reads the `report` column (JSON) as an InsightReport. Anything missing becomes empty rather than
 * an exception, so a half-written or older report never blanks the tab. Returns null if the value
 * isn't an object at all.
 */
export function parseReport(raw: unknown, fallbackReviewCount = 0): InsightReport | null {
  if (!isRec(raw)) return null;
  const reviewCount = count(raw["review_count"]) || fallbackReviewCount;
  const sentiment = isRec(raw["sentiment"]) ? raw["sentiment"] : {};
  return {
    review_count: reviewCount,
    sentiment: {
      positive: count(sentiment["positive"]),
      neutral: count(sentiment["neutral"]),
      negative: count(sentiment["negative"]),
    },
    keep: parseItems(raw["keep"], reviewCount),
    improve: parseItems(raw["improve"], reviewCount),
    next: parseItems(raw["next"], reviewCount),
    sms_sw: strings(raw["sms_sw"]),
    sms_en: strings(raw["sms_en"]),
    dropped_quotes: count(raw["dropped_quotes"]),
    generated_at: text(raw["generated_at"]),
  };
}

/** What is in the feedback table: how many reviews, from where, in how many languages. */
export interface Corpus {
  total: number;
  guest: number;
  sample: number;
  languages: number;
}

export function summariseFeedback(rows: { lang: string | null; source: string }[]): Corpus {
  const languages = new Set<string>();
  let sample = 0;
  for (const r of rows) {
    if (r.source === "sample") sample += 1;
    // "pt-BR" and "pt" are one language.
    const code = r.lang?.trim().toLowerCase().split(/[-_]/)[0];
    if (code) languages.add(code);
  }
  return { total: rows.length, guest: rows.length - sample, sample, languages: languages.size };
}

/** How many rows were created after `iso`. Zero if `iso` isn't a time. */
export function countSince(rows: { created_at: string }[], iso: string): number {
  const since = Date.parse(iso);
  if (Number.isNaN(since)) return 0;
  return rows.filter((r) => Date.parse(r.created_at) > since).length;
}

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;

/** "11 reviews", with where they came from when that is worth saying. */
export function reviewsLabel(c: Corpus): string {
  if (c.total === 0) return "No reviews yet";
  if (c.guest === 0) return plural(c.total, "sample review");
  if (c.sample === 0) return plural(c.total, "review");
  return `${plural(c.total, "review")} (${c.sample} sample, ${c.guest} from guests)`;
}

/** Reads after "updated": "just now", "2 min ago", "yesterday", "on 12 Oct". Empty if unparseable. */
export function formatRelative(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const seconds = Math.max(0, Math.round((now - t) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return `on ${new Date(t).toLocaleDateString("en", { day: "numeric", month: "short", year: "numeric" })}`;
}

let displayNames: Intl.DisplayNames | null | undefined;

/** "de" becomes "German". Falls back to the upper-cased code for anything the browser can't name. */
export function languageName(code: string): string {
  const c = code.trim();
  if (!c) return "Unknown";
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(["en"], { type: "language" });
    } catch {
      displayNames = null;
    }
  }
  try {
    return displayNames?.of(c) ?? c.toUpperCase();
  } catch {
    return c.toUpperCase();
  }
}

export const baseLanguage = (code: string): string =>
  code.trim().toLowerCase().split(/[-_]/)[0] ?? "";

/** Quotes in English, or already identical to their translation, need no second line. */
export function needsTranslation(q: InsightQuote): boolean {
  if (!q.quote_en) return false;
  if (baseLanguage(q.lang) === "en") return false;
  return q.quote_en.trim().toLowerCase() !== q.quote.trim().toLowerCase();
}

/** The most quotes shown under one item. */
export const MAX_QUOTES = 3;

/** How many quotes the report shows in all. */
export const quoteCount = (r: InsightReport): number =>
  [r.keep, r.improve, r.next].reduce(
    (sum, items) => sum + items.reduce((s, i) => s + Math.min(i.quotes.length, MAX_QUOTES), 0),
    0,
  );
