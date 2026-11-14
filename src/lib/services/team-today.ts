import "server-only";
import { prisma } from "@/lib/db";
import { hhmmToMinutes, minutesOfDayInTz, todayDateOnly, zonedDateTime, toIsoDate } from "@/lib/dates";
import type { AppContext } from "@/lib/session";
import { timesOfDay } from "@/lib/domain/attendance-policy";
import { pendingRequestCount } from "./attendance-requests";
import { toEscalate } from "./daily-plans";
import { getPolicy, holidaySet, isOffDay, leadScopeIds, ruleSubjects, scheduleOf } from "./office-rules";

/**
 * What a Team Lead (or an administrator, for the firm) has to act on today under the office
 * rules: who is not in yet, late, absent, without a morning plan, staying late without approval,
 * EOD reports to escalate, and forms and leave waiting for a decision. Null when nobody reports to them.
 */
export async function teamToday(ctx: AppContext) {
  const scope = await leadScopeIds(ctx);
  if (scope !== "ALL" && !scope.length) return null;
  const tz = ctx.organization.timezone;
  const day = todayDateOnly(tz);
  const iso = toIsoDate(day);
  const now = new Date();
  const nowMin = minutesOfDayInTz(now, tz);
  const [policy, subjects, holidays] = await Promise.all([getPolicy(ctx.organization.id), ruleSubjects(ctx.organization.id), holidaySet(ctx.organization.id, day, day)]);
  const ids = [...subjects.keys()].filter((id) => (scope === "ALL" || scope.includes(id)) && id !== ctx.employee?.id);
  const [employees, records, leaves, plans, otApproved, requests, leaveWaiting, escalate] = await Promise.all([
    prisma.employee.findMany({ where: { id: { in: ids }, OR: [{ dateOfJoining: null }, { dateOfJoining: { lte: day } }] }, select: { id: true, attendanceProfile: true, siteReportingTime: true } }),
    prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, attendanceDate: day }, select: { employeeId: true, status: true, timeIn: true, timeOut: true, scheduledStart: true, scheduledEnd: true } }),
    prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", fromDate: { lte: day }, toDate: { gte: day } }, select: { employeeId: true } }),
    prisma.dailyPlan.findMany({ where: { employeeId: { in: ids }, planDate: day, planSubmittedAt: { not: null } }, select: { employeeId: true, approvedAt: true } }),
    prisma.attendanceRequest.findMany({ where: { employeeId: { in: ids }, requestDate: day, kind: "OVERTIME", status: "APPROVED" }, select: { employeeId: true } }),
    pendingRequestCount(ctx),
    prisma.leaveRequest.count({ where: { employeeId: { in: ids }, status: "PENDING" } }),
    toEscalate(ctx),
  ]);
  const recBy = new Map(records.map((r) => [r.employeeId, r]));
  const onLeave = new Set(leaves.map((l) => l.employeeId));
  const planned = new Set(plans.map((p) => p.employeeId));
  const ot = new Set(otApproved.map((o) => o.employeeId));
  const off = isOffDay(iso, holidays);
  let notIn = 0, late = 0, absent = 0, present = 0, staying = 0, noPlan = 0;
  for (const e of employees) {
    const r = recBy.get(e.id);
    const s = scheduleOf(policy, e, r);
    if (r?.timeIn) {
      present++;
      const t = timesOfDay({ timeIn: r.timeIn, timeOut: null }, iso, s, policy.numbers.veryLateAfterMinutes, tz);
      if (t.lateBand === "LATE" || t.lateBand === "VERY_LATE") late++;
      if (!r.timeOut && nowMin > s.overtimeAfter && !ot.has(e.id)) staying++;
      if (subjects.get(e.id)?.plans && !planned.has(e.id)) noPlan++;
    } else if (r?.status === "ABSENT") absent++;
    else if (!off && !onLeave.has(e.id) && r?.status !== "LEAVE") notIn++;
  }
  const planDue = now >= zonedDateTime(iso, hhmmToMinutes(policy.row.morningPlanBy), tz);
  return {
    team: employees.length, present, notIn, late, absent, staying, onLeave: onLeave.size,
    noPlan, planDue, plansToApprove: plans.filter((p) => !p.approvedAt).length,
    escalate: escalate.length, requests, leaveWaiting, off,
    absentAt: policy.row.autoAbsentAt, morningPlanBy: policy.row.morningPlanBy, leadPenalty: policy.row.leadPenaltyRupees,
    firmWide: scope === "ALL",
  };
}
