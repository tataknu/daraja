// The classify prompts, checked without a model: the transport only records what it is sent.
import { describe, expect, it } from "vitest";
import { writeInsightsSms } from "./review-tasks";
import { classifyGuest, classifyHost, weeksAround, withWeekday } from "./tasks";
import type { CallTool } from "./types";

/** A transport that records each request and answers `answer`. */
function recording(answer: unknown = {}) {
  const sent: { system: string; parameters: object }[] = [];
  const call: CallTool = async <T>(
    system: string,
    _user: string,
    _name: string,
    parameters: object,
  ) => {
    sent.push({ system, parameters });
    return answer as T;
  };
  return { sent, call };
}

describe("what the prompts ask for", () => {
  it("asks whether the guest accepts or refuses a date the host offered", async () => {
    const { sent, call } = recording();
    await classifyGuest(call, "Ja, gerne!", {
      today: "2026-10-05",
      slots: ["09:00", "14:00"],
      booking: "B14 status=COUNTER_OFFERED date=2026-10-12 slot=09:00 party=3",
    });
    expect(sent[0]?.system).toContain(
      "accepts_offer: true if the guest accepts a date the host offered, false if they refuse it, null otherwise.",
    );
    expect(sent[0]?.parameters).toMatchObject({
      properties: { accepts_offer: { type: ["boolean", "null"] } },
      required: expect.arrayContaining(["accepts_offer"]),
    });
  });

  it("asks for SMS lines with room to spare that copy the summary's count phrases", async () => {
    const { sent, call } = recording({ lines_sw: [], lines_en: [] });
    await writeInsightsSms(call, "Reviews: 9");
    expect(sent[0]?.system).toContain("each under 140 characters");
    expect(sent[0]?.system).toContain(
      'every line containing its count phrase copied exactly as the summary gives it (e.g. "wageni 5 kati ya 9", "mgeni 1 kati ya 9")',
    );
  });
});

describe("classify prompts", () => {
  it("give today's weekday, computed from the date, so relative dates are counted right", async () => {
    expect(withWeekday("2026-10-05")).toBe("Monday 2026-10-05");
    expect(withWeekday("2026-10-10")).toBe("Saturday 2026-10-10");
    expect(withWeekday("2026-03-01")).toBe("Sunday 2026-03-01");

    const prompts: string[] = [];
    const call: CallTool = async <T>(system: string) => {
      prompts.push(system);
      return {} as T;
    };
    await classifyGuest(call, "来週の土曜日に2人で", {
      today: "2026-10-05",
      slots: ["09:00", "14:00"],
      booking: "none",
    });
    await classifyHost(call, "Jumamosi ijayo", { today: "2026-10-10", openPrompts: "(none)" });
    expect(prompts[0]).toContain("Today is Monday 2026-10-05.");
    expect(prompts[1]).toContain("Today is Saturday 2026-10-10.");
    expect(prompts[0]).toContain("next week is Mon 12 Oct–Sun 18 Oct.");
  });

  it("spell out this week and next, Monday to Sunday, so 'next week's Saturday' is a lookup", () => {
    const weeks = "This week is Mon 5 Oct–Sun 11 Oct; next week is Mon 12 Oct–Sun 18 Oct.";
    expect(weeksAround("2026-10-05")).toBe(weeks); // Monday
    expect(weeksAround("2026-10-10")).toBe(weeks); // Saturday
    expect(weeksAround("2026-10-11")).toBe(weeks); // Sunday still belongs to this week
    expect(weeksAround("2026-12-30")).toBe(
      "This week is Mon 28 Dec–Sun 3 Jan; next week is Mon 4 Jan–Sun 10 Jan.",
    );
  });
});
