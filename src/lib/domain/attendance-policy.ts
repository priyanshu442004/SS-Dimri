// Leave & Timing Policy calculations (pure). PROVISIONAL: the two policy
// versions conflict (slabs vs actual minutes, Sunday rules). Results are shown
// as indicative figures only and are never turned into salary deductions
// until `policyConfirmed` is true and payroll rules are agreed.

import { hhmmToMinutes, minutesOfDayInTz } from "@/lib/dates";

export type PolicyParams = {
  reportingGraceUntil: string; // "09:45"
  halfDayIfLeavingBefore: string; // "17:30"
  leavingGraceUntil: string; // "18:45"
  requiredMinutes: number;
  onsiteRequiredMinutes: number;
  reducedRequiredMinutes: number;
  farClientEarlyMonthMinutes: number;
  farClientEarlyMonthUntilDay: number;
  lateArrivalsPerHalfDay: number;
  lateGracePerMonth: number;
  overtimeMode: "ACTUAL_MINUTES" | "SLABS";
  overtimeMinutesPerDay: number;
};

export type Profile = "STANDARD" | "ONSITE" | "FAR_CLIENT" | "REDUCED_HOURS";

export type DayInput = {
  dayOfMonth: number;
  status: "PRESENT" | "ABSENT" | "LEAVE" | "HALF_DAY";
  timeIn: Date | null;
  timeOut: Date | null;
  lateReason?: string | null;
};

export type DayResult = {
  workedMinutes: number | null;
  requiredMinutes: number;
  isLate: boolean;
  leftBeforeHalfDayCutoff: boolean;
  /** Actual-minutes basis: may be negative (short day, policy OT-03). */
  overtimeMinutes: number | null;
  /** Old policy (slabs): after 18:45 only; <2.5h actual, >2.5h ½ day, >5h 1 day. */
  slabOvertimeDays: number;
  slabOvertimeMinutes: number;
};

export function requiredMinutesFor(profile: Profile, dayOfMonth: number, p: PolicyParams): number {
  switch (profile) {
    case "ONSITE":
      return p.onsiteRequiredMinutes;
    case "REDUCED_HOURS":
      return p.reducedRequiredMinutes;
    case "FAR_CLIENT":
      return dayOfMonth <= p.farClientEarlyMonthUntilDay ? p.farClientEarlyMonthMinutes : p.requiredMinutes;
    default:
      return p.requiredMinutes;
  }
}

export function evaluateDay(day: DayInput, profile: Profile, p: PolicyParams, tz: string): DayResult {
  const required = requiredMinutesFor(profile, day.dayOfMonth, p);
  const worked =
    day.timeIn && day.timeOut ? Math.max(0, Math.round((day.timeOut.getTime() - day.timeIn.getTime()) / 60000)) : null;
  const inMin = day.timeIn ? minutesOfDayInTz(day.timeIn, tz) : null;
  const outMin = day.timeOut ? minutesOfDayInTz(day.timeOut, tz) : null;
  const working = day.status === "PRESENT" || day.status === "HALF_DAY";

  let slabMinutes = 0;
  let slabDays = 0;
  if (working && outMin !== null) {
    const after = outMin - hhmmToMinutes(p.leavingGraceUntil);
    if (after > 0) {
      if (after > 300) slabDays = 1;
      else if (after > 150) slabDays = 0.5;
      else slabMinutes = after;
    }
  }

  return {
    workedMinutes: worked,
    requiredMinutes: required,
    isLate: working && inMin !== null && inMin > hhmmToMinutes(p.reportingGraceUntil),
    leftBeforeHalfDayCutoff: working && outMin !== null && outMin < hhmmToMinutes(p.halfDayIfLeavingBefore),
    // Overtime does not apply on leave days (OT-07).
    overtimeMinutes: working && worked !== null ? worked - required : null,
    slabOvertimeDays: slabDays,
    slabOvertimeMinutes: slabMinutes,
  };
}

export type MonthSummary = {
  presentDays: number;
  halfDays: number;
  leaveDays: number;
  absentDays: number;
  lateArrivals: number;
  lateArrivalsExcusedByGrace: number;
  lateHalfDays: number;
  earlyLeavingHalfDays: number;
  overtimeMinutes: number;
  overtimeDays: number;
  basis: "ACTUAL_MINUTES" | "SLABS";
};

export function summarizeMonth(days: DayInput[], profile: Profile, p: PolicyParams, tz: string): MonthSummary {
  const results = days.map((d) => ({ d, r: evaluateDay(d, profile, p, tz) }));
  const lates = results.filter((x) => x.r.isLate);
  // LT-05: up to `lateGracePerMonth` late arrivals with a recorded reason are excused.
  const excused = Math.min(p.lateGracePerMonth, lates.filter((x) => !!x.d.lateReason?.trim()).length);
  const counted = lates.length - excused;
  const lateHalfDays = Math.floor(counted / p.lateArrivalsPerHalfDay) * 0.5;

  let overtimeMinutes = 0;
  let overtimeDays = 0;
  if (p.overtimeMode === "ACTUAL_MINUTES") {
    overtimeMinutes = results.reduce((s, x) => s + (x.r.overtimeMinutes ?? 0), 0);
    overtimeDays = overtimeMinutes / p.overtimeMinutesPerDay;
  } else {
    overtimeMinutes = results.reduce((s, x) => s + x.r.slabOvertimeMinutes, 0);
    overtimeDays = results.reduce((s, x) => s + x.r.slabOvertimeDays, 0) + overtimeMinutes / p.overtimeMinutesPerDay;
  }

  return {
    presentDays: days.filter((d) => d.status === "PRESENT").length,
    halfDays: days.filter((d) => d.status === "HALF_DAY").length,
    leaveDays: days.filter((d) => d.status === "LEAVE").length,
    absentDays: days.filter((d) => d.status === "ABSENT").length,
    lateArrivals: lates.length,
    lateArrivalsExcusedByGrace: excused,
    lateHalfDays,
    earlyLeavingHalfDays: results.filter((x) => x.r.leftBeforeHalfDayCutoff).length * 0.5,
    overtimeMinutes,
    overtimeDays: Math.round(overtimeDays * 100) / 100,
    basis: p.overtimeMode,
  };
}
