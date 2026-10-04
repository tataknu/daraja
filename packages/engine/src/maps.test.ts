// Every confirmation ends with a Google Maps directions link to the farm, added after translation
// so the AI never sees or rewrites it.
import { describe, expect, it } from "vitest";
import { createEngine } from "./engine";
import { directionsUrl, mapLine } from "./format";
import { fakeAi, guestSays } from "./testing/fake-ai";
import { NOOR_PHONE, memoryRepo } from "./testing/memory-repo";

const LINK = "📍 https://www.google.com/maps/dir/?api=1&destination=-3.238791,37.312834";

function setup() {
  const clock = () => new Date("2026-10-05T08:00:00Z");
  const { repo, data } = memoryRepo(clock);
  const script = fakeAi();
  const engine = createEngine({ repo, ai: script.ai, now: clock });
  let n = 0;
  const email = (text: string, thread_ref?: string) =>
    engine.handleInbound({
      channel: "email",
      sender: "lena@example.de",
      sender_name: "Lena Schulz",
      text,
      provider_msg_id: `e${++n}`,
      thread_ref: thread_ref ?? null,
    });
  const noor = (text: string) =>
    engine.handleInbound({ channel: "sms", sender: NOOR_PHONE, text, provider_msg_id: `s${++n}` });
  const lastEmail = () => {
    const lena = data.contacts.find((c) => c.email === "lena@example.de");
    return data.messages.filter((m) => m.direction === "out" && m.contact_id === lena?.id).at(-1);
  };
  return { data, script, email, noor, lastEmail };
}

describe("the map link", () => {
  it("is Google Maps directions to the farm's coordinates, or nothing without them", () => {
    expect(directionsUrl({ latitude: -3.2387912, longitude: 37.31283394 })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=-3.238791,37.312834",
    );
    expect(mapLine({ latitude: null, longitude: 37.3 })).toBeNull();
  });

  it("ends the confirmation, untranslated, in the guest's language and in English", async () => {
    const t = setup();
    t.script.guest(guestSays());
    await t.email("Hallo! Wir sind 3 Personen und möchten am Samstag morgens kommen.");
    await t.noor("1");

    const confirmation = t.lastEmail();
    expect(confirmation?.text_original).toMatch(/^\[de\] Dear Lena,/); // translated by the AI
    expect(confirmation?.text_original.endsWith(`\n\n${LINK}`)).toBe(true); // added after it
    expect(confirmation?.text_translated?.endsWith(`\n\n${LINK}`)).toBe(true);
    expect(confirmation?.text_original.split(LINK)).toHaveLength(2); // once
  });

  it("ends the confirmation when the guest accepts a date Noor offered", async () => {
    const t = setup();
    t.script.guest(guestSays());
    await t.email("Hallo! Wir sind 3 Personen und möchten am Samstag morgens kommen.");
    await t.noor("B14 3");
    await t.noor("B14 2026-10-12");
    t.script.guest(guestSays({ accepts_offer: true, entities: { date_from: null } }));
    await t.email("Ja, gerne!", "B14");

    expect(t.lastEmail()?.text_original.endsWith(`\n\n${LINK}`)).toBe(true);
  });

  it("is left out when the farm has no coordinates", async () => {
    const t = setup();
    t.data.settings.latitude = null;
    t.script.guest(guestSays());
    await t.email("Hallo! Wir sind 3 Personen und möchten am Samstag morgens kommen.");
    await t.noor("1");

    expect(t.lastEmail()?.text_original).not.toContain("google.com/maps");
  });
});
