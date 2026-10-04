import { describe, expect, it } from "vitest";
import {
  addDays,
  enDate,
  enOrigin,
  enSlot,
  firstName,
  localDate,
  sms160,
  sms160English,
  swDate,
  swOrigin,
  swSlot,
} from "./format";

describe("Swahili wording", () => {
  it("writes dates the way Noor reads them", () => {
    expect(swDate("2026-10-10")).toBe("Jumamosi 10 Okt");
    expect(swDate("2026-03-01")).toBe("Jumapili 1 Mac");
    expect(swDate(null)).toBe("?");
  });

  it("names the tour slots", () => {
    expect(swSlot("09:00")).toBe("asubuhi");
    expect(swSlot("14:00")).toBe("mchana");
    expect(swSlot("16:30")).toBe("16:30");
    expect(swSlot(null)).toBe("");
  });

  it("says where a guest is from, by language", () => {
    expect(swOrigin("de")).toBe("Ujerumani");
    expect(swOrigin("ja")).toBe("Japani");
    expect(swOrigin("pt")).toBe("PT");
  });

  it("has the same words in English, for reviewers", () => {
    expect(enDate("2026-10-10")).toBe("Saturday 10 Oct");
    expect(enDate("2026-03-01")).toBe("Sunday 1 Mar");
    expect(enDate(null)).toBe("?");
    expect(["09:00", "14:00", "16:30"].map(enSlot)).toEqual(["morning", "afternoon", "16:30"]);
    expect(["de", "ja", "pt"].map(enOrigin)).toEqual(["Germany", "Japan", "PT"]);
  });
});

describe("dates and SMS", () => {
  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });

  it("uses the farm's time zone for today", () => {
    // 22:30 UTC is already the next day in Dar es Salaam (UTC+3).
    expect(localDate(new Date("2026-10-04T22:30:00Z"))).toBe("2026-10-05");
  });

  it("keeps an SMS to one 160-character segment", () => {
    expect(sms160("short")).toBe("short");
    const long = sms160("x".repeat(200));
    expect(long).toHaveLength(160);
    expect(long.endsWith("...")).toBe(true);
  });

  it("cuts the English of a long SMS at about the same point", () => {
    expect(sms160English("fupi", "short")).toBe("short");
    // The SMS keeps 157 of its 314 characters: half, so the English keeps half of its own.
    expect(sms160English("x".repeat(314), "y".repeat(200))).toBe("y".repeat(100) + "...");
  });

  it("takes the first name", () => {
    expect(firstName("Lena Schulz")).toBe("Lena");
  });
});
