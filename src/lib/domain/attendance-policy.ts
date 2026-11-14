// Leave, Timing and Office Decorum Rules and Regulations (client PDF, 14 Nov 2026), as pure
// functions. One source for every screen: My attendance, Team attendance, Payroll and the
// Excel exports all score days with `scoreMonth`, so a figure never differs between pages.
//
//   §5  Office 9:30–18:30, grace till 9:45. Client-site team: reporting time fixed by the Team
//       Lead, 8 hours in all.
//   §6  ≤15 min late: grace. 15 min–1 h late on 3 days in a month: half day. Over 1 h: half day.
//       One late arrival a month is excused when the Team Lead was told in the ERP beforehand.
//   §8  Leaving before 17:30 (one hour before the scheduled end) counts as a half day.
//   §9  Overtime: actual minutes from 18:46 to the time out, only with an approved request.
//   §10 One leave a month with intimation; without a request in the ERP an absence counts
//       double; Sundays and holidays inside a continuous leave count as leave; no leave in the
//       month adds two days' salary.

import { hhmmToMinutes, isoDateInTz, minutesOfDayInTz } from "@/lib/dates";

// ---------------------------------------------------------------- the schedule of a day

export type PolicyTimes = {
  officeStart: string; // "09:30"
  reportingGraceUntil: string; // "09:45"
  officeEnd: string; // "18:30"
  leavingGraceUntil: string; // "18:45"
  halfDayIfLeavingBefore: string; // "17:30"
  autoAbsentAt: string; // "12:00"
  onsiteRequiredMinutes: number; // 480 = 8 h for the client-site team
};

/** Minutes of the day. `start`/`end` is the scheduled day; the rest derive from it. */
export type Schedule = {
  start: number;
  graceUntil: number;
  end: number;
  halfDayBefore: number;
  /** Overtime counts after this minute (18:45 → from 18:46). */
  overtimeAfter: number;
  /** Not marked in by now → absent (§3). */
  absentAt: number;
  site: boolean;
};

export type ScheduleOwner = { attendanceProfile: string; siteReportingTime: string | null };

/** Has this person a client-site schedule set by the Team Lead? */
export const isSiteSchedule = (e: ScheduleOwner) => e.attendanceProfile === "ONSITE" && !!e.siteReportingTime;

/**
 * The office day, or the client-site day moved to the reporting time the Team Lead fixed. The
 * grace, the half-day cut-off and the overtime start keep the same distance from the start / end,
 * and the absent cut-off moves with a later start (it never comes before 12:00).
 */
export function scheduleFor(p: PolicyTimes, e: ScheduleOwner | null, recorded?: { start: string | null; end: string | null }): Schedule {
  const officeStart = hhmmToMinutes(p.officeStart);
  const officeEnd = hhmmToMinutes(p.officeEnd);
  const grace = hhmmToMinutes(p.reportingGraceUntil) - officeStart;
  const halfDayGap = officeEnd - hhmmToMinutes(p.halfDayIfLeavingBefore);
  const otGap = hhmmToMinutes(p.leavingGraceUntil) - officeEnd;
  const absent = hhmmToMinutes(p.autoAbsentAt);

  let start = officeStart;
  let end = officeEnd;
  let site = false;
  if (recorded?.start && recorded.end) {
    start = hhmmToMinutes(recorded.start);
    end = hhmmToMinutes(recorded.end);
    site = start !== officeStart || end !== officeEnd;
  } else if (e && isSiteSchedule(e)) {
    start = hhmmToMinutes(e.siteReportingTime!);
    end = start + p.onsiteRequiredMinutes;
    site = true;
  }
  return {
    start,
    graceUntil: start + grace,
    end,
    halfDayBefore: end - halfDayGap,
    overtimeAfter: end + otGap,
    absentAt: Math.max(absent, absent + (start - officeStart)),
    site,
  };
}

export const hhmm = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Minutes of `d` on the calendar day `iso` (a time out after midnight runs past 1440). */
export function minutesOn(d: Date, iso: string, tz: string): number {
  const m = minutesOfDayInTz(d, tz);
  return isoDateInTz(d, tz) > iso ? m + 1440 : m;
}

// ---------------------------------------------------------------- one day

export type LateBand = "ON_TIME" | "GRACE" | "LATE" | "VERY_LATE";

export type DayTimes = {
  lateMinutes: number;
  lateBand: LateBand;
  /** Left before the scheduled end. */
  leftEarly: boolean;
  /** Left before the half-day cut-off (17:30). */
  earlyHalfDay: boolean;
  /** Minutes after 18:45 to the time out, approved or not. */
  stayedMinutes: number;
  workedMinutes: number | null;
};

/** Arrival and leaving of one worked day against its schedule. */
export function timesOfDay(rec: { timeIn: Date | null; timeOut: Date | null }, iso: string, s: Schedule, veryLateAfter: number, tz: string): DayTimes {
  const inMin = rec.timeIn ? minutesOn(rec.timeIn, iso, tz) : null;
  const outMin = rec.timeOut ? minutesOn(rec.timeOut, iso, tz) : null;
  const lateMinutes = inMin === null ? 0 : Math.max(0, inMin - s.start);
  const grace = s.graceUntil - s.start;
  const lateBand: LateBand = lateMinutes === 0 ? "ON_TIME" : lateMinutes <= grace ? "GRACE" : lateMinutes <= veryLateAfter ? "LATE" : "VERY_LATE";
  return {
    lateMinutes,
    lateBand,
    leftEarly: outMin !== null && outMin < s.end,
    earlyHalfDay: outMin !== null && outMin < s.halfDayBefore,
    stayedMinutes: outMin === null ? 0 : Math.max(0, outMin - s.overtimeAfter),
    workedMinutes: rec.timeIn && rec.timeOut ? Math.max(0, Math.round((rec.timeOut.getTime() - rec.timeIn.getTime()) / 60000)) : null,
  };
}

// ---------------------------------------------------------------- a month

export type PolicyNumbers = {
  lateArrivalsPerHalfDay: number; // 3
  lateGracePerMonth: number; // 1
  veryLateAfterMinutes: number; // 60
  paidLeavesPerMonth: number; // 1
  unrequestedAbsenceDays: number; // 2 ("double absent")
  noLeaveBonusDays: number; // 2
  overtimeMinutesPerDay: number; // minutes that make one day's pay of overtime
};

export type DayInput = {
  iso: string;
  /** Sunday or office holiday. */
  off: boolean;
  /** Within the joining / exit dates. */
  employed: boolean;
  /** After the last day counted (today before the cut-off, or a future day): only known leave matters. */
  future: boolean;
  record: { status: "PRESENT" | "ABSENT" | "LEAVE" | "HALF_DAY"; timeIn: Date | null; timeOut: Date | null; autoAbsent?: boolean } | null;
  schedule: Schedule;
  /** Approved leave covering the day. */
  leave: { paid: boolean; halfDay: boolean; withIntimation: boolean } | null;
  /** A leave request (pending or rejected) exists for the day: an absence is then not "without intimation". */
  requested: boolean;
  /** Late intimation raised before the reporting time and not rejected (§6 warning). */
  lateIntimated: boolean;
  earlyLeaveApproved: boolean;
  overtimeApproved: boolean;
};

export type DayKind = "NOT_EMPLOYED" | "FUTURE" | "OFF" | "WORKED" | "HALF_DAY" | "LEAVE" | "HALF_LEAVE" | "ABSENT";

export type DayScore = {
  iso: string;
  kind: DayKind;
  times: DayTimes | null;
  /** The late arrival excused as this month's warning. */
  lateExcused: boolean;
  /** Absent without any request in the ERP: counts `unrequestedAbsenceDays`. */
  absentUnrequested: boolean;
  /** Sunday / holiday inside a continuous leave. */
  sandwiched: boolean;
  /** Leave paid from the monthly allowance. */
  paidLeave: number;
  unpaidLeave: number;
  /** Half day from leaving before 17:30 or arriving over an hour late. */
  earlyHalfDay: boolean;
  veryLateHalfDay: boolean;
  /** Left before the end without the Team Lead's permission (a flag, no deduction of its own). */
  leftEarlyUnapproved: boolean;
  overtimeMinutes: number;
  /** Stayed after 18:45 without approved overtime (not counted). */
  stayedUnapproved: number;
  /** Marked in, never marked out: hours and overtime can't be counted. */
  noTimeOut: boolean;
};

export type MonthScore = {
  days: DayScore[];
  employedDays: number;
  /** Employed days already reached (the rest of a running month is not counted yet). */
  countedDays: number;
  worked: number;
  halfDays: number;
  paidLeave: number;
  unpaidLeave: number;
  excessLeave: number;
  absent: number;
  absentUnrequested: number;
  /** Days deducted for absences (unrequested ones count double). */
  absentDaysCharged: number;
  sandwichDays: number;
  lateArrivals: number; // 15 min – 1 h
  veryLateArrivals: number; // over 1 h
  lateExcused: number;
  lateHalfDays: number;
  earlyHalfDays: number;
  overtimeMinutes: number;
  stayedUnapprovedMinutes: number;
  /** Everything unpaid, in days. */
  unpaidDays: number;
  payableDays: number;
  /** Any leave, absence or half day this month (no bonus then). */
  tookLeave: boolean;
};

const isFullWorking = (d: DayInput) => d.record && (d.record.status === "PRESENT" || d.record.status === "HALF_DAY");

function kindOf(d: DayInput): DayKind {
  if (!d.employed) return "NOT_EMPLOYED";
  if (isFullWorking(d)) {
    if (d.leave?.halfDay) return "HALF_LEAVE";
    return d.record!.status === "HALF_DAY" ? "HALF_DAY" : "WORKED";
  }
  if (d.leave) return d.leave.halfDay ? "HALF_LEAVE" : "LEAVE";
  if (d.future) return "FUTURE";
  if (d.record?.status === "LEAVE") return "LEAVE";
  if (d.off) return "OFF";
  return "ABSENT";
}

/** Is the day a full day away from work (for the Sunday / holiday rule)? */
function away(d: DayInput | undefined): boolean | null {
  if (!d || !d.employed) return null;
  if (isFullWorking(d)) return false;
  if (d.leave) return !d.leave.halfDay;
  if (d.record?.status === "LEAVE") return true;
  if (d.future) return null; // unknown yet
  return true; // absent / not marked
}

/**
 * Score a month. `days` must be in date order and may include a few days on each side of the
 * month (`inMonth` picks the month) so a Sunday on the edge is judged with its neighbours.
 */
export function scoreMonth(days: (DayInput & { inMonth: boolean })[], p: PolicyNumbers, tz: string): MonthScore {
  const scored: (DayScore & { inMonth: boolean; input: DayInput })[] = days.map((d) => {
    const kind = kindOf(d);
    const worked = kind === "WORKED" || kind === "HALF_DAY";
    const times = worked && d.record ? timesOfDay(d.record, d.iso, d.schedule, p.veryLateAfterMinutes, tz) : null;
    const scoreTimes = kind === "WORKED" ? times : null; // a half day is already half a day
    return {
      iso: d.iso,
      kind,
      times,
      lateExcused: false,
      absentUnrequested: kind === "ABSENT" && !d.requested,
      sandwiched: false,
      paidLeave: 0,
      unpaidLeave: 0,
      earlyHalfDay: !!scoreTimes?.earlyHalfDay,
      veryLateHalfDay: scoreTimes?.lateBand === "VERY_LATE",
      leftEarlyUnapproved: !!scoreTimes && scoreTimes.leftEarly && !scoreTimes.earlyHalfDay && !d.earlyLeaveApproved,
      overtimeMinutes: worked && d.overtimeApproved ? (times?.stayedMinutes ?? 0) : 0,
      stayedUnapproved: worked && !d.overtimeApproved ? (times?.stayedMinutes ?? 0) : 0,
      noTimeOut: worked && !!d.record?.timeIn && !d.record.timeOut,
      inMonth: d.inMonth,
      input: d,
    };
  });

  // §10: a Sunday or holiday with a full day away on both sides counts as leave.
  for (let i = 0; i < scored.length; i++) {
    if (scored[i].kind !== "OFF") continue;
    let a = i - 1;
    while (a >= 0 && scored[a].input.off && !isFullWorking(scored[a].input)) a--;
    let b = i + 1;
    while (b < scored.length && scored[b].input.off && !isFullWorking(scored[b].input)) b++;
    if (away(scored[a]?.input) === true && away(scored[b]?.input) === true) scored[i].sandwiched = true;
  }

  const month = scored.filter((s) => s.inMonth);

  // §6: one late arrival a month (the first one told in advance) is a warning only.
  let excusable = p.lateGracePerMonth;
  for (const s of month) {
    const band = s.kind === "WORKED" ? s.times?.lateBand : undefined;
    if (excusable > 0 && (band === "LATE" || band === "VERY_LATE") && s.input.lateIntimated) {
      s.lateExcused = true;
      s.veryLateHalfDay = false;
      excusable--;
    }
  }
  const lateArrivals = month.filter((s) => s.kind === "WORKED" && s.times?.lateBand === "LATE" && !s.lateExcused).length;
  const veryLate = month.filter((s) => s.veryLateHalfDay).length;
  const lateHalfDays = Math.floor(lateArrivals / Math.max(1, p.lateArrivalsPerHalfDay)) * 0.5 + veryLate * 0.5;

  // §10: leave with intimation is paid up to the monthly allowance; the rest is unpaid.
  let allowance = p.paidLeavesPerMonth;
  let excessLeave = 0;
  for (const s of month) {
    const units = s.kind === "LEAVE" ? 1 : s.kind === "HALF_LEAVE" ? 0.5 : 0;
    if (!units) continue;
    const l = s.input.leave;
    if (l && l.paid && l.withIntimation) {
      const paid = Math.min(units, allowance);
      allowance -= paid;
      s.paidLeave = paid;
      s.unpaidLeave = units - paid;
      excessLeave += units - paid;
    } else {
      s.unpaidLeave = units;
    }
  }
  // A half-day leave with nobody at work the other half: that half is an absence.
  const halfLeaveAbsent = month.filter((s) => s.kind === "HALF_LEAVE" && !isFullWorking(s.input) && !s.input.future).length * 0.5;

  const absentDays = month.filter((s) => s.kind === "ABSENT");
  const absentUnrequested = absentDays.filter((s) => s.absentUnrequested).length;
  const absentDaysCharged = (absentDays.length - absentUnrequested) + absentUnrequested * p.unrequestedAbsenceDays + halfLeaveAbsent;
  const sandwichDays = month.filter((s) => s.sandwiched).length;
  const halfDays = month.filter((s) => s.kind === "HALF_DAY").length;
  const earlyHalfDays = month.filter((s) => s.earlyHalfDay).length * 0.5;
  const paidLeave = month.reduce((t, s) => t + s.paidLeave, 0);
  const unpaidLeave = month.reduce((t, s) => t + s.unpaidLeave, 0);
  const employedDays = month.filter((s) => s.kind !== "NOT_EMPLOYED").length;
  const counted = month.filter((s) => s.kind !== "NOT_EMPLOYED" && s.kind !== "FUTURE").length;

  const unpaidDays = round2(unpaidLeave + absentDaysCharged + sandwichDays + halfDays * 0.5 + lateHalfDays + earlyHalfDays);
  const tookLeave = unpaidDays > 0 || paidLeave > 0;
  return {
    days: month.map(({ inMonth: _i, input: _d, ...s }) => s),
    employedDays,
    countedDays: counted,
    worked: month.filter((s) => s.kind === "WORKED").length,
    halfDays,
    paidLeave,
    unpaidLeave: round2(unpaidLeave - excessLeave),
    excessLeave,
    absent: absentDays.length,
    absentUnrequested,
    absentDaysCharged: round2(absentDaysCharged),
    sandwichDays,
    lateArrivals,
    veryLateArrivals: veryLate,
    lateExcused: month.filter((s) => s.lateExcused).length,
    lateHalfDays,
    earlyHalfDays,
    overtimeMinutes: month.reduce((t, s) => t + s.overtimeMinutes, 0),
    stayedUnapprovedMinutes: month.reduce((t, s) => t + s.stayedUnapproved, 0),
    unpaidDays,
    payableDays: Math.max(0, round2(counted - unpaidDays)),
    tookLeave,
  };
}

// ---------------------------------------------------------------- pay

export type PayInput = {
  monthlySalary: number | null;
  daysInMonth: number;
  /** The whole month has passed. */
  complete: boolean;
  /** Employed for every day of the month (the no-leave bonus needs a full month). */
  fullMonth: boolean;
  score: MonthScore;
  fines: number;
};

export type Pay = {
  perDay: number | null;
  basePay: number | null;
  overtimePay: number | null;
  bonusDays: number;
  bonus: number | null;
  fines: number;
  net: number | null;
};

export function computePay(i: PayInput, p: PolicyNumbers): Pay {
  const bonusDays = i.complete && i.fullMonth && !i.score.tookLeave ? p.noLeaveBonusDays : 0;
  if (i.monthlySalary === null) return { perDay: null, basePay: null, overtimePay: null, bonusDays, bonus: null, fines: i.fines, net: null };
  const perDay = i.monthlySalary / i.daysInMonth;
  const basePay = perDay * i.score.payableDays;
  const overtimePay = p.overtimeMinutesPerDay > 0 ? (perDay * i.score.overtimeMinutes) / p.overtimeMinutesPerDay : 0;
  const bonus = perDay * bonusDays;
  return {
    perDay: round2(perDay),
    basePay: round2(basePay),
    overtimePay: round2(overtimePay),
    bonusDays,
    bonus: round2(bonus),
    fines: i.fines,
    net: round2(Math.max(0, basePay + overtimePay + bonus - i.fines)),
  };
}

// ---------------------------------------------------------------- leave requests

/** Raised before the reporting time on the first day of leave → "with intimation" (§10). */
export function leaveWithIntimation(requestedAt: Date, fromIso: string, schedule: Schedule, tz: string): boolean {
  const day = isoDateInTz(requestedAt, tz);
  if (day < fromIso) return true;
  if (day > fromIso) return false;
  return minutesOfDayInTz(requestedAt, tz) < schedule.start;
}

/** Whole days between today and the first day of leave. */
export function noticeDays(todayIso: string, fromIso: string): number {
  return Math.round((Date.parse(`${fromIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86_400_000);
}

const round2 = (n: number) => Math.round(n * 100) / 100;
