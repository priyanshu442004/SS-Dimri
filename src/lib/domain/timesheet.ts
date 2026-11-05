// Timesheet rules from the firm's Team Timesheet workbook (pure).

export const RESOURCE_TYPES = ["Dedicated", "Shared", "Backend Team"] as const;

/** Review window for a submitted entry: within 24 h is on time, 24–36 h due soon, past 36 h escalated. */
export const DUE_SOON_HOURS = 24;
export const OVERDUE_HOURS = 36;

export type Sla = "WITHIN" | "DUE_SOON" | "OVERDUE" | "REVIEWED";

export function slaOf(entry: { submittedAt: Date; reviewedAt?: Date | null; status?: string }, now: Date): Sla {
  if (entry.status === "REVIEWED" || entry.status === "RETURNED") return "REVIEWED";
  const hours = (now.getTime() - entry.submittedAt.getTime()) / 3_600_000;
  return hours > OVERDUE_HOURS ? "OVERDUE" : hours > DUE_SOON_HOURS ? "DUE_SOON" : "WITHIN";
}

/** Minutes between two "HH:MM" times on the same day; null when incomplete or reversed. */
export function minutesBetween(start?: string | null, end?: string | null): number | null {
  if (!start || !end) return null;
  const toMin = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return h * 60 + m;
  };
  const diff = toMin(end) - toMin(start);
  return diff > 0 ? diff : null;
}

/** Late submission: the entry was not filled in on the calendar day the work was done. */
export function isLateSubmission(submittedOnIso: string, workDateIso: string) {
  return submittedOnIso !== workDateIso;
}

/** Late review: the senior took longer than the window, or still has not reviewed it. */
export function isLateReview(entry: { submittedAt: Date; reviewedAt?: Date | null; status: string }, now: Date) {
  if (entry.status === "RETURNED" || entry.status === "REVIEWED") {
    return !!entry.reviewedAt && entry.reviewedAt.getTime() - entry.submittedAt.getTime() > OVERDUE_HOURS * 3_600_000;
  }
  return slaOf(entry, now) === "OVERDUE";
}

/** Assessment years to offer, e.g. for 5 Nov 2026 (FY 2026-27): AY 2023-24 … AY 2027-28. */
export function assessmentYears(today: Date) {
  const fyStart = today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  const ayStart = fyStart + 1;
  const ay = (y: number) => `AY ${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  return [ay(ayStart - 4), ay(ayStart - 3), ay(ayStart - 2), ay(ayStart - 1), ay(ayStart)];
}
