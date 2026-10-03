// Reviews in: every piece of feedback is analysed once, when it arrives, and stored with what the
// visitor loved, wished and suggested. The insights report (insights.ts) only counts and quotes.
import type { Ctx } from "./context";
import type { ReviewInput } from "./types";

/** What the follow-up to a review needs to know. */
export interface IngestedReview {
  id: string;
  sentiment: "positive" | "neutral" | "negative";
  language: string;
}

/** Analyses one review and stores it. Never throws on AI failure: the review is kept untranslated. */
export async function ingestFeedback(
  ctx: Ctx,
  bookingId: number | null,
  text: string,
  lang: string,
  source: "guest" | "sample" = "guest",
): Promise<IngestedReview> {
  const a = await ctx.ai
    .analyzeFeedback(text)
    .catch(() => ({ translation_en: text, themes: [] as string[], sentiment: "neutral" as const }));
  const { id } = await ctx.repo.saveFeedback({
    booking_id: bookingId,
    text_original: text,
    lang,
    text_translated: a.translation_en,
    themes: a.themes,
    sentiment: a.sentiment,
    source,
  });
  return { id, sentiment: a.sentiment, language: lang };
}

/** Imports reviews that didn't arrive by email (a sample set, another platform). */
export async function importReviews(
  _ctx: Ctx,
  _reviews: ReviewInput[],
  _source: "guest" | "sample",
): Promise<{ imported: number; analysed: number }> {
  throw new Error("importReviews is not implemented yet");
}
