// The classify prompts, checked without a model: the transport only records what it is sent.
import { describe, expect, it } from "vitest";
import { classifyGuest, classifyHost, withWeekday } from "./tasks";
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
  });
});
