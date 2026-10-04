// Review analysis tasks: one review in, structured points and ideas out; ideas grouped across
// reviews; the computed summary phrased as SMS. Counting and quote checks happen in code
// (feedback.ts, insights.ts), not here.
import {
  ASPECTS,
  type CallTool,
  type IdeaGroups,
  type InsightsSms,
  type ReviewAnalysis,
} from "./types";

const ASPECT_HINTS =
  "host: host or guide; coffee_process: picking to roasting; tasting: the coffee itself; food: meals, other drinks; landscape: views, walk, nature; farm_life: daily life, other crops, culture; value: price; timing: length, start, pace; access: directions, road, transport; communication: booking, replies, language; group: size, children, crowding; facilities: toilets, shade, seating; other: anything else";

const QUOTE = {
  quote: { type: "string", description: "verbatim excerpt of the review, max 15 words" },
  quote_en: { type: "string", description: "English rendering of the quote" },
};

export async function analyzeReview(call: CallTool, text: string): Promise<ReviewAnalysis> {
  const r = await call<ReviewAnalysis>(
    `You read one visitor review of a small coffee-farm tour. Report only what the review says.
points: each thing the visitor loved, or complained about or wished had been different.
ideas: only suggestions for something new the farm could offer (an activity, product, meal or longer stay), as a short English label. A fix for something that went wrong (signs, shade, seats, toilets, faster replies) is a "wished" point, never an idea.
Each quote is one short excerpt (max 15 words) copied exactly from the review in its original language, without "..."; quote_en is its English.
translation_en: "" if the review is in English. Empty arrays are fine.`,
    text,
    "analyze_review",
    {
      type: "object",
      properties: {
        language: { type: "string", description: "ISO 639-1 code of the review" },
        sentiment: { type: "string", enum: ["positive", "neutral", "negative"] },
        translation_en: { type: "string" },
        points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              aspect: { type: "string", enum: [...ASPECTS], description: ASPECT_HINTS },
              polarity: { type: "string", enum: ["loved", "wished"] },
              ...QUOTE,
            },
            required: ["aspect", "polarity", "quote", "quote_en"],
          },
        },
        ideas: {
          type: "array",
          items: {
            type: "object",
            properties: { idea: { type: "string" }, ...QUOTE },
            required: ["idea", "quote", "quote_en"],
          },
        },
      },
      required: ["language", "sentiment", "translation_en", "points", "ideas"],
    },
  );
  // English reviews aren't copied back by the model: output tokens are the expensive ones.
  return { ...r, translation_en: r.translation_en || text };
}

export async function groupIdeas(
  call: CallTool,
  ideas: { id: string; idea: string }[],
): Promise<IdeaGroups> {
  // The model sees numbers instead of the caller's ids: fewer tokens, nothing long to copy back.
  const r = await call<{ groups: { label_en: string; label_sw: string; ideas: number[] }[] }>(
    'Group visitor suggestions for a coffee-farm tour by meaning: suggestions that one change to the farm would satisfy go in one group, however they are worded. For each group: label_en, that change as a short action (e.g. "Add a covered rest area"); label_sw, the same in short, simple, correct Swahili; ideas, the numbers of its suggestions. Every number goes in exactly one group.',
    ideas.map((x, i) => `${i + 1}. ${x.idea}`).join("\n"),
    "group_ideas",
    {
      type: "object",
      properties: {
        groups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label_en: { type: "string" },
              label_sw: { type: "string" },
              ideas: { type: "array", items: { type: "integer" } },
            },
            required: ["label_en", "label_sw", "ideas"],
          },
        },
      },
      required: ["groups"],
    },
  );
  return {
    groups: r.groups.map((g) => ({
      label_en: g.label_en,
      label_sw: g.label_sw,
      ids: g.ideas.flatMap((n) => ideas[n - 1]?.id ?? []),
    })),
  };
}

export async function writeInsightsSms(call: CallTool, summary: string): Promise<InsightsSms> {
  return call<InsightsSms>(
    `You write SMS for Noor, a coffee farmer who reads simple Swahili on a basic phone. From this summary of her visitors' reviews, write 2-3 lines_sw, each under 140 characters, in plain everyday Swahili, every line containing its count phrase copied exactly as the summary gives it (e.g. "wageni 5 kati ya 9", "mgeni 1 kati ya 9"): first what visitors love (keep doing it), then what to improve, then one idea visitors suggested, to try. Skip a line the summary has nothing for.
Use only the summary and no other numbers. lines_en: the same lines in English.`,
    summary,
    "write_insights_sms",
    {
      type: "object",
      properties: {
        lines_sw: { type: "array", items: { type: "string" } },
        lines_en: { type: "array", items: { type: "string" } },
      },
      required: ["lines_sw", "lines_en"],
    },
  );
}
