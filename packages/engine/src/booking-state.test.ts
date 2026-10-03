import { describe, expect, it } from "vitest";
import { canTransition, code } from "./booking-state";

describe("booking state machine", () => {
  it("lets only Noor confirm a pending request", () => {
    expect(canTransition("PENDING_NOOR", "CONFIRMED", "noor")).toBe(true);
    expect(canTransition("PENDING_NOOR", "CONFIRMED", "system")).toBe(false);
    expect(canTransition("PENDING_NOOR", "CONFIRMED", "guest")).toBe(false);
  });

  it("lets a guest accept a date Noor already offered", () => {
    expect(canTransition("COUNTER_OFFERED", "CONFIRMED", "guest")).toBe(true);
  });

  it("never confirms an incomplete request directly", () => {
    expect(canTransition("INCOMPLETE", "CONFIRMED", "noor")).toBe(false);
    expect(canTransition("INCOMPLETE", "PENDING_NOOR", "system")).toBe(true);
  });

  it("keeps finished bookings finished", () => {
    for (const end of ["DECLINED", "EXPIRED", "CANCELLED", "CLOSED"] as const) {
      expect(canTransition(end, "PENDING_NOOR", "system")).toBe(false);
      expect(canTransition(end, "CONFIRMED", "noor")).toBe(false);
    }
  });

  it("formats booking codes", () => {
    expect(code(14)).toBe("B14");
  });
});
