import { minutesToHhmm } from "@/lib/dates";
import type { DayScore } from "@/lib/domain/attendance-policy";
import { Badge } from "@/components/ui";

/** What the office rules made of one day, as short badges (same wording on every page). */
export function DayFlags({ s, halfDayAt }: { s: DayScore; halfDayAt: string }) {
  const t = s.times;
  const out: React.ReactNode[] = [];
  if (t && (t.lateBand === "LATE" || t.lateBand === "VERY_LATE")) {
    if (s.lateExcused) out.push(<Badge key="l" tone="info">Late {t.lateMinutes} min · excused (informed)</Badge>);
    else if (t.lateBand === "VERY_LATE") out.push(<Badge key="l" tone="danger">Late {minutesToHhmm(t.lateMinutes)} · ½ day</Badge>);
    else out.push(<Badge key="l" tone="warn">Late {t.lateMinutes} min</Badge>);
  } else if (t?.lateBand === "GRACE") out.push(<Badge key="g" tone="neutral">In grace ({t.lateMinutes} min)</Badge>);
  if (s.earlyHalfDay) out.push(<Badge key="e" tone="danger">Left before {halfDayAt} · ½ day</Badge>);
  else if (s.leftEarlyUnapproved) out.push(<Badge key="e" tone="warn">Left early without permission</Badge>);
  if (s.overtimeMinutes > 0) out.push(<Badge key="o" tone="ok">Overtime {minutesToHhmm(s.overtimeMinutes)}</Badge>);
  if (s.stayedUnapproved > 0) out.push(<Badge key="s" tone="warn">Stayed {minutesToHhmm(s.stayedUnapproved)} late · not approved</Badge>);
  if (s.noTimeOut) out.push(<Badge key="n" tone="danger">No time out</Badge>);
  if (s.kind === "ABSENT") out.push(<Badge key="a" tone="danger">{s.absentUnrequested ? "Absent without a request · counts double" : "Absent"}</Badge>);
  if (s.kind === "HALF_DAY") out.push(<Badge key="h" tone="warn">Half day</Badge>);
  if (s.sandwiched) out.push(<Badge key="w" tone="warn">Counts as leave (inside a leave)</Badge>);
  if (s.paidLeave > 0) out.push(<Badge key="p" tone="info">Paid leave{s.paidLeave < 1 ? " (½)" : ""}</Badge>);
  if (s.unpaidLeave > 0) out.push(<Badge key="u" tone="warn">Unpaid leave{s.unpaidLeave < 1 ? " (½)" : ""}</Badge>);
  return out.length ? <span className="flex flex-wrap gap-1">{out}</span> : null;
}
