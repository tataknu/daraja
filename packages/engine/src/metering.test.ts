// Every AI call is logged with its tokens and latency, against the message and booking it served.
import { describe, expect, it } from "vitest";
import { createEngine } from "./engine";
import { FAKE_USAGE, fakeAi, guestSays } from "./testing/fake-ai";
import { memoryRepo } from "./testing/memory-repo";

function setup() {
  const clock = () => new Date("2026-10-05T08:00:00Z");
  const { repo, data } = memoryRepo(clock);
  const script = fakeAi();
  const engine = createEngine({ repo, ai: script.ai, now: clock });
  return { engine, data, script };
}

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
