// Every AI call is logged with its tokens and latency, against the message and booking it served.
import { describe, expect, it } from "vitest";
import { createEngine } from "./engine";
import { FAKE_USAGE, fakeAi, guestSays } from "./testing/fake-ai";
import { NOOR_PHONE, memoryRepo } from "./testing/memory-repo";

function setup() {
  const clock = () => new Date("2026-10-05T08:00:00Z");
  const { repo, data, noor } = memoryRepo(clock);
  const script = fakeAi();
  const engine = createEngine({ repo, ai: script.ai, now: clock });
  return { engine, data, script, noor };
}

describe("AI calls per booking", () => {
  it("classifies the request and writes the guest's two emails; nothing else", async () => {
    const { engine, data, script, noor } = setup();
    script.guest(guestSays());
    await engine.handleInbound({
      channel: "email",
      sender: "lena@example.de",
      sender_name: "Lena Schulz",
      text: "Hallo! Wir sind 3 Personen und möchten am Samstag morgens kommen.",
      provider_msg_id: "m1",
    });
    await engine.handleInbound({
      channel: "sms",
      sender: NOOR_PHONE,
      text: "1",
      provider_msg_id: "m2",
    });

    // Before: five translate calls, three of them English glosses for reviewers (email, both SMS).
    expect(data.aiCalls.map((c) => c.task)).toEqual(["classify_guest", "translate", "translate"]);
    const request = data.messages.find((m) => m.provider_msg_id === "m1");
    expect(request?.text_en).toBe(guestSays().translation_en);
    const sms = data.messages.filter((m) => m.direction === "out" && m.contact_id === noor.id);
    expect(sms.map((m) => [m.text_original, m.text_en])).toEqual([
      [
        "B14: Lena (Ujerumani), watu 3, Jumamosi 10 Okt asubuhi. Jibu 1=Ndiyo 2=Hapana 3=Siku nyingine",
        "B14: Lena (Germany), 3 people, Saturday 10 Oct morning. Reply 1=Yes 2=No 3=Other day",
      ],
      [
        "B14 imethibitishwa. Mgeni ametumiwa maelekezo.",
        "B14 is confirmed. The guest has been sent directions.",
      ],
    ]);
  });
});

describe("AI usage metering", () => {
  it("logs each call of a booking request against its message and booking", async () => {
    const { engine, data, script } = setup();
    script.guest(guestSays());
    const r = await engine.handleInbound({
      channel: "email",
      sender: "lena@example.de",
      text: "Hallo! Wir sind 3 Personen und möchten am Samstag morgens kommen.",
      provider_msg_id: "m1",
    });

    const inbound = data.messages.find((m) => m.provider_msg_id === "m1")!;
    expect(data.aiCalls.length).toBeGreaterThan(1);
    expect(data.aiCalls.map((c) => c.task)).toContain("classify_guest");
    for (const call of data.aiCalls) {
      expect(call).toMatchObject({
        source: "inbound",
        message_id: inbound.id,
        booking_id: "booking_id" in r ? r.booking_id : null,
        input_tokens: FAKE_USAGE.input_tokens,
        output_tokens: FAKE_USAGE.output_tokens,
        ok: true,
      });
    }
  });

  it("keeps two messages' usage apart", async () => {
    const { engine, data, script } = setup();
    script.guest(guestSays());
    script.guest(guestSays({ language: "fr" }));
    const send = (id: string, from: string) =>
      engine.handleInbound({
        channel: "email",
        sender: from,
        text: "Bonjour",
        provider_msg_id: id,
      });
    await Promise.all([send("a", "a@example.de"), send("b", "b@example.fr")]);

    const ids = new Set(data.messages.filter((m) => m.direction === "in").map((m) => m.id));
    expect(new Set(data.aiCalls.map((c) => c.message_id))).toEqual(ids);
  });
});
