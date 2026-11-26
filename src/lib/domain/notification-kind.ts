// Notifications are shown in two tabs (tracker S.No. 108, 25 Nov 2026): "Observations & error reports"
// — something went wrong or needs correcting (a client observation, a missed plan or EOD, an
// automatic absent mark, a missed mark-out, an overdue task or compliance, a memo, a photo not
// accepted, a correction asked for) — and "Notifications" for everything else (assigned, approved,
// decided, reminders, letters …). Pure: the page and the menu badge use the same rule.

const OBSERVATION_TYPES = new Set([
  "observation.assigned",
  "client.observation",
  "daily_plan.missing",
  "daily_plan.missing_team",
  "daily_plan.eod_missing",
  "daily_plan.eod_missing_team",
  "daily_plan.escalated",
  "attendance.auto_absent",
  "attendance.auto_absent_team",
  "attendance.missed_mark_out",
  "attendance.late_stay",
  "task.overdue",
  "compliance.escalated",
  "employee.memo",
]);

export type NotificationTab = "notifications" | "observations";

/** Some types carry both good and bad news: the title tells (e.g. "needs correction" vs "was reviewed"). */
const BAD_NEWS = /needs correction|marked absent|not accepted|rejected|returned|overdue|missed|not filed|fine/i;
const MIXED_TYPES = new Set(["timesheet.review", "attendance.photo_decided", "task.reviewed", "dayreport.reviewed"]);

export function notificationTab(n: { type: string; title: string }): NotificationTab {
  if (OBSERVATION_TYPES.has(n.type)) return "observations";
  if (MIXED_TYPES.has(n.type) && BAD_NEWS.test(n.title)) return "observations";
  return "notifications";
}
