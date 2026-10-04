import { describe, expect, it } from "vitest";
import { arrived } from "./pending";
import type { Message } from "./types";

const at = "2026-10-05T08:00:00Z";
const msg = (o: Partial<Message>): Message =>
  ({
    direction: "in",
    contact_id: "anna",
    text_original: "Hallo Noor!",
    created_at: at,
    ...o,
  }) as Message;
const pending = {
  channel: "email" as const,
  contactId: "anna",
  text: " Hallo Noor! ",
  since: Date.parse(at),
};

describe("arrived", () => {
  it("is true once the stored copy of the pending message is there", () => {
    expect(arrived(pending, [])).toBe(false);
    expect(arrived(pending, [msg({})])).toBe(true);
  });

  it("ignores the same words sent earlier, by someone else, or by the farm", () => {
    expect(arrived(pending, [msg({ created_at: "2026-10-05T07:00:00Z" })])).toBe(false);
    expect(arrived(pending, [msg({ contact_id: "kenji" })])).toBe(false);
    expect(arrived(pending, [msg({ direction: "out" })])).toBe(false);
  });
});
