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
import { fakeAi, guestSays, noorSays } from "./testing/fake-ai";
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
const decision = (
  message_id: string | null,
  model: string,
  action_taken: string,
  intent: string | null = null,
): DecisionRow => ({ message_id, model, intent, action_taken });
/** An ISO time `min` minutes after 08:00 on 5 Oct 2026. */
const at = (min: number) => new Date(Date.UTC(2026, 9, 5, 8) + min * MIN).toISOString();
const prompt = (
  kind: string,
  sentMin: number,
  resolvedMin: number | null,
  resolution: string | null,
  booking_id: number | null = null,
): PromptRow => ({
  booking_id,
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
  it("divides all AI spend and all messages by the bookings sent to Noor", () => {
    const m = computeMetrics({
      ...EMPTY,
      bookings: [
        { id: 13, status: "CONFIRMED", referred_by: null }, // from before AI calls were logged
        { id: 14, status: "CONFIRMED", referred_by: null },
        { id: 15, status: "PENDING_NOOR", referred_by: "contact-anna" },
        { id: 16, status: "INCOMPLETE", referred_by: "contact-anna" }, // a question: never sent
        { id: 17, status: "CANCELLED", referred_by: null }, // cancelled after Noor was asked
        { id: 18, status: "CANCELLED", referred_by: null }, // cancelled before it was complete
      ],
      prompts: [
        prompt("approve_booking", 0, 5, "cancelled_by_guest", 17),
        prompt("answer_question", 0, null, null, 16),
      ],
      messages: [
        msg("g14", "in", "email"), // inbound messages carry no booking
        msg("g15", "in", "email", 15),
        msg("o1", "out", "sms", 14),
        msg("o2", "out", "sms", 14),
        msg("o3", "out", "email", 14),
        msg("o4", "out", "sms", 15),
        msg("o5", "out", "email", 15),
        msg("o6", "out", "sms"), // "please rephrase" to Noor: about no booking, still counted
        msg("o7", "out", "sms", 13), // on the booking left out: not counted
        msg("o8", "out", "email", 16), // the answer to a question: counted
      ],
      aiCalls: [
        call({ booking_id: 14, message_id: "g14", input_tokens: 400, output_tokens: 100 }),
        call({ booking_id: 14 }),
        call({ message_id: "g15", input_tokens: 300, output_tokens: 60 }), // via its message
        call({ booking_id: 16, input_tokens: 200, output_tokens: 40 }), // the question
        call({ booking_id: 17 }),
        call({ booking_id: 18 }),
        call({ source: "insights", input_tokens: 1000, output_tokens: 200 }), // on no booking
        call({ booking_id: 99, input_tokens: 50, output_tokens: 10 }), // not a known booking
      ],
      pricing: PRICES,
    });

    // Sent to Noor, with logged calls: 14, 15 and 17 (an approve_booking prompt). Not 16 or 18.
    const tokens = 500 + 120 + 360 + 240 + 120 + 120 + 1200 + 60;
    expect(m.totals).toMatchObject({ calls: 8, tokens });
    expect(m.perBooking).toMatchObject({
      bookings: 3,
      notSent: 2,
      withoutAiCalls: 1,
      aiCalls: 8 / 3,
      tokens: tokens / 3,
      inputTokens: 2250 / 3,
      outputTokens: 470 / 3,
      smsToHost: 4 / 3,
      emailsToGuest: 3 / 3,
    });
    expect(m.perBooking.cost).toBeCloseTo(m.totals.cost! / 3, 15);
    // The same bookings: 15 was referred; 16 was too, but never reached Noor.
    expect(m.referrals).toEqual({ bookings: 3, referred: 1, share: 1 / 3 });
  });

  it("counts a hand-off when the AI was unsure, the message wasn't for the farm, or the AI failed", () => {
    const m = computeMetrics({
      ...EMPTY,
      messages: [
        ...["g1", "g2", "g3", "g4"].map((id) => msg(id, "in", "email")),
        ...["h1", "h2", "h3", "h4", "h5", "h6", "h7"].map((id) => msg(id, "in", "sms")),
      ],
      decisions: [
        decision("g1", "gpt-5.4-mini", "request_sent_to_noor"), // routed to Noor by design
        decision("g2", "gpt-5.4-mini", "side_feedback_saved"),
        decision("g2", "gpt-5.4-mini", "forwarded_to_noor"), // unsure or spam: counted once
        decision("g3", "gpt-5.4-mini", "ai_error: Error: gateway timeout"), // failed
        decision("g4", "gpt-5.4-mini", "question_forwarded"), // routed by design
        decision("h1", "regex", "approve", "approve"), // keypad: the AI never read it
        decision("h2", "gpt-5.4-mini", "asked_to_rephrase"), // unclear
        decision("h3", "gpt-5.4-mini", "readback_sent", "approve"), // free text, read back
        decision("h4", "regex", "asked_which_booking", "unknown"), // routed, but no AI involved
        decision("h6", "regex", "approve", "confirm_readback"), // "1" to h3's read-back
        decision("h7", "regex", "readback_cancelled", "reject_readback"), // "2" to a read-back
        decision(null, "gpt-5.4-mini", "forwarded_to_noor"), // no message: ignored
        // h5 has no decision: not counted
      ],
    });

    expect(m.handoff).toEqual({ aiRead: 6, handedOff: 3, errors: 1, rate: 0.5 });
    // h1 and h4 of h1–h4: the answers to read-backs belong to the free text the AI read.
    expect(m.keypad).toEqual({ hostReplies: 4, withoutAi: 2, readbackAnswers: 2, share: 0.5 });
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
          booking_id: 14,
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
      notSent: 0,
      withoutAiCalls: 0,
      aiCalls: null,
      cost: null,
      smsToHost: null,
    });
    expect(m.handoff.rate).toBeNull();
    expect(m.keypad).toEqual({ hostReplies: 0, withoutAi: 0, readbackAnswers: 0, share: null });
    expect(m.timeToAnswer).toEqual({ answered: 0, expired: 0, waiting: 0, p50: null, p90: null });
    expect(m.referrals.share).toBeNull();
    expect([m.byTask, m.bySource, m.models, m.unpricedModels]).toEqual([[], [], [], []]);

    expect(computeMetrics({ ...EMPTY, pricing: PRICES }).totals.cost).toBe(0);
  });

  it("agrees with what the engine logs: keypad and free-text replies, a guest handed to Noor", async () => {
    let now = Date.parse("2026-10-05T08:00:00Z");
    const clock = () => new Date(now);
    const { repo, data } = memoryRepo(clock);
    const script = fakeAi();
    const engine = createEngine({ repo, ai: script.ai, now: clock });
    const email = (sender: string, text: string, id: string) =>
      engine.handleInbound({ channel: "email", sender, text, provider_msg_id: id });
    const noor = (text: string, id: string) =>
      engine.handleInbound({ channel: "sms", sender: NOOR_PHONE, text, provider_msg_id: id });

    // B14: a request Noor approves with her keypad 90 minutes later.
    script.guest(guestSays());
    await email("lena@example.de", "Hallo! Wir sind 3 Personen, Samstag morgens.", "g1");
    now += 90 * MIN;
    await noor("1", "n1");
    // B15: a guest the AI is unsure of, handed to Noor: never a booking request.
    script.guest(guestSays({ intent: "unknown", confidence: 0.4 }));
    await email("ana@example.es", "Hola, ¿se puede ir con un perro?", "g2");
    // B16: a request Noor answers in free text 30 minutes later, then confirms the read-back.
    script.guest(guestSays({ entities: { date_from: "2026-10-11" } }));
    await email("tom@example.com", "Three of us on Sunday morning, please.", "g3");
    now += 30 * MIN;
    script.host(noorSays({ intent: "approve", booking: "B16", confidence: 0.9 }));
    await noor("Sawa, wakaribishwe.", "n2");
    await noor("1", "n3");

    const m = computeMetrics({
      aiCalls: data.aiCalls,
      bookings: data.bookings,
      messages: data.messages,
      decisions: data.decisions.map((d) => decision(d.message_id, d.model, d.action, d.intent)),
      prompts: data.prompts,
      pricing: { "fake-model": { input: 1, cachedInput: 0.1, output: 2 } },
    });

    expect(data.bookings.map((b) => `B${b.id} ${b.status}`)).toEqual([
      "B14 CONFIRMED",
      "B15 INCOMPLETE",
      "B16 CONFIRMED",
    ]);
    // The AI read g1, g2, g3 and n2; g2 went to Noor.
    expect(m.handoff).toEqual({ aiRead: 4, handedOff: 1, errors: 0, rate: 0.25 });
    // n1 by keypad, n2 by the AI; n3 only answers n2's read-back, so it is neither.
    expect(m.keypad).toEqual({ hostReplies: 2, withoutAi: 1, readbackAnswers: 1, share: 0.5 });
    expect(m.timeToAnswer).toMatchObject({ answered: 2, waiting: 0 });
    expect(m.timeToAnswer.p50).toBeCloseTo(60 * MIN); // waits of 90 and 30 minutes
    // B14 and B16 reached Noor; B15 didn't, but its AI calls count.
    expect(m.perBooking).toMatchObject({ bookings: 2, notSent: 1, withoutAiCalls: 0 });
    expect(m.perBooking.aiCalls).toBe(data.aiCalls.length / 2);
    // Each fake call: 100 tokens in at $1/1M, 20 out at $2/1M.
    expect(m.perBooking.cost).toBeCloseTo((data.aiCalls.length * 140e-6) / 2, 12);
  });
});
