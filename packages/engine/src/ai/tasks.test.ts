// The classify prompts, checked without a model: the transport only records what it is sent.
import { describe, expect, it } from "vitest";
import { classifyGuest, classifyHost, weeksAround, withWeekday } from "./tasks";
import type { CallTool } from "./types";

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
