import { describe, expect, it } from "vitest";
import { parseHostReply } from "./host-replies";
import type { Prompt } from "./types";

let n = 0;
const prompt = (booking_id: number, kind: string, options: unknown = {}): Prompt => ({
  id: `p${++n}`,
  booking_id,
  kind,
  options,
  sent_at: "2026-10-05T08:00:00Z",
  nudged_at: null,
});
const waiting = (id: number) => prompt(id, "approve_booking");

describe("Noor's keypad replies", () => {
  it("answers the only waiting request with a bare number", () => {
    expect(parseHostReply("1", [waiting(14)])).toEqual({
      kind: "act",
      bookingId: 14,
      choice: 1,
      action: "approve",
    });
    expect(parseHostReply(" 2 ", [waiting(14)])).toMatchObject({ kind: "act", action: "decline" });
    expect(parseHostReply("3", [waiting(14)])).toMatchObject({
      kind: "act",
      action: "ask_other_date",
    });
  });

  it("asks which booking when several are waiting", () => {
    expect(parseHostReply("1", [waiting(15), waiting(14)])).toEqual({
      kind: "ask_which",
      codes: ["B15", "B14"],
      choice: "1",
    });
  });

  it("accepts the booking code in the forms people type", () => {
    for (const text of ["B14 1", "b14: 1", "14-1", "B 14 1", "B14,1"]) {
      expect(parseHostReply(text, [waiting(14), waiting(15)])).toMatchObject({
        kind: "act",
        bookingId: 14,
        choice: 1,
      });
    }
  });

  it("never splits a booking number to find a choice", () => {
    // "B141 hapana" must not approve B14; "B32 ndiyo" is for the AI to read, not B3 + 2.
    expect(parseHostReply("B141 hapana", [waiting(14), waiting(141)])).toEqual({
      kind: "free_text",
    });
    expect(parseHostReply("B32 ndiyo", [waiting(32)])).toEqual({ kind: "free_text" });
    expect(parseHostReply("B14 12", [waiting(14)])).toEqual({ kind: "free_text" });
  });

  it("says so when the named booking has nothing waiting", () => {
    expect(parseHostReply("B20 1", [waiting(14)])).toEqual({
      kind: "no_open_request",
      bookingId: 20,
      choice: 1,
    });
  });

  it("confirms or cancels a read-back with 1 or 2", () => {
    const rb = prompt(14, "confirm_readback", { action: "approve" });
    expect(parseHostReply("1", [rb, waiting(14)])).toMatchObject({ kind: "readback", yes: true });
    expect(parseHostReply("2", [rb])).toMatchObject({ kind: "readback", yes: false });
    expect(parseHostReply("B14 1", [rb, waiting(14)])).toMatchObject({
      kind: "readback",
      yes: true,
    });
  });

  it("takes another date after she was asked for one", () => {
    const ask = prompt(14, "ask_other_date");
    expect(parseHostReply("B14 2026-10-12", [ask])).toEqual({
      kind: "propose_date",
      bookingId: 14,
      date: "2026-10-12",
    });
    expect(parseHostReply("B14 2026-10-12", [waiting(14)])).toEqual({ kind: "free_text" });
  });

  it("leaves anything else to the AI", () => {
    expect(parseHostReply("Ndiyo, karibuni", [waiting(14)])).toEqual({ kind: "free_text" });
    expect(parseHostReply("1", [])).toEqual({ kind: "free_text" });
  });
});
