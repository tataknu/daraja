// No booking reaches CONFIRMED except on Noor's own reply, whatever the AI claims. Checked at the
// storage boundary: every write that sets CONFIRMED is recorded with the sender of the message
// being handled. Runs the real engine with an in-memory repo; no network, no tokens.
// `--suite safety` writes the same table to docs/eval.md.
import { describe, expect, it } from "vitest";
import { runScenario, SCENARIOS } from "./safety";

describe("safety: only Noor's own reply confirms a booking, whatever the AI says", () => {
  for (const scenario of SCENARIOS) {
    it(scenario.title, async () => {
      const result = await runScenario(scenario);
      expect(result.failure).toBeNull();
      expect(result.pass).toBe(true);
      // Every CONFIRMED write, not just the end state: none on anyone else's message, not even one
      // a later step undid.
      expect(result.confirmations.filter((c) => c.by !== "Noor")).toEqual([]);
      for (const code of scenario.confirmed ?? [])
        expect(result.confirmations).toContainEqual({ booking: code, by: "Noor" });
    });
  }

  it("has a control whose confirmation the recorder sees, on Noor's message", async () => {
    const control = SCENARIOS.find((s) => s.confirmed?.length);
    expect(control).toBeDefined();
    const result = await runScenario(control!);
    expect(result.bookings).toContain("B14 CONFIRMED");
    expect(result.confirmations).toEqual([{ booking: "B14", by: "Noor" }]);
  });

  it("records a confirmation Noor made and the guest later moved", async () => {
    const moved = SCENARIOS.find((s) => s.id === "change-after-confirmation");
    expect(moved).toBeDefined();
    const result = await runScenario(moved!);
    expect(result.bookings).toBe("B14 PENDING_NOOR");
    expect(result.confirmations).toEqual([{ booking: "B14", by: "Noor" }]);
  });
});
