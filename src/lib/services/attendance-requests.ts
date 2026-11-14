import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zIsoDate, zOptionalText } from "@/lib/actions";
import { dateOnly, formatDate, hhmmToMinutes, minutesOfDayInTz, todayDateOnly } from "@/lib/dates";
import { hhmm } from "@/lib/domain/attendance-policy";
import type { AppContext } from "@/lib/session";
import { NO_EMPLOYEE } from "@/lib/ids";
import { audit } from "./audit";
import { notifyEmployees, notifyRoles } from "./notifications";
import { requestLeave } from "./attendance";
import { actsAsLeadFor, getPolicy, holidaySet, isOffDay, leadScopeIds, scheduleOf } from "./office-rules";

// Forms raised in the ERP (policy §2, §3, §6, §8, §9):
//   - "I'll be late": reason and expected arrival time, before the reporting time. The first one
//     a month that the Team Lead does not reject excuses that day's late arrival (§6).
//   - "I can't come today": becomes a same-day leave request for the Team Lead to decide (§10).
//   - "Leave early": the Team Lead's permission to leave before the scheduled time (§8).
//   - "Overtime": prior permission to stay after 18:45, stating the task and why it cannot wait
//     till tomorrow (§8, §9). Only approved overtime is counted.

const hhmmField = z.string().regex(/^\d{2}:\d{2}$/, "Enter a time");

export const requestSchema = z.object({
  kind: z.enum(["LATE_ARRIVAL", "ABSENT", "EARLY_LEAVE", "OVERTIME"], { error: "Choose what you are informing" }),
  requestDate: zIsoDate,
  atTime: hhmmField.optional(),
  reason: z.string({ error: "Give the reason" }).trim().min(3, "Give the reason").max(1000),
  task: zOptionalText(1000),
  whyNotTomorrow: zOptionalText(1000),
});

export const KIND_LABEL = { LATE_ARRIVAL: "Late arrival", EARLY_LEAVE: "Leave early", OVERTIME: "Overtime" } as const;

export async function raiseRequest(ctx: AppContext, v: z.infer<typeof requestSchema>): Promise<string> {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  const tz = ctx.organization.timezone;
  const today = todayDateOnly(tz);
  const day = dateOnly(v.requestDate);
  if (day < today) throw new BusinessRuleError("This form is for today or a later day. For a past day, speak to your Team Lead.");
  if (v.kind === "ABSENT") {
    const r = await requestLeave(ctx, { fromDate: v.requestDate, toDate: v.requestDate, leaveType: "CASUAL", reason: v.reason }, { source: "absent_intimation" });
    return `Your Team Lead is informed and a leave request for ${formatDate(day)} is raised${r.withIntimation ? "" : " (after the reporting time, so it counts as leave without prior intimation)"}.`;
  }
  const [policy, emp, holidays] = await Promise.all([
    getPolicy(ctx.organization.id),
    prisma.employee.findUniqueOrThrow({ where: { id: ctx.employee.id }, select: { attendanceProfile: true, siteReportingTime: true } }),
    holidaySet(ctx.organization.id, day, day),
  ]);
  if (isOffDay(v.requestDate, holidays)) throw new BusinessRuleError(`${formatDate(day)} is a Sunday or office holiday.`);
  const record = await prisma.attendanceRecord.findFirst({ where: { employeeId: ctx.employee.id, attendanceDate: day } });
  const s = scheduleOf(policy, emp, record);
  const isToday = day.getTime() === today.getTime();
  const nowMin = minutesOfDayInTz(new Date(), tz);
  let inAdvance = true;
  const data: { atTime?: string; task?: string; whyNotTomorrow?: string } = {};

  if (v.kind === "LATE_ARRIVAL") {
    if (!v.atTime) throw new BusinessRuleError("Enter the time you expect to arrive.");
    if (record?.timeIn) throw new BusinessRuleError("You have already marked in today.");
    if (record?.autoAbsentAt) throw new BusinessRuleError("Today is already marked Absent by the ERP.");
    if (hhmmToMinutes(v.atTime) <= s.start) throw new BusinessRuleError(`Your reporting time is ${hhmm(s.start)}; enter a later arrival time.`);
    if (hhmmToMinutes(v.atTime) >= s.absentAt) throw new BusinessRuleError(`Arriving after ${hhmm(s.absentAt)} means the day is marked Absent. Use "I can't come today" or ask for a half-day leave.`);
    inAdvance = !isToday || nowMin < s.start;
    data.atTime = v.atTime;
  } else if (v.kind === "EARLY_LEAVE") {
    if (!v.atTime) throw new BusinessRuleError("Enter the time you want to leave.");
    if (hhmmToMinutes(v.atTime) >= s.end) throw new BusinessRuleError(`Your day ends at ${hhmm(s.end)}; this form is for leaving before that.`);
    if (record?.timeOut) throw new BusinessRuleError("You have already marked out today.");
    inAdvance = !isToday || nowMin < hhmmToMinutes(v.atTime);
    data.atTime = v.atTime;
  } else {
    if (!v.task?.trim()) throw new BusinessRuleError("Say what task you will be doing.");
    if (!v.whyNotTomorrow?.trim()) throw new BusinessRuleError("Say why it cannot wait till tomorrow.");
    if (isToday && nowMin >= s.overtimeAfter) throw new BusinessRuleError(`Overtime needs the Team Lead's permission before ${hhmm(s.overtimeAfter)} (office rule 8). It cannot be asked for afterwards.`);
    if (record?.timeOut) throw new BusinessRuleError("You have already marked out today.");
    if (v.atTime && hhmmToMinutes(v.atTime) <= s.overtimeAfter) throw new BusinessRuleError(`Overtime starts after ${hhmm(s.overtimeAfter)}; enter a later finish time.`);
    Object.assign(data, { atTime: v.atTime, task: v.task, whyNotTomorrow: v.whyNotTomorrow });
  }

  const existing = await prisma.attendanceRequest.findUnique({ where: { employeeId_requestDate_kind: { employeeId: ctx.employee.id, requestDate: day, kind: v.kind } } });
  if (existing && existing.status !== "CANCELLED") throw new BusinessRuleError(`You already raised a ${KIND_LABEL[v.kind].toLowerCase()} form for ${formatDate(day)}${existing.status === "PENDING" ? "; it is waiting for your Team Lead" : ` and it was ${existing.status.toLowerCase()}`}.`);
  await prisma.$transaction(async (tx) => {
    const fields = { reason: v.reason, inAdvance, ...data, status: "PENDING" as const, decidedById: null, decidedAt: null, decisionNote: null };
    const r = existing
      ? await tx.attendanceRequest.update({ where: { id: existing.id }, data: fields })
      : await tx.attendanceRequest.create({ data: { organizationId: ctx.organization.id, employeeId: ctx.employee!.id, kind: v.kind as "LATE_ARRIVAL" | "EARLY_LEAVE" | "OVERTIME", requestDate: day, ...fields } });
    await audit(tx, ctx, `attendance_request.${v.kind.toLowerCase()}`, "attendance_request", r.id);
    const who = ctx.employee!.firstName;
    const when = isToday ? "today" : formatDate(day);
    const title =
      v.kind === "LATE_ARRIVAL" ? `${who} will be late ${when} (arriving ${v.atTime})`
      : v.kind === "EARLY_LEAVE" ? `${who} asks to leave at ${v.atTime} ${when}`
      : `${who} asks to stay late ${when}${v.atTime ? ` (till ${v.atTime})` : ""}`;
    const body = v.kind === "OVERTIME" ? `Task: ${v.task} · Why it can't wait: ${v.whyNotTomorrow}` : v.reason;
    await notifyLeads(tx, ctx, { type: "attendance.request", title, body, link: "/app/attendance?tab=requests" });
  });
  if (v.kind === "LATE_ARRIVAL") return inAdvance ? "Your Team Lead is informed. One late arrival a month informed in advance is a warning only." : "Your Team Lead is informed. This was after your reporting time, so it does not count as informed in advance.";
  if (v.kind === "EARLY_LEAVE") return `Request sent to your Team Lead.${hhmmToMinutes(v.atTime!) < s.halfDayBefore ? ` Leaving before ${hhmm(s.halfDayBefore)} counts as a half day even with permission.` : ""}`;
  return "Overtime request sent to your Team Lead. Only approved overtime is counted.";
}

async function notifyLeads(tx: Prisma.TransactionClient, ctx: AppContext, note: { type: string; title: string; body?: string; link: string }) {
  const managers = await tx.employeeReportingRelationship.findMany({ where: { employeeId: ctx.employee!.id }, select: { managerId: true } });
  if (managers.length) await notifyEmployees(tx, ctx.organization.id, managers.map((m) => m.managerId), note);
  else await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], note, ctx.user.id);
}

export async function cancelRequest(ctx: AppContext, id: string) {
  const r = await prisma.attendanceRequest.findFirst({ where: { id, employeeId: ctx.employee?.id ?? NO_EMPLOYEE, status: "PENDING" } });
  if (!r) throw new BusinessRuleError("Only your own requests that are still waiting can be withdrawn.");
  await prisma.$transaction(async (tx) => {
    await tx.attendanceRequest.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, ctx, "attendance_request.cancelled", "attendance_request", id);
  });
}

export const decideSchema = z.object({ decision: z.enum(["approve", "reject"]), note: zOptionalText(500) });

export async function decideRequest(ctx: AppContext, id: string, v: z.infer<typeof decideSchema>) {
  const r = await prisma.attendanceRequest.findFirst({ where: { id, organizationId: ctx.organization.id }, include: { employee: { select: { firstName: true } } } });
  if (!r || r.status === "CANCELLED") throw new BusinessRuleError("Request not found or withdrawn.");
  if (!(await actsAsLeadFor(ctx, r.employeeId))) throw new BusinessRuleError("You can only decide for people who report to you.");
  // A late intimation may be changed later (accepted ↔ not genuine); permissions are decided once.
  if (r.kind !== "LATE_ARRIVAL" && r.status !== "PENDING") throw new BusinessRuleError("This request was already decided. Refresh the page.");
  const approve = v.decision === "approve";
  await prisma.$transaction(async (tx) => {
    await tx.attendanceRequest.update({ where: { id }, data: { status: approve ? "APPROVED" : "REJECTED", decidedById: ctx.user.id, decidedAt: new Date(), decisionNote: v.note } });
    await audit(tx, ctx, approve ? "attendance_request.approved" : "attendance_request.rejected", "attendance_request", id);
    const what = r.kind === "LATE_ARRIVAL" ? `Your late-arrival reason for ${formatDate(r.requestDate)} was ${approve ? "accepted" : "not accepted as genuine"}`
      : `Your ${KIND_LABEL[r.kind].toLowerCase()} request for ${formatDate(r.requestDate)} was ${approve ? "approved" : "rejected"}`;
    await notifyEmployees(tx, ctx.organization.id, [r.employeeId], { type: "attendance.request_decided", title: what, body: v.note, link: "/app/attendance?tab=requests" });
  });
  return r.employee.firstName;
}

/** This member's own forms, newest first. */
export async function myRequests(ctx: AppContext) {
  if (!ctx.employee) return [];
  return prisma.attendanceRequest.findMany({
    where: { employeeId: ctx.employee.id },
    orderBy: [{ requestDate: "desc" }, { createdAt: "desc" }],
    take: 30,
    include: { decidedBy: { select: { name: true } } },
  });
}

/** Forms to decide: pending permissions, and recent late intimations (to mark one not genuine). */
export async function requestsToDecide(ctx: AppContext) {
  const scope = await leadScopeIds(ctx);
  if (scope !== "ALL" && !scope.length) return [];
  const since = new Date(todayDateOnly(ctx.organization.timezone).getTime() - 7 * 86_400_000);
  return prisma.attendanceRequest.findMany({
    where: {
      organizationId: ctx.organization.id,
      employeeId: scope === "ALL" ? { not: ctx.employee?.id ?? NO_EMPLOYEE } : { in: scope },
      OR: [{ status: "PENDING" }, { kind: "LATE_ARRIVAL", requestDate: { gte: since }, status: { not: "CANCELLED" } }],
    },
    orderBy: [{ status: "asc" }, { requestDate: "asc" }, { createdAt: "asc" }],
    take: 100,
    include: { employee: { select: { id: true, firstName: true, lastName: true } }, decidedBy: { select: { name: true } } },
  });
}

/** Count for the tab badge and the dashboards: permissions waiting (late intimations need no action). */
export async function pendingRequestCount(ctx: AppContext) {
  const scope = await leadScopeIds(ctx);
  if (scope !== "ALL" && !scope.length) return 0;
  return prisma.attendanceRequest.count({
    where: { organizationId: ctx.organization.id, status: "PENDING", kind: { in: ["EARLY_LEAVE", "OVERTIME"] }, employeeId: scope === "ALL" ? { not: ctx.employee?.id ?? NO_EMPLOYEE } : { in: scope } },
  });
}

