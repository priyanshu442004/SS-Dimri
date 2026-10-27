import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zIsoDate, zOptionalText } from "@/lib/actions";
import { dateOnly, hhmmToMinutes, isoDateInTz, minutesOfDayInTz, todayDateOnly } from "@/lib/dates";
import type { PolicyParams } from "@/lib/domain/attendance-policy";
import type { AppContext } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "./audit";
import { hasFile, storeUpload } from "./files";
import { notifyEmployees, notifyRoles } from "./notifications";

export async function getPolicy(organizationId: string) {
  const p = await prisma.attendancePolicy.upsert({ where: { organizationId }, update: {}, create: { organizationId } });
  const params: PolicyParams = {
    reportingGraceUntil: p.reportingGraceUntil,
    halfDayIfLeavingBefore: p.halfDayIfLeavingBefore,
    leavingGraceUntil: p.leavingGraceUntil,
    requiredMinutes: p.requiredMinutes,
    onsiteRequiredMinutes: p.onsiteRequiredMinutes,
    reducedRequiredMinutes: p.reducedRequiredMinutes,
    farClientEarlyMonthMinutes: p.farClientEarlyMonthMinutes,
    farClientEarlyMonthUntilDay: p.farClientEarlyMonthUntilDay,
    lateArrivalsPerHalfDay: p.lateArrivalsPerHalfDay,
    lateGracePerMonth: p.lateGracePerMonth,
    overtimeMode: p.overtimeMode,
    overtimeMinutesPerDay: p.overtimeMinutesPerDay,
  };
  return { row: p, params };
}

const coord = (min: number, max: number) => z.coerce.number().min(min).max(max).optional();
export const markSchema = z.object({
  latitude: coord(-90, 90),
  longitude: coord(-180, 180),
  lateReason: zOptionalText(500),
});

/** Self-service mark in / mark out. Time comes from the server clock, never from the device. */
export async function markAttendance(ctx: AppContext, kind: "in" | "out", v: z.infer<typeof markSchema>, fd: FormData) {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  const tz = ctx.organization.timezone;
  const now = new Date();
  const day = todayDateOnly(tz);
  const existing = await prisma.attendanceRecord.findFirst({
    where: { organizationId: ctx.organization.id, employeeId: ctx.employee.id, attendanceDate: day },
    orderBy: { createdAt: "desc" },
  });
  // Validate before uploading, so a rejected attempt leaves no orphaned photo.
  if (kind === "in" && existing?.timeIn) throw new BusinessRuleError("You have already marked in today.");
  if (kind === "out" && !existing?.timeIn) throw new BusinessRuleError("Mark in first.");
  if (kind === "out" && existing?.timeOut) throw new BusinessRuleError("You have already marked out today.");
  const photo = fd.get("photo");
  const photoId = hasFile(photo) ? (await storeUpload(ctx, photo, { area: "attendance", ownerId: ctx.employee.id, imagesOnly: true })).id : undefined;
  const duplicate = new BusinessRuleError("Attendance for today was already recorded. Refresh the page.");

  if (kind === "in") {
    const { row } = await getPolicy(ctx.organization.id);
    const late = minutesOfDayInTz(now, tz) > hhmmToMinutes(row.reportingGraceUntil);
    const data = {
      timeIn: now,
      timeInLatitude: v.latitude,
      timeInLongitude: v.longitude,
      timeInPhotoFileId: photoId,
      status: "PRESENT" as const,
      lateReason: late ? v.lateReason : null,
      recordedById: ctx.user.id,
    };
    // Conditional writes: a double submit or a second tab cannot record two mark-ins.
    if (existing) {
      const res = await prisma.attendanceRecord.updateMany({ where: { id: existing.id, timeIn: null }, data });
      if (res.count !== 1) throw duplicate;
    } else {
      try {
        await prisma.attendanceRecord.create({ data: { ...data, organizationId: ctx.organization.id, employeeId: ctx.employee.id, attendanceDate: day } });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") throw duplicate; // unique (employee, date)
        throw e;
      }
    }
    return { late };
  }

  const res = await prisma.attendanceRecord.updateMany({
    where: { id: existing!.id, timeOut: null },
    data: { timeOut: now, timeOutLatitude: v.latitude, timeOutLongitude: v.longitude, timeOutPhotoFileId: photoId },
  });
  if (res.count !== 1) throw duplicate;
  return { late: false };
}

export const correctionSchema = z.object({
  employeeId: z.uuid(),
  date: zIsoDate,
  status: z.enum(["PRESENT", "ABSENT", "LEAVE", "HALF_DAY"]),
  timeIn: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timeOut: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  reason: z.string().min(3, "Give a reason for the correction").max(500),
});

/** Authorized correction / manual entry. Records actor, reason, original and new values. */
export async function correctAttendance(ctx: AppContext, v: z.infer<typeof correctionSchema>) {
  const emp = await prisma.employee.findFirst({ where: { id: v.employeeId, organizationId: ctx.organization.id }, select: { id: true } });
  if (!emp) throw new BusinessRuleError("Employee not found.");
  const day = dateOnly(v.date);
  const at = (t?: string) => (t ? new Date(`${v.date}T${t}:00+05:30`) : null);
  const timeIn = at(v.timeIn);
  const timeOut = at(v.timeOut);
  if (timeIn && timeOut && timeOut < timeIn) throw new BusinessRuleError("Time out must be after time in.");
  await prisma.$transaction(async (tx) => {
    const existing = await tx.attendanceRecord.findFirst({ where: { organizationId: ctx.organization.id, employeeId: emp.id, attendanceDate: day }, orderBy: { createdAt: "desc" } });
    const newValues = { status: v.status, timeIn: timeIn?.toISOString() ?? null, timeOut: timeOut?.toISOString() ?? null };
    const record = existing
      ? await tx.attendanceRecord.update({ where: { id: existing.id }, data: { status: v.status, timeIn, timeOut, remarks: v.reason } })
      : await tx.attendanceRecord.create({
          data: { organizationId: ctx.organization.id, employeeId: emp.id, attendanceDate: day, status: v.status, timeIn, timeOut, remarks: v.reason, recordedById: ctx.user.id },
        });
    await tx.attendanceCorrection.create({
      data: {
        attendanceRecordId: record.id,
        actorUserId: ctx.user.id,
        reason: v.reason,
        originalValues: existing ? { status: existing.status, timeIn: existing.timeIn?.toISOString() ?? null, timeOut: existing.timeOut?.toISOString() ?? null } : { status: null },
        newValues,
      },
    });
    await audit(tx, ctx, "attendance.corrected", "attendance_record", record.id);
  });
}

export const leaveSchema = z.object({
  fromDate: zIsoDate,
  toDate: zIsoDate,
  leaveType: z.enum(["CASUAL", "SICK", "PLANNED", "UNPAID", "OTHER"]),
  isHalfDay: zCheckbox.optional(),
  withIntimation: zCheckbox.optional(),
  reason: zOptionalText(1000),
});

export async function requestLeave(ctx: AppContext, v: z.infer<typeof leaveSchema>) {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  const from = dateOnly(v.fromDate);
  const to = dateOnly(v.toDate);
  if (to < from) throw new BusinessRuleError("The end date is before the start date.");
  const overlapping = await prisma.leaveRequest.findFirst({
    where: { employeeId: ctx.employee.id, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: to }, toDate: { gte: from } },
  });
  if (overlapping) throw new BusinessRuleError("You already have a leave request for these dates.");
  const { row } = await getPolicy(ctx.organization.id);
  const noticeDays = Math.round((from.getTime() - todayDateOnly(ctx.organization.timezone).getTime()) / 86_400_000);
  const shortNotice = v.leaveType === "PLANNED" && noticeDays < row.plannedLeaveNoticeDays;
  await prisma.$transaction(async (tx) => {
    const r = await tx.leaveRequest.create({
      data: {
        organizationId: ctx.organization.id,
        employeeId: ctx.employee!.id,
        fromDate: from,
        toDate: to,
        leaveType: v.leaveType,
        isHalfDay: !!v.isHalfDay,
        isPaid: v.leaveType !== "UNPAID",
        withIntimation: v.withIntimation !== false,
        reason: v.reason,
      },
    });
    const managers = await tx.employeeReportingRelationship.findMany({ where: { employeeId: ctx.employee!.id }, select: { managerId: true } });
    const note = { type: "leave.requested", title: `Leave request from ${ctx.employee!.firstName}`, body: `${v.fromDate} to ${v.toDate}`, link: "/app/attendance?tab=leave" };
    if (managers.length) await notifyEmployees(tx, ctx.organization.id, managers.map((m) => m.managerId), note);
    else await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], note, ctx.user.id);
    return r;
  });
  return { shortNotice, noticeDays, required: row.plannedLeaveNoticeDays };
}

export async function decideLeave(ctx: AppContext, requestId: string, approve: boolean, note?: string) {
  const r = await prisma.leaveRequest.findFirst({ where: { id: requestId, organizationId: ctx.organization.id, status: "PENDING" } });
  if (!r) throw new BusinessRuleError("Leave request not found or already decided.");
  if (r.employeeId === ctx.employee?.id) throw new BusinessRuleError("You cannot decide your own leave request.");
  // Owners/admins decide any request; managers and seniors only their own reportees.
  if (!can(ctx.role, "org.manage")) {
    const reports = ctx.employee
      ? await prisma.employeeReportingRelationship.count({ where: { employeeId: r.employeeId, managerId: ctx.employee.id } })
      : 0;
    if (!reports) throw new BusinessRuleError("You can only decide leave for people who report to you.");
  }
  await prisma.$transaction(async (tx) => {
    const res = await tx.leaveRequest.updateMany({
      where: { id: r.id, status: "PENDING" },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedById: ctx.user.id, decidedAt: new Date(), decisionNote: note },
    });
    if (res.count !== 1) throw new BusinessRuleError("This request was already decided by someone else. Refresh the page.");
    await audit(tx, ctx, approve ? "leave.approved" : "leave.rejected", "leave_request", r.id);
    await notifyEmployees(tx, ctx.organization.id, [r.employeeId], {
      type: "leave.decided",
      title: `Your leave request was ${approve ? "approved" : "rejected"}`,
      body: note,
      link: "/app/attendance?tab=leave",
    });
  });
}

export function todayIso(ctx: AppContext) {
  return isoDateInTz(new Date(), ctx.organization.timezone);
}
