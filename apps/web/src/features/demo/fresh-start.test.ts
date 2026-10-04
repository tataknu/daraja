import { beforeEach, describe, expect, it } from "vitest";
import { markStarted, needsFreshStart } from "./fresh-start";

describe("fresh start", () => {
  beforeEach(() => sessionStorage.clear());

  it("starts fresh once per browser tab", () => {
    expect(needsFreshStart()).toBe(true);
    markStarted();
    expect(needsFreshStart()).toBe(false); // a reload keeps the conversation
  });

  it("never resets when session storage is blocked", () => {
    const blocked = () => {
      throw new Error("SecurityError");
    };
    expect(needsFreshStart(blocked)).toBe(false);
    expect(() => markStarted(blocked)).not.toThrow();
  });
});
