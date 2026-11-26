import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zOptionalText } from "@/lib/actions";
import { formatDate, formatTime, hhmmToMinutes, minutesOfDayInTz, monthRange, toIsoDate, todayDateOnly, zonedDateTime } from "@/lib/dates";
import { hhmm, scheduleFor, type Schedule } from "@/lib/domain/attendance-policy";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { NO_EMPLOYEE } from "@/lib/ids";
import { audit } from "./audit";
import { notifyEmployees, notifyRoles } from "./notifications";
import { getPolicy, scheduleOf, type Policy } from "./office-rules";

// "Please mark my attendance" (client, 25 Nov 2026). Someone who forgot to mark in, or could not
// (phone, location, network), asks in the ERP. Every senior above them (up to four levels) is told
// and any of them can mark it; if nobody does, the person can send it on to the administrators.
// Nobody can mark it after the absent cut-off (12:00) — the ERP then marks the day Absent as usual.
// Up to `requestMarksPerMonth` (3) such days a month count normally; each later one is a half day
// (worked out in scoreMonth, so payroll and every page agree).

const DEPTH = 4;
const LOCATIONS = ["OFFICE", "CLIENT_OFFICE", "CLIENT_VISIT"] as const;

export const markRequestSchema = z.object({
  atTime: z.string({ error: "Enter the time you reached" }).regex(/^\d{2}:\d{2}$/, "Enter the time you reached"),
  workLocation: z.enum(LOCATIONS, { error: "Choose where you are working today" }),
  workPlace: zOptionalText(200),
  reason: z.string({ error: "Say why you could not mark it yourself" }).trim().min(3, "Say why you could not mark it yourself").max(1000),
});

/** Everyone above this person in the reporting line, nearest first (up to four levels). */
export async function seniorsAbove(employeeId: string, depth = DEPTH): Promise<string[]> {
  const out: string[] = [];
  let level = [employeeId];
  for (let i = 0; i < depth && level.length; i++) {
    const rels = await prisma.employeeReportingRelationship.findMany({ where: { employeeId: { in: level } }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], select: { managerId: true } });
    level = [...new Set(rels.map((r) => r.managerId))].filter((id) => id !== employeeId && !out.includes(id));
    out.push(...level);
  }
  return out;
}

/** May this member mark the person's attendance on request: an administrator, or a senior above them. */
export async function maySeniorMark(ctx: AppContext, employeeId: string): Promise<boolean> {
  if (employeeId === ctx.employee?.id) return false;
  if (can(ctx, "org.manage")) return true;
  if (!ctx.employee) return false;
  return (await seniorsAbove(employeeId)).includes(ctx.employee.id);
}

async function scheduleForRequest(organizationId: string, policy: Policy, employeeId: string, loc: { workLocation: string | null; workPlace: string | null }, existing: { scheduledStart: string | null; scheduledEnd: string | null } | null): Promise<Schedule> {
  // At a client whose office opening time is set, the day follows the client's time (as at mark-in).
  const opens = loc.workLocation && loc.workLocation !== "OFFICE" && loc.workPlace
    ? (await prisma.client.findFirst({ where: { organizationId, tradeName: { equals: loc.workPlace.trim(), mode: "insensitive" }, officeOpensAt: { not: null } }, select: { officeOpensAt: true } }))?.officeOpensAt ?? null
    : null;
  if (opens) return scheduleFor(policy.times, { attendanceProfile: "ONSITE", siteReportingTime: opens });
  const emp = await prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { attendanceProfile: true, siteReportingTime: true, siteDayMinutes: true } });
  return scheduleOf(policy, emp, existing);
}

/** Days already marked on request this month (before `day`), for the "3 a month" warning. */
export async function requestMarksThisMonth(employeeId: string, day: Date): Promise<number> {
  const { start } = monthRange(toIsoDate(day));
  return prisma.attendanceRecord.count({ where: { employeeId, markedOnRequest: true, attendanceDate: { gte: start, lt: day } } });
}

const nameOf = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();
const LOCATION_WORDS: Record<string, string> = { OFFICE: "in the office", CLIENT_OFFICE: "at the client's office", CLIENT_VISIT: "on a client visit" };

/** Raised by the person for today. Returns the message shown to them. */
export async function raiseMarkRequest(ctx: AppContext, v: z.infer<typeof markRequestSchema>): Promise<string> {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  const tz = ctx.organization.timezone;
  const day = todayDateOnly(tz);
  const now = new Date();
  const nowMin = minutesOfDayInTz(now, tz);
  if (v.workLocation !== "OFFICE" && !v.workPlace?.trim()) throw new BusinessRuleError(v.workLocation === "CLIENT_OFFICE" ? "Enter the client whose office you are at." : "Enter the client you are visiting.");
  const policy = await getPolicy(ctx.organization.id);
  const existing = await prisma.attendanceRecord.findFirst({ where: { organizationId: ctx.organization.id, employeeId: ctx.employee.id, attendanceDate: day } });
  if (existing?.timeIn) throw new BusinessRuleError(`You are already marked in today (${formatTime(existing.timeIn, tz)}).`);
  if (existing?.autoAbsentAt) throw new BusinessRuleError(`It is past ${policy.row.autoAbsentAt}: the ERP has marked today Absent, and attendance cannot be marked after that by anyone (office rule 3).`);
  if (existing && existing.status !== "PRESENT") throw new BusinessRuleError(`Today is recorded as ${existing.status === "LEAVE" ? "leave" : existing.status === "ABSENT" ? "absent" : "a half day"}.`);
  const schedule = await scheduleForRequest(ctx.organization.id, policy, ctx.employee.id, { workLocation: v.workLocation, workPlace: v.workPlace ?? null }, existing);
  if (nowMin >= schedule.absentAt) throw new BusinessRuleError(`It is past ${hhmm(schedule.absentAt)}: attendance can no longer be marked for today by anyone (office rule 3). If you are on leave, raise a leave request.`);
  const reached = hhmmToMinutes(v.atTime);
  if (reached > nowMin + 1) throw new BusinessRuleError("The time you reached cannot be later than now.");
  if (reached < 5 * 60) throw new BusinessRuleError("Enter the time you actually reached today.");

  const seniors = await seniorsAbove(ctx.employee.id);
  const used = await requestMarksThisMonth(ctx.employee.id, day);
  const limit = policy.row.requestMarksPerMonth;
  const existingReq = await prisma.attendanceRequest.findUnique({ where: { employeeId_requestDate_kind: { employeeId: ctx.employee.id, requestDate: day, kind: "MARK_ATTENDANCE" } } });
  if (existingReq?.status === "APPROVED") throw new BusinessRuleError("Your attendance for today was already marked on your request.");
  const who = nameOf(ctx.employee as { firstName: string; lastName: string | null });
  const toAdmins = seniors.length === 0;
  await prisma.$transaction(async (tx) => {
    const fields = {
      atTime: v.atTime, reason: v.reason, workLocation: v.workLocation, workPlace: v.workLocation === "OFFICE" ? null : v.workPlace?.trim() ?? null,
      inAdvance: true, status: "PENDING" as const, decidedById: null, decidedAt: null, decisionNote: null, escalatedAt: toAdmins ? new Date() : null,
    };
    const r = existingReq
      ? await tx.attendanceRequest.update({ where: { id: existingReq.id }, data: fields })
      : await tx.attendanceRequest.create({ data: { organizationId: ctx.organization.id, employeeId: ctx.employee!.id, kind: "MARK_ATTENDANCE", requestDate: day, ...fields } });
    await audit(tx, ctx, "attendance_request.mark_attendance", "attendance_request", r.id);
    const note = {
      type: "attendance.mark_request",
      title: `${who} asks you to mark their attendance today (reached ${v.atTime}, ${LOCATION_WORDS[v.workLocation]}${fields.workPlace ? ` · ${fields.workPlace}` : ""})`,
      body: `${v.reason} — Mark it before ${hhmm(schedule.absentAt)}; after that nobody can.`,
      link: "/app/attendance?tab=requests",
    };
    if (toAdmins) await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], note, ctx.user.id);
    else await notifyEmployees(tx, ctx.organization.id, seniors, note);
  });
  const over = used >= limit;
  return `${toAdmins ? "Sent to the administrators" : `Sent to your seniors (${seniors.length})`}. Any of them can mark it before ${hhmm(schedule.absentAt)}; after that nobody can.${toAdmins ? "" : " If nobody marks it in time, use “Send to admin”."} ${over ? `This month ${used} day${used === 1 ? " was" : "s were"} already marked on request (allowed: ${limit}), so if this is marked it counts as a half day.` : `Days marked on request this month: ${used} of ${limit}; after ${limit}, each one counts as a half day.`}`;
}

/** The person sends a waiting request on to the administrators (their seniors have not marked it). */
export async function escalateMarkRequest(ctx: AppContext, id: string) {
  const r = await prisma.attendanceRequest.findFirst({ where: { id, employeeId: ctx.employee?.id ?? NO_EMPLOYEE, kind: "MARK_ATTENDANCE", status: "PENDING" } });
  if (!r) throw new BusinessRuleError("Only your own waiting request can be sent to the admin.");
  const tz = ctx.organization.timezone;
  if (toIsoDate(r.requestDate) !== toIsoDate(todayDateOnly(tz))) throw new BusinessRuleError("This request was for an earlier day.");
  const policy = await getPolicy(ctx.organization.id);
  const existing = await prisma.attendanceRecord.findFirst({ where: { employeeId: r.employeeId, attendanceDate: r.requestDate } });
  const schedule = await scheduleForRequest(ctx.organization.id, policy, r.employeeId, r, existing);
  if (minutesOfDayInTz(new Date(), tz) >= schedule.absentAt) throw new BusinessRuleError(`It is past ${hhmm(schedule.absentAt)}: attendance can no longer be marked for today by anyone.`);
  if (r.escalatedAt) throw new BusinessRuleError("It is already with the administrators.");
  const who = nameOf(ctx.employee as { firstName: string; lastName: string | null });
  await prisma.$transaction(async (tx) => {
    await tx.attendanceRequest.update({ where: { id }, data: { escalatedAt: new Date() } });
    await audit(tx, ctx, "attendance_request.mark_escalated", "attendance_request", id);
    await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], {
      type: "attendance.mark_request",
      title: `${who} asks the admin to mark their attendance today (reached ${r.atTime}); their seniors have not marked it yet`,
      body: `${r.reason} — Mark it before ${hhmm(schedule.absentAt)}; after that nobody can.`,
      link: "/app/attendance?tab=requests",
    }, ctx.user.id);
  });
  return `Sent to the administrators. They can mark it before ${hhmm(schedule.absentAt)}.`;
}

/** A senior or an administrator marks the attendance (approve) or declines it (reject). */
export async function decideMarkRequest(ctx: AppContext, id: string, approve: boolean, note?: string): Promise<string> {
  const r = await prisma.attendanceRequest.findFirst({ where: { id, organizationId: ctx.organization.id, kind: "MARK_ATTENDANCE" }, include: { employee: { select: { id: true, firstName: true, lastName: true } } } });
  if (!r || r.status === "CANCELLED") throw new BusinessRuleError("Request not found or withdrawn.");
  if (r.status !== "PENDING") throw new BusinessRuleError("This request was already decided. Refresh the page.");
  if (!(await maySeniorMark(ctx, r.employeeId))) throw new BusinessRuleError("Only their seniors or an administrator can mark this attendance.");
  const tz = ctx.organization.timezone;
  const today = todayDateOnly(tz);
  const name = nameOf(r.employee);
  if (r.requestDate.getTime() !== today.getTime()) throw new BusinessRuleError(`This request was for ${formatDate(r.requestDate)}. Attendance can only be marked on the same day, before the cut-off.`);
  const policy = await getPolicy(ctx.organization.id);
  const existing = await prisma.attendanceRecord.findFirst({ where: { organizationId: ctx.organization.id, employeeId: r.employeeId, attendanceDate: today } });
  const schedule = await scheduleForRequest(ctx.organization.id, policy, r.employeeId, r, existing);
  const now = new Date();
  const decided = { decidedById: ctx.user.id, decidedAt: now, decisionNote: note?.trim() || null };

  if (!approve) {
    await prisma.$transaction(async (tx) => {
      await tx.attendanceRequest.update({ where: { id }, data: { status: "REJECTED", ...decided } });
      await audit(tx, ctx, "attendance_request.mark_rejected", "attendance_request", id);
      await notifyEmployees(tx, ctx.organization.id, [r.employeeId], { type: "attendance.request_decided", title: `${ctx.user.name} did not mark your attendance for today`, body: note?.trim() || undefined, link: "/app/attendance?tab=requests" });
    });
    return `Declined: ${name}'s attendance is not marked.`;
  }
  if (minutesOfDayInTz(now, tz) >= schedule.absentAt) throw new BusinessRuleError(`It is past ${hhmm(schedule.absentAt)}: attendance can no longer be marked for today by anyone (office rule 3).`);
  if (existing?.timeIn) throw new BusinessRuleError(`${name} is already marked in today (${formatTime(existing.timeIn, tz)}).`);
  if (existing?.autoAbsentAt) throw new BusinessRuleError(`The ERP has already marked ${name} absent today; it cannot be changed.`);
  if (existing && existing.status !== "PRESENT") throw new BusinessRuleError(`${name} is recorded as ${existing.status.toLowerCase().replace("_", " ")} today.`);
  const reached = zonedDateTime(toIsoDate(today), hhmmToMinutes(r.atTime ?? hhmm(minutesOfDayInTz(now, tz))), tz);
  const timeIn = reached > now ? now : reached;
  const used = await requestMarksThisMonth(r.employeeId, today);
  const halfDay = used >= policy.row.requestMarksPerMonth;
  const data = {
    timeIn, status: "PRESENT" as const, recordedById: ctx.user.id, markedOnRequest: true,
    workLocation: (r.workLocation ?? "OFFICE") as "OFFICE" | "CLIENT_OFFICE" | "CLIENT_VISIT",
    workPlace: r.workLocation === "OFFICE" ? null : r.workPlace,
    remarks: `Marked by ${ctx.user.name} on request: ${r.reason}`.slice(0, 500),
    scheduledStart: hhmm(schedule.start), scheduledEnd: hhmm(schedule.end),
  } satisfies Prisma.AttendanceRecordUncheckedUpdateInput;
  const duplicate = new BusinessRuleError("Attendance for today was already recorded. Refresh the page.");
  await prisma.$transaction(async (tx) => {
    const res = await tx.attendanceRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "APPROVED", ...decided } });
    if (res.count !== 1) throw new BusinessRuleError("This request was already decided. Refresh the page.");
    if (existing) {
      const u = await tx.attendanceRecord.updateMany({ where: { id: existing.id, timeIn: null, autoAbsentAt: null }, data });
      if (u.count !== 1) throw duplicate;
    } else {
      try {
        await tx.attendanceRecord.create({ data: { ...data, organizationId: ctx.organization.id, employeeId: r.employeeId, attendanceDate: today } });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") throw duplicate;
        throw e;
      }
    }
    await audit(tx, ctx, "attendance.marked_on_request", "attendance_request", id);
    await notifyEmployees(tx, ctx.organization.id, [r.employeeId], {
      type: "attendance.request_decided",
      title: `${ctx.user.name} marked your attendance today (in at ${formatTime(timeIn, tz)})`,
      body: halfDay ? `More than ${policy.row.requestMarksPerMonth} days this month were marked on request, so today counts as a half day. Remember to mark out yourself.` : "Remember to mark out yourself when you leave.",
      link: "/app/attendance",
    });
  });
  return `${name} marked in at ${formatTime(timeIn, tz)}${halfDay ? ` — over ${policy.row.requestMarksPerMonth} request days this month, so it counts as a half day` : ""}.`;
}

/** Waiting mark-attendance requests of today this member may act on (admins: all; seniors: their whole line). */
export async function markRequestsToDecide(ctx: AppContext) {
  const today = todayDateOnly(ctx.organization.timezone);
  const rows = await prisma.attendanceRequest.findMany({
    where: { organizationId: ctx.organization.id, kind: "MARK_ATTENDANCE", requestDate: today, status: "PENDING", employeeId: { not: ctx.employee?.id ?? NO_EMPLOYEE } },
    orderBy: [{ escalatedAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
    include: { employee: { select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } } } } },
  });
  if (can(ctx, "org.manage")) return rows;
  const mine: typeof rows = [];
  for (const r of rows) if (await maySeniorMark(ctx, r.employeeId)) mine.push(r);
  return mine;
}

/** The absent cut-off for a person today (12:00 for office staff), as "HH:MM". */
export async function cutoffFor(ctx: AppContext, employeeId: string, r?: { workLocation: string | null; workPlace: string | null }) {
  const policy = await getPolicy(ctx.organization.id);
  const existing = await prisma.attendanceRecord.findFirst({ where: { employeeId, attendanceDate: todayDateOnly(ctx.organization.timezone) } });
  const s = await scheduleForRequest(ctx.organization.id, policy, employeeId, r ?? { workLocation: null, workPlace: null }, existing);
  return hhmm(s.absentAt);
}
