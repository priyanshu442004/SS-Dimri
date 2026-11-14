import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zOptionalText } from "@/lib/actions";
import { hhmmToMinutes, todayDateOnly } from "@/lib/dates";
import { hhmm } from "@/lib/domain/attendance-policy";
import { lunchAllowanceMinutes } from "@/lib/domain/attendance-extras";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { notifyEmployees } from "./notifications";
import { actsAsLeadFor, getPolicy, leadScopeIds, scheduleOf } from "./office-rules";

// What the Team Lead fixes in the ERP:
//   §5 the reporting time of a client-site team member (their day then lasts 8 hours);
//   §7 a lunch moved for urgent work (still 30 minutes at most).

const time = z.string().regex(/^\d{2}:\d{2}$/, "Enter a time");

export const scheduleSchema = z.object({
  employeeId: z.uuid("Choose the team member"),
  place: z.enum(["OFFICE", "SITE"]),
  siteReportingTime: time.optional(),
  siteName: zOptionalText(200),
});

export async function setSchedule(ctx: AppContext, v: z.infer<typeof scheduleSchema>) {
  if (!(await actsAsLeadFor(ctx, v.employeeId))) throw new BusinessRuleError("You can set the schedule only for people who report to you.");
  const emp = await prisma.employee.findFirst({ where: { id: v.employeeId, organizationId: ctx.organization.id }, select: { id: true, firstName: true, lastName: true } });
  if (!emp) throw new BusinessRuleError("Team member not found.");
  const policy = await getPolicy(ctx.organization.id);
  if (v.place === "SITE") {
    if (!v.siteReportingTime) throw new BusinessRuleError("Enter the reporting time at the client.");
    if (!v.siteName?.trim()) throw new BusinessRuleError("Enter the client or site.");
    const start = hhmmToMinutes(v.siteReportingTime);
    if (start < 6 * 60 || start > 14 * 60) throw new BusinessRuleError("Choose a reporting time between 06:00 and 14:00.");
  }
  const site = v.place === "SITE";
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: emp.id },
      data: site
        ? { attendanceProfile: "ONSITE", siteReportingTime: v.siteReportingTime, siteName: v.siteName!.trim() }
        : { attendanceProfile: "STANDARD", siteReportingTime: null, siteName: null },
    });
    await audit(tx, ctx, "attendance.schedule_set", "employee", emp.id);
    const s = scheduleOf(policy, site ? { attendanceProfile: "ONSITE", siteReportingTime: v.siteReportingTime! } : null);
    await notifyEmployees(tx, ctx.organization.id, [emp.id], {
      type: "attendance.schedule",
      title: site ? `Your reporting time at ${v.siteName!.trim()} is ${hhmm(s.start)}` : "You are back on office timings",
      body: `${hhmm(s.start)}–${hhmm(s.end)}, grace till ${hhmm(s.graceUntil)}. Set by ${ctx.user.name}; it applies from your next mark-in.`,
      link: "/app/attendance",
    });
  });
  return `${emp.firstName} ${emp.lastName ?? ""}`.trim();
}

/** People whose schedule this member sets, with their current timing. */
export async function scheduleRows(ctx: AppContext) {
  const scope = await leadScopeIds(ctx);
  if (scope !== "ALL" && !scope.length) return [];
  const [policy, employees, records] = await Promise.all([
    getPolicy(ctx.organization.id),
    prisma.employee.findMany({
      where: { organizationId: ctx.organization.id, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" }, id: scope === "ALL" ? { not: ctx.employee?.id ?? undefined } : { in: scope } },
      orderBy: { firstName: "asc" },
      select: { id: true, firstName: true, lastName: true, attendanceProfile: true, siteReportingTime: true, siteName: true, designation: { select: { name: true } } },
    }),
    prisma.attendanceRecord.findMany({ where: { organizationId: ctx.organization.id, attendanceDate: todayDateOnly(ctx.organization.timezone) }, select: { employeeId: true, timeIn: true, timeOut: true, lunchOutAt: true, lunchShiftedTo: true } }),
  ]);
  return employees.map((e) => ({ ...e, schedule: scheduleOf(policy, e), today: records.find((r) => r.employeeId === e.id) ?? null }));
}

export const lunchShiftSchema = z.object({ employeeId: z.uuid("Choose the team member"), lunchAt: time });

/** §7: move today's lunch for urgent work. The length stays the policy's (30 minutes). */
export async function shiftLunch(ctx: AppContext, v: z.infer<typeof lunchShiftSchema>) {
  if (!(await actsAsLeadFor(ctx, v.employeeId))) throw new BusinessRuleError("You can shift lunch only for people who report to you.");
  const policy = await getPolicy(ctx.organization.id);
  const day = todayDateOnly(ctx.organization.timezone);
  const rec = await prisma.attendanceRecord.findFirst({ where: { organizationId: ctx.organization.id, employeeId: v.employeeId, attendanceDate: day }, include: { employee: { select: { firstName: true } } } });
  if (!rec?.timeIn) throw new BusinessRuleError("They have not marked in today.");
  if (rec.timeOut) throw new BusinessRuleError("They have already marked out today.");
  if (rec.lunchOutAt) throw new BusinessRuleError("They have already taken lunch today.");
  const len = lunchAllowanceMinutes(policy.row.lunchStart, policy.row.lunchEnd);
  await prisma.$transaction(async (tx) => {
    await tx.attendanceRecord.update({ where: { id: rec.id }, data: { lunchShiftedTo: v.lunchAt } });
    await audit(tx, ctx, "attendance.lunch_shifted", "attendance_record", rec.id);
    await notifyEmployees(tx, ctx.organization.id, [v.employeeId], {
      type: "attendance.lunch_shifted",
      title: `Lunch today moved to ${v.lunchAt}–${hhmm(hhmmToMinutes(v.lunchAt) + len)}`,
      body: `Moved by ${ctx.user.name} for urgent work. Lunch stays ${len} minutes.`,
      link: "/app/attendance",
    });
  });
  return rec.employee.firstName;
}
