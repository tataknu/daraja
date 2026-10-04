import type { GuestClassification, HostClassification, ReviewAnalysis } from "@daraja/engine/ai";
import type { SampleReview } from "@daraja/engine/samples";
import { guestSays, noorSays, reviewSays } from "@daraja/engine/testing";
import { describe, expect, it } from "vitest";
import type { GuestCase, HostCase } from "./labels";
import {
  guestMetrics,
  isVerbatim,
  normBooking,
  normLang,
  normMissing,
  percentile,
  reviewMetrics,
  scoreGuest,
  scoreHost,
  scoreReview,
  usageMetrics,
} from "./score";

const SLOTS = ["09:00", "14:00"];

const request: GuestCase = {
  id: "de-request",
  text: "Wir sind zu dritt und kommen nächsten Samstag morgens.",
  booking: "none",
  labels: {
    intent: "booking_request",
    language: "de",
    entities: {
      date_from: { any_of: ["2026-10-10", "2026-10-17"] },
      party_size: 3,
      slot: "09:00",
    },
    missing: [],
  },
};

describe("reading model output like the engine", () => {
  it("compares languages by primary subtag", () => {
    expect(normLang("zh-CN")).toBe("zh");
    expect(normLang(" DE ")).toBe("de");
    expect(normLang("")).toBeNull();
  });

  it("reads booking references by their digits", () => {
    expect(normBooking("b14")).toBe("B14");
    expect(normBooking(14)).toBe("B14");
    expect(normBooking("B014")).toBe("B14");
    expect(normBooking("none")).toBeNull();
    expect(normBooking(null)).toBeNull();
  });

  it("compares missing fields as sets and ignores the optional slot", () => {
    expect(normMissing(["party_size", "date_from", "slot"])).toBe("date_from,party_size");
    expect(normMissing(["date_from", "date_from"])).toBe("date_from");
    expect(normMissing(null)).toBe("");
  });

  it("finds quotes verbatim regardless of case, spacing and edge punctuation", () => {
    const review = "Das Rösten der Bohnen war   unser Highlight! Nur der Weg war schwer zu finden.";
    expect(isVerbatim("„das rösten der bohnen war unser highlight!“", review)).toBe(true);
    expect(isVerbatim("...der Weg war schwer", review)).toBe(true);
    expect(isVerbatim("the roasting was the highlight", review)).toBe(false);
    expect(isVerbatim("!!!", review)).toBe(false);
  });

  it("takes the nearest-rank percentile", () => {
    const xs = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(percentile(xs, 0.5)).toBe(500);
    expect(percentile(xs, 0.95)).toBe(1000);
    expect(percentile([42], 0.95)).toBe(42);
    expect(percentile([], 0.5)).toBeNull();
  });
});

describe("guest scores", () => {
  const says = (o: Parameters<typeof guestSays>[0] = {}): GuestClassification =>
    guestSays({ confidence: 0.9, ...o });

  it("accepts any labelled option for an ambiguous date", () => {
    const s = scoreGuest(request, says({ entities: { date_from: "2026-10-17" } }), SLOTS);
    expect(s).toMatchObject({ intent: true, date_from: true, exact: true, handoff: false });
    expect(s.wrong_but_confident).toBe(false);
  });

  it("counts a confident wrong field as the risky case", () => {
    const s = scoreGuest(request, says({ entities: { party_size: 4 } }), SLOTS);
    expect(s).toMatchObject({ party_size: false, exact: false, wrong_but_confident: true });
  });

  it("hands low confidence or unknown intent to Noor, which is not the risky case", () => {
    const low = scoreGuest(request, says({ confidence: 0.6, entities: { party_size: 4 } }), SLOTS);
    expect(low).toMatchObject({ handoff: true, wrong_but_confident: false });
    expect(scoreGuest(request, says({ intent: "unknown" }), SLOTS).handoff).toBe(true);
  });

  it("treats a slot that isn't one of the farm's as none, like guest.ts", () => {
    expect(scoreGuest(request, says({ entities: { slot: "9:00" } }), SLOTS).slot).toBe(false);
  });

  it("scores an AI error as wrong and handed to Noor", () => {
    expect(scoreGuest(request, null, SLOTS)).toMatchObject({
      intent: false,
      language: false,
      date_from: false,
      exact: false,
      handoff: true,
      wrong_but_confident: false,
      confidence: null,
    });
  });

  it("does not score fields that have no label", () => {
    const question: GuestCase = {
      id: "q",
      text: "?",
      booking: "none",
      labels: { intent: "question" },
    };
    const s = scoreGuest(question, says({ intent: "question" }), SLOTS);
    expect(s).toMatchObject({ language: null, date_from: null, missing: null, exact: true });
  });

  it("aggregates rates over the scored cases, with per-intent rows", () => {
    const question: GuestCase = {
      id: "q",
      text: "?",
      booking: "none",
      labels: { intent: "question" },
    };
    const cases = [request, question];
    const scores = [
      scoreGuest(request, says(), SLOTS),
      scoreGuest(question, says({ intent: "question", entities: { date_from: null } }), SLOTS),
    ];
    const m = Object.fromEntries(guestMetrics(cases, scores).map((x) => [x.key, x]));
    expect(m["intent"]).toMatchObject({ value: 1, num: 2, den: 2 });
    expect(m["date_from"]).toMatchObject({ num: 1, den: 1 });
    expect(m["intent:question"]).toMatchObject({ num: 1, den: 1 });
  });
});

describe("host scores", () => {
  const twoWaiting: HostCase = {
    id: "two",
    text: "Ndiyo, karibuni.",
    open: [
      { booking: "B28", kind: "approve_booking" },
      { booking: "B29", kind: "approve_booking" },
    ],
    labels: { intent: { any_of: ["approve", "unknown"] }, booking: null },
  };
  const says = (o: Partial<HostClassification>) => noorSays({ confidence: 0.9, ...o });

  it("counts a guessed booking as wrong and confident", () => {
    const s = scoreHost(twoWaiting, says({ booking: "B28" }));
    expect(s).toMatchObject({
      intent: true,
      booking: false,
      handoff: false,
      wrong_but_confident: true,
    });
  });

  it("hands off when the booking isn't one of the open prompts, like host.ts", () => {
    const s = scoreHost(twoWaiting, says({ booking: null }));
    expect(s).toMatchObject({ booking: true, exact: true, handoff: true });
  });

  it("scores the proposed date only when labelled", () => {
    const propose: HostCase = {
      id: "p",
      text: "Tarehe 20.",
      open: [{ booking: "B21", kind: "ask_other_date" }],
      labels: { intent: "propose_other_date", booking: "B21", proposed_date: "2026-10-20" },
    };
    const right = says({
      intent: "propose_other_date",
      booking: "b21",
      proposed_date: "2026-10-20",
    });
    expect(scoreHost(propose, right)).toMatchObject({ proposed_date: true, exact: true });
    expect(scoreHost(propose, { ...right, proposed_date: "2026-10-21" }).proposed_date).toBe(false);
    expect(scoreHost(twoWaiting, says({ booking: null })).proposed_date).toBeNull();
  });
});

describe("review scores", () => {
  const review: SampleReview = {
    id: "r1",
    lang: "de",
    text: "Wir haben die Bohnen selbst geröstet, toll! Der Weg war schwer zu finden. Vielleicht Schilder aufstellen?",
    labels: {
      sentiment: "positive",
      loved: ["coffee_process"],
      wished: ["access"],
      ideas: ["signs on the road"],
    },
  };

  it("matches (aspect, polarity) points and checks quotes", () => {
    const out: ReviewAnalysis = reviewSays({
      points: [
        {
          aspect: "coffee_process",
          polarity: "loved",
          quote: "die Bohnen selbst geröstet",
          quote_en: "roasted the beans ourselves",
        },
        { aspect: "landscape", polarity: "loved", quote: "schöne Aussicht", quote_en: "nice view" },
      ],
      ideas: [],
    });
    expect(scoreReview(review, out)).toEqual({
      sentiment: true,
      points_tp: 1,
      points_predicted: 2,
      points_gold: 2,
      has_idea: false,
      idea_labelled: true,
      quotes: 2,
      verbatim: 1,
    });
  });

  it("aggregates micro precision, recall and F1", () => {
    const m = Object.fromEntries(
      reviewMetrics([
        {
          sentiment: true,
          points_tp: 1,
          points_predicted: 2,
          points_gold: 2,
          has_idea: true,
          idea_labelled: true,
          quotes: 2,
          verbatim: 2,
        },
        {
          sentiment: false,
          points_tp: 2,
          points_predicted: 2,
          points_gold: 4,
          has_idea: true,
          idea_labelled: false,
          quotes: 2,
          verbatim: 1,
        },
      ]).map((x) => [x.key, x]),
    );
    expect(m["points_precision"]).toMatchObject({ value: 0.75, num: 3, den: 4 });
    expect(m["points_recall"]).toMatchObject({ value: 0.5, num: 3, den: 6 });
    expect(m["points_f1"]?.value).toBeCloseTo(0.6);
    expect(m["idea_precision"]).toMatchObject({ num: 1, den: 2 });
    expect(m["idea_recall"]).toMatchObject({ num: 1, den: 1 });
    expect(m["quote_verbatim"]).toMatchObject({ num: 3, den: 4 });
  });
});

describe("usage", () => {
  const call = (input: number, output: number, latency: number, ok = true) => ({
    task: "classify_guest",
    model: "m",
    input_tokens: input,
    cached_tokens: 0,
    output_tokens: output,
    reasoning_tokens: 0,
    latency_ms: latency,
    ok,
  });

  it("prices 1,000 messages only when prices are given", () => {
    const perCase = [[call(1000, 200, 800)], [call(3000, 400, 1200)]];
    const m = Object.fromEntries(
      usageMetrics(perCase, { in: 0.5, out: 2 }).map((x) => [x.key, x.value]),
    );
    // Avg per message: (2000 * 0.5 + 300 * 2) / 1e6 = 0.0016 USD.
    expect(m["cost_per_1k"]).toBeCloseTo(1.6);
    expect(m["input_tokens"]).toBe(2000);
    expect(m["latency_p50"]).toBe(800);
    const unpriced = usageMetrics(perCase, null).find((x) => x.key === "cost_per_1k");
    expect(unpriced?.value).toBeNull();
  });

  it("leaves failed calls out of token and latency averages", () => {
    const m = Object.fromEntries(
      usageMetrics([[call(1000, 100, 500)], [call(0, 0, 90, false)]], null).map((x) => [
        x.key,
        x.value,
      ]),
    );
    expect(m).toMatchObject({ calls: 2, failed: 1, input_tokens: 1000, latency_avg: 500 });
  });
});
