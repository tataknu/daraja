// What the system costs and how it behaves, computed from the rows Daraja stores: AI calls, tokens,
// latency and cost per booking; hand-offs to the host; replies read without AI; time to her
// answer; referrals. Pure and browser-safe (no IO, no Node): the Metrics tab loads the rows and
// calls computeMetrics, tests pass literals.
//
// Units: tokens as the API reports them (cached ⊂ input, reasoning ⊂ output), times in ms, cost in
// USD. Shares and rates are 0–1. Null means there is nothing to measure yet, or no price.
import type { BookingStatus } from "./booking-state";
import { callCost, priceOf, type Pricing } from "./pricing";

export {
  PRICES,
  PRICING_SOURCE,
  callCost,
  priceOf,
  type ModelPrice,
  type Pricing,
} from "./pricing";

// --- Input: the columns used from each table -----------------------------------------------------

/** ai_calls: one model call. */
export interface AiCallRow {
  task: string;
  model: string;
  source: string;
  message_id: string | null;
  booking_id: number | null;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  latency_ms: number;
  ok: boolean;
}

export interface BookingRow {
  id: number;
  /** A BookingStatus (booking-state.ts). */
  status: string;
  /** The contact whose referral brought this booking in. */
  referred_by?: string | null | undefined;
}

/** messages: every email and SMS, both directions. */
export interface MessageRow {
  id: string;
  direction: string;
  channel: string;
  booking_id?: number | null | undefined;
}

/** decisions: what the assistant, or the keypad parser, decided about an inbound message. */
export interface DecisionRow {
  message_id: string | null;
  model: string | null;
  /** What the message was taken to mean, by the AI or the parser (READBACK_ANSWER_INTENTS…). */
  intent: string | null;
  action_taken: string | null;
}

/** pending_prompts: questions sent to the host, and how each was resolved. */
export interface PromptRow {
  booking_id: number | null;
  kind: string;
  sent_at: string;
  resolved_at: string | null;
  resolution: string | null;
}

export interface MetricsInput {
  aiCalls: readonly AiCallRow[];
  bookings: readonly BookingRow[];
  messages: readonly MessageRow[];
  decisions: readonly DecisionRow[];
  prompts: readonly PromptRow[];
  /** Prices per model (pricing.ts). Without them every cost is null. */
  pricing?: Pricing | undefined;
}

// --- What the decision log and the prompt resolutions mean (guest.ts, host.ts) -------------------

/**
 * Decision actions meaning a message was handed to the host instead of acted on, because the AI
 * was unsure, the message was not for the farm, or the AI failed. forwarded_to_noor: a guest
 * message below CONF_MIN, or of intent unknown, which is also how the AI marks spam and mail not
 * meant for the farm, so a hand-off can follow a sure reading. asked_to_rephrase: the host's free
 * text was unclear or named no waiting booking. Actions starting with AI_ERROR ("ai_error: …"):
 * the model call failed. Not counted: request_sent_to_noor, modified_sent_to_noor and
 * question_forwarded go to the host by design (she decides every booking and answers questions),
 * so routed_to_human alone says nothing about the AI.
 */
export const HANDOFF_ACTIONS: readonly string[] = ["forwarded_to_noor", "asked_to_rephrase"];
export const AI_ERROR = "ai_error";

/** This decision handed the message to the host: AI unsure, not for the farm, or AI error. */
export function isHandoff(action: string | null): boolean {
  return !!action && (HANDOFF_ACTIONS.includes(action) || action.startsWith(AI_ERROR));
}

/** The decision model of host replies read by the keypad parser (host-replies.ts), not the AI. */
export const KEYPAD_MODEL = "regex";

/**
 * Decision intents of the host's 1 (yes) or 2 (no) to a read-back (host.ts resolveReadback). The
 * keypad parser reads them, but they only confirm what the AI made of her free text, so they are
 * left out of the share of replies read without AI: otherwise every reply the AI read would bring
 * one "without AI" along, and all-free-text use would still show 50%.
 */
export const READBACK_ANSWER_INTENTS: readonly string[] = ["confirm_readback", "reject_readback"];

/**
 * Statuses a booking reaches only after it was sent to the host for a decision (booking-state.ts:
 * through PENDING_NOOR). INCOMPLETE never was; CANCELLED may or may not have been, so a cancelled
 * booking counts as sent only with an approve_booking prompt.
 */
export const SENT_TO_HOST_STATUSES: readonly string[] = [
  "PENDING_NOOR",
  "CONFIRMED",
  "DECLINED",
  "COUNTER_OFFERED",
  "EXPIRED",
  "VISITED",
  "FEEDBACK_REQUESTED",
  "CLOSED",
] satisfies BookingStatus[];

/** The prompt kind of a booking request sent to the host for her yes or no (guest.ts). */
export const APPROVE_PROMPT = "approve_booking";

/**
 * How an approve_booking prompt is resolved when the host's reply decides it: approved (1),
 * declined (2), other_day (3: she will name another day) and counter_offered (she named a date).
 * Not her answer: expired (no answer within 48 h), superseded (the guest changed the request),
 * cancelled_by_guest, accepted.
 */
export const HOST_ANSWER_RESOLUTIONS: readonly string[] = [
  "approved",
  "declined",
  "other_day",
  "counter_offered",
];

// --- Output --------------------------------------------------------------------------------------

/** Token use, cost and latency of a set of AI calls. */
export interface Usage {
  calls: number;
  /** Calls that failed (ok = false). */
  failed: number;
  /** failed ÷ calls. */
  failureRate: number | null;
  inputTokens: number;
  /** Input tokens served from the prompt cache: part of inputTokens, billed cheaper. */
  cachedTokens: number;
  /** Output tokens, reasoning included. */
  outputTokens: number;
  /** Hidden reasoning tokens: part of outputTokens, billed as output. */
  reasoningTokens: number;
  /** inputTokens + outputTokens. Cached and reasoning tokens are already inside them. */
  tokens: number;
  /**
   * USD: (input − cached) × input price + cached × cached-input price + output × output price,
   * summed over the calls whose model has a price. Null without pricing, or when no call has one.
   */
  cost: number | null;
  /** Calls whose model has no price. When > 0, `cost` leaves them out: it is a lower bound. */
  unpricedCalls: number;
  /**
   * Wall time of each successful call, from request to the last streamed token (ms): mean, median,
   * 95th percentile. Failed calls are left out: they end in an error or a timeout, not an answer.
   */
  latency: { avg: number | null; p50: number | null; p95: number | null };
}

export interface UsageGroup extends Usage {
  /** The task (the structured-output schema name) or the source (inbound, timers, insights, import). */
  key: string;
  /** tokens ÷ all calls' tokens. */
  tokenShare: number | null;
  /** cost ÷ all calls' cost. Null when costs are unknown. */
  costShare: number | null;
}

export interface Metrics {
  /** Every AI call. Failure rate: failed ÷ calls. */
  totals: Usage;
  /**
   * All AI spend and all outbound messages ÷ the bookings sent to the host. A guest's question,
   * spam, feedback, an unfinished request or an AI error opens a booking too (INCOMPLETE, to keep
   * the conversation together), so counting every booking would count those as bookings.
   */
  perBooking: {
    /**
     * The denominator: bookings sent to the host for a decision (an approve_booking prompt, or a
     * status in SENT_TO_HOST_STATUSES) that have at least one logged AI call, tied by the call's
     * booking_id or by its message's.
     */
    bookings: number;
    /** Bookings with logged AI calls that never reached the host: not counted, but their calls are. */
    notSent: number;
    /**
     * Bookings with no logged AI call: from before calls were logged, since every booking starts
     * with a guest message the AI reads. Left out with their messages, which would otherwise count
     * as free.
     */
    withoutAiCalls: number;
    /** totals.calls ÷ bookings: every AI call, whatever it was for. */
    aiCalls: number | null;
    /** totals.tokens ÷ bookings. */
    tokens: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    /** totals.cost ÷ bookings: all AI spend. Null without a price. */
    cost: number | null;
    /** Outbound SMS ÷ bookings (only the host gets SMS), except those on a left-out booking. */
    smsToHost: number | null;
    /** Outbound emails ÷ bookings, except those on a left-out booking. */
    emailsToGuest: number | null;
  };
  /** By task, most tokens first. */
  byTask: UsageGroup[];
  /** By source (inbound, timers, insights, import), most tokens first. */
  bySource: UsageGroup[];
  /**
   * Hand-off rate: inbound messages the AI read that were handed to the host because the AI was
   * unsure, the message was not for the farm, or the AI failed (isHandoff) ÷ inbound messages the
   * AI read (with a decision by a model other than the keypad parser). `errors` counts the failed
   * calls among `handedOff`.
   */
  handoff: { aiRead: number; handedOff: number; errors: number; rate: number | null };
  /**
   * Replies read without AI: the host's replies (inbound SMS: she answers by SMS, guests write by
   * email) whose decisions all came from the keypad parser ÷ her replies with a decision. Her
   * answers to a read-back (READBACK_ANSWER_INTENTS) are in neither, only in `readbackAnswers`.
   */
  keypad: { hostReplies: number; withoutAi: number; readbackAnswers: number; share: number | null };
  /**
   * Time to the host's answer: resolved_at − sent_at of the approve_booking prompts her reply
   * resolved (HOST_ANSWER_RESOLUTIONS), in ms: median and 90th percentile. A free-text answer
   * counts once she confirms the read-back, when it takes effect.
   */
  timeToAnswer: {
    answered: number;
    /** approve_booking prompts that expired unanswered. */
    expired: number;
    /** approve_booking prompts still open. */
    waiting: number;
    p50: number | null;
    p90: number | null;
  };
  /**
   * Bookings brought in by a referral (referred_by set) among perBooking's bookings (sent to the
   * host, with logged AI calls), and their share of them: the same denominator as cost per booking.
   */
  referrals: { bookings: number; referred: number; share: number | null };
  /** Models seen in ai_calls. */
  models: string[];
  /** Models without a price: their calls have no cost. */
  unpricedModels: string[];
}

// --- Computation ---------------------------------------------------------------------------------

/**
 * The p-quantile (p from 0 to 1) of `values`, interpolated linearly between the closest ranks
 * (numpy's default; the median of 1, 2, 3, 4 is 2.5). Null when there are no values.
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = sorted[Math.floor(rank)]!;
  const hi = sorted[Math.ceil(rank)]!;
  return lo + (hi - lo) * (rank - Math.floor(rank));
}

const ratio = (n: number, d: number) => (d > 0 ? n / d : null);
const mean = (v: readonly number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** Milliseconds since the epoch; tolerates Postgres' microseconds, which some browsers reject. */
const toMs = (ts: string) => Date.parse(ts.replace(/(\.\d{3})\d+/, "$1"));

function usageOf(calls: readonly AiCallRow[], pricing: Pricing | undefined): Usage {
  let input = 0;
  let cached = 0;
  let output = 0;
  let reasoning = 0;
  let failed = 0;
  let cost = 0;
  let unpriced = 0;
  const latencies: number[] = [];
  for (const c of calls) {
    input += c.input_tokens;
    cached += c.cached_tokens;
    output += c.output_tokens;
    reasoning += c.reasoning_tokens;
    if (c.ok) latencies.push(c.latency_ms);
    else failed++;
    const price = pricing ? priceOf(c.model, pricing) : null;
    if (price) cost += callCost(c, price);
    else unpriced++;
  }
  return {
    calls: calls.length,
    failed,
    failureRate: ratio(failed, calls.length),
    inputTokens: input,
    cachedTokens: cached,
    outputTokens: output,
    reasoningTokens: reasoning,
    tokens: input + output,
    cost: !pricing || (calls.length > 0 && unpriced === calls.length) ? null : cost,
    unpricedCalls: unpriced,
    latency: {
      avg: mean(latencies),
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
    },
  };
}

function groupUsage(
  calls: readonly AiCallRow[],
  key: (c: AiCallRow) => string,
  total: Usage,
  pricing: Pricing | undefined,
): UsageGroup[] {
  const groups = new Map<string, AiCallRow[]>();
  for (const c of calls) push(groups, key(c), c);
  return [...groups]
    .map(([k, rows]) => {
      const u = usageOf(rows, pricing);
      return {
        key: k,
        ...u,
        tokenShare: ratio(u.tokens, total.tokens),
        costShare: u.cost !== null && total.cost ? u.cost / total.cost : null,
      };
    })
    .sort((a, b) => b.tokens - a.tokens || a.key.localeCompare(b.key));
}

export function computeMetrics(input: MetricsInput): Metrics {
  const { aiCalls, bookings, messages, decisions, prompts, pricing } = input;
  const totals = usageOf(aiCalls, pricing);

  // Bookings with a logged AI call: by the call's booking, else by its message's booking.
  const bookingIds = new Set(bookings.map((b) => b.id));
  const messageBooking = new Map(messages.map((m) => [m.id, m.booking_id]));
  const metered = new Set<number>();
  for (const c of aiCalls) {
    const id = c.booking_id ?? (c.message_id ? messageBooking.get(c.message_id) : null);
    if (id != null && bookingIds.has(id)) metered.add(id);
  }
  // Per booking: all AI spend and all outbound messages ÷ the bookings sent to the host. Bookings
  // without a logged call (from before calls were logged) are left out, and so are their messages.
  const asked = new Set(prompts.flatMap((p) => (p.kind === APPROVE_PROMPT ? [p.booking_id] : [])));
  const sentToHost = (b: BookingRow) => SENT_TO_HOST_STATUSES.includes(b.status) || asked.has(b.id);
  const counted = bookings.filter((b) => metered.has(b.id) && sentToHost(b));
  const perBookingOf = (n: number) => ratio(n, counted.length);
  const outbound = messages.filter(
    (m) => m.direction === "out" && (m.booking_id == null || metered.has(m.booking_id)),
  );

  // Decisions by message: one inbound message can log several (side feedback, then the action).
  const decisionsOf = new Map<string, DecisionRow[]>();
  for (const d of decisions) if (d.message_id) push(decisionsOf, d.message_id, d);

  let aiRead = 0;
  let handedOff = 0;
  let errors = 0;
  for (const ds of decisionsOf.values()) {
    if (!ds.some((d) => d.model !== null && d.model !== KEYPAD_MODEL)) continue;
    aiRead++;
    if (ds.some((d) => isHandoff(d.action_taken))) handedOff++;
    if (ds.some((d) => d.action_taken?.startsWith(AI_ERROR))) errors++;
  }

  let hostReplies = 0;
  let withoutAi = 0;
  let readbackAnswers = 0;
  for (const m of messages) {
    const ds = decisionsOf.get(m.id);
    if (m.direction !== "in" || m.channel !== "sms" || !ds) continue;
    if (ds.some((d) => READBACK_ANSWER_INTENTS.includes(d.intent ?? ""))) {
      readbackAnswers++;
      continue;
    }
    hostReplies++;
    if (ds.every((d) => d.model === KEYPAD_MODEL)) withoutAi++;
  }

  const approvals = prompts.filter((p) => p.kind === APPROVE_PROMPT);
  const waits = approvals.flatMap((p) => {
    if (!p.resolved_at || !HOST_ANSWER_RESOLUTIONS.includes(p.resolution ?? "")) return [];
    const ms = toMs(p.resolved_at) - toMs(p.sent_at);
    return Number.isFinite(ms) && ms >= 0 ? [ms] : [];
  });

  const referred = counted.filter((b) => !!b.referred_by).length;
  const models = [...new Set(aiCalls.map((c) => c.model))].sort();

  return {
    totals,
    perBooking: {
      bookings: counted.length,
      notSent: metered.size - counted.length,
      withoutAiCalls: bookings.length - metered.size,
      aiCalls: perBookingOf(totals.calls),
      tokens: perBookingOf(totals.tokens),
      inputTokens: perBookingOf(totals.inputTokens),
      outputTokens: perBookingOf(totals.outputTokens),
      cost: totals.cost === null ? null : perBookingOf(totals.cost),
      smsToHost: perBookingOf(outbound.filter((m) => m.channel === "sms").length),
      emailsToGuest: perBookingOf(outbound.filter((m) => m.channel === "email").length),
    },
    byTask: groupUsage(aiCalls, (c) => c.task, totals, pricing),
    bySource: groupUsage(aiCalls, (c) => c.source, totals, pricing),
    handoff: { aiRead, handedOff, errors, rate: ratio(handedOff, aiRead) },
    keypad: { hostReplies, withoutAi, readbackAnswers, share: ratio(withoutAi, hostReplies) },
    timeToAnswer: {
      answered: waits.length,
      expired: approvals.filter((p) => p.resolution === "expired").length,
      waiting: approvals.filter((p) => !p.resolved_at).length,
      p50: percentile(waits, 0.5),
      p90: percentile(waits, 0.9),
    },
    referrals: { bookings: counted.length, referred, share: ratio(referred, counted.length) },
    models,
    unpricedModels: models.filter((m) => !pricing || !priceOf(m, pricing)),
  };
}
