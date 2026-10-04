import { describe, expect, it } from "vitest";
import { splitDirections } from "./directions";

const URL = "https://www.google.com/maps/dir/?api=1&destination=-3.238791,37.312834";

describe("splitDirections", () => {
  it("takes the pinned link off the end of a confirmation and reads its destination", () => {
    const { text, map } = splitDirections(`Bis bald!\nNoor's Farm Visits\n\n📍 ${URL}`);
    expect(text).toBe("Bis bald!\nNoor's Farm Visits");
    expect(map).toEqual({ url: URL, lat: -3.238791, lng: 37.312834 });
  });

  it("leaves other messages alone", () => {
    const plain = "Thank you — Noor will get back to you. https://example.com/maps";
    expect(splitDirections(plain)).toEqual({ text: plain, map: null });
  });
});
