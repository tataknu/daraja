// The labelled datasets: what a careful reader of each message expects the AI to extract. A label
// is one value, or { any_of: [...] } where the message is genuinely ambiguous ("next Saturday").
// The JSON files are hand-written, so they are validated here: a typo in a label must fail loudly,
// not quietly count as a model error.
import type { GuestIntent, HostIntent } from "@daraja/engine/ai";

export type OneOf<T> = T | { any_of: T[] };

export const GUEST_INTENTS: readonly GuestIntent[] = [
  "booking_request",
  "modify",
  "cancel",
  "question",
  "feedback",
  "unknown",
];
export const HOST_INTENTS: readonly HostIntent[] = [
  "approve",
  "decline",
  "propose_other_date",
  "answer_question",
  "unknown",
];
/** The fields a booking request needs; the prompt asks the model to list the unknown ones. */
export const MISSING_FIELDS = ["date_from", "party_size"] as const;
export type MissingField = (typeof MISSING_FIELDS)[number];
/** Kinds of question the engine can be waiting for Noor to answer (types.ts PromptKind). */
export const PROMPT_KINDS = [
  "approve_booking",
  "answer_question",
  "confirm_cancellation",
  "confirm_readback",
  "ask_other_date",
] as const;
export type PromptKind = (typeof PROMPT_KINDS)[number];

export interface GuestCase {
  id: string;
  text: string;
  /** The guest's open booking as guest.ts describe() shows it to the model, or "none". */
  booking: string;
  labels: {
    intent: OneOf<GuestIntent>;
    /** ISO 639-1. Omitted when the text has no language (gibberish): not scored. */
    language?: OneOf<string>;
    /** Present for booking requests and changes, where the engine acts on them. */
    entities?: {
      date_from: OneOf<string | null>;
      party_size: OneOf<number | null>;
      slot: OneOf<string | null>;
    };
    missing?: OneOf<MissingField[]>;
  };
  note?: string;
}

export interface HostCase {
  id: string;
  text: string;
  /** Noor's open prompts when she sends the text; rendered for the model like host.ts does. */
  open: { booking: string; kind: PromptKind }[];
  labels: {
    intent: OneOf<HostIntent>;
    booking: OneOf<string | null>;
    /** Present when the reply proposes another day. */
    proposed_date?: OneOf<string | null>;
  };
  note?: string;
}

export interface Dataset<C> {
  /** The date the model is told it is today; relative dates in the labels resolve from it. */
  today: string;
  /** Tour slots (morning, afternoon), as in the farm settings. */
  slots: string[];
  cases: C[];
}

/** The open-prompts block of the classify_host prompt, exactly as host.ts readFreeText builds it. */
export function renderOpenPrompts(open: HostCase["open"]): string {
  return open.length ? open.map((p) => `${p.booking} (${p.kind})`).join("\n") : "(none)";
}

export function options<T>(label: OneOf<T>): T[] {
  return isAnyOf(label) ? label.any_of : [label];
}

function isAnyOf<T>(label: OneOf<T>): label is { any_of: T[] } {
  return typeof label === "object" && label !== null && !Array.isArray(label) && "any_of" in label;
}

// ---- validation ---------------------------------------------------------------------------------

type Check<T> = (v: unknown, path: string) => T;

const fail = (path: string, what: string): never => {
  throw new Error(`${path}: ${what}`);
};
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const str: Check<string> = (v, p) => (typeof v === "string" && v.trim() ? v : fail(p, "text"));
const int: Check<number> = (v, p) =>
  typeof v === "number" && Number.isInteger(v) && v > 0 ? v : fail(p, "positive integer");
const nullable =
  <T>(c: Check<T>): Check<T | null> =>
  (v, p) =>
    v === null ? null : c(v, p);
const arrayOf =
  <T>(c: Check<T>): Check<T[]> =>
  (v, p) =>
    Array.isArray(v) ? v.map((x, i) => c(x, `${p}[${i}]`)) : fail(p, "array");
const enumOf =
  <T extends string>(values: readonly T[]): Check<T> =>
  (v, p) =>
    values.includes(v as T) ? (v as T) : fail(p, `one of ${values.join(", ")}, got ${String(v)}`);
const oneOf =
  <T>(c: Check<T>): Check<OneOf<T>> =>
  (v, p) => {
    if (!isRecord(v) || !("any_of" in v)) return c(v, p);
    const any = arrayOf(c)(v["any_of"], `${p}.any_of`);
    return any.length >= 2 ? { any_of: any } : fail(p, "any_of needs two or more options");
  };
const record = (v: unknown, p: string, keys: string[]): Record<string, unknown> => {
  if (!isRecord(v)) return fail(p, "object");
  const extra = Object.keys(v).filter((k) => !keys.includes(k));
  return extra.length ? fail(p, `unexpected key(s) ${extra.join(", ")}`) : v;
};

export const isoDate: Check<string> = (v, p) => {
  const s = str(v, p);
  const d = new Date(`${s}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && d.toISOString().startsWith(s)
    ? s
    : fail(p, `ISO date, got ${s}`);
};
const lang: Check<string> = (v, p) =>
  typeof v === "string" && /^[a-z]{2}$/.test(v) ? v : fail(p, "ISO 639-1 code");
const bookingCode: Check<string> = (v, p) =>
  typeof v === "string" && /^B\d+$/.test(v) ? v : fail(p, "booking code like B14");
// Mirrors guest.ts describe(): "B14 status=PENDING_NOOR date=2026-10-10 slot=09:00 party=3".
const bookingContext: Check<string> = (v, p) =>
  v === "none" ||
  (typeof v === "string" &&
    /^B\d+ status=[A-Z_]+ date=(\d{4}-\d{2}-\d{2}|\?) slot=(\d{2}:\d{2}|\?) party=(\d+|\?)$/.test(
      v,
    ))
    ? (v as string)
    : fail(p, `"none" or a booking as guest.ts describe() writes it`);

function header(raw: unknown, file: string) {
  const top = record(raw, file, ["today", "slots", "cases"]);
  return {
    today: isoDate(top["today"], `${file}.today`),
    slots: arrayOf(str)(top["slots"], `${file}.slots`),
    rawCases: (Array.isArray(top["cases"])
      ? top["cases"]
      : fail(`${file}.cases`, "array")) as unknown[],
  };
}

function uniqueIds<C extends { id: string }>(cases: C[], file: string): C[] {
  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id)) fail(file, `duplicate id ${c.id}`);
    if (!/^[a-z0-9-]+$/.test(c.id)) fail(file, `id ${c.id} must be lowercase-kebab`);
    seen.add(c.id);
  }
  return cases;
}

export function parseGuestDataset(raw: unknown, file = "guest.json"): Dataset<GuestCase> {
  const { today, slots, rawCases } = header(raw, file);
  const slot: Check<string> = (v, p) =>
    slots.includes(v as string) ? (v as string) : fail(p, "slot");
  const cases = rawCases.map((rc: unknown, i: number): GuestCase => {
    const p = `${file}.cases[${i}]`;
    const c = record(rc, p, ["id", "text", "booking", "labels", "note"]);
    const l = record(c["labels"], `${p}.labels`, ["intent", "language", "entities", "missing"]);
    const labels: GuestCase["labels"] = {
      intent: oneOf(enumOf(GUEST_INTENTS))(l["intent"], `${p}.labels.intent`),
    };
    if (l["language"] !== undefined) labels.language = oneOf(lang)(l["language"], `${p}.language`);
    if (l["entities"] !== undefined) {
      const e = record(l["entities"], `${p}.entities`, ["date_from", "party_size", "slot"]);
      labels.entities = {
        date_from: oneOf(nullable(isoDate))(e["date_from"], `${p}.entities.date_from`),
        party_size: oneOf(nullable(int))(e["party_size"], `${p}.entities.party_size`),
        slot: oneOf(nullable(slot))(e["slot"], `${p}.entities.slot`),
      };
    }
    if (l["missing"] !== undefined)
      labels.missing = oneOf(arrayOf(enumOf(MISSING_FIELDS)))(l["missing"], `${p}.missing`);
    if ((labels.entities === undefined) !== (labels.missing === undefined))
      fail(p, "entities and missing are labelled together");
    const out: GuestCase = {
      id: str(c["id"], `${p}.id`),
      text: str(c["text"], `${p}.text`),
      booking: bookingContext(c["booking"], `${p}.booking`),
      labels,
    };
    if (c["note"] !== undefined) out.note = str(c["note"], `${p}.note`);
    return out;
  });
  return { today, slots, cases: uniqueIds(cases, file) };
}

export function parseHostDataset(raw: unknown, file = "host.json"): Dataset<HostCase> {
  const { today, slots, rawCases } = header(raw, file);
  const cases = rawCases.map((rc: unknown, i: number): HostCase => {
    const p = `${file}.cases[${i}]`;
    const c = record(rc, p, ["id", "text", "open", "labels", "note"]);
    const l = record(c["labels"], `${p}.labels`, ["intent", "booking", "proposed_date"]);
    const open = arrayOf((v, q) => {
      const o = record(v, q, ["booking", "kind"]);
      return {
        booking: bookingCode(o["booking"], `${q}.booking`),
        kind: enumOf(PROMPT_KINDS)(o["kind"], `${q}.kind`),
      };
    })(c["open"], `${p}.open`);
    const labels: HostCase["labels"] = {
      intent: oneOf(enumOf(HOST_INTENTS))(l["intent"], `${p}.labels.intent`),
      booking: oneOf(nullable(bookingCode))(l["booking"], `${p}.labels.booking`),
    };
    if (l["proposed_date"] !== undefined)
      labels.proposed_date = oneOf(nullable(isoDate))(l["proposed_date"], `${p}.proposed_date`);
    for (const b of options(labels.booking))
      if (b && !open.some((o) => o.booking === b)) fail(p, `labelled booking ${b} is not open`);
    const out: HostCase = {
      id: str(c["id"], `${p}.id`),
      text: str(c["text"], `${p}.text`),
      open,
      labels,
    };
    if (c["note"] !== undefined) out.note = str(c["note"], `${p}.note`);
    return out;
  });
  return { today, slots, cases: uniqueIds(cases, file) };
}
