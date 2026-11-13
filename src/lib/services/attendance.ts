import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zIsoDate, zOptionalText } from "@/lib/actions";
import { addDays, dateOnly, hhmmToMinutes, isoDateInTz, minutesOfDayInTz, toIsoDate, todayDateOnly } from "@/lib/dates";
import { evaluateDay, type PolicyParams } from "@/lib/domain/attendance-policy";
import { isMissingTimeOut, lunchMinutes, lunchOverMinutes, markOutReminderDue } from "@/lib/domain/attendance-extras";
import type { AppContext } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "./audit";
import { hasFile, storeUpload } from "./files";
import { notifyEmployees, notifyRoles } from "./notifications";
import { nextTemporaryEmployeeCode } from "./codes";

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

/**
 * The owner and administrators often sign in without a staff record, which is all that
 * stood between them and marking attendance. Create it (approved, linked to their login)
 * the first time they mark in, so their attendance works like everyone else's.
 */
export async function ensureAdminEmployee(ctx: AppContext): Promise<AppContext> {
  if (ctx.employee || !can(ctx, "org.manage")) return ctx;
  const parts = ctx.user.name.trim().split(/\s+/);
  const firstName = parts[0] || "Administrator";
  const lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  const employee = await prisma.$transaction(async (tx) => {
    const emp = await tx.employee.create({
      data: {
        organizationId: ctx.organization.id,
        temporaryEmployeeCode: await nextTemporaryEmployeeCode(tx, ctx.organization.id),
        firstName,
        lastName,
        email: ctx.user.email,
        officialEmail: ctx.user.email,
        approvalStatus: "APPROVED",
        approvedAt: new Date(),
        approvedById: ctx.user.id,
        employmentStatus: "ACTIVE",
      },
    });
    await tx.organizationMembership.update({ where: { id: ctx.membershipId }, data: { employeeId: emp.id } });
    await audit(tx, ctx, "employee.self_linked", "employee", emp.id);
    return emp;
  });
  return { ...ctx, employee: { id: employee.id, firstName, lastName, approvalStatus: "APPROVED", onboardingSubmittedAt: null } };
}

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
  await closeDayExtras(existing!.id, ctx.employee.id, now, v);
  return { late: false };
}

/**
 * At mark-out, an open lunch break and an open client visit end at the same moment,
 * so neither runs on overnight.
 */
export async function closeDayExtras(recordId: string, employeeId: string, at: Date, loc: { latitude?: number; longitude?: number }) {
  await prisma.attendanceRecord.updateMany({ where: { id: recordId, lunchOutAt: { not: null }, lunchInAt: null }, data: { lunchInAt: at } });
  await prisma.clientVisit.updateMany({ where: { employeeId, endedAt: null }, data: { endedAt: at, endLatitude: loc.latitude, endLongitude: loc.longitude } });
}

/** Start lunch / back from lunch. One lunch break a day; server clock only. */
export async function markLunch(ctx: AppContext, kind: "out" | "in") {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  const day = todayDateOnly(ctx.organization.timezone);
  const rec = await prisma.attendanceRecord.findFirst({ where: { organizationId: ctx.organization.id, employeeId: ctx.employee.id, attendanceDate: day } });
  if (!rec?.timeIn) throw new BusinessRuleError("Mark in first.");
  if (rec.timeOut) throw new BusinessRuleError("You have already marked out today.");
  const now = new Date();
  if (kind === "out") {
    if (rec.lunchOutAt) throw new BusinessRuleError(rec.lunchInAt ? "Lunch is already recorded for today." : "You are already on lunch.");
    const res = await prisma.attendanceRecord.updateMany({ where: { id: rec.id, lunchOutAt: null, timeOut: null }, data: { lunchOutAt: now } });
    if (res.count !== 1) throw new BusinessRuleError("Lunch was already recorded. Refresh the page.");
  } else {
    if (!rec.lunchOutAt) throw new BusinessRuleError("Start lunch first.");
    if (rec.lunchInAt) throw new BusinessRuleError("You are already back from lunch.");
    const res = await prisma.attendanceRecord.updateMany({ where: { id: rec.id, lunchInAt: null }, data: { lunchInAt: now } });
    if (res.count !== 1) throw new BusinessRuleError("Lunch was already recorded. Refresh the page.");
  }
  return { at: now };
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
  if (!can(ctx, "org.manage")) {
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

// ---------------------------------------------------------------- team view & export

export const ATTENDANCE_FILTERS = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "NOT_MARKED", "LATE", "NO_OUT", "PROXY"] as const;
export type AttendanceFilter = (typeof ATTENDANCE_FILTERS)[number];
export const MAX_RANGE_DAYS = 92;

export type TeamFilters = { from: string; to: string; q: string; status: AttendanceFilter | ""; departmentId: string; employeeId: string };

/** Query-string values → safe filters. A single day when no range is given; future days are not counted. */
export function parseTeamFilters(sp: Record<string, string | string[] | undefined>, today: string): TeamFilters {
  const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const to = iso(sp.to) || iso(sp.date) || today;
  let from = iso(sp.from) || iso(sp.date) || to;
  if (from > to) from = to;
  const earliest = toIsoDate(addDays(dateOnly(to), -(MAX_RANGE_DAYS - 1)));
  if (from < earliest) from = earliest;
  const status = ATTENDANCE_FILTERS.find((s) => s === sp.status) ?? "";
  return {
    from,
    to,
    q: typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "",
    status,
    departmentId: typeof sp.department === "string" && /^[0-9a-f-]{36}$/i.test(sp.department) ? sp.department : "",
    employeeId: typeof sp.employee === "string" && /^[0-9a-f-]{36}$/i.test(sp.employee) ? sp.employee : "",
  };
}

/** One row per employee per day in the period. Sundays appear only when something was recorded. */
export async function teamAttendanceRows(ctx: AppContext, policy: PolicyParams, f: TeamFilters, extras: { markOutReminderAt: string; lunchAllowance: number } = { markOutReminderAt: "19:00", lunchAllowance: 30 }) {
  const organizationId = ctx.organization.id;
  const tz = ctx.organization.timezone;
  const today = todayDateOnly(tz);
  const now = new Date();
  const reminderDue = markOutReminderDue(now, extras.markOutReminderAt, tz);
  const from = dateOnly(f.from);
  const to = dateOnly(f.to);
  const text = f.q ? { contains: f.q, mode: "insensitive" as const } : undefined;
  const [employees, records, leaves] = await Promise.all([
    prisma.employee.findMany({
      where: {
        organizationId,
        approvalStatus: "APPROVED",
        employmentStatus: { not: "EXITED" },
        ...(f.departmentId ? { departmentId: f.departmentId } : {}),
        ...(f.employeeId ? { id: f.employeeId } : {}),
        ...(text ? { OR: [{ firstName: text }, { lastName: text }, { permanentEmployeeCode: text }] } : {}),
      },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, permanentEmployeeCode: true, temporaryEmployeeCode: true, attendanceProfile: true, designation: { select: { name: true } }, department: { select: { name: true } } },
    }),
    prisma.attendanceRecord.findMany({
      where: { organizationId, attendanceDate: { gte: from, lte: to } },
      include: { timeInProxyBy: { select: { name: true } }, timeOutProxyBy: { select: { name: true } }, photoReviewedBy: { select: { name: true } } },
    }),
    prisma.leaveRequest.findMany({ where: { organizationId, status: "APPROVED", fromDate: { lte: to }, toDate: { gte: from } }, select: { employeeId: true, fromDate: true, toDate: true } }),
  ]);
  const recBy = new Map(records.map((r) => [`${r.employeeId}|${toIsoDate(r.attendanceDate)}`, r]));
  const rows = [];
  for (let d = from; d <= to && d <= today; d = addDays(d, 1)) {
    const iso = toIsoDate(d);
    for (const e of employees) {
      const record = recBy.get(`${e.id}|${iso}`) ?? null;
      if (!record && d.getUTCDay() === 0) continue;
      const onLeave = leaves.some((l) => l.employeeId === e.id && l.fromDate <= d && l.toDate >= d);
      const evaluation = record ? evaluateDay({ dayOfMonth: d.getUTCDate(), status: record.status, timeIn: record.timeIn, timeOut: record.timeOut }, e.attendanceProfile, policy, tz) : null;
      const state: AttendanceFilter = record ? (record.status as AttendanceFilter) : onLeave ? "LEAVE" : "NOT_MARKED";
      const lunch = record ? lunchMinutes(record.lunchOutAt, record.lunchInAt, now) : null;
      rows.push({
        key: `${e.id}|${iso}`, date: d, employee: e, record, approvedLeave: !record && onLeave, state, isLate: !!evaluation?.isLate, workedMinutes: evaluation?.workedMinutes ?? null,
        lunchMinutes: lunch,
        lunchOver: lunchOverMinutes(record?.lunchInAt ? lunch : null, extras.lunchAllowance),
        onLunch: !!record?.lunchOutAt && !record.lunchInAt && !record.timeOut,
        missingTimeOut: !!record && isMissingTimeOut({ timeIn: record.timeIn, timeOut: record.timeOut, isToday: d.getTime() === today.getTime() }, reminderDue),
        byOther: !!record?.photoReview,
      });
    }
  }
  const counts = {
    total: rows.length,
    PRESENT: rows.filter((r) => r.state === "PRESENT" || r.state === "HALF_DAY").length,
    ABSENT: rows.filter((r) => r.state === "ABSENT").length,
    HALF_DAY: rows.filter((r) => r.state === "HALF_DAY").length,
    LEAVE: rows.filter((r) => r.state === "LEAVE").length,
    NOT_MARKED: rows.filter((r) => r.state === "NOT_MARKED").length,
    LATE: rows.filter((r) => r.isLate).length,
    NO_OUT: rows.filter((r) => r.missingTimeOut).length,
    PROXY: rows.filter((r) => r.byOther).length,
  };
  const shown = rows.filter((r) => {
    if (!f.status) return true;
    if (f.status === "LATE") return r.isLate;
    if (f.status === "NO_OUT") return r.missingTimeOut;
    if (f.status === "PROXY") return r.byOther;
    // "Present" counts half days too, as the tile does: they did attend.
    if (f.status === "PRESENT") return r.state === "PRESENT" || r.state === "HALF_DAY";
    return r.state === f.status;
  });
  return { rows: shown, counts, employeeCount: employees.length };
}
