import { describe, expect, it } from "vitest";
import { ASPECTS, type Aspect } from "../ai/types";
import { SAMPLE_REVIEWS, type SampleReview } from "./index";

const total = SAMPLE_REVIEWS.length;
const count = (pick: (r: SampleReview) => boolean) => SAMPLE_REVIEWS.filter(pick).length;
const share = (pick: (r: SampleReview) => boolean) => count(pick) / total;
const loved = (aspect: Aspect) => share((r) => r.labels.loved.includes(aspect));
const wished = (aspect: Aspect) => share((r) => r.labels.wished.includes(aspect));
const suggested = (idea: RegExp) => share((r) => r.labels.ideas.some((i) => idea.test(i)));
const inRange = (value: number, min: number, max: number) => {
  expect(value).toBeGreaterThanOrEqual(min);
  expect(value).toBeLessThanOrEqual(max);
};
/** The aspect (or idea) that comes up most often. */
const mostCommon = (items: string[]) => {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

describe("sample reviews", () => {
  it("has 42 reviews with unique ids r01 to r42", () => {
    expect(SAMPLE_REVIEWS).toHaveLength(42);
    expect(new Set(SAMPLE_REVIEWS.map((r) => r.id)).size).toBe(42);
    expect(SAMPLE_REVIEWS.map((r) => r.id)).toEqual(
      Array.from({ length: 42 }, (_, i) => `r${String(i + 1).padStart(2, "0")}`),
    );
  });

  it("has a language code and some text for every review", () => {
    for (const r of SAMPLE_REVIEWS) {
      expect(r.lang, r.id).toMatch(/^[a-z]{2}$/);
      expect(r.text.trim(), r.id).not.toBe("");
    }
  });

  it("labels only known aspects, once per list, and non-empty ideas", () => {
    const known = new Set<string>(ASPECTS);
    for (const r of SAMPLE_REVIEWS) {
      for (const list of [r.labels.loved, r.labels.wished]) {
        expect(
          list.every((a) => known.has(a)),
          r.id,
        ).toBe(true);
        expect(new Set(list).size, r.id).toBe(list.length);
      }
      for (const idea of r.labels.ideas) expect(idea.trim(), r.id).not.toBe("");
    }
  });

  it("covers at least 10 languages, close to the planned mix", () => {
    expect(new Set(SAMPLE_REVIEWS.map((r) => r.lang)).size).toBeGreaterThanOrEqual(10);
    const plan = { de: 8, fr: 6, en: 6, ja: 5, es: 5, nl: 3, it: 3, sw: 2, pt: 2 };
    for (const [lang, planned] of Object.entries(plan)) {
      const actual = count((r) => r.lang === lang);
      expect(Math.abs(actual - planned), lang).toBeLessThanOrEqual(1);
    }
  });

  it("has about 70% positive, 20% neutral and 10% negative reviews", () => {
    inRange(
      share((r) => r.labels.sentiment === "positive"),
      0.6,
      0.8,
    );
    inRange(
      share((r) => r.labels.sentiment === "neutral"),
      0.1,
      0.3,
    );
    inRange(
      share((r) => r.labels.sentiment === "negative"),
      0.05,
      0.15,
    );
  });

  it("has at least 12 reviews with ideas", () => {
    expect(count((r) => r.labels.ideas.length > 0)).toBeGreaterThanOrEqual(12);
  });

  it("plants what visitors loved", () => {
    inRange(loved("coffee_process"), 0.38, 0.52); // roasting their own beans
    inRange(loved("host"), 0.33, 0.47); // Noor's warmth and stories
    inRange(loved("landscape"), 0.22, 0.36); // the view and the walk
    inRange(loved("tasting"), 0.22, 0.38);
    inRange(loved("farm_life"), 0.08, 0.22);
    expect(mostCommon(SAMPLE_REVIEWS.flatMap((r) => r.labels.loved))).toBe("coffee_process");
  });

  it("plants what visitors wished were different", () => {
    inRange(wished("access"), 0.18, 0.32); // finding the farm
    inRange(wished("facilities"), 0.12, 0.28); // shade, a rest stop, toilets
    inRange(wished("landscape"), 0.05, 0.2); // the slope
    inRange(wished("food"), 0.08, 0.22);
    inRange(wished("communication"), 0.04, 0.14); // slow booking replies
    expect(mostCommon(SAMPLE_REVIEWS.flatMap((r) => r.labels.wished))).toBe("access");
  });

  it("plants the ideas, each under one wording", () => {
    inRange(suggested(/roasted beans/), 0.14, 0.26);
    inRange(suggested(/lunch/), 0.09, 0.2);
    inRange(suggested(/harvest/), 0.04, 0.12);
    inRange(suggested(/children/), 0.02, 0.09);
    expect(mostCommon(SAMPLE_REVIEWS.flatMap((r) => r.labels.ideas))).toBe(
      "sell roasted beans to take home",
    );
  });

  it("includes the hard cases", () => {
    // Nothing specific to label.
    expect(
      count((r) => !r.labels.loved.length && !r.labels.wished.length && !r.labels.ideas.length),
    ).toBeGreaterThanOrEqual(1);
    // Praise and a complaint about the same aspect.
    expect(
      count((r) => r.labels.loved.some((a) => r.labels.wished.includes(a))),
    ).toBeGreaterThanOrEqual(1);
    // An idea phrased as a question.
    expect(count((r) => r.labels.ideas.length > 0 && /[?？]/.test(r.text))).toBeGreaterThanOrEqual(
      1,
    );
    // A wish and an idea in the same review.
    expect(
      count((r) => r.labels.wished.length > 0 && r.labels.ideas.length > 0),
    ).toBeGreaterThanOrEqual(1);
    // Very short and very long.
    const lengths = SAMPLE_REVIEWS.map((r) => [...r.text].length);
    expect(Math.min(...lengths)).toBeLessThanOrEqual(40);
    expect(Math.max(...lengths)).toBeGreaterThanOrEqual(500);
  });
});
