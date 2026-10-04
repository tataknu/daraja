// Reviews in: quotes are checked against what the visitor wrote, an AI failure never loses a
// review, and imports spend no tokens on reviews that already have an analysis.
import { describe, expect, it } from "vitest";
import type { Ai } from "./ai/types";
import { createContext } from "./context";
import { createEngine } from "./engine";
import { ingestFeedback, quoteInText } from "./feedback";
import { fakeAi, reviewSays } from "./testing/fake-ai";
import { memoryRepo } from "./testing/memory-repo";

const GERMAN =
  "Es war toll, die Bohnen selbst zu rösten! Der Weg war schwer zu finden – ein Schild an der Straße wäre gut.";

function setup(wrap: (ai: Ai) => Ai = (ai) => ai) {
  const now = () => new Date("2026-10-05T08:00:00Z");
  const { repo, data } = memoryRepo(now);
  const script = fakeAi();
  const deps = { repo, ai: wrap(script.ai), now };
  return { data, script, ctx: createContext(deps), engine: createEngine(deps) };
}

/** The fake AI with analyses that take a moment, counting how many run at once. */
function slowReviews(ai: Ai, running: { now: number; most: number }): Ai {
  return {
    ...ai,
    withUsage: (l) => slowReviews(ai.withUsage(l), running),
    analyzeReview: async (text) => {
      running.most = Math.max(running.most, ++running.now);
      await new Promise((r) => setTimeout(r, 1));
      running.now--;
      return ai.analyzeReview(text);
    },
  };
}

describe("quoteInText", () => {
  it("ignores case, spacing, quote marks and punctuation around the quote", () => {
    expect(quoteInText('"bohnen  SELBST zu rösten!"', GERMAN)).toBe(true);
    expect(quoteInText("l’accueil de Noor", "Nous avons adoré l'accueil de Noor.")).toBe(true);
    expect(quoteInText("ご主人の説明。", "ご主人の説明がとても丁寧でした。")).toBe(true);
  });

  it("rejects words the visitor didn't write", () => {
    expect(quoteInText("die Bohnen geröstet", GERMAN)).toBe(false);
    expect(quoteInText("toll ... finden", GERMAN)).toBe(false);
    expect(quoteInText(" … ", GERMAN)).toBe(false);
  });
});

describe("ingestFeedback", () => {
  it("stores what the visitor loved, wished and suggested, dropping invented quotes", async () => {
    const t = setup();
    t.script.review(
      reviewSays({
        translation_en: "Roasting the beans ourselves was great! The way was hard to find.",
        points: [
          {
            aspect: "coffee_process",
            polarity: "loved",
            quote: "die Bohnen selbst zu rösten",
            quote_en: "roasting the beans ourselves",
          },
          {
            aspect: "access",
            polarity: "wished",
            quote: "Der Weg war schwer zu finden",
            quote_en: "The way was hard to find",
          },
          {
            aspect: "food",
            polarity: "loved",
            quote: "Das Mittagessen war lecker",
            quote_en: "Lunch was tasty",
          },
        ],
        ideas: [
          {
            idea: "a sign on the road",
            quote: "ein Schild an der Straße wäre gut",
            quote_en: "a sign on the road would be good",
          },
          { idea: "sell coffee to go", quote: "Kaffee zum Mitnehmen", quote_en: "coffee to go" },
        ],
      }),
    );

    const review = await ingestFeedback(t.ctx, null, GERMAN, "de");

    expect(review).toEqual({ id: t.data.feedback[0]?.id, sentiment: "positive", language: "de" });
    const [row] = t.data.feedback;
    expect(row?.points?.map((p) => p.aspect)).toEqual(["coffee_process", "access"]);
    expect(row?.ideas?.map((i) => i.idea)).toEqual(["a sign on the road"]);
    expect(row).toMatchObject({
      text_original: GERMAN,
      lang: "de",
      text_translated: "Roasting the beans ourselves was great! The way was hard to find.",
      themes: ["coffee_process", "access"],
      source: "guest",
      quotes_dropped: 2, // the lunch point and the coffee-to-go idea
    });
  });

  it("keeps the review, untranslated and neutral, when the AI fails", async () => {
    const t = setup();
    t.script.review(new Error("gateway down"));

    const review = await ingestFeedback(t.ctx, 14, GERMAN, "de");

    expect(review).toMatchObject({ sentiment: "neutral", language: "de" });
    expect(t.data.feedback[0]).toMatchObject({
      booking_id: 14,
      text_translated: GERMAN,
      sentiment: "neutral",
      themes: [],
      points: [],
      ideas: [],
    });
  });
});

describe("importReviews", () => {
  it("uses a stored analysis without calling the AI, and still checks its quotes", async () => {
    const t = setup();
    const analysis = reviewSays({
      points: [
        ...reviewSays().points,
        { aspect: "food", polarity: "loved", quote: "leckerer Kuchen", quote_en: "tasty cake" },
      ],
    });

    const result = await t.engine.importReviews([{ text: GERMAN, lang: "de", analysis }], "sample");

    expect(result).toEqual({ imported: 1, analysed: 0 });
    expect(t.data.aiCalls).toEqual([]);
    expect(t.data.feedback[0]).toMatchObject({
      source: "sample",
      lang: "de",
      sentiment: "positive",
    });
    expect(t.data.feedback[0]?.points?.map((p) => p.quote)).toEqual(["Bohnen selbst zu rösten"]);
  });

  it("analyses the rest four at a time, and keeps the reviews the AI couldn't read", async () => {
    const running = { now: 0, most: 0 };
    const t = setup((ai) => slowReviews(ai, running));
    t.script.review(reviewSays({ language: "ja", points: [] }));
    t.script.review(new Error("timeout"));
    const reviews = Array.from({ length: 6 }, (_, i) => ({ text: `Review ${i}` }));

    const result = await t.engine.importReviews([...reviews, { text: "Avis", lang: "fr" }]);

    expect(result).toEqual({ imported: 7, analysed: 7 });
    expect(running.most).toBe(4);
    const row = (text: string) => t.data.feedback.find((f) => f.text_original === text);
    expect(row("Review 0")).toMatchObject({ lang: "ja", sentiment: "positive" });
    expect(row("Review 1")).toMatchObject({ lang: "und", sentiment: "neutral" });
    expect(row("Avis")?.lang).toBe("fr");
    expect(t.data.aiCalls.every((c) => c.source === "import")).toBe(true);
  });
});
