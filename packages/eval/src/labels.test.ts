// The hand-written datasets: valid, unambiguous where they claim to be, and consistent with
// what the engine shows the model.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { options, parseGuestDataset, parseHostDataset, renderOpenPrompts } from "./labels";

const read = (file: string): unknown =>
  JSON.parse(readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));

describe("guest.json", () => {
  const ds = parseGuestDataset(read("guest.json"));

  it("is a Monday with the farm's two slots", () => {
    expect(new Date(`${ds.today}T12:00:00Z`).getUTCDay()).toBe(1);
    expect(ds.slots).toEqual(["09:00", "14:00"]);
  });

  it("covers every intent and many languages", () => {
    const intents = new Set(ds.cases.flatMap((c) => options(c.labels.intent)));
    expect([...intents].sort()).toEqual(
      ["booking_request", "cancel", "feedback", "modify", "question", "unknown"].sort(),
    );
    const langs = new Set(
      ds.cases.flatMap((c) => (c.labels.language ? options(c.labels.language) : [])),
    );
    expect(langs.size).toBeGreaterThanOrEqual(11);
    expect(ds.cases.length).toBeGreaterThanOrEqual(45);
  });

  it("labels no date in the past", () => {
    for (const c of ds.cases)
      for (const d of c.labels.entities ? options(c.labels.entities.date_from) : [])
        if (d) expect(d >= ds.today, `${c.id}: ${d}`).toBe(true);
  });

  it("lists a missing date only when the date may be unknown", () => {
    for (const c of ds.cases) {
      if (!c.labels.entities || !c.labels.missing) continue;
      const dateMayBeNull = options(c.labels.entities.date_from).includes(null);
      const partyMayBeNull = options(c.labels.entities.party_size).includes(null);
      for (const m of options(c.labels.missing)) {
        if (m.includes("date_from")) expect(dateMayBeNull, c.id).toBe(true);
        // A change keeps the booking's party size, so it is never missing there.
        if (m.includes("party_size"))
          expect(partyMayBeNull && c.booking === "none", c.id).toBe(true);
      }
    }
  });

  it("rejects label typos", () => {
    const dataset = (labels: object) => ({
      today: "2026-10-05",
      slots: ["09:00", "14:00"],
      cases: [{ id: "x", text: "Hi", booking: "none", labels }],
    });
    expect(() => parseGuestDataset(dataset({ intent: "booking" }))).toThrow(/intent: one of/);
    const tenAm = { date_from: null, party_size: 2, slot: "10:00" };
    expect(() =>
      parseGuestDataset(dataset({ intent: "booking_request", entities: tenAm, missing: [] })),
    ).toThrow(/slot/);
  });
});

describe("host.json", () => {
  const ds = parseHostDataset(read("host.json"));

  it("renders open prompts the way host.ts does", () => {
    expect(
      renderOpenPrompts([
        { booking: "B14", kind: "approve_booking" },
        { booking: "B15", kind: "answer_question" },
      ]),
    ).toBe("B14 (approve_booking)\nB15 (answer_question)");
    expect(renderOpenPrompts([])).toBe("(none)");
  });

  it("only holds replies the keypad parser would hand to the AI", () => {
    // The patterns of host-replies.ts: "1", "B14 2026-10-12" and "B14 2" never reach the AI.
    const keypad = [
      /^\s*[1-3]\s*$/,
      /^\s*B?(\d+)\s+(\d{4}-\d{2}-\d{2})\s*$/i,
      /^\s*B?\s*(\d+)[\s\-:.,/]*([1-3])\b/i,
    ];
    for (const c of ds.cases) for (const re of keypad) expect(c.text, c.id).not.toMatch(re);
  });

  it("labels a proposed date for every proposal", () => {
    for (const c of ds.cases)
      if (options(c.labels.intent).includes("propose_other_date"))
        expect(c.labels.proposed_date, c.id).toBeDefined();
  });
});
