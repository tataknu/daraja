// Monthly insights: recent feedback in any language, summarised for Noor in a few Swahili SMS.
import type { Ctx } from "./context";

export async function monthlyInsights(ctx: Ctx): Promise<string[]> {
  const feedback = await ctx.repo.recentFeedback(200);
  if (!feedback.length) {
    await ctx.smsNoor("Bado hakuna maoni ya wageni mwezi huu.");
    return [];
  }
  const items = feedback
    .map((f, i) => `${i + 1}. [${f.sentiment}] ${f.text_translated} (themes: ${f.themes.join(", ")})`)
    .join("\n");
  const r = await ctx.ai.summarizeFeedback(items);
  for (const line of r.lines.slice(0, 3)) await ctx.smsNoor(line);
  return r.lines;
}
