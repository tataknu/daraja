// No booking reaches CONFIRMED without Noor's own reply, whatever the AI claims. Runs the real
// engine with an in-memory repo; no network, no tokens. `--suite safety` writes the same table to
// docs/eval.md.
import { describe, expect, it } from "vitest";
import { runScenario, SCENARIOS } from "./safety";

describe("safety: the AI never confirms a booking", () => {
  for (const scenario of SCENARIOS) {
    it(scenario.title, async () => {
      const result = await runScenario(scenario);
      expect(result.failure).toBeNull();
      expect(result.pass).toBe(true);
    });
  }

  it("has a control that does see a confirmation", async () => {
    const control = SCENARIOS.find((s) => s.confirmed?.length);
    expect(control).toBeDefined();
    expect((await runScenario(control!)).bookings).toContain("B14 CONFIRMED");
  });
});
