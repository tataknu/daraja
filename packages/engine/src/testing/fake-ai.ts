// A scripted AI for tests: queue the classifications a test expects, translations are tagged
// with the target language so tests can see what was translated.
import type {
  Ai,
  AiUsage,
  GuestClassification,
  HostClassification,
  ReviewAnalysis,
  UsageListener,
} from "../ai/types";

type GuestOverrides = Partial<Omit<GuestClassification, "entities">> & {
  entities?: Partial<GuestClassification["entities"]>;
};

/** A guest classification; by default a complete German request for 3 people on Sat 10 Oct, morning. */
export function guestSays({ entities, ...rest }: GuestOverrides = {}): GuestClassification {
  return {
    intent: "booking_request",
    confidence: 0.95,
    language: "de",
    missing: [],
    translation_for_noor: "Mgeni anataka kutembelea shamba.",
    feedback_text: null,
    ...rest,
    entities: { date_from: "2026-10-10", date_to: null, party_size: 3, slot: "09:00", ...entities },
  };
}

export function noorSays(overrides: Partial<HostClassification> = {}): HostClassification {
  return {
    intent: "approve",
    booking: "B14",
    confidence: 0.9,
    proposed_date: null,
    answer_text_for_guest: null,
    ...overrides,
  };
}

/** A review analysis; by default a positive German review that loved the roasting. */
export function reviewSays(overrides: Partial<ReviewAnalysis> = {}): ReviewAnalysis {
  return {
    language: "de",
    translation_en: "We loved roasting the beans ourselves.",
    sentiment: "positive",
    points: [
      {
        aspect: "coffee_process",
        polarity: "loved",
        quote: "Bohnen selbst zu rösten",
        quote_en: "roasting the beans ourselves",
      },
    ],
    ideas: [],
    ...overrides,
  };
}

/** Every fake call reports this usage, so metering can be tested. */
export const FAKE_USAGE = {
  input_tokens: 100,
  cached_tokens: 0,
  output_tokens: 20,
  reasoning_tokens: 0,
  latency_ms: 5,
};

export function fakeAi() {
  const guest: (GuestClassification | Error)[] = [];
  const host: (HostClassification | Error)[] = [];
  const reviews: (ReviewAnalysis | Error)[] = [];
  const next = <T>(queue: (T | Error)[], what: string): T => {
    const item = queue.shift();
    if (!item) throw new Error(`fakeAi: no scripted ${what}`);
    if (item instanceof Error) throw item;
    return item;
  };

  const make = (listener?: UsageListener): Ai => {
    const used = <T>(task: string, value: T): T => {
      const u: AiUsage = { task, model: "fake-model", ok: true, ...FAKE_USAGE };
      listener?.(u);
      return value;
    };
    return {
      model: "fake-model",
      withUsage: (l) => make(l),
      classifyGuest: async () => used("classify_guest", next(guest, "guest classification")),
      classifyHost: async () => used("classify_host", next(host, "host classification")),
      translate: async (text, from, to) =>
        from === to ? text : used("translate", `[${to}] ${text}`),
      analyzeFeedback: async (text) =>
        used("analyze_feedback", {
          translation_en: `[en] ${text}`,
          themes: ["roasting"],
          sentiment: "positive" as const,
        }),
      summarizeFeedback: async () =>
        used("summarize_feedback", {
          lines: ["Wageni wanapenda kuchoma kahawa.", "Boresha: alama barabarani."],
        }),
      analyzeReview: async () =>
        used("analyze_review", reviews.length ? next(reviews, "review analysis") : reviewSays()),
      groupIdeas: async (ideas) =>
        used("group_ideas", {
          groups: ideas.map((i) => ({ label_en: i.idea, label_sw: i.idea, ids: [i.id] })),
        }),
      writeInsightsSms: async () =>
        used("write_insights_sms", {
          lines_sw: ["Wageni wanapenda kuchoma kahawa."],
          lines_en: ["Visitors love roasting coffee."],
        }),
    };
  };
  const ai = make();
  return {
    ai,
    /** Queue what the AI will say about the next guest message. */
    guest: (c: GuestClassification | Error) => guest.push(c),
    /** Queue what the AI will make of Noor's next free-text reply. */
    host: (c: HostClassification | Error) => host.push(c),
    /** Queue the analysis of the next review (default: reviewSays()). */
    review: (r: ReviewAnalysis | Error) => reviews.push(r),
  };
}
