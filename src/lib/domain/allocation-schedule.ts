// When a team member is actually at (or working on) an allocated client (pure).
// The firm's Team Allocation sheet describes this with Week days ("Mon, Wed, Fri"), a
// Frequency (Daily … Monthly, As required) and Visit day(s) of month ("5, 20", "7",
// "1st & 3rd Tue", "Last working day"). A visit that falls on a Sunday moves to the next
// working day. Dates are UTC midnights (see lib/dates `dateOnly`).

export const FREQUENCIES = {
  DAILY: "Daily",
  THREE_A_WEEK: "3 days a week",
  TWICE_A_WEEK: "Twice a week",
  ONCE_A_WEEK: "Once a week",
  TWICE_A_MONTH: "Twice a month (every 15 days)",
  MONTHLY: "Monthly",
  AS_REQUIRED: "As required",
} as const;
export type Frequency = keyof typeof FREQUENCIES;
export const FREQUENCY_KEYS = Object.keys(FREQUENCIES) as Frequency[];

/** Days a week the frequency expects (for a gentle check of the Week days column). */
const DAYS_PER_WEEK: Partial<Record<Frequency, number>> = { THREE_A_WEEK: 3, TWICE_A_WEEK: 2, ONCE_A_WEEK: 1 };
const MONTH_BASED: Frequency[] = ["TWICE_A_MONTH", "MONTHLY"];

/** Index = JavaScript getUTCDay(): 0 = Sunday. */
export const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const WORKING_DAYS = [1, 2, 3, 4, 5, 6];

const clean = (s: string) => s.toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

/** Frequency wording from a sheet or the form → key. Unknown wording → null. */
export function parseFrequency(text: string | null | undefined): Frequency | null {
  const t = clean(text ?? "");
  if (!t) return null;
  if (t in FREQUENCIES) return t as Frequency;
  const upper = t.toUpperCase().replace(/[\s-]+/g, "_");
  if (upper in FREQUENCIES) return upper as Frequency;
  if (/^(as (and when )?required|as needed|when required|on call|need based|as and when)/.test(t)) return "AS_REQUIRED";
  if (/^(daily|every ?day|all days)/.test(t)) return "DAILY";
  if (/^(3|three) days?( a| per| in a)? week|thrice/.test(t)) return "THREE_A_WEEK";
  if (/^(twice|2 days?|two days?)( a| per| in a)? week/.test(t)) return "TWICE_A_WEEK";
  if (/^(once a week|1 day a week|one day a week|weekly)/.test(t)) return "ONCE_A_WEEK";
  if (/^(twice|2 times|two times)( a| per| in a)? month|fortnight|every 15 days|bi-?monthly|half[- ]monthly/.test(t)) return "TWICE_A_MONTH";
  if (/^(monthly|once a month|every month)/.test(t)) return "MONTHLY";
  return null;
}

const DAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

/**
 * "Mon, Wed, Fri", "Mon–Sat (all days)", "Mon-Fri", "Tue & Thu" → [1, 3, 5] etc.
 * Blank → [] (meaning Mon–Sat). Words it cannot read are returned in `unknown`.
 */
export function parseWeekDays(text: string | null | undefined): { days: number[]; unknown: string[] } {
  let t = clean(text ?? "").replace(/\(.*?\)/g, " ");
  if (!t) return { days: [], unknown: [] };
  if (/^(all( days)?|daily|every ?day|mon ?- ?sat|monday ?- ?saturday)\b/.test(t) && !/[,&]/.test(t)) return { days: [...WORKING_DAYS], unknown: [] };
  t = t.replace(/\s*(?:-|to)\s*/g, "-");
  const days = new Set<number>();
  const unknown: string[] = [];
  for (const token of t.split(/[,&/;]| and |\s+/).map((x) => x.trim()).filter(Boolean)) {
    const range = /^([a-z]+)-([a-z]+)$/.exec(token);
    if (range && range[1] in DAY_WORDS && range[2] in DAY_WORDS) {
      const [a, b] = [DAY_WORDS[range[1]], DAY_WORDS[range[2]]];
      for (let d = a; d !== (b + 1) % 7; d = (d + 1) % 7) days.add(d);
      continue;
    }
    if (token in DAY_WORDS) days.add(DAY_WORDS[token]);
    else unknown.push(token);
  }
  return { days: [...days].sort((a, b) => a - b), unknown };
}

export type VisitDays =
  | { kind: "dates"; days: number[] }
  | { kind: "nthWeekday"; nth: number[]; weekday: number } // nth: 1–5, or -1 for the last
  | { kind: "lastWorkingDay" };

const ORDINAL: Record<string, number> = { "1st": 1, first: 1, "2nd": 2, second: 2, "3rd": 3, third: 3, "4th": 4, fourth: 4, "5th": 5, fifth: 5, last: -1 };

/** "5, 20" · "5 & 20" · "7" · "10th and 25th" · "1st & 3rd Tue" · "Last working day" → a rule; unreadable → null. */
export function parseVisitDays(text: string | null | undefined): VisitDays | null {
  const t = clean(text ?? "");
  if (!t) return null;
  if (/^last( working)?( day)?( of( the)? month)?$/.test(t)) return { kind: "lastWorkingDay" };
  const words = t.split(/[,&/;]| and |\s+/).map((x) => x.trim()).filter(Boolean);
  const weekday = words.map((w) => DAY_WORDS[w]).find((d) => d !== undefined);
  if (weekday !== undefined) {
    const nth = [...new Set(words.map((w) => ORDINAL[w]).filter((n): n is number => n !== undefined))];
    if (!nth.length || words.some((w) => DAY_WORDS[w] === undefined && ORDINAL[w] === undefined)) return null;
    return { kind: "nthWeekday", nth: nth.sort((a, b) => (a === -1 ? 9 : a) - (b === -1 ? 9 : b)), weekday };
  }
  const nums = words.map((w) => /^(\d{1,2})(st|nd|rd|th)?$/.exec(w)?.[1]);
  if (nums.some((n) => n === undefined)) return null;
  const days = [...new Set(nums.map(Number))].filter((n) => n >= 1 && n <= 31).sort((a, b) => a - b);
  return days.length === nums.length ? { kind: "dates", days } : null;
}

/** The rule written back in the sheet's own words, so the form and the export stay readable. */
export function formatVisitDays(v: VisitDays): string {
  if (v.kind === "lastWorkingDay") return "Last working day";
  if (v.kind === "dates") return v.days.join(", ");
  const ord = (n: number) => (n === -1 ? "Last" : `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`);
  return `${v.nth.map(ord).join(" & ")} ${WEEKDAY_NAMES[v.weekday]}`;
}

export const formatWeekDays = (days: number[]) => {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (!d.length || (d.length === 6 && WORKING_DAYS.every((x) => d.includes(x)))) return "Mon–Sat";
  return d.map((x) => WEEKDAY_NAMES[x]).join(", ");
};

export type Schedule = {
  weekDays?: number[] | null;
  frequency?: Frequency | null;
  visitDays?: string | null;
};

const DAY = 86_400_000;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
const isWorking = (d: Date, holidays?: Set<string>) => d.getUTCDay() !== 0 && !holidays?.has(d.toISOString().slice(0, 10));
const nextWorking = (d: Date, holidays?: Set<string>) => {
  let x = d;
  for (let i = 0; i < 14 && !isWorking(x, holidays); i++) x = new Date(x.getTime() + DAY);
  return x;
};

/** The visit dates a month-based rule gives in one month (after moving off Sundays and holidays). */
export function visitDatesInMonth(rule: VisitDays, year: number, month: number, holidays?: Set<string>): Date[] {
  const last = daysIn(year, month);
  if (rule.kind === "lastWorkingDay") {
    let d = utc(year, month, last);
    for (let i = 0; i < 14 && !isWorking(d, holidays); i++) d = new Date(d.getTime() - DAY);
    return [d];
  }
  if (rule.kind === "dates") return rule.days.map((n) => nextWorking(utc(year, month, Math.min(n, last)), holidays));
  const out: Date[] = [];
  const firstDow = utc(year, month, 1).getUTCDay();
  const firstHit = 1 + ((rule.weekday - firstDow + 7) % 7);
  const hits = Array.from({ length: 5 }, (_, i) => firstHit + i * 7).filter((d) => d <= last);
  for (const n of rule.nth) {
    const day = n === -1 ? hits[hits.length - 1] : hits[n - 1];
    if (day) out.push(nextWorking(utc(year, month, day), holidays));
  }
  return out;
}

/** True when the schedule has no fixed days (As required, or a month rule that could not be read). */
export function hasNoFixedDays(s: Schedule) {
  return s.frequency === "AS_REQUIRED" || (!!s.frequency && MONTH_BASED.includes(s.frequency) && !parseVisitDays(s.visitDays));
}

/**
 * Is the person planned at this client on `day`? Week-based schedules follow the week days
 * (blank = Mon–Sat); month-based ones the visit days; As required has no fixed days.
 */
export function isPlannedOn(s: Schedule, day: Date, holidays?: Set<string>): boolean {
  if (s.frequency === "AS_REQUIRED") return false;
  if (s.frequency && MONTH_BASED.includes(s.frequency)) {
    const rule = parseVisitDays(s.visitDays);
    if (!rule) return false;
    const t = day.getTime();
    // A visit moved off a Sunday at the end of last month can land on the first days of this one.
    const y = day.getUTCFullYear();
    const m = day.getUTCMonth();
    const prev = m === 0 ? [y - 1, 11] : [y, m - 1];
    return [...visitDatesInMonth(rule, y, m, holidays), ...visitDatesInMonth(rule, prev[0], prev[1], holidays)].some((d) => d.getTime() === t);
  }
  const days = s.weekDays?.length ? s.weekDays : WORKING_DAYS;
  if (!days.includes(day.getUTCDay())) return false;
  return !holidays?.has(day.toISOString().slice(0, 10));
}

/** Plain words, e.g. "Mon, Wed, Fri", "Twice a month · 5, 20", "As required". */
export function describeSchedule(s: Schedule): string {
  const f = s.frequency ?? null;
  if (f === "AS_REQUIRED") return "As required";
  if (f && MONTH_BASED.includes(f)) {
    const rule = parseVisitDays(s.visitDays);
    return `${f === "MONTHLY" ? "Monthly" : "Twice a month"}${rule ? ` · ${formatVisitDays(rule)}` : " · days not set"}`;
  }
  const days = formatWeekDays(s.weekDays ?? []);
  if (!f) return days;
  return f === "DAILY" ? (days === "Mon–Sat" ? "Daily (Mon–Sat)" : `Daily · ${days}`) : `${FREQUENCIES[f]} · ${days}`;
}

/** Problems worth telling the user about; none of them stops a save. */
export function scheduleWarnings(s: Schedule): string[] {
  const out: string[] = [];
  const f = s.frequency ?? null;
  const days = s.weekDays ?? [];
  const want = f ? DAYS_PER_WEEK[f] : undefined;
  if (want && !days.length) out.push(`Week days are blank for “${FREQUENCIES[f!]}”, so Mon–Sat is planned. Fill the days (e.g. Mon, Wed, Fri) to plan only those.`);
  else if (want && days.length !== want) out.push(`“${FREQUENCIES[f!]}” usually means ${want} day${want > 1 ? "s" : ""}, but ${days.length} week day${days.length > 1 ? "s are" : " is"} given (${formatWeekDays(days)}). Saved as given.`);
  if (f && MONTH_BASED.includes(f)) {
    const rule = parseVisitDays(s.visitDays);
    if (!s.visitDays?.trim()) out.push(`Visit day(s) of month are blank for “${FREQUENCIES[f]}”, so no visit date is planned. Fill e.g. ${f === "MONTHLY" ? "7 or Last working day" : "5, 20 or 1st & 3rd Tue"}.`);
    else if (!rule) out.push(`Visit day(s) of month “${s.visitDays}” could not be read, so no visit date is planned. Use e.g. 5, 20 or 1st & 3rd Tue or Last working day.`);
    else if (f === "TWICE_A_MONTH" && (rule.kind === "lastWorkingDay" || (rule.kind === "dates" ? rule.days.length : rule.nth.length) !== 2)) out.push("“Twice a month” usually has 2 visit days. Saved as given.");
  }
  return out;
}

/** Planned dates in [from, to] (inclusive), at most `limit`; for the calendar and reminders. */
export function plannedDates(s: Schedule & { startDate: Date; endDate: Date | null }, from: Date, to: Date, holidays?: Set<string>, limit = 400): Date[] {
  const out: Date[] = [];
  const start = Math.max(from.getTime(), s.startDate.getTime());
  const end = Math.min(to.getTime(), s.endDate?.getTime() ?? Infinity);
  for (let t = start; t <= end && out.length < limit; t += DAY) {
    const d = new Date(t);
    if (isPlannedOn(s, d, holidays)) out.push(d);
  }
  return out;
}
