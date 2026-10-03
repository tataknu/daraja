// The whole workflow through the real engine modules, with an in-memory repo, a scripted AI and a
// clock the tests control. No network, no database.
import { describe, expect, it } from "vitest";
import { createEngine } from "./engine";
import { fakeAi, guestSays, noorSays } from "./testing/fake-ai";
import { NOOR_PHONE, memoryRepo } from "./testing/memory-repo";
import type { InboundInput } from "./types";

const HOUR = 3600e3;

function setup() {
  let now = new Date("2026-10-05T08:00:00Z");
  const clock = () => now;
  const { repo, data, noor } = memoryRepo(clock);
  const script = fakeAi();
  const engine = createEngine({ repo, ai: script.ai, now: clock });

  const email = (from: string, text: string, extra: Partial<InboundInput> = {}): InboundInput => ({
    channel: "email",
    sender: from,
    sender_name: "Lena Schulz",
    text,
    provider_msg_id: crypto.randomUUID(),
    ...extra,
  });
  const noorTexts = (text: string) =>
    engine.handleInbound({
      channel: "sms",
      sender: NOOR_PHONE,
      text,
      provider_msg_id: crypto.randomUUID(),
    });
  const toNoor = () =>
    data.messages
      .filter((m) => m.direction === "out" && m.contact_id === noor.id)
      .map((m) => m.text_original);
  const emailsTo = (address: string) => {
    const guest = data.contacts.find((c) => c.email === address);
    return data.messages
      .filter((m) => m.direction === "out" && m.contact_id === guest?.id)
      .map((m) => m.text_original);
  };
  const booking = (id: number) => data.bookings.find((b) => b.id === id);
  const advance = (hours: number) => {
    now = new Date(now.getTime() + hours * HOUR);
  };
  const request = async (
    from = "lena@example.de",
    overrides: Parameters<typeof guestSays>[0] = {},
  ) => {
    script.guest(guestSays(overrides));
    return engine.handleInbound(
      email(from, "Hallo! Wir sind 3 Personen und möchten am Samstag morgens kommen."),
    );
  };

  return { engine, data, script, email, noorTexts, toNoor, emailsTo, booking, advance, request };
}

describe("a guest asks to visit", () => {
  it("sends Noor one Swahili SMS and tells the guest it isn't confirmed yet", async () => {
    const t = setup();
    expect(await t.request()).toEqual({ booking_id: 14 });

    expect(t.booking(14)).toMatchObject({
      status: "PENDING_NOOR",
      date_from: "2026-10-10",
      slot: "09:00",
      party_size: 3,
    });
    expect(t.toNoor()).toEqual([
      "B14: Lena (Ujerumani), watu 3, Jumamosi 10 Okt asubuhi. Jibu 1=Ndiyo 2=Hapana 3=Siku nyingine",
    ]);
    expect(t.emailsTo("lena@example.de")[0]).toMatch(
      /^\[de\] Thank you! Your request \(B14\).*not yet a confirmation/,
    );
    expect(t.data.contacts.find((c) => c.email === "lena@example.de")?.language).toBe("de");
    expect(t.data.decisions.at(-1)).toMatchObject({
      action: "request_sent_to_noor",
      routed: true,
      model: "fake-model",
    });
  });

  it("asks for what's missing and doesn't bother Noor", async () => {
    const t = setup();
    await t.request("lena@example.de", { entities: { party_size: null } });

    expect(t.booking(14)).toMatchObject({ status: "INCOMPLETE", date_from: "2026-10-10" });
    expect(t.emailsTo("lena@example.de")[0]).toContain("number of people");
    expect(t.toNoor()).toEqual([]);
  });

  it("warns Noor when the slot would be over capacity", async () => {
    const t = setup();
    await t.request("a@example.de", { entities: { party_size: 6 } });
    await t.request("b@example.de", { entities: { party_size: 4 } });
    expect(t.toNoor()[1]).toContain(" ZIDI!");
  });

  it("ignores a webhook delivered twice", async () => {
    const t = setup();
    t.script.guest(guestSays());
    const msg = t.email("lena@example.de", "Hallo!");
    await t.engine.handleInbound(msg);
    expect(await t.engine.handleInbound(msg)).toEqual({ ignored: true });
    expect(t.data.messages.filter((m) => m.direction === "in")).toHaveLength(1);
  });
});

describe("Noor decides by SMS", () => {
  it("confirms with a bare 1 when only one request is waiting", async () => {
    const t = setup();
    await t.request();
    await t.noorTexts("1");

    expect(t.booking(14)?.status).toBe("CONFIRMED");
    expect(t.emailsTo("lena@example.de").at(-1)).toMatch(
      /Noor has confirmed your coffee farm visit \(B14\)/,
    );
    expect(t.toNoor().at(-1)).toBe("B14 imethibitishwa. Mgeni ametumiwa maelekezo.");
  });

  it("asks which booking a bare 1 is for when two are waiting", async () => {
    const t = setup();
    await t.request("a@example.de");
    await t.request("b@example.de", { entities: { date_from: "2026-10-11" } });
    await t.noorTexts("1");

    expect(t.toNoor().at(-1)).toBe("Maombi 2 yanasubiri: B15, B14. Jibu mf. 'B15 1'.");
    expect([t.booking(14)?.status, t.booking(15)?.status]).toEqual([
      "PENDING_NOOR",
      "PENDING_NOOR",
    ]);
    await t.noorTexts("B15 1");
    expect(t.booking(15)?.status).toBe("CONFIRMED");
  });

  it("declines with 2", async () => {
    const t = setup();
    await t.request();
    await t.noorTexts("B14 2");
    expect(t.booking(14)?.status).toBe("DECLINED");
    expect(t.emailsTo("lena@example.de").at(-1)).toContain("Unfortunately Noor cannot host you");
  });

  it("offers another day with 3, and the guest can accept it", async () => {
    const t = setup();
    await t.request();
    await t.noorTexts("B14 3");
    expect(t.toNoor().at(-1)).toBe("B14: Siku gani nyingine? Jibu mf. 'B14 2026-10-11'");

    await t.noorTexts("B14 2026-10-12");
    expect(t.booking(14)).toMatchObject({ status: "COUNTER_OFFERED", date_from: "2026-10-12" });
    expect(t.emailsTo("lena@example.de").at(-1)).toContain("she can offer 2026-10-12");

    t.script.guest(guestSays({ entities: { date_from: null } }));
    await t.engine.handleInbound(t.email("lena@example.de", "Ja, gerne!", { thread_ref: "B14" }));
    expect(t.booking(14)?.status).toBe("CONFIRMED");
  });

  it("reads free text back to her before acting on it", async () => {
    const t = setup();
    await t.request();
    t.script.host(noorSays({ intent: "approve", booking: "B14" }));
    await t.noorTexts("Ndiyo, karibuni");

    expect(t.toNoor().at(-1)).toBe("Nimeelewa: kubali kwa B14. Jibu 1 kutuma, 2 kughairi.");
    expect(t.booking(14)?.status).toBe("PENDING_NOOR");
    await t.noorTexts("1");
    expect(t.booking(14)?.status).toBe("CONFIRMED");
  });

  it("asks her to rephrase when the AI isn't sure", async () => {
    const t = setup();
    await t.request();
    t.script.host(noorSays({ confidence: 0.4 }));
    await t.noorTexts("hmm");
    expect(t.toNoor().at(-1)).toBe("Samahani, sikuelewa. Jibu mf. 'B14 1'.");
    expect(t.booking(14)?.status).toBe("PENDING_NOOR");
  });
});

describe("when things go wrong", () => {
  it("passes the raw message to Noor if the AI is down", async () => {
    const t = setup();
    t.script.guest(new Error("gateway timeout"));
    await t.engine.handleInbound(t.email("lena@example.de", "Hallo Noor!"));

    expect(t.toNoor().at(-1)).toBe("B14 ujumbe kutoka Lena (haukutafsiriwa): Hallo Noor!");
    expect(t.emailsTo("lena@example.de").at(-1)).toBe("Thank you — Noor will get back to you.");
    expect(t.data.decisions.at(-1)).toMatchObject({ intent: "error", routed: true });
  });

  it("hands a low-confidence message to Noor as a question", async () => {
    const t = setup();
    t.script.guest(
      guestSays({ confidence: 0.5, translation_for_noor: "Je, mna chakula cha mboga?" }),
    );
    await t.engine.handleInbound(t.email("lena@example.de", "Vegetarisch?"));

    expect(t.toNoor().at(-1)).toBe("B14 Lena: Je, mna chakula cha mboga?");
    expect(t.data.prompts.at(-1)).toMatchObject({ kind: "answer_question" });
  });
});

describe("timers", () => {
  it("nudges Noor after 24 hours and expires the request after 48", async () => {
    const t = setup();
    await t.request();

    t.advance(25);
    expect(await t.engine.runTimers()).toEqual(["B14 nudged"]);
    expect(t.toNoor().at(-1)).toMatch(/^Kumbusho: B14 bado inasubiri jibu/);

    t.advance(24);
    expect(await t.engine.runTimers()).toEqual(["B14 expired"]);
    expect(t.booking(14)?.status).toBe("EXPIRED");
    expect(t.emailsTo("lena@example.de").at(-1)).toContain("it has expired");
  });

  it("asks for feedback after the visit", async () => {
    const t = setup();
    await t.request();
    await t.noorTexts("1");

    t.advance(6 * 24); // past Saturday 10 Oct
    expect(await t.engine.runTimers()).toEqual(["B14 feedback requested"]);
    expect(t.booking(14)?.status).toBe("FEEDBACK_REQUESTED");
  });
});

describe("feedback and insights", () => {
  it("saves feedback in any language and summarises it for Noor", async () => {
    const t = setup();
    expect(await t.engine.monthlyInsights()).toEqual([]);
    expect(t.toNoor().at(-1)).toBe("Bado hakuna maoni ya wageni mwezi huu.");

    t.script.guest(guestSays({ intent: "feedback", feedback_text: "Die Röstung war toll!" }));
    await t.engine.handleInbound(t.email("lena@example.de", "Die Röstung war toll!"));
    expect(t.data.feedback).toHaveLength(1);

    expect(await t.engine.monthlyInsights()).toHaveLength(2);
    expect(t.toNoor().slice(-2)).toEqual([
      "Wageni wanapenda kuchoma kahawa.",
      "Boresha: alama barabarani.",
    ]);
  });
});
