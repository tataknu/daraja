// Pure formatting helpers: farm-local dates and the short Swahili wording Noor sees.

/** The farm's time zone; "today" and reminder hours are computed here. */
export const TZ = "Africa/Dar_es_Salaam";

export const localDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: TZ });
export const localHour = (d: Date) =>
  Number(d.toLocaleString("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }));

export const addDays = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const SW_DAYS = ["Jumapili", "Jumatatu", "Jumanne", "Jumatano", "Alhamisi", "Ijumaa", "Jumamosi"];
const SW_MONTHS = [
  "Jan",
  "Feb",
  "Mac",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];
const SW_ORIGIN: Record<string, string> = {
  de: "Ujerumani",
  en: "Uingereza",
  fr: "Ufaransa",
  nl: "Uholanzi",
  it: "Italia",
  es: "Uhispania",
  sw: "Tanzania",
  zh: "China",
  ja: "Japani",
};

/** "2026-10-10" -> "Jumamosi 10 Okt". */
export function swDate(iso: string | null) {
  if (!iso) return "?";
  const d = new Date(iso + "T12:00:00Z");
  return `${SW_DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${SW_MONTHS[d.getUTCMonth()]}`;
}

/** Tour slot as Noor says it: morning or afternoon. */
export const swSlot = (s: string | null) =>
  s === "09:00" ? "asubuhi" : s === "14:00" ? "mchana" : (s ?? "");

/** Where the guest is from, in Swahili, from their language code. */
export const swOrigin = (lang: string) => SW_ORIGIN[lang] ?? lang.toUpperCase();

/** One SMS segment. */
export const sms160 = (s: string) => (s.length <= 160 ? s : s.slice(0, 157) + "...");

export const firstName = (n: string) => n.split(" ")[0] ?? n;
