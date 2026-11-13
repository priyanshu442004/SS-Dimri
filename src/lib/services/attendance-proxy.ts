import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zOptionalText } from "@/lib/actions";
import { formatDate, formatTime, todayDateOnly } from "@/lib/dates";
import { mayReviewPhoto, wageForDay } from "@/lib/domain/attendance-extras";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { NO_EMPLOYEE } from "@/lib/ids";
import { audit } from "./audit";
import { closeDayExtras } from "./attendance";
import { hasFile, storeUpload, validateUpload } from "./files";
import { notifyEmployees, notifyRoles, notifyUsers } from "./notifications";

// Attendance marked for someone else (client feedback 12 Nov 2026): a senior or a
// designated person marks a colleague without a phone, internet or battery, or a daily
// worker, from their own phone. A photo of the person is required as proof. The person
// counts as present at once; their seniors or an administrator can look at the photo
// later and mark them absent if it is not genuine.

const coord = (min: number, max: number) => z.coerce.number().min(min).max(max).optional();

export const proxyMarkSchema = z.object({
  /** "e:<employee id>" for a team member, "w:<worker id>" for a daily worker. */
  person: z.string({ error: "Choose the person" }).regex(/^[ew]:[0-9a-f-]{36}$/i, "Choose the person"),
  kind: z.enum(["in", "out"]),
  latitude: coord(-90, 90),
  longitude: coord(-180, 180),
  note: zOptionalText(300),
});

const nameOf = (p: { firstName: string; lastName: string | null }) => `${p.firstName} ${p.lastName ?? ""}`.trim();

/** Mark a team member or a daily worker in / out. Returns the toast text. */
export async function proxyMark(ctx: AppContext, v: z.infer<typeof proxyMarkSchema>, fd: FormData): Promise<string> {
  const [type, id] = v.person.split(":") as ["e" | "w", string];
  const photo = fd.get("photo");
  if (!hasFile(photo)) throw new BusinessRuleError("Take a photo of the person as proof of attendance.");
  // Check the picture before anything is written, so a bad file leaves nothing behind.
  await validateUpload(photo, { imagesOnly: true });
  return type === "e" ? markEmployee(ctx, id, v, photo) : markWorker(ctx, id, v, photo);
}

async function markEmployee(ctx: AppContext, employeeId: string, v: z.infer<typeof proxyMarkSchema>, photo: File) {
  const org = ctx.organization.id;
  const tz = ctx.organization.timezone;
  if (employeeId === ctx.employee?.id) throw new BusinessRuleError("To mark yourself, use the My attendance tab.");
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId: org, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!emp) throw new BusinessRuleError("This team member was not found.");
  const name = nameOf(emp);
  const day = todayDateOnly(tz);
  const now = new Date();
  const existing = await prisma.attendanceRecord.findFirst({ where: { organizationId: org, employeeId: emp.id, attendanceDate: day } });
  if (v.kind === "in" && existing?.timeIn) throw new BusinessRuleError(`${name} is already marked in today (${formatTime(existing.timeIn, tz)}).`);
  if (v.kind === "out" && !existing?.timeIn) throw new BusinessRuleError(`${name} has not been marked in today. Record the time in first.`);
  if (v.kind === "out" && existing?.timeOut) throw new BusinessRuleError(`${name} is already marked out today.`);
  const stored = await storeUpload(ctx, photo, { area: "attendance", ownerId: emp.id, imagesOnly: true });
  const duplicate = new BusinessRuleError("Attendance for today was already recorded. Refresh the page.");

  await prisma.$transaction(async (tx) => {
    if (v.kind === "in") {
      const data = {
        timeIn: now,
        timeInLatitude: v.latitude,
        timeInLongitude: v.longitude,
        timeInPhotoFileId: stored.id,
        status: "PRESENT" as const,
        recordedById: ctx.user.id,
        timeInProxyById: ctx.user.id,
        photoReview: "PENDING" as const,
        remarks: v.note || existing?.remarks,
      };
      if (existing) {
        const res = await tx.attendanceRecord.updateMany({ where: { id: existing.id, timeIn: null }, data });
        if (res.count !== 1) throw duplicate;
      } else {
        try {
          await tx.attendanceRecord.create({ data: { ...data, organizationId: org, employeeId: emp.id, attendanceDate: day } });
        } catch (e) {
          if ((e as { code?: string }).code === "P2002") throw duplicate;
          throw e;
        }
      }
    } else {
      const res = await tx.attendanceRecord.updateMany({
        where: { id: existing!.id, timeOut: null },
        data: {
          timeOut: now, timeOutLatitude: v.latitude, timeOutLongitude: v.longitude, timeOutPhotoFileId: stored.id, timeOutProxyById: ctx.user.id,
          // A new photo to look at: back to "to check", whatever was decided about the morning's.
          photoReview: "PENDING",
          ...(v.note ? { remarks: existing!.remarks ? `${existing!.remarks} · ${v.note}` : v.note } : {}),
        },
      });
      if (res.count !== 1) throw duplicate;
    }
    await audit(tx, ctx, v.kind === "in" ? "attendance.proxy_in" : "attendance.proxy_out", "employee", emp.id);
    const when = formatTime(now, tz);
    await notifyEmployees(tx, org, [emp.id], {
      type: "attendance.proxy",
      title: `${ctx.user.name} marked your time ${v.kind} at ${when}`,
      body: "Marked from their phone with your photo. Tell your senior or administrator if this is wrong.",
      link: "/app/attendance",
    });
    await notifyReviewers(tx, ctx, emp.id, {
      type: "attendance.photo_check",
      title: `Photo attendance to check: ${name}`,
      body: `Time ${v.kind} ${when}, marked by ${ctx.user.name}.`,
      link: "/app/attendance?tab=photos",
    });
  });
  if (v.kind === "out") await closeDayExtras(existing!.id, emp.id, now, v);
  return `${name} marked ${v.kind} at ${formatTime(now, tz)}. Their photo is saved for checking.`;
}

/** The person's seniors (reporting managers) — or the administrators when they report to nobody. Never the marker. */
async function notifyReviewers(tx: Prisma.TransactionClient, ctx: AppContext, employeeId: string, note: { type: string; title: string; body?: string; link?: string }) {
  const managers = await tx.employeeReportingRelationship.findMany({ where: { employeeId }, select: { managerId: true } });
  const ids = managers.map((m) => m.managerId).filter((id) => id !== ctx.employee?.id);
  if (ids.length) {
    const members = await tx.organizationMembership.findMany({ where: { organizationId: ctx.organization.id, status: "ACTIVE", employeeId: { in: ids } }, select: { userId: true } });
    const userIds = members.map((m) => m.userId).filter((u) => u !== ctx.user.id);
    if (userIds.length) return notifyUsers(tx, ctx.organization.id, userIds, note);
  }
  await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], note, ctx.user.id);
}

async function markWorker(ctx: AppContext, workerId: string, v: z.infer<typeof proxyMarkSchema>, photo: File) {
  const org = ctx.organization.id;
  const tz = ctx.organization.timezone;
  const w = await prisma.dailyWorker.findFirst({ where: { id: workerId, organizationId: org, isActive: true } });
  if (!w) throw new BusinessRuleError("This daily worker was not found.");
  const day = todayDateOnly(tz);
  const now = new Date();
  const existing = await prisma.dailyWorkerDay.findUnique({ where: { workerId_workDate: { workerId: w.id, workDate: day } } });
  if (v.kind === "in" && existing?.timeIn) throw new BusinessRuleError(`${w.name} is already marked in today (${formatTime(existing.timeIn, tz)}).`);
  if (v.kind === "in" && existing) throw new BusinessRuleError(`${w.name} already has attendance for today (${existing.status === "ABSENT" ? "absent" : "present"}).`);
  if (v.kind === "out" && !existing?.timeIn) throw new BusinessRuleError(`${w.name} has not been marked in today. Record the time in first.`);
  if (v.kind === "out" && existing?.timeOut) throw new BusinessRuleError(`${w.name} is already marked out today.`);
  const stored = await storeUpload(ctx, photo, { area: "attendance", ownerId: w.id, imagesOnly: true });
  await prisma.$transaction(async (tx) => {
    if (v.kind === "in") {
      try {
        await tx.dailyWorkerDay.create({
          data: {
            organizationId: org, workerId: w.id, workDate: day, status: "PRESENT", timeIn: now, inLatitude: v.latitude, inLongitude: v.longitude,
            inPhotoFileId: stored.id, wage: wageForDay(Number(w.dailyWage), "PRESENT"), remarks: v.note, markedById: ctx.user.id,
          },
        });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") throw new BusinessRuleError("Attendance for today was already recorded. Refresh the page.");
        throw e;
      }
    } else {
      const res = await tx.dailyWorkerDay.updateMany({ where: { id: existing!.id, timeOut: null }, data: { timeOut: now, outPhotoFileId: stored.id } });
      if (res.count !== 1) throw new BusinessRuleError("Attendance for today was already recorded. Refresh the page.");
    }
    await audit(tx, ctx, v.kind === "in" ? "daily_worker.in" : "daily_worker.out", "daily_worker", w.id);
  });
  return `${w.name} marked ${v.kind} at ${formatTime(now, tz)}.`;
}

/** People this member may mark, with where each stands today (for the picker). */
export async function proxyTargets(ctx: AppContext) {
  const org = ctx.organization.id;
  const tz = ctx.organization.timezone;
  const day = todayDateOnly(tz);
  const [employees, records, workers, workerDays] = await Promise.all([
    prisma.employee.findMany({
      where: { organizationId: org, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" }, id: { not: ctx.employee?.id ?? NO_EMPLOYEE } },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } } },
    }),
    prisma.attendanceRecord.findMany({ where: { organizationId: org, attendanceDate: day }, select: { employeeId: true, timeIn: true, timeOut: true, status: true } }),
    prisma.dailyWorker.findMany({ where: { organizationId: org, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, workType: true } }),
    prisma.dailyWorkerDay.findMany({ where: { organizationId: org, workDate: day }, select: { workerId: true, timeIn: true, timeOut: true, status: true } }),
  ]);
  const stateOf = (r?: { timeIn: Date | null; timeOut: Date | null; status: string }) =>
    !r?.timeIn ? (r && r.status !== "PRESENT" ? ("other" as const) : ("none" as const)) : r.timeOut ? ("out" as const) : ("in" as const);
  const text = (r?: { timeIn: Date | null; timeOut: Date | null; status: string }) =>
    !r ? "Not marked yet today" : !r.timeIn ? (r.status === "PRESENT" ? "Not marked yet today" : r.status === "ABSENT" ? "Absent today" : r.status === "LEAVE" ? "On leave today" : "Half day today")
      : r.timeOut ? `In ${formatTime(r.timeIn, tz)} · out ${formatTime(r.timeOut, tz)}` : `In since ${formatTime(r.timeIn, tz)}`;
  const recBy = new Map(records.map((r) => [r.employeeId, r]));
  const dayBy = new Map(workerDays.map((r) => [r.workerId, r]));
  return [
    ...employees.map((e) => {
      const r = recBy.get(e.id);
      return { value: `e:${e.id}`, label: nameOf(e) + (e.designation ? ` — ${e.designation.name}` : ""), group: "Team member" as const, state: stateOf(r), status: text(r) };
    }),
    ...workers.map((w) => {
      const r = dayBy.get(w.id);
      return { value: `w:${w.id}`, label: w.name + (w.workType ? ` — ${w.workType}` : ""), group: "Daily worker" as const, state: stateOf(r), status: text(r) };
    }),
  ];
}

/** Today's marks made by this member, newest first. */
export async function myProxyMarksToday(ctx: AppContext) {
  const day = todayDateOnly(ctx.organization.timezone);
  const org = ctx.organization.id;
  const [records, workerDays] = await Promise.all([
    prisma.attendanceRecord.findMany({
      where: { organizationId: org, attendanceDate: day, OR: [{ timeInProxyById: ctx.user.id }, { timeOutProxyById: ctx.user.id }] },
      include: { employee: { select: { firstName: true, lastName: true } } },
    }),
    prisma.dailyWorkerDay.findMany({ where: { organizationId: org, workDate: day, markedById: ctx.user.id }, include: { worker: { select: { name: true } } } }),
  ]);
  return [
    ...records.map((r) => ({ id: r.id, name: nameOf(r.employee), kind: "Team member", timeIn: r.timeIn, timeOut: r.timeOut, inPhoto: r.timeInPhotoFileId, outPhoto: r.timeOutPhotoFileId })),
    ...workerDays.map((d) => ({ id: d.id, name: d.worker.name, kind: "Daily worker", timeIn: d.timeIn, timeOut: d.timeOut, inPhoto: d.inPhotoFileId, outPhoto: d.outPhotoFileId })),
  ].sort((a, b) => (b.timeOut ?? b.timeIn ?? new Date(0)).getTime() - (a.timeOut ?? a.timeIn ?? new Date(0)).getTime());
}

// ---------------------------------------------------------------- photo check

/** Where-clause for the photo attendances this member may check. */
async function reviewScope(ctx: AppContext): Promise<Prisma.AttendanceRecordWhereInput | null> {
  const base = { organizationId: ctx.organization.id, photoReview: { not: null }, employeeId: { not: ctx.employee?.id ?? NO_EMPLOYEE } } satisfies Prisma.AttendanceRecordWhereInput;
  if (can(ctx, "attendance.review_photos")) return base;
  if (!ctx.employee || !can(ctx, "attendance.mark_own")) return null;
  return {
    ...base,
    employee: { reportsTo: { some: { managerId: ctx.employee.id } } },
    // Not a mark they made themselves (written with OR null: NOT on a null column would drop the row).
    AND: [
      { OR: [{ timeInProxyById: null }, { timeInProxyById: { not: ctx.user.id } }] },
      { OR: [{ timeOutProxyById: null }, { timeOutProxyById: { not: ctx.user.id } }] },
    ],
  };
}

/** Number of photo attendances waiting for this member's check (menu badge, tab count). */
export async function pendingPhotoChecks(ctx: AppContext): Promise<number> {
  const scope = await reviewScope(ctx);
  if (!scope) return 0;
  return prisma.attendanceRecord.count({ where: { AND: [scope, { photoReview: "PENDING" }] } });
}

export type PhotoFilter = "PENDING" | "ACCEPTED" | "REJECTED" | "ALL";

/**
 * Photo attendances for the check screen. Those who may check them see what they can act on;
 * with the team view they also see the rest, read-only.
 */
export async function photoCheckRows(ctx: AppContext, f: { from: Date; to: Date; filter: PhotoFilter; employeeId?: string }) {
  const scope = await reviewScope(ctx);
  const seeAll = can(ctx, "attendance.view_all");
  if (!scope && !seeAll) return [];
  const filters: Prisma.AttendanceRecordWhereInput = {
    organizationId: ctx.organization.id,
    photoReview: f.filter === "ALL" ? { not: null } : f.filter,
    attendanceDate: { gte: f.from, lte: f.to },
    ...(f.employeeId ? { employeeId: f.employeeId } : {}),
  };
  const where: Prisma.AttendanceRecordWhereInput = seeAll ? filters : { AND: [filters, scope!] };
  const rows = await prisma.attendanceRecord.findMany({
    where,
    orderBy: [{ attendanceDate: "desc" }, { timeIn: "desc" }],
    take: 300,
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } }, reportsTo: { select: { managerId: true } } } },
      timeInProxyBy: { select: { name: true } },
      timeOutProxyBy: { select: { name: true } },
      photoReviewedBy: { select: { name: true } },
    },
  });
  const reviewAll = can(ctx, "attendance.review_photos");
  return rows.map((r) => ({
    ...r,
    mayReview: mayReviewPhoto({
      reviewAll,
      isReportingManager: !!ctx.employee && r.employee.reportsTo.some((m) => m.managerId === ctx.employee!.id),
      markedByMe: r.timeInProxyById === ctx.user.id || r.timeOutProxyById === ctx.user.id,
      isMine: r.employeeId === ctx.employee?.id,
    }),
  }));
}

export const reviewSchema = z.object({ decision: z.enum(["accept", "reject"]), note: zOptionalText(500) });

/** Accept a photo attendance, or mark the person absent for that day. Either can be reversed. */
export async function reviewPhoto(ctx: AppContext, recordId: string, v: z.infer<typeof reviewSchema>) {
  const r = await prisma.attendanceRecord.findFirst({
    where: { id: recordId, organizationId: ctx.organization.id, photoReview: { not: null } },
    include: { employee: { select: { id: true, firstName: true, lastName: true, reportsTo: { select: { managerId: true } } } } },
  });
  if (!r) throw new BusinessRuleError("This photo attendance was not found.");
  const allowed = mayReviewPhoto({
    reviewAll: can(ctx, "attendance.review_photos"),
    isReportingManager: !!ctx.employee && r.employee.reportsTo.some((m) => m.managerId === ctx.employee!.id),
    markedByMe: r.timeInProxyById === ctx.user.id || r.timeOutProxyById === ctx.user.id,
    isMine: r.employeeId === ctx.employee?.id,
  });
  if (!allowed) throw new BusinessRuleError("You cannot check this attendance. Their senior or an administrator can.");
  const reject = v.decision === "reject";
  if (reject && !v.note?.trim()) throw new BusinessRuleError("Say why the photo is not genuine.");
  const name = nameOf(r.employee);
  // Marking absent sets the day to Absent; accepting after that restores Present.
  const newStatus = reject ? "ABSENT" : r.photoReview === "REJECTED" && r.status === "ABSENT" ? "PRESENT" : r.status;
  await prisma.$transaction(async (tx) => {
    const res = await tx.attendanceRecord.updateMany({
      where: { id: r.id, updatedAt: r.updatedAt },
      data: { photoReview: reject ? "REJECTED" : "ACCEPTED", photoReviewedById: ctx.user.id, photoReviewedAt: new Date(), photoReviewNote: v.note?.trim() || null, status: newStatus },
    });
    if (res.count !== 1) throw new BusinessRuleError("This attendance was changed by someone else. Refresh the page.");
    if (newStatus !== r.status) {
      await tx.attendanceCorrection.create({
        data: {
          attendanceRecordId: r.id,
          actorUserId: ctx.user.id,
          reason: reject ? `Photo not genuine: ${v.note!.trim()}` : `Photo accepted${v.note?.trim() ? `: ${v.note.trim()}` : ""}`,
          originalValues: { status: r.status },
          newValues: { status: newStatus },
        },
      });
    }
    await audit(tx, ctx, reject ? "attendance.photo_rejected" : "attendance.photo_accepted", "attendance_record", r.id);
    if (reject || newStatus !== r.status) {
      await notifyEmployees(tx, ctx.organization.id, [r.employeeId], {
        type: "attendance.photo_decided",
        title: reject ? `Your attendance on ${formatDate(r.attendanceDate)} was marked absent` : `Your attendance on ${formatDate(r.attendanceDate)} was restored`,
        body: v.note?.trim() || undefined,
        link: "/app/attendance",
      });
    }
  });
  return reject ? `${name} marked absent for ${formatDate(r.attendanceDate)}.` : `Photo accepted for ${name}.`;
}
