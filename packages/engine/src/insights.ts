// Monthly insights: what visitors keep returning to, what they wished had been different, and what
// to build next. Code counts reviews and checks every quote; the AI only groups visitors' ideas by
// meaning and words Noor's SMS from the counts.
import type { Aspect, ReviewPoint } from "./ai/types";
import type { Ctx } from "./context";
import { quoteInText } from "./feedback";
import { sms160 } from "./format";
import type { FeedbackRow } from "./repo";
import type { InsightItem, InsightQuote, InsightReport } from "./types";

const NO_REVIEWS = "Bado hakuna maoni ya wageni mwezi huu.";
/** Newest reviews read per report. */
const REVIEW_LIMIT = 200;
const ITEMS_PER_LIST = 5;
const QUOTES_PER_ITEM = 3;
const SMS_LINES = 3;

// How each aspect is named in the report and the SMS. The Swahili needs a native speaker's check.
const ASPECT_LABELS: Record<Aspect, { label_en: string; label_sw: string }> = {
  host: { label_en: "The host and guide", label_sw: "Ukarimu na maelezo ya mwenyeji" },
  coffee_process: { label_en: "How coffee is made", label_sw: "Jinsi kahawa inavyotengenezwa" },
  tasting: { label_en: "Tasting the coffee", label_sw: "Kuonja kahawa" },
  food: { label_en: "Food and drinks", label_sw: "Chakula na vinywaji" },
  landscape: { label_en: "Views and the walk", label_sw: "Mandhari na matembezi" },
  farm_life: { label_en: "Farm life and culture", label_sw: "Maisha ya shambani" },
  value: { label_en: "Price and value", label_sw: "Bei" },
  timing: { label_en: "Length and pace", label_sw: "Muda wa ziara" },
  access: { label_en: "Finding the farm", label_sw: "Njia ya kufika shambani" },
  communication: { label_en: "Booking and replies", label_sw: "Mawasiliano" },
  group: { label_en: "Group size", label_sw: "Ukubwa wa kikundi" },
  facilities: { label_en: "Toilets, shade and seats", label_sw: "Choo, kivuli na viti" },
  other: { label_en: "Other", label_sw: "Mengineyo" },
};

/** One review mentioning an item, with the quote that shows it. */
interface Mention {
  key: string;
  label_en: string;
  label_sw: string;
  quote: InsightQuote;
}
interface CheckedPoint {
  aspect: Aspect;
  polarity: ReviewPoint["polarity"];
  quote: InsightQuote;
}
interface CheckedIdea {
  id: string;
  idea: string;
  quote: InsightQuote;
}
type Counts = Omit<InsightReport, "sms_sw" | "sms_en">;

export async function monthlyInsights(ctx: Ctx): Promise<InsightReport> {
  const reviews = await ctx.repo.feedbackForInsights(REVIEW_LIMIT);
  const generated_at = ctx.now().toISOString();
  if (!reviews.length) {
    await ctx.smsNoor(NO_REVIEWS);
    return {
      review_count: 0,
      sentiment: { positive: 0, neutral: 0, negative: 0 },
      keep: [],
      improve: [],
      next: [],
      sms_sw: [NO_REVIEWS],
      sms_en: ["No visitor reviews yet this month."],
      dropped_quotes: 0,
      generated_at,
    };
  }

  const n = reviews.length;
  const { points, ideas, dropped } = checkQuotes(reviews);
  const counts: Counts = {
    review_count: n,
    sentiment: sentimentCounts(reviews),
    keep: aspectItems(points, "loved", n),
    improve: aspectItems(points, "wished", n),
    next: await ideaItems(ctx, ideas, n),
    dropped_quotes: dropped,
    generated_at,
  };
  const sms = await smsFor(ctx, counts);
  for (const line of sms.sw) await ctx.smsNoor(line);
  const report: InsightReport = { ...counts, sms_sw: sms.sw, sms_en: sms.en };
  await ctx.repo.saveInsightReport(report);
  return report;
}

/** Every point and idea whose quote is still found in its review, and how many weren't. */
function checkQuotes(reviews: FeedbackRow[]) {
  const points: CheckedPoint[] = [];
  const ideas: CheckedIdea[] = [];
  let dropped = 0;
  for (const r of reviews) {
    const quoteOf = (x: { quote: string; quote_en: string }): InsightQuote | null => {
      if (quoteInText(x.quote, r.text_original)) {
        return { feedback_id: r.id, lang: r.lang ?? "und", quote: x.quote, quote_en: x.quote_en };
      }
      dropped++;
      return null;
    };
    for (const p of r.points) {
      const quote = quoteOf(p);
      if (quote) points.push({ aspect: p.aspect, polarity: p.polarity, quote });
    }
    r.ideas.forEach((idea, i) => {
      const quote = quoteOf(idea);
      if (quote) ideas.push({ id: `${r.id}:${i}`, idea: idea.idea, quote });
    });
  }
  return { points, ideas, dropped };
}

function sentimentCounts(reviews: FeedbackRow[]): InsightReport["sentiment"] {
  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const { sentiment: s } of reviews) {
    if (s === "positive" || s === "negative") counts[s]++;
    else counts.neutral++;
  }
  return counts;
}

function aspectItems(points: CheckedPoint[], polarity: CheckedPoint["polarity"], n: number) {
  const mentions = points
    .filter((p) => p.polarity === polarity)
    .map((p) => ({ key: p.aspect, ...ASPECT_LABELS[p.aspect], quote: p.quote }));
  return items(mentions, n);
}

/** Visitors' ideas, grouped by meaning by the AI and counted in code. */
async function ideaItems(ctx: Ctx, ideas: CheckedIdea[], n: number): Promise<InsightItem[]> {
  if (!ideas.length) return [];
  const groups = await ctx.ai
    .groupIdeas(ideas.map(({ id, idea }) => ({ id, idea })))
    .then((r) => r.groups)
    .catch(() => []);
  const unplaced = new Map(ideas.map((x) => [x.id, x]));
  const mentions: Mention[] = [];
  for (const g of groups) {
    for (const id of g.ids) {
      const idea = unplaced.get(id); // unknown ids, and ids already in a group, are skipped
      if (!idea) continue;
      unplaced.delete(id);
      mentions.push({
        key: g.label_en,
        label_en: g.label_en,
        label_sw: g.label_sw,
        quote: idea.quote,
      });
    }
  }
  // Ideas the AI left out (all of them if it failed) are grouped by their exact English label.
  for (const x of unplaced.values()) {
    mentions.push({ key: x.idea, label_en: x.idea, label_sw: x.idea, quote: x.quote });
  }
  return items(mentions, n);
}

/** One item per key, counted by distinct reviews, most mentioned first. */
function items(mentions: Mention[], n: number): InsightItem[] {
  const byKey = new Map<string, Mention & { quotes: Map<string, InsightQuote> }>();
  for (const m of mentions) {
    const item = byKey.get(m.key) ?? { ...m, quotes: new Map<string, InsightQuote>() };
    if (!item.quotes.has(m.quote.feedback_id)) item.quotes.set(m.quote.feedback_id, m.quote);
    byKey.set(m.key, item);
  }
  return [...byKey.values()]
    .map(({ key, label_en, label_sw, quotes }) => ({
      key,
      label_en,
      label_sw,
      count: quotes.size,
      share: quotes.size / n,
      quotes: pickQuotes([...quotes.values()]),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, ITEMS_PER_LIST);
}

/** A few quotes, one per language before any language repeats. */
function pickQuotes(quotes: InsightQuote[]): InsightQuote[] {
  const firstPerLang = quotes.filter((q, i) => quotes.findIndex((o) => o.lang === q.lang) === i);
  const rest = quotes.filter((q) => !firstPerLang.includes(q));
  return [...firstPerLang, ...rest].slice(0, QUOTES_PER_ITEM);
}

/** Labels and counts only, so the SMS call costs the same however many reviews there are. */
function summaryOf(c: Counts): string {
  const list = (items: InsightItem[]) =>
    items
      .slice(0, 3)
      .map((i) => `${i.label_sw} (${i.label_en}): ${i.count}`)
      .join("; ") || "none";
  return [
    `Reviews: ${c.review_count}`,
    `Visitors who loved: ${list(c.keep)}`,
    `Visitors who wished it different: ${list(c.improve)}`,
    `Visitors who suggested: ${list(c.next)}`,
  ].join("\n");
}

/** Noor's SMS: the AI's wording if it keeps to the summary's numbers, otherwise a fixed template. */
async function smsFor(ctx: Ctx, c: Counts): Promise<{ sw: string[]; en: string[] }> {
  if (!c.keep.length && !c.improve.length && !c.next.length) return template(c);
  const summary = summaryOf(c);
  const sms = await ctx.ai.writeInsightsSms(summary).catch(() => null);
  const lines = (sms?.lines_sw ?? [])
    .map((sw, i) => ({ sw: sw.trim(), en: sms?.lines_en[i]?.trim() ?? "" }))
    .filter((l) => l.sw)
    .slice(0, SMS_LINES);
  const given = new Set(summary.match(/\d+/g));
  const madeUp = lines.some((l) => `${l.sw} ${l.en}`.match(/\d+/g)?.some((d) => !given.has(d)));
  if (!lines.length || madeUp) return template(c);
  return { sw: lines.map((l) => sms160(l.sw)), en: lines.map((l) => l.en) };
}

/** The SMS without AI: fixed Swahili around the top label and count of each list. */
function template(c: Counts): { sw: string[]; en: string[] } {
  const n = c.review_count;
  const [keep] = c.keep;
  const [improve] = c.improve;
  const [idea] = c.next;
  const lines: { sw: string; en: string }[] = [];
  if (keep) {
    lines.push({
      sw: `Endelea: ${keep.label_sw}. ${visitorsSw(keep.count, n)} ${verbSw(keep.count, "lipenda")}.`,
      en: `Keep: ${keep.label_en}. ${keep.count} of ${n} visitors loved it.`,
    });
  }
  if (improve) {
    lines.push({
      sw: `Boresha: ${improve.label_sw}. ${visitorsSw(improve.count, n)} ${verbSw(improve.count, "litaja")}.`,
      en: `Improve: ${improve.label_en}. ${improve.count} of ${n} visitors mentioned it.`,
    });
  }
  if (idea) {
    lines.push({
      sw: `Jaribu: ${idea.label_sw}. ${visitorsSw(idea.count)} ${verbSw(idea.count, "lipendekeza")}.`,
      en: `Try: ${idea.label_en}. Suggested by ${idea.count} visitor${idea.count === 1 ? "" : "s"}.`,
    });
  }
  if (!lines.length) {
    const s = c.sentiment;
    lines.push({
      sw: `Maoni ya wageni: ${n}. Wamefurahi: ${s.positive}. Hawakufurahi: ${s.negative}.`,
      en: `Visitor reviews: ${n}. Happy: ${s.positive}. Unhappy: ${s.negative}.`,
    });
  }
  return { sw: lines.map((l) => sms160(l.sw)), en: lines.map((l) => l.en) };
}

/** "Wageni 5 kati ya 9", or "Mgeni 1" for one visitor. */
const visitorsSw = (count: number, of?: number) =>
  `${count === 1 ? "Mgeni" : "Wageni"} ${count}${of ? ` kati ya ${of}` : ""}`;
/** A past-tense verb agreeing with the number of visitors: "walipenda", "alipenda". */
const verbSw = (count: number, stem: string) => `${count === 1 ? "a" : "wa"}${stem}`;
