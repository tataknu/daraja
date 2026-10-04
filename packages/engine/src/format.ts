// Pure formatting helpers: farm-local dates and the short Swahili wording Noor sees, with its
// English for reviewers.

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
const EN_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const EN_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
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
const EN_ORIGIN: Record<string, string> = {
  de: "Germany",
  en: "UK",
  fr: "France",
  nl: "Netherlands",
  it: "Italy",
  es: "Spain",
  sw: "Tanzania",
  zh: "China",
  ja: "Japan",
};

function dayMonth(iso: string | null, days: string[], months: string[]) {
  if (!iso) return "?";
  const d = new Date(iso + "T12:00:00Z");
  return `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]}`;
}

/** "2026-10-10" -> "Jumamosi 10 Okt". */
export const swDate = (iso: string | null) => dayMonth(iso, SW_DAYS, SW_MONTHS);
/** "2026-10-10" -> "Saturday 10 Oct". */
export const enDate = (iso: string | null) => dayMonth(iso, EN_DAYS, EN_MONTHS);

/** Tour slot as Noor says it: morning or afternoon. */
export const swSlot = (s: string | null) =>
  s === "09:00" ? "asubuhi" : s === "14:00" ? "mchana" : (s ?? "");
export const enSlot = (s: string | null) =>
  s === "09:00" ? "morning" : s === "14:00" ? "afternoon" : (s ?? "");

/** Where the guest is from, in Swahili, from their language code. */
export const swOrigin = (lang: string) => SW_ORIGIN[lang] ?? lang.toUpperCase();
export const enOrigin = (lang: string) => EN_ORIGIN[lang] ?? lang.toUpperCase();

/** One SMS segment. */
export const sms160 = (s: string) => (s.length <= 160 ? s : s.slice(0, 157) + "...");
/** The English of an SMS, cut where sms160 cuts the SMS, in proportion to their lengths. */
export const sms160English = (sms: string, en: string) =>
  sms.length <= 160 ? en : en.slice(0, Math.floor((en.length * 157) / sms.length)) + "...";

export const firstName = (n: string) => n.split(" ")[0] ?? n;

/** Google Maps directions to the farm, from wherever the guest opens it (official Maps URL). */
export function directionsUrl(s: { latitude: number | null; longitude: number | null }) {
  if (s.latitude === null || s.longitude === null) return null;
  const at = (n: number) => +n.toFixed(6);
  return `https://www.google.com/maps/dir/?api=1&destination=${at(s.latitude)},${at(s.longitude)}`;
}

/** The last line of a confirmation email: a pin and the directions link, in every language. */
export function mapLine(s: { latitude: number | null; longitude: number | null }) {
  const url = directionsUrl(s);
  return url ? `📍 ${url}` : null;
}
