// Pure rules for the attendance additions of 12 Nov 2026: lunch in / out, the mark-out
// reminder, photo attendance marked by a colleague, and daily (contract) workers' pay.

import { hhmmToMinutes, minutesOfDayInTz } from "@/lib/dates";

// ---------------------------------------------------------------- lunch

/** Minutes allowed for lunch under the policy (lunch start → lunch end). */
export function lunchAllowanceMinutes(lunchStart: string, lunchEnd: string): number {
  return Math.max(0, hhmmToMinutes(lunchEnd) - hhmmToMinutes(lunchStart));
}

/**
 * Length of the lunch break. While someone is still at lunch it runs to `now`.
 * Null when no lunch was taken.
 */
export function lunchMinutes(lunchOutAt: Date | null, lunchInAt: Date | null, now = new Date()): number | null {
  if (!lunchOutAt) return null;
  const end = lunchInAt ?? now;
  return Math.max(0, Math.round((end.getTime() - lunchOutAt.getTime()) / 60000));
}

/** Minutes taken beyond the allowance (0 when within it or no lunch). */
export function lunchOverMinutes(taken: number | null, allowance: number): number {
  return taken === null ? 0 : Math.max(0, taken - allowance);
}

// ---------------------------------------------------------------- mark-out reminder

/** Is it time to remind people still marked in today? (`at` is the policy's HH:MM.) */
export function markOutReminderDue(now: Date, at: string, tz: string): boolean {
  return minutesOfDayInTz(now, tz) >= hhmmToMinutes(at);
}

/** A record with a time in but no time out, on a past day or today after the reminder time. */
export function isMissingTimeOut(r: { timeIn: Date | null; timeOut: Date | null; isToday: boolean }, reminderDue: boolean): boolean {
  return !!r.timeIn && !r.timeOut && (!r.isToday || reminderDue);
}

// ---------------------------------------------------------------- photo attendance by a colleague

/**
 * May this person check (accept / mark absent) a photo attendance? Those with the right to
 * check everyone's may; seniors and managers may for people who report to them. Nobody checks
 * a mark they made themselves unless they hold the firm-wide right.
 */
export function mayReviewPhoto(v: { reviewAll: boolean; isReportingManager: boolean; markedByMe: boolean; isMine: boolean }): boolean {
  if (v.isMine) return false;
  if (v.reviewAll) return true;
  return v.isReportingManager && !v.markedByMe;
}

// ---------------------------------------------------------------- daily workers

export type WorkerDayStatus = "PRESENT" | "HALF_DAY" | "ABSENT";

/** Earnings for one day: full wage when present, half on a half day, nothing when absent. */
export function wageForDay(dailyWage: number, status: WorkerDayStatus): number {
  if (status === "PRESENT") return round2(dailyWage);
  if (status === "HALF_DAY") return round2(dailyWage / 2);
  return 0;
}

export type WorkerPayoff = {
  fullDays: number;
  halfDays: number;
  absentDays: number;
  /** Full days + half of the half days. */
  daysWorked: number;
  earned: number;
  paid: number;
  due: number;
};

/** Pay summary for a worker over a period, from their marked days. */
export function summarizeWorkerDays(days: { status: string; wage: number; paid: boolean }[]): WorkerPayoff {
  const fullDays = days.filter((d) => d.status === "PRESENT").length;
  const halfDays = days.filter((d) => d.status === "HALF_DAY").length;
  const earned = round2(days.reduce((s, d) => s + d.wage, 0));
  const paid = round2(days.filter((d) => d.paid).reduce((s, d) => s + d.wage, 0));
  return {
    fullDays,
    halfDays,
    absentDays: days.filter((d) => d.status === "ABSENT").length,
    daysWorked: fullDays + halfDays * 0.5,
    earned,
    paid,
    due: round2(earned - paid),
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
