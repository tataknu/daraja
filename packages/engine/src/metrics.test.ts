// The definitions behind the Metrics tab, on hand-made rows and on what the engine itself logs.
import { describe, expect, it } from "vitest";
import { createEngine } from "./engine";
import {
  computeMetrics,
  percentile,
  priceOf,
  PRICES,
  type AiCallRow,
  type DecisionRow,
  type MessageRow,
  type Metrics,
  type MetricsInput,
  type PromptRow,
} from "./metrics";
import { fakeAi, guestSays } from "./testing/fake-ai";
import { memoryRepo, NOOR_PHONE } from "./testing/memory-repo";

const MIN = 60_000;
const EMPTY: MetricsInput = { aiCalls: [], bookings: [], messages: [], decisions: [], prompts: [] };

function call(overrides: Partial<AiCallRow> = {}): AiCallRow {
  return {
    task: "translate",
    model: "gpt-5.4-mini",
    source: "inbound",
    message_id: null,
    booking_id: null,
    input_tokens: 100,
    cached_tokens: 0,
    output_tokens: 20,
    reasoning_tokens: 0,
    latency_ms: 1000,
    ok: true,
    ...overrides,
  };
}

const msg = (id: string, direction: string, channel: string, booking_id: number | null = null) =>
  ({ id, direction, channel, booking_id }) satisfies MessageRow;
const decision = (message_id: string | null, model: string, action_taken: string): DecisionRow => ({
  message_id,
  model,
  action_taken,
});
/** An ISO time `min` minutes after 08:00 on 5 Oct 2026. */
const at = (min: number) => new Date(Date.UTC(2026, 9, 5, 8) + min * MIN).toISOString();
const prompt = (
  kind: string,
  sentMin: number,
  resolvedMin: number | null,
  resolution: string | null,
): PromptRow => ({
  kind,
  sent_at: at(sentMin),
  resolved_at: resolvedMin === null ? null : at(resolvedMin),
  resolution,
});

/** Every number in `m`, however deeply nested. */
function numbers(m: unknown): number[] {
  if (typeof m === "number") return [m];
  if (m && typeof m === "object") return Object.values(m).flatMap(numbers);
  return [];
}

describe("percentile", () => {
  it("interpolates linearly between the closest ranks", () => {
    expect(percentile([4, 1, 3, 2], 0.5)).toBe(2.5);
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0.9)).toBeCloseTo(91);
    const oneToTwenty = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(oneToTwenty, 0.95)).toBeCloseTo(19.05);
    expect(percentile(oneToTwenty, 0)).toBe(1);
    expect(percentile(oneToTwenty, 1)).toBe(20);
  });

  it("handles one value, no values, and leaves the input as it was", () => {
    expect(percentile([7], 0.95)).toBe(7);
    expect(percentile([], 0.5)).toBeNull();
    const values = [3, 1, 2];
    percentile(values, 0.5);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("computeMetrics", () => {
  it("averages AI use and messages over the bookings with AI calls, leaving out calls on none", () => {
    const m = computeMetrics({
      ...EMPTY,
      bookings: [
        { id: 13, referred_by: null }, // from before AI calls were logged
        { id: 14, referred_by: null },
        { id: 15, referred_by: "contact-anna" },
      ],
      messages: [
        msg("g14", "in", "email"), // inbound messages carry no booking
        msg("g15", "in", "email", 15),
        msg("o1", "out", "sms", 14),
        msg("o2", "out", "sms", 14),
        msg("o3", "out", "email", 14),
        msg("o4", "out", "sms", 15),
        msg("o5", "out", "email", 15),
        msg("o6", "out", "sms"), // "please rephrase" to Noor: about no booking
        msg("o7", "out", "sms", 13),
      ],
      aiCalls: [
        call({ booking_id: 14, message_id: "g14", input_tokens: 400, output_tokens: 100 }),
        call({ booking_id: 14 }),
        call({ message_id: "g15", input_tokens: 300, output_tokens: 60 }), // via its message
        call({ source: "insights", input_tokens: 1000, output_tokens: 200 }),
        call({ booking_id: 99, input_tokens: 50, output_tokens: 10 }), // not a known booking
      ],
    });

    expect(m.perBooking).toMatchObject({
      bookings: 2,
      withoutAiCalls: 1,
      aiCalls: 1.5,
      tokens: (500 + 120 + 360) / 2,
      inputTokens: 400,
      outputTokens: 90,
      smsToHost: 1.5,
      emailsToGuest: 1,
    });
    expect(m.perBooking.usage.calls).toBe(3);
    expect(m.notOnBooking).toMatchObject({ calls: 2, tokens: 1200 + 60 });
    expect(m.totals).toMatchObject({ calls: 5, tokens: 980 + 1260 });
    expect(m.referrals).toEqual({ bookings: 3, referred: 1, share: 1 / 3 });
  });

  it("counts a hand-off only when the AI was unsure or failed, not when routing is by design", () => {
    const m = computeMetrics({
      ...EMPTY,
      messages: [
        ...["g1", "g2", "g3", "g4"].map((id) => msg(id, "in", "email")),
        ...["h1", "h2", "h3", "h4", "h5"].map((id) => msg(id, "in", "sms")),
      ],
      decisions: [
        decision("g1", "gpt-5.4-mini", "request_sent_to_noor"), // routed to Noor by design
        decision("g2", "gpt-5.4-mini", "side_feedback_saved"),
        decision("g2", "gpt-5.4-mini", "forwarded_to_noor"), // unsure: one message, counted once
        decision("g3", "gpt-5.4-mini", "ai_error: Error: gateway timeout"), // failed
        decision("g4", "gpt-5.4-mini", "question_forwarded"), // routed by design
        decision("h1", "regex", "approve"), // keypad: the AI never read it
        decision("h2", "gpt-5.4-mini", "asked_to_rephrase"), // unsure
        decision("h3", "gpt-5.4-mini", "readback_sent"),
        decision("h4", "regex", "asked_which_booking"), // routed, but no AI involved
        decision(null, "gpt-5.4-mini", "forwarded_to_noor"), // no message: ignored
        // h5 has no decision: not counted
      ],
    });

    expect(m.handoff).toEqual({ aiRead: 6, unsure: 3, errors: 1, rate: 0.5 });
    expect(m.keypad).toEqual({ hostReplies: 4, withoutAi: 2, share: 0.5 });
  });

  it("times Noor's answers to booking requests, leaving out expiries and other resolutions", () => {
    const m = computeMetrics({
      ...EMPTY,
      prompts: [
        prompt("approve_booking", 0, 30, "approved"),
        prompt("approve_booking", 0, 90, "declined"),
        prompt("approve_booking", 10, 20, "other_day"),
        prompt("approve_booking", 0, 60, "counter_offered"),
        prompt("approve_booking", 0, 48 * 60, "expired"),
        prompt("approve_booking", 0, 5, "superseded"),
        prompt("approve_booking", 0, 5, "cancelled_by_guest"),
        prompt("approve_booking", 0, null, null),
        prompt("answer_question", 0, 3, "answered"),
        prompt("confirm_readback", 0, 1, "confirmed"),
      ],
    });

    // Waits of 10, 30, 60 and 90 minutes.
    expect(m.timeToAnswer).toMatchObject({ answered: 4, expired: 1, waiting: 1 });
    expect(m.timeToAnswer.p50).toBeCloseTo(45 * MIN);
    expect(m.timeToAnswer.p90).toBeCloseTo(81 * MIN);
  });

  it("reads Postgres timestamps with microseconds", () => {
    const m = computeMetrics({
      ...EMPTY,
      prompts: [
        {
          kind: "approve_booking",
          sent_at: "2026-10-03T23:21:34.882209+00:00",
          resolved_at: "2026-10-03T23:21:38.113788+00:00",
          resolution: "approved",
        },
      ],
    });
    expect(m.timeToAnswer.p50).toBe(3231);
  });

  it("prices uncached input, cached input and output; reasoning is part of output", () => {
    const big = call({
      input_tokens: 1_000_000,
      cached_tokens: 200_000,
      output_tokens: 100_000,
      reasoning_tokens: 40_000,
    });
    const m = computeMetrics({ ...EMPTY, aiCalls: [big], pricing: PRICES });
    // 0.8M × $0.75 + 0.2M × $0.075 + 0.1M × $4.50
    expect(m.totals.cost).toBeCloseTo(0.6 + 0.015 + 0.45, 10);
    expect(m.totals).toMatchObject({
      tokens: 1_100_000,
      reasoningTokens: 40_000,
      unpricedCalls: 0,
    });
    expect(m.unpricedModels).toEqual([]);

    const noReasoning = computeMetrics({
      ...EMPTY,
      aiCalls: [{ ...big, reasoning_tokens: 0 }],
      pricing: PRICES,
    });
    expect(noReasoning.totals.cost).toBe(m.totals.cost);
  });

  it("has no cost without prices, and a lower bound when some models have none", () => {
    const calls = [call(), call({ model: "mystery-1", task: "classify_guest" })];

    const unpriced = computeMetrics({ ...EMPTY, aiCalls: calls });
    expect(unpriced.totals.cost).toBeNull();
    expect(unpriced.perBooking.cost).toBeNull();
    expect(unpriced.byTask.every((g) => g.cost === null && g.costShare === null)).toBe(true);
    expect(unpriced.unpricedModels).toEqual(["gpt-5.4-mini", "mystery-1"]);

    const partial = computeMetrics({ ...EMPTY, aiCalls: calls, pricing: PRICES });
    expect(partial.totals.cost).toBeCloseTo((100 * 0.75 + 20 * 4.5) / 1e6, 12);
    expect(partial.totals.unpricedCalls).toBe(1);
    expect(partial.unpricedModels).toEqual(["mystery-1"]);
    expect(partial.byTask.find((g) => g.key === "classify_guest")?.cost).toBeNull();
  });

  it("finds a price under the gateway's prefix or a dated snapshot, never by guessing", () => {
    expect(priceOf("openai/gpt-5.4-mini")).toBe(PRICES["gpt-5.4-mini"]);
    expect(priceOf("gpt-5.4-mini-2026-03-17")).toBe(PRICES["gpt-5.4-mini"]);
    expect(priceOf("gpt-5.4-mini-high")).toBeNull();
    expect(priceOf("openai/gpt-6-astra")).toBeNull();
  });

  it("splits tokens and cost by task and by source, biggest first", () => {
    const m = computeMetrics({
      ...EMPTY,
      aiCalls: [
        call({ task: "classify_guest", input_tokens: 400, output_tokens: 100, latency_ms: 3000 }),
        call({ task: "translate", input_tokens: 100, output_tokens: 100, latency_ms: 1000 }),
        call({ task: "translate", input_tokens: 100, output_tokens: 100, latency_ms: 2000 }),
        call({ task: "analyze_review", source: "import", input_tokens: 200, output_tokens: 0 }),
      ],
      pricing: PRICES,
    });

    expect(m.byTask.map((g) => [g.key, g.calls, g.tokens])).toEqual([
      ["classify_guest", 1, 500],
      ["translate", 2, 400],
      ["analyze_review", 1, 200],
    ]);
    const translate = m.byTask[1]!;
    expect(translate.tokenShare).toBeCloseTo(400 / 1100);
    expect(translate.costShare).toBeCloseTo((200 * 0.75 + 200 * 4.5) / (800 * 0.75 + 300 * 4.5));
    expect(translate.latency).toMatchObject({ avg: 1500, p50: 1500 });
    expect(translate.latency.p95).toBeCloseTo(1950);
    expect(m.bySource.map((g) => [g.key, g.calls])).toEqual([
      ["inbound", 3],
      ["import", 1],
    ]);
  });

  it("measures latency on successful calls and reports the failure rate", () => {
    const m = computeMetrics({
      ...EMPTY,
      aiCalls: [
        ...[1000, 2000, 3000, 4000].map((latency_ms) => call({ latency_ms })),
        call({ ok: false, latency_ms: 30_000, input_tokens: 0, output_tokens: 0 }),
      ],
    });
    expect(m.totals.latency).toMatchObject({ avg: 2500, p50: 2500 });
    expect(m.totals.latency.p95).toBeCloseTo(3850);
    expect(m.totals).toMatchObject({ calls: 5, failed: 1, failureRate: 0.2 });
  });

  it("returns zeros and nulls, never NaN, when there is nothing yet", () => {
    const m: Metrics = computeMetrics(EMPTY);
    expect(numbers(m).some(Number.isNaN)).toBe(false);
    expect(m.totals).toMatchObject({ calls: 0, tokens: 0, cost: null, failureRate: null });
    expect(m.totals.latency).toEqual({ avg: null, p50: null, p95: null });
    expect(m.perBooking).toMatchObject({
      bookings: 0,
      withoutAiCalls: 0,
      aiCalls: null,
      cost: null,
      smsToHost: null,
    });
    expect(m.handoff.rate).toBeNull();
    expect(m.keypad.share).toBeNull();
    expect(m.timeToAnswer).toEqual({ answered: 0, expired: 0, waiting: 0, p50: null, p90: null });
    expect(m.referrals.share).toBeNull();
    expect([m.byTask, m.bySource, m.models, m.unpricedModels]).toEqual([[], [], [], []]);

    expect(computeMetrics({ ...EMPTY, pricing: PRICES }).totals.cost).toBe(0);
  });

  it("agrees with what the engine logs: a request, Noor's keypad 1, a guest the AI is unsure of", async () => {
    let now = Date.parse("2026-10-05T08:00:00Z");
    const clock = () => new Date(now);
    const { repo, data } = memoryRepo(clock);
    const script = fakeAi();
    const engine = createEngine({ repo, ai: script.ai, now: clock });

    script.guest(guestSays());
    await engine.handleInbound({
      channel: "email",
      sender: "lena@example.de",
      text: "Hallo! Wir sind 3 Personen und möchten am Samstag morgens kommen.",
      provider_msg_id: "g1",
    });
    now += 90 * MIN;
    await engine.handleInbound({
      channel: "sms",
      sender: NOOR_PHONE,
      text: "1",
      provider_msg_id: "n1",
    });
    script.guest(guestSays({ intent: "unknown", confidence: 0.4 }));
    await engine.handleInbound({
      channel: "email",
      sender: "ana@example.es",
      text: "Hola, ¿se puede ir con un perro?",
      provider_msg_id: "g2",
    });

    const m = computeMetrics({
      aiCalls: data.aiCalls,
      bookings: data.bookings,
      messages: data.messages,
      decisions: data.decisions.map((d) => decision(d.message_id, d.model, d.action)),
      prompts: data.prompts,
      pricing: { "fake-model": { input: 1, cachedInput: 0.1, output: 2 } },
    });

    expect(m.handoff).toEqual({ aiRead: 2, unsure: 1, errors: 0, rate: 0.5 });
    expect(m.keypad).toEqual({ hostReplies: 1, withoutAi: 1, share: 1 });
    expect(m.timeToAnswer).toMatchObject({ answered: 1, waiting: 0, p50: 90 * MIN });
    expect(m.notOnBooking.calls).toBe(0);
    expect(m.perBooking.bookings).toBe(2);
    expect(m.perBooking.aiCalls).toBe(data.aiCalls.length / 2);
    // Each fake call: 100 tokens in at $1/1M, 20 out at $2/1M.
    expect(m.perBooking.cost).toBeCloseTo((data.aiCalls.length * 140e-6) / 2, 12);
  });
});
