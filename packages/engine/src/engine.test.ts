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
  const smsToNoor = () =>
    data.messages.filter((m) => m.direction === "out" && m.contact_id === noor.id);
  const toNoor = () => smsToNoor().map((m) => m.text_original);
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

  return {
    engine,
    data,
    script,
    email,
    noorTexts,
    smsToNoor,
    toNoor,
    emailsTo,
    booking,
    advance,
    request,
  };
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

  it("doesn't let an unanswered read-back catch her answer to a newer request", async () => {
    const t = setup();
    await t.request("a@example.de"); // B14
    t.script.host(noorSays({ intent: "decline", booking: "B14" }));
    await t.noorTexts("B14 hapana"); // read back, never answered
    t.advance(1);
    await t.request("b@example.de", { entities: { date_from: "2026-10-11" } }); // B15
    await t.noorTexts("1"); // meant for B15

    expect(t.booking(14)?.status).toBe("PENDING_NOOR");
    expect(t.booking(15)?.status).toBe("PENDING_NOOR");
    expect(t.toNoor().at(-1)).toBe("Maombi 2 yanasubiri: B15, B14. Jibu mf. 'B15 1'.");
    await t.noorTexts("B15 1");
    expect([t.booking(14)?.status, t.booking(15)?.status]).toEqual(["PENDING_NOOR", "CONFIRMED"]);
  });

  it("reads 'B14 1' as yes to B14, not as yes to the decline read back for B14", async () => {
    const t = setup();
    await t.request();
    t.script.host(noorSays({ intent: "decline", booking: "B14" }));
    await t.noorTexts("B14 hapana");
    await t.noorTexts("B14 1"); // 1=Ndiyo, as in the booking SMS

    expect(t.booking(14)?.status).toBe("CONFIRMED");
    expect(t.emailsTo("lena@example.de").at(-1)).toContain("Noor has confirmed your coffee farm");
    expect(t.data.prompts.find((p) => p.kind === "confirm_readback")?.resolution).toBe(
      "superseded",
    );
  });

  it("reads a bare 1 after a reminder as the reminder's yes, not the older read-back's", async () => {
    const t = setup();
    await t.request();
    t.script.host(noorSays({ intent: "decline", booking: "B14" }));
    await t.noorTexts("B14 hapana"); // read back, never answered
    t.advance(25);
    await t.engine.runTimers(); // "Kumbusho: B14 … Jibu 1=Ndiyo 2=Hapana 3=Siku nyingine"
    await t.noorTexts("1");

    expect(t.booking(14)?.status).toBe("CONFIRMED");
  });
});

describe("when things go wrong", () => {
  it("passes the raw message to Noor if the AI is down", async () => {
    const t = setup();
    t.script.guest(new Error("gateway timeout"));
    await t.engine.handleInbound(t.email("lena@example.de", "Hallo Noor!"));

    expect(t.toNoor().at(-1)).toBe("B14 ujumbe kutoka Lena (haukutafsiriwa): Hallo Noor!");
    // The one SMS whose English the AI still writes: nobody has translated the guest's words.
    expect(t.smsToNoor().at(-1)?.text_en).toBe(
      "[en] B14 ujumbe kutoka Lena (haukutafsiriwa): Hallo Noor!",
    );
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
  it("analyses feedback in any language and tells Noor what visitors love", async () => {
    const t = setup();
    expect((await t.engine.monthlyInsights()).review_count).toBe(0);
    expect(t.toNoor().at(-1)).toBe("Bado hakuna maoni ya wageni mwezi huu.");

    const text = "Es war toll, die Bohnen selbst zu rösten!";
    t.script.guest(guestSays({ intent: "feedback", feedback_text: text }));
    await t.engine.handleInbound(t.email("lena@example.de", text));
    expect(t.data.feedback).toHaveLength(1);
    expect(t.data.feedback[0]).toMatchObject({ lang: "de", themes: ["coffee_process"] });

    const report = await t.engine.monthlyInsights();
    expect(report).toMatchObject({ review_count: 1, sentiment: { positive: 1 } });
    expect(report.keep[0]).toMatchObject({ key: "coffee_process", count: 1, share: 1 });
    expect(report.keep[0]?.quotes[0]).toMatchObject({
      lang: "de",
      quote: "Bohnen selbst zu rösten",
    });
    expect(t.toNoor().at(-1)).toBe("Wageni wanapenda kuchoma kahawa.");
    expect(t.data.insightReports).toHaveLength(1);
  });
});

describe("English for reviewers", () => {
  const numbers = (s: string | null | undefined) => (s?.match(/\d+/g) ?? []).sort();

  it("comes with every SMS to Noor, written by code with the same codes and numbers", async () => {
    const t = setup();
    await t.request("a@example.de", { entities: { party_size: 6 } }); // B14
    await t.request("b@example.de", { entities: { party_size: 4 } }); // B15, over capacity
    await t.noorTexts("1"); // which one?
    await t.noorTexts("B14 1"); // confirmed
    await t.noorTexts("B15 3"); // which other day?
    await t.noorTexts("B15 2026-10-12"); // offer sent
    t.script.guest(guestSays({ entities: { date_from: null } }));
    await t.engine.handleInbound(t.email("b@example.de", "Ja, gerne!", { thread_ref: "B15" }));
    t.script.guest(guestSays({ intent: "question" }));
    await t.engine.handleInbound(t.email("c@example.de", "Gibt es Mittagessen?")); // B16
    t.script.host(
      noorSays({ intent: "answer_question", booking: "B16", answer_text_for_guest: "Yes, lunch." }),
    );
    await t.noorTexts("Ndiyo, chakula kipo."); // read back
    await t.noorTexts("1"); // reply sent
    t.script.guest(guestSays({ confidence: 0.5 }));
    await t.engine.handleInbound(t.email("d@example.de", "Hm?")); // B17, forwarded
    t.script.host(
      noorSays({ intent: "propose_other_date", booking: "B17", proposed_date: "2026-10-13" }),
    );
    await t.noorTexts("Jumanne?"); // read back
    await t.noorTexts("2"); // not sent
    await t.noorTexts("B99 1"); // nothing waiting
    t.script.guest(guestSays({ intent: "cancel" }));
    await t.engine.handleInbound(t.email("b@example.de", "Wir müssen absagen.")); // B15
    await t.request("e@example.de"); // B18
    t.advance(25);
    await t.engine.runTimers(); // B18 nudged
    t.advance(82); // Friday evening
    await t.engine.runTimers(); // B14 is tomorrow
    await t.engine.monthlyInsights(); // no reviews yet

    const sms = t.smsToNoor();
    expect(sms).toHaveLength(19);
    for (const m of sms) {
      expect(m.text_en, m.text_original).toBeTruthy();
      expect(m.text_en, m.text_original).not.toMatch(/^\[en\]/); // not from a translate call
      expect(numbers(m.text_en), m.text_original).toEqual(numbers(m.text_original));
    }
  });

  it("takes the guest's English from the classification", async () => {
    const t = setup();
    t.script.guest(
      guestSays({
        intent: "question",
        translation_for_noor: "Je, mna chakula cha mboga?",
        translation_en: "Do you have vegetarian food?",
      }),
    );
    await t.engine.handleInbound(t.email("lena@example.de", "Habt ihr vegetarisches Essen?"));

    expect(t.data.messages[0]?.text_en).toBe("Do you have vegetarian food?");
    expect(t.smsToNoor()[0]).toMatchObject({
      text_original: "B14 swali: Je, mna chakula cha mboga?",
      text_en: "B14 question: Do you have vegetarian food?",
    });
    expect(t.data.aiCalls.map((c) => c.task)).toEqual(["classify_guest", "translate"]); // the reply
  });

  it("cuts the English of a long question where the SMS is cut", async () => {
    const t = setup();
    const english = "Can we bring our dog? ".repeat(10);
    t.script.guest(
      guestSays({
        intent: "question",
        translation_for_noor: "Tunaweza kuleta mbwa wetu? ".repeat(10),
        translation_en: english,
      }),
    );
    await t.engine.handleInbound(t.email("lena@example.de", "Dürfen wir unseren Hund mitbringen?"));

    const [sms] = t.smsToNoor();
    expect(sms?.text_original).toHaveLength(160);
    expect(sms?.text_en).toMatch(/^B14 question: Can we bring our dog\? .*\.\.\.$/);
    expect(sms?.text_en?.length).toBeLessThan(`B14 question: ${english}`.length);
  });

  it("uses an English guest's own words, with no AI call for them", async () => {
    const t = setup();
    t.script.guest(guestSays({ intent: "question", language: "en", translation_en: "" }));
    await t.engine.handleInbound(t.email("ann@example.com", "Do you have vegetarian food?"));

    expect(t.data.messages[0]?.text_en).toBeNull();
    expect(t.smsToNoor()[0]?.text_en).toBe("B14 question: Do you have vegetarian food?");
    expect(t.data.aiCalls.map((c) => c.task)).toEqual(["classify_guest"]);
  });

  it("translates an email only when the classification brought no English", async () => {
    const t = setup();
    t.script.guest(guestSays({ intent: "question", translation_en: "" }));
    await t.engine.handleInbound(t.email("lena@example.de", "Habt ihr vegetarisches Essen?"));

    expect(t.data.messages[0]?.text_en).toBe("[en] Habt ihr vegetarisches Essen?");
    expect(t.smsToNoor()[0]?.text_en).toBe("B14 question: [en] Habt ihr vegetarisches Essen?");
  });

  it("gets Noor's free text in English from the AI that reads it", async () => {
    const t = setup();
    await t.request();
    t.script.host(noorSays({ translation_en: "Yes, welcome." }));
    await t.noorTexts("Ndiyo, karibuni");
    await t.noorTexts("2"); // keypad: no AI
    await t.noorTexts("B14 1 asante"); // keypad with words: translated, as before

    const sent = (text: string) => t.data.messages.find((m) => m.text_original === text);
    const tasks = (text: string) =>
      t.data.aiCalls.filter((c) => c.message_id === sent(text)?.id).map((c) => c.task);
    expect(sent("Ndiyo, karibuni")?.text_en).toBe("Yes, welcome.");
    expect(tasks("Ndiyo, karibuni")).toEqual(["classify_host"]);
    expect(tasks("2")).toEqual([]);
    expect(sent("B14 1 asante")?.text_en).toBe("[en] B14 1 asante");
  });
});
