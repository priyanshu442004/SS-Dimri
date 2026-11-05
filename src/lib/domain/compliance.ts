// Compliance tracker rules (pure), as in the firm's Compliance Tracker workbook:
// days remaining, status and escalation all derive from the due date and whether action
// has been taken; "ESCALATE TO …" shows when a filing is within 7 days and not done.

export type ComplianceStatus = "COMPLETED" | "OVERDUE" | "DUE_THIS_WEEK" | "UPCOMING" | "OK";

export const COMPLIANCE_STATUS_LABELS: Record<ComplianceStatus, string> = {
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  DUE_THIS_WEEK: "Due this week",
  UPCOMING: "Upcoming",
  OK: "OK",
};

const DAY = 86_400_000;
export const ESCALATION_DAYS = 7;

export function daysRemaining(dueDate: Date, today: Date) {
  return Math.round((dueDate.getTime() - today.getTime()) / DAY);
}

export function complianceStatus(e: { dueDate: Date; actionTaken: boolean; reminderLeadDays: number }, today: Date): ComplianceStatus {
  if (e.actionTaken) return "COMPLETED";
  const d = daysRemaining(e.dueDate, today);
  if (d < 0) return "OVERDUE";
  if (d <= ESCALATION_DAYS) return "DUE_THIS_WEEK";
  return d <= e.reminderLeadDays ? "UPCOMING" : "OK";
}

export function isEscalated(e: { dueDate: Date; actionTaken: boolean }, today: Date) {
  return !e.actionTaken && daysRemaining(e.dueDate, today) <= ESCALATION_DAYS;
}

export const COMPLIANCE_FREQUENCIES = ["Monthly", "Quarterly", "Half-Yearly", "Annual", "One-Time"] as const;

/** Next due date when a recurring filing is done; null for one-time items. */
export function nextDueDate(due: Date, frequency: string | null | undefined): Date | null {
  const months = { Monthly: 1, Quarterly: 3, "Half-Yearly": 6, Annual: 12 }[frequency ?? ""];
  if (!months) return null;
  const y = due.getUTCFullYear();
  const m = due.getUTCMonth() + months;
  // Keep the day where the month allows it (31 Jan → 28 Feb, not 3 Mar).
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(due.getUTCDate(), lastDay)));
}

/** Usual authority for a department, to save retyping it on every row. */
export function defaultAuthority(department: string) {
  return ({ GST: "GST Dept", TDS: "TDS Dept", "Income Tax": "IT Dept", ROC: "ROC / MCA", ESI: "ESIC", EPF: "EPFO", MSME: "MSME Dept" } as Record<string, string>)[department] ?? "";
}

/** Maps the master list's free-text frequency ("Month 1 & 2 of quarter") to the tracker's choices. */
export function normalizeFrequency(raw: string | null | undefined): string {
  const f = (raw ?? "").toLowerCase();
  if (f.startsWith("month")) return "Monthly";
  if (f.startsWith("quarter")) return "Quarterly";
  if (f.startsWith("half")) return "Half-Yearly";
  if (f.startsWith("annual")) return "Annual";
  return "One-Time";
}
