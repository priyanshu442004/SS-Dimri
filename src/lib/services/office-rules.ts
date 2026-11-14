import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zIsoDate } from "@/lib/actions";
import { dateOnly, toIsoDate } from "@/lib/dates";
import { scheduleFor, type PolicyNumbers, type PolicyTimes, type ScheduleOwner } from "@/lib/domain/attendance-policy";
import { can, canUseModule, type ModuleKey, type Role } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";

// Shared pieces of the Leave, Timing and Office Decorum rules: the firm's policy values, office
// holidays, who someone's Team Lead is, and whom the rules apply to.

export async function getPolicy(organizationId: string) {
  // Read first: an upsert would touch updated_at on every call, and that date tells people
  // when the rules last changed (they are asked to accept them again).
  const row =
    (await prisma.attendancePolicy.findUnique({ where: { organizationId } })) ??
    (await prisma.attendancePolicy.upsert({ where: { organizationId }, update: {}, create: { organizationId } }));
  const times: PolicyTimes = {
    officeStart: row.officeStart,
    reportingGraceUntil: row.reportingGraceUntil,
    officeEnd: row.officeEnd,
    leavingGraceUntil: row.leavingGraceUntil,
    halfDayIfLeavingBefore: row.halfDayIfLeavingBefore,
    autoAbsentAt: row.autoAbsentAt,
    onsiteRequiredMinutes: row.onsiteRequiredMinutes,
  };
  const numbers: PolicyNumbers = {
    lateArrivalsPerHalfDay: row.lateArrivalsPerHalfDay,
    lateGracePerMonth: row.lateGracePerMonth,
    veryLateAfterMinutes: row.veryLateAfterMinutes,
    paidLeavesPerMonth: Number(row.paidLeavesPerMonth),
    unrequestedAbsenceDays: Number(row.unrequestedAbsenceDays),
    noLeaveBonusDays: Number(row.noLeaveBonusDays),
    overtimeMinutesPerDay: row.overtimeMinutesPerDay,
  };
  return { row, times, numbers };
}

export type Policy = Awaited<ReturnType<typeof getPolicy>>;

/** Labels for the work location, with the firm's own office name (e.g. "Naraina Office"). */
export function workLocationLabels(officeName: string): Record<"OFFICE" | "CLIENT_OFFICE" | "CLIENT_VISIT", string> {
  return { OFFICE: officeName || "Office", CLIENT_OFFICE: "Client office", CLIENT_VISIT: "Client visit" };
}

export function scheduleOf(policy: Policy, e: ScheduleOwner | null, recorded?: { scheduledStart: string | null; scheduledEnd: string | null } | null) {
  return scheduleFor(policy.times, e, recorded ? { start: recorded.scheduledStart, end: recorded.scheduledEnd } : undefined);
}

// ---------------------------------------------------------------- holidays

/** Office holidays between two dates, as "YYYY-MM-DD". Sundays are not stored: they are always off. */
export async function holidaySet(organizationId: string, from: Date, to: Date): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({ where: { organizationId, holidayDate: { gte: from, lte: to } }, select: { holidayDate: true } });
  return new Set(rows.map((h) => toIsoDate(h.holidayDate)));
}

export const isOffDay = (iso: string, holidays: ReadonlySet<string>) => dateOnly(iso).getUTCDay() === 0 || holidays.has(iso);

export const holidaySchema = z.object({ holidayDate: zIsoDate, name: z.string({ error: "Name the holiday" }).trim().min(2, "Name the holiday").max(120) });

export async function addHoliday(ctx: AppContext, v: z.infer<typeof holidaySchema>) {
  const day = dateOnly(v.holidayDate);
  if (day.getUTCDay() === 0) throw new BusinessRuleError("Sundays are always off; add only office holidays on other days.");
  const existing = await prisma.holiday.findUnique({ where: { organizationId_holidayDate: { organizationId: ctx.organization.id, holidayDate: day } } });
  if (existing) throw new BusinessRuleError(`${v.holidayDate} is already a holiday (${existing.name}).`);
  await prisma.$transaction(async (tx) => {
    const h = await tx.holiday.create({ data: { organizationId: ctx.organization.id, holidayDate: day, name: v.name } });
    await audit(tx, ctx, "holiday.added", "holiday", h.id);
  });
}

export async function removeHoliday(ctx: AppContext, id: string) {
  const h = await prisma.holiday.findFirst({ where: { id, organizationId: ctx.organization.id } });
  if (!h) throw new BusinessRuleError("Holiday not found.");
  await prisma.$transaction(async (tx) => {
    await tx.holiday.delete({ where: { id } });
    await audit(tx, ctx, "holiday.removed", "holiday", id);
  });
  return h.name;
}

// ---------------------------------------------------------------- team leads

/**
 * Each person's Team Leads: the people they report to (Employees → Whom to report), the primary
 * one first. The fine for not escalating falls on the first of them.
 */
export async function leadsOf(employeeIds: string[]): Promise<Map<string, string[]>> {
  if (!employeeIds.length) return new Map();
  const rels = await prisma.employeeReportingRelationship.findMany({
    where: { employeeId: { in: employeeIds } },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    select: { employeeId: true, managerId: true },
  });
  const out = new Map<string, string[]>();
  for (const r of rels) out.set(r.employeeId, [...(out.get(r.employeeId) ?? []), r.managerId]);
  return out;
}

/** People who report directly to this member. */
export async function reporteeIds(ctx: AppContext): Promise<string[]> {
  if (!ctx.employee) return [];
  const rows = await prisma.employeeReportingRelationship.findMany({ where: { managerId: ctx.employee.id }, select: { employeeId: true } });
  return rows.map((r) => r.employeeId);
}

/** May this member act as Team Lead for the person (approve, edit, escalate)? Admins act for everyone. */
export async function actsAsLeadFor(ctx: AppContext, employeeId: string): Promise<boolean> {
  if (employeeId === ctx.employee?.id) return false;
  if (can(ctx, "org.manage")) return true;
  if (!ctx.employee) return false;
  return (await prisma.employeeReportingRelationship.count({ where: { employeeId, managerId: ctx.employee.id } })) > 0;
}

/** Whose requests and plans this member sees as Team Lead: everyone for admins, else their reportees. */
export async function leadScopeIds(ctx: AppContext): Promise<string[] | "ALL"> {
  if (can(ctx, "org.manage")) return "ALL";
  return reporteeIds(ctx);
}

// ---------------------------------------------------------------- whom the rules apply to

export type Subject = { employeeId: string; userId: string; role: Role; plans: boolean };

/**
 * Staff the daily rules apply to. The owner is left out (nobody marks the owner absent or fines
 * them). Morning plan and EOD apply to those who use the timesheet, so support staff limited to
 * attendance and payroll (a peon, a driver) are not flagged or fined for a timesheet they don't have.
 */
export async function ruleSubjects(organizationId: string): Promise<Map<string, Subject>> {
  const rows = await prisma.organizationMembership.findMany({
    where: { organizationId, status: "ACTIVE", employeeId: { not: null }, role: { notIn: ["OWNER", "CLIENT"] }, employee: { approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } } },
    select: { employeeId: true, userId: true, role: true, moduleRestricted: true, allowedModules: true },
  });
  return new Map(rows.map((m) => [m.employeeId!, {
    employeeId: m.employeeId!,
    userId: m.userId,
    role: m.role as Role,
    plans: canUseModule({ role: m.role as Role, moduleRestricted: m.moduleRestricted, allowedModules: m.allowedModules }, "timesheet" as ModuleKey),
  }]));
}

/** Does the morning plan / EOD apply to the signed-in member? */
export function plansApplyTo(ctx: AppContext): boolean {
  return !!ctx.employee && ctx.role !== "OWNER" && canUseModule(ctx, "timesheet");
}

// ---------------------------------------------------------------- the rules page (§11 Declaration)

export async function acknowledgeRules(ctx: AppContext) {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: ctx.employee!.id }, data: { rulesAcknowledgedAt: new Date() } });
    await audit(tx, ctx, "office_rules.acknowledged", "employee", ctx.employee!.id);
  });
}

/** Has the person accepted the current version of the rules (a policy change asks again)? */
export function hasAcceptedRules(acknowledgedAt: Date | null, policyUpdatedAt: Date) {
  return !!acknowledgedAt && acknowledgedAt >= policyUpdatedAt;
}
