// The insights report: counts and quotes come from code, the AI only groups ideas and words the
// SMS, and Noor still gets a correct SMS when the AI fails.
import { describe, expect, it } from "vitest";
import type { Ai, Aspect, ReviewAnalysis } from "./ai/types";
import { createEngine } from "./engine";
import { fakeAi, reviewSays } from "./testing/fake-ai";
import { memoryRepo } from "./testing/memory-repo";
import type { ReviewInput } from "./types";

type Point = [Aspect, "loved" | "wished", string];

/** A review with its analysis already done, so importing it costs no AI call. */
function review(
  lang: string,
  sentiment: ReviewAnalysis["sentiment"],
  text: string,
  points: Point[],
  ideas: [string, string][] = [],
): ReviewInput {
  return {
    text,
    lang,
    analysis: reviewSays({
      language: lang,
      translation_en: `[en] ${text}`,
      sentiment,
      points: points.map(([aspect, polarity, quote]) => ({
        aspect,
        polarity,
        quote,
        quote_en: `[en] ${quote}`,
      })),
      ideas: ideas.map(([idea, quote]) => ({ idea, quote, quote_en: `[en] ${quote}` })),
    }),
  };
}

// Oldest first. Five reviews: tasting loved in four of them (twice in the Spanish one).
const REVIEWS = [
  review(
    "de",
    "positive",
    "Die Verkostung war wunderbar, und die Aussicht über das Tal auch. Leider war der Weg schwer zu finden. Ihr könntet Bohnen zum Mitnehmen verkaufen.",
    [
      ["tasting", "loved", "Die Verkostung war wunderbar"],
      ["landscape", "loved", "die Aussicht über das Tal"],
      ["access", "wished", "der Weg schwer zu finden"],
    ],
    [["sell beans to take home", "Bohnen zum Mitnehmen verkaufen"]],
  ),
  review(
    "ja",
    "positive",
    "コーヒーの試飲が最高でした。道が分かりにくかったです。豆を買えたら嬉しいです。",
    [
      ["tasting", "loved", "コーヒーの試飲が最高でした"],
      ["access", "wished", "道が分かりにくかったです"],
    ],
    [["sell beans to take home", "豆を買えたら嬉しいです"]],
  ),
  review(
    "es",
    "positive",
    "¡Nos encantó la cata de café! La cata fue lo mejor. Sería genial poder tostar nuestro propio café.",
    [
      ["tasting", "loved", "Nos encantó la cata de café"],
      ["tasting", "loved", "La cata fue lo mejor"],
    ],
    [["roast your own coffee", "poder tostar nuestro propio café"]],
  ),
  review("en", "negative", "Lovely views, but the tour was too long and there was no shade.", [
    ["landscape", "loved", "Lovely views"],
    ["timing", "wished", "the tour was too long"],
    ["facilities", "wished", "there was no shade"],
  ]),
  review("es", "positive", "La cata de café estuvo increíble.", [
    ["tasting", "loved", "La cata de café estuvo increíble"],
  ]),
];

/** The fixed SMS for REVIEWS and its English: what Noor gets when the AI's wording can't be used. */
const FIXED_SW = [
  "Endelea: Kuonja kahawa. Wageni 4 kati ya 5 walipenda.",
  "Boresha: Njia ya kufika shambani. Wageni 2 kati ya 5 walitaja.",
  "Jaribu: [sw] sell beans to take home. Wageni 2 walipendekeza.",
];
const FIXED_EN = [
  "Keep: Tasting the coffee. 4 of 5 visitors loved it.",
  "Improve: Finding the farm. 2 of 5 visitors mentioned it.",
  "Try: sell beans to take home. Suggested by 2 visitors.",
];

/** The AI with some tasks replaced, also in the metered copies the engine makes. */
function replacing(ai: Ai, tasks: Partial<Pick<Ai, "groupIdeas" | "writeInsightsSms">>): Ai {
  return { ...ai, ...tasks, withUsage: (l) => replacing(ai.withUsage(l), tasks) };
}

async function setup(
  reviews: ReviewInput[] = REVIEWS,
  tasks: Partial<Pick<Ai, "groupIdeas" | "writeInsightsSms">> = {},
) {
  const now = () => new Date("2026-10-31T18:00:00Z");
  const { repo, data, noor } = memoryRepo(now);
  const script = fakeAi();
  const engine = createEngine({ repo, ai: replacing(script.ai, tasks), now });
  for (const r of reviews) await engine.importReviews([r]);
  const toNoor = () =>
    data.messages.filter((m) => m.contact_id === noor.id).map((m) => m.text_original);
  return { engine, repo, data, script, toNoor };
}

describe("monthly insights", () => {
  it("answers the three questions, counting each review once", async () => {
    const t = await setup();

    const report = await t.engine.monthlyInsights();

    expect(report.review_count).toBe(5);
    expect(report.sentiment).toEqual({ positive: 4, neutral: 0, negative: 1 });
    const summary = (items: typeof report.keep) => items.map((i) => [i.key, i.count]);
    expect(summary(report.keep)).toEqual([
      ["tasting", 4],
      ["landscape", 2],
    ]);
    expect(summary(report.improve)).toEqual([
      ["access", 2],
      ["timing", 1],
      ["facilities", 1],
    ]);
    expect(summary(report.next)).toEqual([
      ["sell beans to take home", 2],
      ["roast your own coffee", 1],
    ]);
    const [tasting] = report.keep;
    expect(tasting).toMatchObject({ label_en: "Tasting the coffee", label_sw: "Kuonja kahawa" });
    expect(tasting?.share).toBe(0.8);
    // Newest first, one per language before a language repeats: the older Spanish quote waits.
    expect(tasting?.quotes.map((q) => [q.lang, q.quote])).toEqual([
      ["es", "La cata de café estuvo increíble"],
      ["ja", "コーヒーの試飲が最高でした"],
      ["de", "Die Verkostung war wunderbar"],
    ]);
    expect(report.dropped_quotes).toBe(0);
  });

  it("sends Noor the SMS, saves the report and logs the AI calls it made", async () => {
    const t = await setup();

    const report = await t.engine.monthlyInsights();

    expect(report.sms_sw).toEqual(["Wageni wanapenda kuchoma kahawa."]);
    expect(report.sms_en).toEqual(["Visitors love roasting coffee."]);
    expect(t.toNoor()).toEqual(report.sms_sw);
    expect(t.data.insightReports).toHaveLength(1);
    expect(t.data.insightReports[0]).toMatchObject(report);
    const tasks = t.data.aiCalls.filter((c) => c.source === "insights").map((c) => c.task);
    expect(tasks).toEqual(expect.arrayContaining(["group_ideas", "write_insights_sms"]));
  });

  it("groups ideas by meaning, placing each idea once", async () => {
    const seen: { id: string; idea: string }[][] = [];
    const t = await setup(REVIEWS, {
      groupIdeas: async (ideas) => {
        seen.push(ideas);
        const beans = ideas.filter((i) => i.idea.includes("beans")).map((i) => i.id);
        return {
          groups: [
            { label_en: "Sell coffee beans", label_sw: "Kuuza kahawa", ids: [...beans, "x:9"] },
            { label_en: "Beans again", label_sw: "Tena", ids: beans },
          ],
        };
      },
    });

    const report = await t.engine.monthlyInsights();

    const ideaIds = t.data.feedback.filter((f) => f.ideas?.length).map((f) => `${f.id}:0`);
    expect(seen[0]?.map((i) => i.id).sort()).toEqual(ideaIds.sort());
    expect(report.next.map((i) => [i.label_sw, i.count])).toEqual([
      ["Kuuza kahawa", 2],
      ["roast your own coffee", 1],
    ]);
    expect(report.next[0]?.quotes.map((q) => q.lang)).toEqual(["ja", "de"]);
  });

  it("drops stored quotes that aren't in the review, and counts them", async () => {
    const t = await setup([]);
    await t.repo.saveFeedback({
      booking_id: null,
      text_original: "Wonderful tasting.",
      lang: "en",
      text_translated: "Wonderful tasting.",
      themes: ["tasting", "food"],
      sentiment: "positive",
      points: [
        { aspect: "tasting", polarity: "loved", quote: "Wonderful tasting", quote_en: "" },
        { aspect: "food", polarity: "loved", quote: "The lunch was great", quote_en: "" },
      ],
      ideas: [{ idea: "a coffee shop", quote: "open a coffee shop", quote_en: "" }],
    });

    const report = await t.engine.monthlyInsights();

    expect(report.dropped_quotes).toBe(2);
    expect(report.keep.map((i) => i.key)).toEqual(["tasting"]);
    expect(report.next).toEqual([]);
  });

  it("adds the quotes dropped when each review arrived", async () => {
    const t = await setup([]);
    await t.repo.saveFeedback({
      booking_id: null,
      text_original: "Wonderful tasting.",
      lang: "en",
      text_translated: "Wonderful tasting.",
      themes: ["tasting"],
      sentiment: "positive",
      points: [{ aspect: "tasting", polarity: "loved", quote: "Wonderful tasting", quote_en: "" }],
      quotes_dropped: 3,
    });

    expect((await t.engine.monthlyInsights()).dropped_quotes).toBe(3);
  });

  it("keeps the SMS to three lines", async () => {
    const t = await setup();
    t.script.sms({
      lines_sw: ["Wageni 4 kati ya 5 wanapenda kuonja kahawa.", "Boresha njia.", "Jaribu.", "Nne."],
      lines_en: ["4 of 5 visitors love the tasting.", "Improve the road.", "Try.", "Four."],
    });

    const report = await t.engine.monthlyInsights();

    expect(report.sms_sw).toEqual([
      "Wageni 4 kati ya 5 wanapenda kuonja kahawa.",
      "Boresha njia.",
      "Jaribu.",
    ]);
    expect(report.sms_en).toEqual([
      "4 of 5 visitors love the tasting.",
      "Improve the road.",
      "Try.",
    ]);
    expect(t.toNoor()).toEqual(report.sms_sw);
  });

  it("sends the fixed SMS rather than a line cut short, whose English would say more", async () => {
    // 170 characters: cut to one SMS, Noor would read "… Mgeni 1..." and never "kati ya 5".
    const long =
      "Wageni 4 kati ya 5 wanapenda kuonja kahawa".padEnd(150, ", sana") + ". Mgeni 1 kati ya 5.";
    expect(long).toHaveLength(170);
    const t = await setup();
    t.script.sms({
      lines_sw: [long, "Boresha njia."],
      lines_en: ["4 of 5 visitors love the tasting, and 1 of 5 too.", "Improve the road."],
    });

    const report = await t.engine.monthlyInsights();

    expect(report.sms_sw).toEqual(FIXED_SW);
    expect(report.sms_en).toEqual(FIXED_EN);
    expect(t.toNoor()).toEqual(FIXED_SW);
  });

  it("phrases only labels and counts, each count as the Swahili phrase to copy", async () => {
    const summaries: string[] = [];
    const t = await setup(REVIEWS, {
      writeInsightsSms: async (summary) => {
        summaries.push(summary);
        return { lines_sw: ["Sawa."], lines_en: ["Fine."] };
      },
    });

    await t.engine.monthlyInsights();

    expect(summaries).toEqual([
      [
        "Reviews: 5",
        "Visitors who loved: Kuonja kahawa (Tasting the coffee): wageni 4 kati ya 5; Mandhari na matembezi (Views and the walk): wageni 2 kati ya 5",
        "Visitors who wished it different: Njia ya kufika shambani (Finding the farm): wageni 2 kati ya 5; Muda wa ziara (Length and pace): mgeni 1 kati ya 5; Choo, kivuli na viti (Toilets, shade and seats): mgeni 1 kati ya 5",
        "Visitors who suggested: [sw] sell beans to take home (sell beans to take home): wageni 2 kati ya 5; [sw] roast your own coffee (roast your own coffee): mgeni 1 kati ya 5",
      ].join("\n"),
    ]);
  });

  it("falls back to a fixed Swahili SMS when the AI fails or makes up a number", async () => {
    const t = await setup();
    t.script.sms(new Error("gateway down"));
    t.script.sms({
      lines_sw: ["Wageni 7 kati ya 5 wanapenda kuonja kahawa."],
      lines_en: ["7 of 5 visitors love the tasting."],
    });

    expect((await t.engine.monthlyInsights()).sms_sw).toEqual(FIXED_SW);
    expect(t.toNoor()).toEqual(FIXED_SW);
    const again = await t.engine.monthlyInsights();
    expect([again.sms_sw, again.sms_en]).toEqual([FIXED_SW, FIXED_EN]);
  });

  it("still reports when ideas can't be grouped, and keeps their English out of the SMS", async () => {
    const t = await setup([REVIEWS[2]!]);
    t.script.ideaGroups(new Error("gateway down"));
    t.script.sms(new Error("gateway down"));

    const report = await t.engine.monthlyInsights();

    expect(report.next.map((i) => [i.key, i.count])).toEqual([["roast your own coffee", 1]]);
    // Without its grouping the idea has no Swahili label: Noor's SMS leaves it out.
    expect(report.sms_sw).toEqual(["Endelea: Kuonja kahawa. Mgeni 1 kati ya 1 alipenda."]);

    const ideaOnly = review(
      "es",
      "positive",
      "Sería genial poder tostar nuestro propio café.",
      [],
      [["roast your own coffee", "poder tostar nuestro propio café"]],
    );
    const u = await setup([ideaOnly]);
    u.script.ideaGroups(new Error("gateway down"));
    u.script.sms(new Error("gateway down"));
    expect((await u.engine.monthlyInsights()).sms_sw).toEqual([
      "Maoni ya wageni: 1. Wamefurahi: 1. Hawakufurahi: 0.",
    ]);
  });

  it("leaves out an idea whose Swahili label is too long for one SMS", async () => {
    const label_sw = "Ongeza ".repeat(25).trim();
    const t = await setup(REVIEWS, {
      groupIdeas: async (ideas) => ({
        groups: [{ label_en: "A long idea", label_sw, ids: ideas.map((i) => i.id) }],
      }),
      writeInsightsSms: async () => {
        throw new Error("gateway down");
      },
    });

    const report = await t.engine.monthlyInsights();

    expect(report.next[0]).toMatchObject({ label_sw, count: 3 });
    expect(report.sms_sw).toEqual(FIXED_SW.slice(0, 2));
    expect(report.sms_en).toEqual(FIXED_EN.slice(0, 2));
  });

  it("without points or ideas, sends sentiment counts without calling the AI", async () => {
    const t = await setup([
      { text: "Gut.", lang: "de", analysis: reviewSays({ points: [] }) },
      { text: "Hmm.", lang: "de", analysis: reviewSays({ sentiment: "neutral", points: [] }) },
    ]);

    const report = await t.engine.monthlyInsights();

    expect(report.sms_sw).toEqual(["Maoni ya wageni: 2. Wamefurahi: 1. Hawakufurahi: 0."]);
    expect(t.data.aiCalls.map((c) => c.task)).not.toContain("write_insights_sms");
  });

  it("tells Noor there are no reviews yet, and saves nothing", async () => {
    const t = await setup([]);

    const report = await t.engine.monthlyInsights();

    expect(report).toMatchObject({ review_count: 0, keep: [], improve: [], next: [] });
    expect(t.toNoor()).toEqual(["Bado hakuna maoni ya wageni mwezi huu."]);
    expect(t.data.insightReports).toEqual([]);
    expect(t.data.aiCalls.map((c) => c.task)).not.toContain("write_insights_sms");
  });
});
