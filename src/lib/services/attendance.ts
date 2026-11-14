import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zIsoDate, zOptionalText } from "@/lib/actions";
import { addDays, dateOnly, formatDate, isoDateInTz, minutesOfDayInTz, monthRange, toIsoDate, todayDateOnly } from "@/lib/dates";
import { hhmm, leaveWithIntimation, noticeDays, timesOfDay } from "@/lib/domain/attendance-policy";
import { isMissingTimeOut, lunchAllowanceMinutes, lunchMinutes, lunchOverMinutes, markOutReminderDue } from "@/lib/domain/attendance-extras";
import type { AppContext } from "@/lib/session";
import { can } from "@/lib/permissions";
import { audit } from "./audit";
import { hasFile, storeUpload } from "./files";
import { notifyEmployees, notifyRoles } from "./notifications";
import { nextTemporaryEmployeeCode } from "./codes";
import { actsAsLeadFor, getPolicy, holidaySet, isOffDay, leadsOf, ruleSubjects, scheduleOf, type Policy } from "./office-rules";

export { getPolicy };

const coord = (min: number, max: number) => z.coerce.number().min(min).max(max).optional();
export const markSchema = z.object({
  latitude: coord(-90, 90),
  longitude: coord(-180, 180),
  lateReason: zOptionalText(500),
  workLocation: z.enum(["OFFICE", "CLIENT_OFFICE", "CLIENT_VISIT"]).optional(),
  workPlace: zOptionalText(200),
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

/**
 * Self-service mark in / mark out (policy §1–§3). The time comes from the server clock, never
 * from the device; the map location is required (attendance without it is not considered); the
 * work location is recorded; after the absent cut-off (12:00) the day can no longer be marked.
 */
export async function markAttendance(ctx: AppContext, kind: "in" | "out", v: z.infer<typeof markSchema>, fd: FormData) {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  if (v.latitude === undefined || v.longitude === undefined) throw new BusinessRuleError(NO_LOCATION);
  const tz = ctx.organization.timezone;
  const now = new Date();
  const day = todayDateOnly(tz);
  const iso = toIsoDate(day);
  const [existing, policy, emp] = await Promise.all([
    prisma.attendanceRecord.findFirst({ where: { organizationId: ctx.organization.id, employeeId: ctx.employee.id, attendanceDate: day }, orderBy: { createdAt: "desc" } }),
    getPolicy(ctx.organization.id),
    prisma.employee.findUniqueOrThrow({ where: { id: ctx.employee.id }, select: { attendanceProfile: true, siteReportingTime: true } }),
  ]);
  const location = v.workLocation ?? existing?.workLocation ?? undefined;
  if (kind === "in" && !location) throw new BusinessRuleError("Choose where you are working today.");
  if (location && location !== "OFFICE" && !v.workPlace && !(kind === "out" && existing?.workPlace)) {
    throw new BusinessRuleError(location === "CLIENT_OFFICE" ? "Enter the client whose office you are at." : "Enter the client you are visiting.");
  }
  // Validate before uploading, so a rejected attempt leaves no orphaned photo.
  if (kind === "in" && existing?.autoAbsentAt) throw new BusinessRuleError(AUTO_ABSENT(policy.row.autoAbsentAt));
  if (kind === "in" && existing?.timeIn) throw new BusinessRuleError("You have already marked in today.");
  if (kind === "in" && existing && existing.status !== "PRESENT") throw new BusinessRuleError(`Today is recorded as ${existing.status === "LEAVE" ? "leave" : existing.status === "ABSENT" ? "absent" : "a half day"}.`);
  if (kind === "out" && !existing?.timeIn) throw new BusinessRuleError("Mark in first.");
  if (kind === "out" && existing?.timeOut) throw new BusinessRuleError("You have already marked out today.");
  const schedule = scheduleOf(policy, emp, existing);
  if (kind === "in" && ctx.role !== "OWNER" && minutesOfDayInTz(now, tz) >= schedule.absentAt) {
    // Someone on leave for part of the day (a half day) may still come in.
    const onLeave = await prisma.leaveRequest.count({ where: { employeeId: ctx.employee.id, status: { in: ["APPROVED", "PENDING"] }, fromDate: { lte: day }, toDate: { gte: day } } });
    if (!onLeave) throw new BusinessRuleError(AUTO_ABSENT(hhmm(schedule.absentAt)));
  }
  const photo = fd.get("photo");
  const photoId = hasFile(photo) ? (await storeUpload(ctx, photo, { area: "attendance", ownerId: ctx.employee.id, imagesOnly: true })).id : undefined;
  const duplicate = new BusinessRuleError("Attendance for today was already recorded. Refresh the page.");

  if (kind === "in") {
    const times = timesOfDay({ timeIn: now, timeOut: null }, iso, schedule, policy.numbers.veryLateAfterMinutes, tz);
    const late = times.lateBand === "LATE" || times.lateBand === "VERY_LATE";
    const data = {
      timeIn: now,
      timeInLatitude: v.latitude,
      timeInLongitude: v.longitude,
      timeInPhotoFileId: photoId,
      status: "PRESENT" as const,
      lateReason: late ? v.lateReason : null,
      recordedById: ctx.user.id,
      workLocation: location,
      workPlace: location === "OFFICE" ? null : v.workPlace,
      scheduledStart: hhmm(schedule.start),
      scheduledEnd: hhmm(schedule.end),
    };
    // Conditional writes: a double submit or a second tab cannot record two mark-ins.
    if (existing) {
      const res = await prisma.attendanceRecord.updateMany({ where: { id: existing.id, timeIn: null, autoAbsentAt: null }, data });
      if (res.count !== 1) throw duplicate;
    } else {
      try {
        await prisma.attendanceRecord.create({ data: { ...data, organizationId: ctx.organization.id, employeeId: ctx.employee.id, attendanceDate: day } });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") throw duplicate; // unique (employee, date)
        throw e;
      }
    }
    return { late, lateMinutes: times.lateMinutes, band: times.lateBand, early: false, halfDay: false };
  }

  const res = await prisma.attendanceRecord.updateMany({
    where: { id: existing!.id, timeOut: null },
    data: {
      timeOut: now, timeOutLatitude: v.latitude, timeOutLongitude: v.longitude, timeOutPhotoFileId: photoId,
      timeOutWorkLocation: location,
      ...(v.workPlace && location !== "OFFICE" && location !== existing!.workLocation ? { workPlace: v.workPlace } : {}),
    },
  });
  if (res.count !== 1) throw duplicate;
  await closeDayExtras(existing!.id, ctx.employee.id, now, v);
  const times = timesOfDay({ timeIn: existing!.timeIn, timeOut: now }, iso, schedule, policy.numbers.veryLateAfterMinutes, tz);
  return { late: false, lateMinutes: 0, band: "ON_TIME" as const, early: times.leftEarly, halfDay: times.earlyHalfDay };
}

export const NO_LOCATION = "Turn on location for this site and try again. Attendance without the map location is not considered (office rule 1).";
const AUTO_ABSENT = (at: string) => `It is past ${at}, so the ERP has marked today Absent. Attendance cannot be changed to Present after that (office rule 3). If you are unwell or have an emergency, raise a leave request.`;

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

// ---------------------------------------------------------------- leave (§10)

export const leaveSchema = z.object({
  fromDate: zIsoDate,
  toDate: zIsoDate,
  leaveType: z.enum(["CASUAL", "SICK", "PLANNED", "UNPAID", "OTHER"]),
  isHalfDay: zCheckbox.optional(),
  reason: zOptionalText(1000),
});

/**
 * Raise a leave request. "With intimation" is worked out, not ticked: asked before the reporting
 * time of the first day. Planned leave must be asked at least 15 days ahead. Returns notes for
 * the person (e.g. a Sunday that will count as leave).
 */
export async function requestLeave(ctx: AppContext, v: z.infer<typeof leaveSchema>, opts: { source?: "absent_intimation" } = {}) {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  const tz = ctx.organization.timezone;
  const from = dateOnly(v.fromDate);
  const to = dateOnly(v.toDate);
  const today = todayDateOnly(tz);
  if (to < from) throw new BusinessRuleError("The end date is before the start date.");
  if (from < addDays(today, -31)) throw new BusinessRuleError("Leave can be asked for at most a month back.");
  if (v.isHalfDay && v.fromDate !== v.toDate) throw new BusinessRuleError("A half-day leave is for one day: make the From and To dates the same.");
  const [policy, emp] = await Promise.all([
    getPolicy(ctx.organization.id),
    prisma.employee.findUniqueOrThrow({ where: { id: ctx.employee.id }, select: { attendanceProfile: true, siteReportingTime: true } }),
  ]);
  const notice = noticeDays(toIsoDate(today), v.fromDate);
  if (v.leaveType === "PLANNED" && notice < policy.row.plannedLeaveNoticeDays) {
    throw new BusinessRuleError(
      `Planned leave must be requested at least ${policy.row.plannedLeaveNoticeDays} days in advance (this is ${Math.max(0, notice)} day${notice === 1 ? "" : "s"}). For an emergency or illness choose Casual or Sick.`,
    );
  }
  const overlapping = await prisma.leaveRequest.findFirst({
    where: { employeeId: ctx.employee.id, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: to }, toDate: { gte: from } },
  });
  if (overlapping) throw new BusinessRuleError("You already have a leave request for these dates.");
  const now = new Date();
  const withIntimation = leaveWithIntimation(now, v.fromDate, scheduleOf(policy, emp), tz);

  // §10: Sundays and holidays inside the leave, or between it and a neighbouring leave, count as leave.
  const holidays = await holidaySet(ctx.organization.id, addDays(from, -7), addDays(to, 7));
  const neighbours = await prisma.leaveRequest.findMany({
    where: { employeeId: ctx.employee.id, status: { in: ["PENDING", "APPROVED"] }, isHalfDay: false, fromDate: { lte: addDays(to, 7) }, toDate: { gte: addDays(from, -7) } },
    select: { fromDate: true, toDate: true },
  });
  const away = (d: Date) => (d >= from && d <= to && !v.isHalfDay) || neighbours.some((l) => l.fromDate <= d && l.toDate >= d);
  const sandwiched: string[] = [];
  for (let d = addDays(from, -7); d <= addDays(to, 7); d = addDays(d, 1)) {
    if (!isOffDay(toIsoDate(d), holidays)) continue;
    let a = addDays(d, -1);
    while (isOffDay(toIsoDate(a), holidays) && a > addDays(from, -14)) a = addDays(a, -1);
    let b = addDays(d, 1);
    while (isOffDay(toIsoDate(b), holidays) && b < addDays(to, 14)) b = addDays(b, 1);
    const touches = (a >= from && a <= to) || (b >= from && b <= to) || (d >= from && d <= to);
    if (touches && away(a) && away(b)) sandwiched.push(formatDate(d));
  }

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
        withIntimation,
        reason: v.reason,
      },
    });
    await audit(tx, ctx, opts.source === "absent_intimation" ? "leave.absent_intimation" : "leave.requested", "leave_request", r.id);
    const managers = await tx.employeeReportingRelationship.findMany({ where: { employeeId: ctx.employee!.id }, select: { managerId: true } });
    const when = v.fromDate === v.toDate ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`;
    const note = {
      type: "leave.requested",
      title: opts.source === "absent_intimation" ? `${ctx.employee!.firstName} cannot come today` : `Leave request from ${ctx.employee!.firstName}`,
      body: `${when}${v.isHalfDay ? " (half day)" : ""}${v.reason ? ` · ${v.reason}` : ""}${withIntimation ? "" : " · asked after the reporting time"}`,
      link: "/app/attendance?tab=leave",
    };
    if (managers.length) await notifyEmployees(tx, ctx.organization.id, managers.map((m) => m.managerId), note);
    else await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], note, ctx.user.id);
  });
  return { withIntimation, sandwiched };
}

export async function decideLeave(ctx: AppContext, requestId: string, approve: boolean, note?: string) {
  const r = await prisma.leaveRequest.findFirst({ where: { id: requestId, organizationId: ctx.organization.id, status: "PENDING" } });
  if (!r) throw new BusinessRuleError("Leave request not found or already decided.");
  if (r.employeeId === ctx.employee?.id) throw new BusinessRuleError("You cannot decide your own leave request.");
  // Owners/admins decide any request; managers and seniors only their own reportees.
  if (!(await actsAsLeadFor(ctx, r.employeeId))) throw new BusinessRuleError("You can only decide leave for people who report to you.");
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

/** Leave used this month (for "1 of 1 used" on the leave form). */
export async function leaveUsedThisMonth(ctx: AppContext) {
  if (!ctx.employee) return 0;
  const { start, end } = monthRange(todayIso(ctx));
  const rows = await prisma.leaveRequest.findMany({
    where: { employeeId: ctx.employee.id, status: { in: ["APPROVED", "PENDING"] }, fromDate: { lte: end }, toDate: { gte: start } },
    select: { fromDate: true, toDate: true, isHalfDay: true },
  });
  let days = 0;
  for (const l of rows) for (let d = l.fromDate < start ? start : l.fromDate; d <= l.toDate && d <= end; d = addDays(d, 1)) if (d.getUTCDay() !== 0) days += l.isHalfDay ? 0.5 : 1;
  return days;
}

export function todayIso(ctx: AppContext) {
  return isoDateInTz(new Date(), ctx.organization.timezone);
}

// ---------------------------------------------------------------- team view & export

export const ATTENDANCE_FILTERS = ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "NOT_MARKED", "LATE", "NO_OUT", "PROXY", "STAYING"] as const;
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

/** One row per employee per day in the period. Sundays and holidays appear only when something was recorded. */
export async function teamAttendanceRows(ctx: AppContext, policy: Policy, f: TeamFilters) {
  const organizationId = ctx.organization.id;
  const tz = ctx.organization.timezone;
  const today = todayDateOnly(tz);
  const now = new Date();
  const { row: policyRow } = policy;
  const reminderDue = markOutReminderDue(now, policyRow.markOutReminderAt, tz);
  const lunchAllowance = lunchAllowanceMinutes(policyRow.lunchStart, policyRow.lunchEnd);
  const from = dateOnly(f.from);
  const to = dateOnly(f.to);
  const text = f.q ? { contains: f.q, mode: "insensitive" as const } : undefined;
  const [employees, records, leaves, requests, holidays] = await Promise.all([
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
      select: { id: true, firstName: true, lastName: true, permanentEmployeeCode: true, temporaryEmployeeCode: true, attendanceProfile: true, siteReportingTime: true, siteName: true, dateOfJoining: true, designation: { select: { name: true } }, department: { select: { name: true } } },
    }),
    prisma.attendanceRecord.findMany({
      where: { organizationId, attendanceDate: { gte: from, lte: to } },
      include: { timeInProxyBy: { select: { name: true } }, timeOutProxyBy: { select: { name: true } }, photoReviewedBy: { select: { name: true } } },
    }),
    prisma.leaveRequest.findMany({ where: { organizationId, status: "APPROVED", fromDate: { lte: to }, toDate: { gte: from } }, select: { employeeId: true, fromDate: true, toDate: true, isHalfDay: true } }),
    prisma.attendanceRequest.findMany({ where: { organizationId, requestDate: { gte: from, lte: to }, status: { not: "REJECTED" } }, select: { employeeId: true, requestDate: true, kind: true, status: true, inAdvance: true, atTime: true, reason: true } }),
    holidaySet(organizationId, from, to),
  ]);
  const recBy = new Map(records.map((r) => [`${r.employeeId}|${toIsoDate(r.attendanceDate)}`, r]));
  const reqBy = new Map<string, typeof requests>();
  for (const r of requests) {
    const k = `${r.employeeId}|${toIsoDate(r.requestDate)}`;
    reqBy.set(k, [...(reqBy.get(k) ?? []), r]);
  }
  const rows = [];
  for (let d = from; d <= to && d <= today; d = addDays(d, 1)) {
    const iso = toIsoDate(d);
    const off = isOffDay(iso, holidays);
    for (const e of employees) {
      if (e.dateOfJoining && e.dateOfJoining > d) continue;
      const record = recBy.get(`${e.id}|${iso}`) ?? null;
      if (!record && off) continue;
      const leave = leaves.find((l) => l.employeeId === e.id && l.fromDate <= d && l.toDate >= d);
      const schedule = scheduleOf(policy, e, record);
      const worked = record && (record.status === "PRESENT" || record.status === "HALF_DAY");
      const times = worked ? timesOfDay(record, iso, schedule, policy.numbers.veryLateAfterMinutes, tz) : null;
      const dayReqs = reqBy.get(`${e.id}|${iso}`) ?? [];
      const otApproved = dayReqs.some((r) => r.kind === "OVERTIME" && r.status === "APPROVED");
      const lateNote = dayReqs.find((r) => r.kind === "LATE_ARRIVAL");
      // Before the cut-off today, a person not yet in is "not marked"; after it the ERP has marked them absent.
      const state: AttendanceFilter = record ? (record.status as AttendanceFilter) : leave ? "LEAVE" : "NOT_MARKED";
      const lunch = record ? lunchMinutes(record.lunchOutAt, record.lunchInAt, now) : null;
      const isToday = d.getTime() === today.getTime();
      // Still in now, past the overtime start (18:45) — the Team Lead is answerable for it (§8).
      const stayingNow = isToday && !!record?.timeIn && !record.timeOut && minutesOfDayInTz(now, tz) > schedule.overtimeAfter;
      rows.push({
        key: `${e.id}|${iso}`, date: d, employee: e, record, approvedLeave: !record && !!leave, halfDayLeave: !!leave?.isHalfDay, state,
        isLate: times?.lateBand === "LATE" || times?.lateBand === "VERY_LATE", lateMinutes: times?.lateMinutes ?? 0, lateBand: times?.lateBand ?? null,
        lateIntimation: lateNote ? { inAdvance: lateNote.inAdvance, atTime: lateNote.atTime, reason: lateNote.reason } : null,
        leftEarly: !!times?.leftEarly, earlyHalfDay: !!times?.earlyHalfDay, earlyApproved: dayReqs.some((r) => r.kind === "EARLY_LEAVE" && r.status === "APPROVED"),
        stayedMinutes: times?.stayedMinutes ?? 0, otApproved, otRequested: dayReqs.some((r) => r.kind === "OVERTIME"), stayingNow,
        workedMinutes: times?.workedMinutes ?? null, schedule,
        lunchMinutes: lunch,
        lunchOver: lunchOverMinutes(record?.lunchInAt ? lunch : null, lunchAllowance),
        onLunch: !!record?.lunchOutAt && !record.lunchInAt && !record.timeOut,
        missingTimeOut: !!record && isMissingTimeOut({ timeIn: record.timeIn, timeOut: record.timeOut, isToday }, reminderDue),
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
    STAYING: rows.filter((r) => r.stayingNow || (r.stayedMinutes > 0 && !r.otApproved)).length,
  };
  const shown = rows.filter((r) => {
    if (!f.status) return true;
    if (f.status === "LATE") return r.isLate;
    if (f.status === "NO_OUT") return r.missingTimeOut;
    if (f.status === "PROXY") return r.byOther;
    if (f.status === "STAYING") return r.stayingNow || (r.stayedMinutes > 0 && !r.otApproved);
    // "Present" counts half days too, as the tile does: they did attend.
    if (f.status === "PRESENT") return r.state === "PRESENT" || r.state === "HALF_DAY";
    return r.state === f.status;
  });
  return { rows: shown, counts, employeeCount: employees.length };
}

// ---------------------------------------------------------------- §3 automatic absent at 12:00

/**
 * After the cut-off the ERP marks everyone the rules apply to, who has not marked in and is not
 * on leave, Absent. The record carries `autoAbsentAt` and can never become Present. Runs from the
 * scheduled call; one claim per person per day (the unique employee + date row).
 */
export async function sweepAutoAbsent(organizationId: string, tz: string) {
  const now = new Date();
  const day = todayDateOnly(tz);
  const iso = toIsoDate(day);
  const [policy, holidays] = await Promise.all([getPolicy(organizationId), holidaySet(organizationId, day, day)]);
  if (isOffDay(iso, holidays)) return { marked: 0 };
  const subjects = await ruleSubjects(organizationId);
  if (!subjects.size) return { marked: 0 };
  const [employees, records, leaves] = await Promise.all([
    prisma.employee.findMany({
      where: { id: { in: [...subjects.keys()] }, OR: [{ dateOfJoining: null }, { dateOfJoining: { lte: day } }] },
      select: { id: true, firstName: true, lastName: true, attendanceProfile: true, siteReportingTime: true },
    }),
    prisma.attendanceRecord.findMany({ where: { organizationId, attendanceDate: day }, select: { employeeId: true } }),
    prisma.leaveRequest.findMany({ where: { organizationId, status: { in: ["APPROVED", "PENDING"] }, fromDate: { lte: day }, toDate: { gte: day } }, select: { employeeId: true } }),
  ]);
  const has = new Set(records.map((r) => r.employeeId));
  const onLeave = new Set(leaves.map((l) => l.employeeId));
  const minute = minutesOfDayInTz(now, tz);
  const marked: typeof employees = [];
  for (const e of employees) {
    if (has.has(e.id) || onLeave.has(e.id)) continue;
    const s = scheduleOf(policy, e);
    if (minute < s.absentAt) continue;
    try {
      await prisma.attendanceRecord.create({
        data: {
          organizationId, employeeId: e.id, attendanceDate: day, status: "ABSENT", autoAbsentAt: now,
          scheduledStart: hhmm(s.start), scheduledEnd: hhmm(s.end),
          remarks: `Not marked in by ${hhmm(s.absentAt)}: marked Absent by the ERP.`,
        },
      });
      marked.push(e);
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err; // marked in at the same moment
    }
  }
  if (!marked.length) return { marked: 0 };
  // Tell each person, and each Team Lead (or the administrators) who in their team is absent.
  const leads = await leadsOf(marked.map((e) => e.id));
  await prisma.$transaction(async (tx) => {
    for (const e of marked) {
      await notifyEmployees(tx, organizationId, [e.id], {
        type: "attendance.auto_absent",
        title: "You were marked Absent today",
        body: `You had not marked in by ${hhmm(scheduleOf(policy, e).absentAt)}. If you are on leave, raise a leave request so the day is not counted as an absence without intimation.`,
        link: "/app/attendance?tab=leave",
      });
    }
    const byLead = new Map<string, string[]>();
    const noLead: string[] = [];
    for (const e of marked) {
      const name = `${e.firstName} ${e.lastName ?? ""}`.trim();
      const l = leads.get(e.id);
      if (l?.length) for (const m of l) byLead.set(m, [...(byLead.get(m) ?? []), name]);
      else noLead.push(name);
    }
    const note = (names: string[]) => ({
      type: "attendance.auto_absent_team",
      title: names.length === 1 ? `${names[0]} is absent today` : `${names.length} people are absent today`,
      body: `Not marked in by the cut-off: ${names.slice(0, 10).join(", ")}${names.length > 10 ? "…" : ""}`,
      link: `/app/attendance?tab=team&status=ABSENT&date=${iso}`,
    });
    for (const [lead, names] of byLead) await notifyEmployees(tx, organizationId, [lead], note(names));
    if (noLead.length) await notifyRoles(tx, organizationId, ["OWNER", "ADMIN"], note(noLead));
  });
  return { marked: marked.length };
}
