// A scripted AI for tests: queue the classifications a test expects, translations are tagged
// with the target language so tests can see what was translated.
import type { Ai, GuestClassification, HostClassification } from "../ai/types";

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

export function fakeAi() {
  const guest: (GuestClassification | Error)[] = [];
  const host: (HostClassification | Error)[] = [];
  const next = <T>(queue: (T | Error)[], what: string): T => {
    const item = queue.shift();
    if (!item) throw new Error(`fakeAi: no scripted ${what}`);
    if (item instanceof Error) throw item;
    return item;
  };

  const ai: Ai = {
    model: "fake-model",
    classifyGuest: async () => next(guest, "guest classification"),
    classifyHost: async () => next(host, "host classification"),
    translate: async (text, from, to) => (from === to ? text : `[${to}] ${text}`),
    analyzeFeedback: async (text) => ({
      translation_en: `[en] ${text}`,
      themes: ["roasting"],
      sentiment: "positive",
    }),
    summarizeFeedback: async () => ({
      lines: ["Wageni wanapenda kuchoma kahawa.", "Boresha: alama barabarani."],
    }),
  };
  return {
    ai,
    /** Queue what the AI will say about the next guest message. */
    guest: (c: GuestClassification | Error) => guest.push(c),
    /** Queue what the AI will make of Noor's next free-text reply. */
    host: (c: HostClassification | Error) => host.push(c),
  };
}
