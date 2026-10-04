// Reviews in: every piece of feedback is analysed once, when it arrives, and stored with what the
// visitor loved, wished and suggested. The insights report (insights.ts) only counts and quotes.
import type { ReviewAnalysis } from "./ai/types";
import type { Ctx } from "./context";
import type { ReviewInput } from "./types";

/** What the follow-up to a review needs to know. */
export interface IngestedReview {
  id: string;
  sentiment: "positive" | "neutral" | "negative";
  language: string;
}

/** Reviews analysed at the same time during an import. */
const IMPORT_CONCURRENCY = 4;

/** Lowercase, one space between words, the same quote marks, no punctuation at either end. */
function normalise(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‛`´]/g, "'")
    .replace(/[“”„‟«»]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, "");
}

/** True when `quote` appears in `text`: the AI may only quote what the visitor wrote. */
export function quoteInText(quote: string, text: string): boolean {
  const q = normalise(quote);
  return q.length > 0 && normalise(text).includes(q);
}

/** Analyses one review and stores it. Never throws on AI failure: the review is kept untranslated. */
export async function ingestFeedback(
  ctx: Ctx,
  bookingId: number | null,
  text: string,
  lang: string,
  source: "guest" | "sample" = "guest",
): Promise<IngestedReview> {
  const analysis = await ctx.ai.analyzeReview(text).catch(() => null);
  return save(ctx, { bookingId, text, lang, source }, analysis);
}

/** Imports reviews that didn't arrive by email (a sample set, another platform). */
export async function importReviews(
  ctx: Ctx,
  reviews: ReviewInput[],
  source: "guest" | "sample",
): Promise<{ imported: number; skipped: number; analysed: number }> {
  // Importing the same set twice must not double every count in the insights.
  const stored = new Set(
    (await ctx.repo.feedbackForInsights(1000))
      .filter((f) => f.source === source)
      .map((f) => f.text_original),
  );
  const fresh = reviews.filter((r) => !stored.has(r.text));
  let analysed = 0;
  await inParallel(fresh, IMPORT_CONCURRENCY, async (r) => {
    let analysis = r.analysis ?? null;
    if (!analysis) {
      analysed++;
      analysis = await ctx.ai.analyzeReview(r.text).catch(() => null);
    }
    const lang = r.lang ?? analysis?.language ?? "und";
    await save(ctx, { bookingId: null, text: r.text, lang, source }, analysis);
  });
  return { imported: fresh.length, skipped: reviews.length - fresh.length, analysed };
}

/** Stores a review with the points and ideas whose quotes check out; without analysis, as neutral. */
async function save(
  ctx: Ctx,
  review: { bookingId: number | null; text: string; lang: string; source: "guest" | "sample" },
  analysis: ReviewAnalysis | null,
): Promise<IngestedReview> {
  const points = analysis?.points.filter((p) => quoteInText(p.quote, review.text)) ?? [];
  const ideas = analysis?.ideas.filter((i) => quoteInText(i.quote, review.text)) ?? [];
  const sentiment = analysis?.sentiment ?? "neutral";
  const { id } = await ctx.repo.saveFeedback({
    booking_id: review.bookingId,
    text_original: review.text,
    lang: review.lang,
    text_translated: analysis?.translation_en ?? review.text,
    themes: [...new Set(points.map((p) => p.aspect))],
    sentiment,
    points,
    ideas,
    source: review.source,
    quotes_dropped: analysis
      ? analysis.points.length - points.length + analysis.ideas.length - ideas.length
      : 0,
  });
  return { id, sentiment, language: review.lang };
}

/** Runs `fn` on every item, at most `limit` at a time. */
async function inParallel<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = items.values(); // shared by the workers, so each item is taken once
  const worker = async () => {
    for (const item of queue) await fn(item);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
