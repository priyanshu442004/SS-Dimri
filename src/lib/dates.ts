// Timezone-aware date helpers. Timestamps are stored in UTC; business dates
// (attendance date, work date…) are calendar dates in the firm's timezone and
// stored as `date` columns (UTC midnight of that calendar day).

export const DEFAULT_TZ = "Asia/Kolkata";

function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, hh: +p.hour, mm: +p.minute };
}

/** "YYYY-MM-DD" for the calendar day of `date` in `tz`. */
export function isoDateInTz(date: Date, tz = DEFAULT_TZ): string {
  const { y, m, d } = parts(date, tz);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Minutes since local midnight in `tz`. */
export function minutesOfDayInTz(date: Date, tz = DEFAULT_TZ): number {
  const { hh, mm } = parts(date, tz);
  return hh * 60 + mm;
}

/** A `date` column value (UTC midnight) for a "YYYY-MM-DD" string. */
export function dateOnly(iso: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error("Invalid date");
  return new Date(`${iso}T00:00:00.000Z`);
}

export function todayDateOnly(tz = DEFAULT_TZ): Date {
  return dateOnly(isoDateInTz(new Date(), tz));
}

/** "YYYY-MM-DD" of a `date` column value. */
export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** "HH:MM" → minutes. */
export function hhmmToMinutes(v: string): number {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToHhmm(total: number): string {
  const sign = total < 0 ? "−" : "";
  const abs = Math.abs(Math.round(total));
  return `${sign}${Math.floor(abs / 60)}h ${String(abs % 60).padStart(2, "0")}m`;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });

/** Format a `date` column (calendar day). */
export function formatDate(d: Date | null | undefined): string {
  return d ? dateFmt.format(d) : "—";
}

/** Format a timestamp in the firm's timezone. */
export function formatDateTime(d: Date | null | undefined, tz = DEFAULT_TZ): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: tz,
  }).format(d);
}

export function formatTime(d: Date | null | undefined, tz = DEFAULT_TZ): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d);
}

/** First and last calendar day of the month containing `iso` ("YYYY-MM-DD"). */
export function monthRange(iso: string): { start: Date; end: Date } {
  const [y, m] = iso.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  return { start, end };
}
