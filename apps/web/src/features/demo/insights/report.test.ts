import { describe, expect, it } from "vitest";
import {
  countSince,
  formatRelative,
  languageName,
  needsTranslation,
  parseReport,
  plural,
  quoteCount,
  reviewsLabel,
  summariseFeedback,
} from "./report";

const quote = (over: Record<string, unknown> = {}) => ({
  feedback_id: "f1",
  lang: "de",
  quote: "Noor erklärt alles sehr lebendig",
  quote_en: "Noor explains everything very vividly",
  ...over,
});
const item = (over: Record<string, unknown> = {}) => ({
  key: "host",
  label_en: "Noor's warmth",
  label_sw: "Ukarimu wa Noor",
  count: 7,
  share: 0.78,
  quotes: [quote()],
  ...over,
});

describe("parseReport", () => {
  it("reads a complete report", () => {
    const report = parseReport({
      review_count: 9,
      sentiment: { positive: 7, neutral: 1, negative: 1 },
      keep: [item()],
      improve: [item({ key: "access", label_en: "Finding the farm", count: 4 })],
      next: [],
      sms_sw: ["Habari"],
      sms_en: ["Hello"],
      dropped_quotes: 2,
      generated_at: "2026-10-03T10:00:00.000Z",
    });
    expect(report).toMatchObject({
      review_count: 9,
      sentiment: { positive: 7, neutral: 1, negative: 1 },
      sms_sw: ["Habari"],
      sms_en: ["Hello"],
      dropped_quotes: 2,
      generated_at: "2026-10-03T10:00:00.000Z",
    });
    expect(report?.keep[0]).toMatchObject({ label_en: "Noor's warmth", count: 7 });
    expect(report?.keep[0]?.quotes[0]?.quote).toBe("Noor erklärt alles sehr lebendig");
    expect(report?.improve).toHaveLength(1);
    expect(report?.next).toEqual([]);
  });

  it("returns null when the value is not an object", () => {
    for (const bad of [null, undefined, "report", 3, []]) expect(parseReport(bad)).toBeNull();
  });

  it("fills in what is missing rather than throwing", () => {
    expect(parseReport({}, 5)).toEqual({
      review_count: 5,
      sentiment: { positive: 0, neutral: 0, negative: 0 },
      keep: [],
      improve: [],
      next: [],
      sms_sw: [],
      sms_en: [],
      dropped_quotes: 0,
      generated_at: "",
    });
  });

  it("skips malformed items and quotes", () => {
    const report = parseReport({
      review_count: 4,
      keep: [
        null,
        "text",
        item({ label_en: "", key: "" }),
        item({ quotes: [quote({ quote: "  " }), 12, quote()] }),
      ],
    });
    expect(report?.keep).toHaveLength(1);
    expect(report?.keep[0]?.quotes).toHaveLength(1);
  });

  it("labels an item by its key when it has no English label", () => {
    const report = parseReport({ review_count: 3, next: [item({ label_en: "", key: "lunch" })] });
    expect(report?.next[0]?.label_en).toBe("lunch");
  });

  it("lists the most mentioned first and keeps the given order for ties", () => {
    const report = parseReport({
      review_count: 10,
      keep: [
        item({ label_en: "A", count: 2 }),
        item({ label_en: "B", count: 5 }),
        item({ label_en: "C", count: 2 }),
      ],
    });
    expect(report?.keep.map((i) => i.label_en)).toEqual(["B", "A", "C"]);
  });

  it("works the share out from the count, not from the stored value", () => {
    const report = parseReport({ review_count: 8, keep: [item({ count: 2, share: 99 })] });
    expect(report?.keep[0]?.share).toBe(0.25);
  });

  it("falls back to the row's review count", () => {
    expect(parseReport({ keep: [item({ count: 3 })] }, 6)?.keep[0]?.share).toBe(0.5);
  });

  it("keeps each SMS line next to its translation", () => {
    const report = parseReport({ sms_sw: ["a", "b", "c"], sms_en: ["A", 7, "C"] });
    expect(report?.sms_sw).toEqual(["a", "b", "c"]);
    expect(report?.sms_en).toEqual(["A", "", "C"]);
  });

  it("ignores negative, fractional and non-numeric counts", () => {
    const report = parseReport({
      review_count: "9",
      dropped_quotes: -3,
      keep: [item({ count: 2.6 }), item({ count: "many", label_en: "Z" })],
    });
    expect(report?.review_count).toBe(0);
    expect(report?.dropped_quotes).toBe(0);
    expect(report?.keep.map((i) => i.count)).toEqual([3, 0]);
  });
});

describe("summariseFeedback", () => {
  it("counts reviews by source and languages", () => {
    const rows = [
      { lang: "de", source: "sample" },
      { lang: "fr", source: "sample" },
      { lang: "DE", source: "guest" },
      { lang: "pt-BR", source: "sample" },
      { lang: "pt", source: "sample" },
      { lang: null, source: "guest" },
      { lang: " ", source: "guest" },
    ];
    expect(summariseFeedback(rows)).toEqual({
      total: 7,
      sample: 4,
      guest: 3,
      languages: 3,
    });
  });

  it("handles no reviews", () => {
    expect(summariseFeedback([])).toEqual({ total: 0, sample: 0, guest: 0, languages: 0 });
  });
});

describe("reviewsLabel", () => {
  it("says where the reviews came from only when it matters", () => {
    expect(reviewsLabel({ total: 0, guest: 0, sample: 0, languages: 0 })).toBe("No reviews yet");
    expect(reviewsLabel({ total: 1, guest: 1, sample: 0, languages: 1 })).toBe("1 review");
    expect(reviewsLabel({ total: 12, guest: 0, sample: 12, languages: 6 })).toBe(
      "12 sample reviews",
    );
    expect(reviewsLabel({ total: 11, guest: 4, sample: 7, languages: 9 })).toBe(
      "11 reviews (7 sample, 4 from guests)",
    );
  });
});

describe("plural", () => {
  it("agrees with the number", () => {
    expect(plural(1, "review")).toBe("1 review");
    expect(plural(0, "review")).toBe("0 reviews");
    expect(plural(2, "sample review")).toBe("2 sample reviews");
  });
});

describe("formatRelative", () => {
  const now = Date.parse("2026-10-03T12:00:00.000Z");
  const ago = (ms: number) => new Date(now - ms).toISOString();
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  it("reads naturally after the word 'updated'", () => {
    expect(formatRelative(ago(10_000), now)).toBe("just now");
    expect(formatRelative(ago(2 * MIN), now)).toBe("2 min ago");
    expect(formatRelative(ago(59 * MIN), now)).toBe("59 min ago");
    expect(formatRelative(ago(61 * MIN), now)).toBe("1 h ago");
    expect(formatRelative(ago(5 * HOUR), now)).toBe("5 h ago");
    expect(formatRelative(ago(30 * HOUR), now)).toBe("yesterday");
    expect(formatRelative(ago(4 * DAY), now)).toBe("4 days ago");
    expect(formatRelative(ago(40 * DAY), now)).toMatch(/^on .*2026/);
  });

  it("treats a time slightly in the future as now, and garbage as nothing", () => {
    expect(formatRelative(new Date(now + 5 * MIN).toISOString(), now)).toBe("just now");
    expect(formatRelative("not a date", now)).toBe("");
    expect(formatRelative("", now)).toBe("");
  });
});

describe("languageName", () => {
  it("names a language in English", () => {
    expect(languageName("de")).toBe("German");
    expect(languageName("ja")).toBe("Japanese");
    expect(languageName("sw")).toBe("Swahili");
  });

  it("copes with odd input", () => {
    expect(languageName("")).toBe("Unknown");
    expect(languageName("not a code!")).toBe("NOT A CODE!");
  });
});

describe("needsTranslation", () => {
  it("is false for English and for a translation that adds nothing", () => {
    expect(needsTranslation({ ...quote(), lang: "en", quote_en: "something else" })).toBe(false);
    expect(needsTranslation({ ...quote(), lang: "en-GB" })).toBe(false);
    expect(needsTranslation({ ...quote(), quote: "Hola", quote_en: " hola " })).toBe(false);
    expect(needsTranslation({ ...quote(), quote_en: "" })).toBe(false);
  });

  it("is true when the English differs", () => {
    expect(needsTranslation(quote())).toBe(true);
  });
});

describe("quoteCount", () => {
  it("counts the quotes the report shows, at most three per item", () => {
    const quotes = (n: number) => Array.from({ length: n }, (_, i) => quote({ quote: `q${i}` }));
    const report = parseReport({
      review_count: 5,
      keep: [item({ quotes: quotes(5) }), item({ quotes: quotes(1) })],
      next: [item({ quotes: quotes(2) })],
    });
    expect(report && quoteCount(report)).toBe(3 + 1 + 2);
  });
});

describe("countSince", () => {
  const rows = [
    { created_at: "2026-10-03T09:00:00.000Z" },
    { created_at: "2026-10-03T10:00:00.000Z" },
    { created_at: "2026-10-03T10:00:01.000Z" },
    { created_at: "2026-10-04T08:00:00.000Z" },
  ];

  it("counts the rows created after the given time", () => {
    expect(countSince(rows, "2026-10-03T10:00:00.000Z")).toBe(2);
    expect(countSince(rows, "2026-10-05T00:00:00.000Z")).toBe(0);
    expect(countSince(rows, "2026-10-01T00:00:00.000Z")).toBe(4);
  });

  it("counts nothing when the time is not a time", () => {
    expect(countSince(rows, "")).toBe(0);
    expect(countSince(rows, "later")).toBe(0);
  });
});
