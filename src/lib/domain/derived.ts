// Values the handwritten notes list as fields but which are DERIVED from
// source columns rather than stored (see docs/requirements-traceability.md).

import { isoDateInTz } from "@/lib/dates";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Attendance "Work hours" = time out - time in. */
export function workHours(timeIn: Date | null, timeOut: Date | null): number | null {
  if (!timeIn || !timeOut) return null;
  return Math.max(0, (timeOut.getTime() - timeIn.getTime()) / 3_600_000);
}

/** Task "Overdue" status. */
export function isTaskOverdue(task: { dueAt: Date | null; status: string }, now = new Date()): boolean {
  return !!task.dueAt && task.dueAt < now && task.status !== "COMPLETED" && task.status !== "CANCELLED";
}

export type PendingDaysBasis = "CALENDAR" | "BUSINESS";

/**
 * Pending tracker "Days pending" = days from the request date to the close
 * date (or today), counted in the firm's timezone.
 * - CALENDAR (default): every day counts.
 * - BUSINESS: Monday–Saturday count (the firm's working week); Sundays do not.
 *   Public holidays are not excluded (no holiday calendar has been supplied).
 * Which basis applies is not confirmed by the firm; it is an organization setting.
 */
export function daysPending(
  item: { requestedOn: Date; closedAt: Date | null },
  today = new Date(),
  basis: PendingDaysBasis = "CALENDAR",
): number {
  // requested_on is a calendar date (UTC midnight); closed_at/today are instants → firm-local day.
  const startUtc = Date.UTC(item.requestedOn.getUTCFullYear(), item.requestedOn.getUTCMonth(), item.requestedOn.getUTCDate());
  const endUtc = Date.parse(`${isoDateInTz(item.closedAt ?? today)}T00:00:00Z`);
  const days = Math.max(0, Math.round((endUtc - startUtc) / MS_PER_DAY));
  if (basis === "CALENDAR") return days;
  let count = 0;
  for (let i = 1; i <= days; i++) {
    if (new Date(startUtc + i * MS_PER_DAY).getUTCDay() !== 0) count++;
  }
  return count;
}

/** Employee "Age" from date of birth. */
export function ageOn(dateOfBirth: Date | null, on = new Date()): number | null {
  if (!dateOfBirth) return null;
  let age = on.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (on.getUTCMonth() === dateOfBirth.getUTCMonth() && on.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) age--;
  return age;
}

/** Probation end date from joining date and the organization's default probation days. */
export function probationEndDate(startDate: Date, probationDays: number): Date {
  return new Date(startDate.getTime() + probationDays * MS_PER_DAY);
}
