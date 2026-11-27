import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zOptionalText } from "@/lib/actions";
import { hhmmToMinutes, todayDateOnly } from "@/lib/dates";
import { hhmm, WORK_LOCATION_WORDS, WORK_LOCATIONS } from "@/lib/domain/attendance-policy";
import { lunchAllowanceMinutes } from "@/lib/domain/attendance-extras";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { notifyEmployees } from "./notifications";
import { actsAsLeadFor, getPolicy, leadScopeIds, scheduleOf } from "./office-rules";

// What the Team Lead fixes in the ERP:
//   where each person works — office, client office, client visit, one or more — which are then the
//      only choices at their mark-in (client feedback, 26 Nov 2026);
//   §5 the reporting time of a client-site team member and the length of their day (8 hours unless
//      the Team Lead sets other hours — 25 Nov 2026);
//   §7 a lunch moved for urgent work (still 30 minutes at most).

const time = z.string().regex(/^\d{2}:\d{2}$/, "Enter a time");

export const scheduleSchema = z.object({
  employeeId: z.uuid("Choose the team member"),
  /**
   * Where they work (26 Nov 2026: more than one may be ticked). These are the only choices they get at
   * mark-in. "Client office" carries the client-site timing below.
   */
  "places[]": z.array(z.enum(WORK_LOCATIONS), { error: "Tick where they work" }).min(1, "Tick where they work"),
  siteReportingTime: time.optional(),
  siteName: zOptionalText(200),
  /** Working hours at the client site (6, 8, 8.5 …); blank = the firm's usual client-site day. */
  siteDayHours: z.coerce.number("Enter the working hours").min(1, "At least 1 hour").max(16, "At most 16 hours").optional(),
});

export async function setSchedule(ctx: AppContext, v: z.infer<typeof scheduleSchema>) {
  if (!(await actsAsLeadFor(ctx, v.employeeId))) throw new BusinessRuleError("You can set the schedule only for people who report to you.");
  const emp = await prisma.employee.findFirst({ where: { id: v.employeeId, organizationId: ctx.organization.id }, select: { id: true, firstName: true, lastName: true } });
  if (!emp) throw new BusinessRuleError("Team member not found.");
  const policy = await getPolicy(ctx.organization.id);
  const places = WORK_LOCATIONS.filter((l) => v["places[]"].includes(l));
  const site = places.includes("CLIENT_OFFICE");
  if (site) {
    if (!v.siteReportingTime) throw new BusinessRuleError("Enter the reporting time at the client.");
    if (!v.siteName?.trim()) throw new BusinessRuleError("Enter the client or site.");
    const start = hhmmToMinutes(v.siteReportingTime);
    if (start < 6 * 60 || start > 14 * 60) throw new BusinessRuleError("Choose a reporting time between 06:00 and 14:00.");
    if (v.siteDayHours && start + v.siteDayHours * 60 > 23 * 60 + 59) throw new BusinessRuleError("The day would end after midnight. Choose fewer hours or an earlier reporting time.");
  }
  const dayMinutes = site && v.siteDayHours ? Math.round(v.siteDayHours * 60) : null;
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({
      where: { id: emp.id },
      data: site
        ? { attendanceProfile: "ONSITE", siteReportingTime: v.siteReportingTime, siteName: v.siteName!.trim(), siteDayMinutes: dayMinutes, allowedWorkLocations: places }
        : { attendanceProfile: "STANDARD", siteReportingTime: null, siteName: null, siteDayMinutes: null, allowedWorkLocations: places },
    });
    await audit(tx, ctx, "attendance.schedule_set", "employee", emp.id);
    const s = scheduleOf(policy, site ? { attendanceProfile: "ONSITE", siteReportingTime: v.siteReportingTime!, siteDayMinutes: dayMinutes } : null);
    await notifyEmployees(tx, ctx.organization.id, [emp.id], {
      type: "attendance.schedule",
      title: site ? `Your reporting time at ${v.siteName!.trim()} is ${hhmm(s.start)}` : `Your timing: office hours · ${places.map((l) => WORK_LOCATION_WORDS[l]).join(", ")}`,
      body: `${hhmm(s.start)}–${hhmm(s.end)} (${Math.round(((s.end - s.start) / 60) * 100) / 100} h), grace till ${hhmm(s.graceUntil)}. You mark in at: ${places.map((l) => WORK_LOCATION_WORDS[l]).join(", ")}. Set by ${ctx.user.name}; it applies from your next mark-in.`,
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
      select: { id: true, firstName: true, lastName: true, attendanceProfile: true, siteReportingTime: true, siteDayMinutes: true, siteName: true, allowedWorkLocations: true, designation: { select: { name: true } } },
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
