// The Google Maps directions link the engine adds to confirmation emails (format.ts mapLine).
const DIRECTIONS =
  /\n*(?:📍\s*)?(https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?))/u;

export interface Directions {
  url: string;
  lat: number;
  lng: number;
}

/** A message's text without its directions link, and the link's destination, if it has one. */
export function splitDirections(text: string): { text: string; map: Directions | null } {
  const m = DIRECTIONS.exec(text);
  if (!m || m[1] === undefined) return { text, map: null };
  return {
    text: (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trimEnd(),
    map: { url: m[1], lat: Number(m[2]), lng: Number(m[3]) },
  };
}
