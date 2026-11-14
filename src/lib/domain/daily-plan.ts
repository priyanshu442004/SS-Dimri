// Morning plan and EOD report (policy §2, §4), as pure rules.
//
// - The plan is due by 10:30; a later plan is accepted and shown as late.
// - The EOD report is the timesheet. A day worked needs one; it may be filed until the next
//   working day's reporting time. After that it is "not filed": a fine for the person.
// - The Team Lead must escalate a missing EOD the next day. If it is still missing at the end of
//   that day and nobody escalated it, the Team Lead is fined too.
// - Pending and Carried Forward lines need a reason; both come back as "old work" the next day.

import { addDays, dateOnly, toIsoDate, zonedDateTime } from "@/lib/dates";

/** The first day after `iso` that is not a Sunday or office holiday. */
export function nextWorkingDay(iso: string, holidays: ReadonlySet<string>): string {
  let d = addDays(dateOnly(iso), 1);
  for (let i = 0; i < 31 && (d.getUTCDay() === 0 || holidays.has(toIsoDate(d))); i++) d = addDays(d, 1);
  return toIsoDate(d);
}

export type EodDeadlines = {
  /** Last moment to file the EOD without a fine: the next working day's reporting time. */
  fileBy: Date;
  /** The Team Lead escalates a missing EOD by this time (end of that next working day). */
  escalateBy: Date;
  /** The next working day (when the deadline falls). */
  nextDay: string;
};

export function eodDeadlines(planIso: string, holidays: ReadonlySet<string>, reportingMinutes: number, endMinutes: number, tz: string): EodDeadlines {
  const nextDay = nextWorkingDay(planIso, holidays);
  return { nextDay, fileBy: zonedDateTime(nextDay, reportingMinutes, tz), escalateBy: zonedDateTime(nextDay, endMinutes, tz) };
}

export type EodState = "NOT_NEEDED" | "FILED" | "FILED_LATE" | "DUE" | "MISSED";

/** Where one day's EOD stands. Only days actually worked need one. */
export function eodState(v: { worked: boolean; submittedAt: Date | null; fileBy: Date; now: Date }): EodState {
  if (v.submittedAt) return v.submittedAt <= v.fileBy ? "FILED" : "FILED_LATE";
  if (!v.worked) return "NOT_NEEDED";
  return v.now <= v.fileBy ? "DUE" : "MISSED";
}

/** The person is fined when the EOD was not filed in time (filing it later does not undo it). */
export const personFined = (s: EodState) => s === "MISSED" || s === "FILED_LATE";

/**
 * The Team Lead is fined when, at the end of the next working day, the EOD is still not filed
 * and nobody escalated it by then.
 */
export function leadFined(v: { state: EodState; submittedAt: Date | null; escalatedAt: Date | null; escalateBy: Date; now: Date }): boolean {
  if (!personFined(v.state) || v.now <= v.escalateBy) return false;
  if (v.escalatedAt && v.escalatedAt <= v.escalateBy) return false;
  return !v.submittedAt || v.submittedAt > v.escalateBy;
}

/** Is it time to escalate (the EOD is overdue and the Team Lead has not escalated yet)? */
export const needsEscalation = (v: { state: EodState; escalatedAt: Date | null }) => v.state === "MISSED" && !v.escalatedAt;

export const planIsLate = (submittedAt: Date | null, dueBy: Date) => !!submittedAt && submittedAt > dueBy;

export type EodLine = { status: "DONE" | "PENDING" | "CARRIED_FORWARD" | null; reason: string | null; task: string };

/** Problems that stop the EOD from being filed: every line needs a status, and a reason when not done. */
export function eodProblems(lines: EodLine[]): string[] {
  const out: string[] = [];
  if (!lines.length) out.push("Add at least one line of work done today.");
  for (const l of lines) {
    if (!l.status) out.push(`Choose Done, Pending or Carried Forward for "${short(l.task)}".`);
    else if (l.status !== "DONE" && !l.reason?.trim()) out.push(`Give the reason "${short(l.task)}" is not done.`);
  }
  return out;
}

/** Lines that come back as old work the next day. */
export const carriesOver = (status: string | null) => status === "PENDING" || status === "CARRIED_FORWARD";

const short = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);
