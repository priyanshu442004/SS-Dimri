import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zIsoDate, zOptionalText } from "@/lib/actions";
import { addDays, dateOnly, formatDate, isoDateInTz, toIsoDate } from "@/lib/dates";
import { capacityFromPolicy, findConflicts, formatHours, type AllocationSpan } from "@/lib/domain/allocation";
import { ALLOCATION_RESOURCE_TYPES, ALLOCATION_ROLES, LEGACY_RESOURCE_TYPES, type AllocationRole } from "@/lib/domain/allocation-import";
import { FREQUENCY_KEYS, formatVisitDays, parseVisitDays, type Frequency } from "@/lib/domain/allocation-schedule";
import { getPolicy } from "./attendance";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { notifyEmployees } from "./notifications";

const zHours = z.coerce.number("Enter hours as a number").min(0, "Hours cannot be negative").max(24).optional();

export const allocationSchema = z.object({
  clientId: z.uuid("Select a client"),
  clientServiceId: z.uuid().optional(),
  employeeId: z.uuid("Select a team member"),
  seniorityLevel: z.enum(Object.keys(ALLOCATION_ROLES) as [AllocationRole, ...AllocationRole[]]).optional(),
  startDate: zIsoDate,
  endDate: zIsoDate.optional(),
  /** Hours in each half of the day; both blank = full day. */
  firstHalfHours: zHours,
  secondHalfHours: zHours,
  resourceType: z.enum([...ALLOCATION_RESOURCE_TYPES, ...LEGACY_RESOURCE_TYPES]).optional(),
  reportsToEmployeeId: z.uuid().optional(),
  teamLeaderEmployeeId: z.uuid().optional(),
  allowOverlap: zCheckbox.optional(),
  /** 1 = Mon … 6 = Sat; none ticked = Mon–Sat. */
  "weekDays[]": z.array(z.coerce.number().int().min(1).max(6)).max(6).default([]),
  frequency: z.enum(FREQUENCY_KEYS as [Frequency, ...Frequency[]]).optional(),
  visitDays: zOptionalText(80),
  remark: zOptionalText(1000),
});
type AllocationInput = z.input<typeof allocationSchema>;

/** Planned before the start, ended after the To date, active in between. */
export function allocationStatusFor(start: Date, end: Date | null, today: Date) {
  if (end && end < today) return "ENDED" as const;
  return start > today ? ("PLANNED" as const) : ("ACTIVE" as const);
}

/** A person's current and planned allocations, as spans for the conflict check. */
export async function allocationSpans(organizationId: string, employeeIds: string[], excludeId?: string): Promise<(AllocationSpan & { employeeId: string; clientId: string })[]> {
  const rows = await prisma.teamAllocation.findMany({
    where: { organizationId, employeeId: { in: employeeIds }, status: { in: ["ACTIVE", "PLANNED"] }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: {
      id: true, employeeId: true, clientId: true, startDate: true, endDate: true, firstHalfHours: true, secondHalfHours: true,
      weekDays: true, frequency: true, visitDays: true, allowOverlap: true, client: { select: { tradeName: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id, employeeId: r.employeeId, clientId: r.clientId, startDate: r.startDate, endDate: r.endDate, clientName: r.client.tradeName,
    firstHalfHours: r.firstHalfHours === null ? null : Number(r.firstHalfHours),
    secondHalfHours: r.secondHalfHours === null ? null : Number(r.secondHalfHours),
    weekDays: r.weekDays, frequency: r.frequency, visitDays: r.visitDays, allowOverlap: r.allowOverlap,
  }));
}

/** Ends allocations whose To date has passed and starts planned ones whose day has come (sheet rule). */
export async function refreshAllocationStatuses(organizationId: string, todayIso: string) {
  const today = dateOnly(todayIso);
  const [ended, started] = await prisma.$transaction([
    prisma.teamAllocation.updateMany({ where: { organizationId, status: { in: ["ACTIVE", "PLANNED"] }, endDate: { lt: today } }, data: { status: "ENDED" } }),
    prisma.teamAllocation.updateMany({ where: { organizationId, status: "PLANNED", startDate: { lte: today } }, data: { status: "ACTIVE" } }),
  ]);
  return { ended: ended.count, started: started.count };
}

/** Validate an allocation (ownership, dates, conflicts) and return the row data to insert. */
async function prepareAllocation(ctx: AppContext, input: AllocationInput, excludeId?: string) {
  const v = allocationSchema.parse(input);
  const [client, employee] = await Promise.all([
    prisma.client.findFirst({ where: { id: v.clientId, organizationId: ctx.organization.id, status: { in: ["ACTIVE", "ON_HOLD"] } } }),
    prisma.employee.findFirst({ where: { id: v.employeeId, organizationId: ctx.organization.id, approvalStatus: "APPROVED" } }),
  ]);
  if (!client) throw new BusinessRuleError("Only active clients can be allocated.");
  if (!employee) throw new BusinessRuleError("Select an approved team member.");
  const start = dateOnly(v.startDate);
  const end = v.endDate ? dateOnly(v.endDate) : null;
  if (end && end < start) throw new BusinessRuleError("End date must be on or after the start date.");
  const today = dateOnly(isoDateInTz(new Date(), ctx.organization.timezone));

  // Visit days are read and written back in one style ("5, 20", "1st & 3rd Tue", "Last working day").
  const monthBased = v.frequency === "TWICE_A_MONTH" || v.frequency === "MONTHLY";
  let visitDays: string | null = null;
  if (v.visitDays) {
    const rule = parseVisitDays(v.visitDays);
    if (!rule) throw new BusinessRuleError("Visit day(s) of month could not be read. Write e.g. 5, 20 or 7 or 1st & 3rd Tue or Last working day.");
    visitDays = formatVisitDays(rule);
  }
  if (monthBased && !visitDays) throw new BusinessRuleError("For twice a month or monthly, fill the visit day(s) of month (e.g. 5, 20 or Last working day).");
  const weekDays = [...new Set(v["weekDays[]"])].sort((a, b) => a - b);

  const { row: policy } = await getPolicy(ctx.organization.id);
  const cap = capacityFromPolicy(policy);
  const blank = v.firstHalfHours === undefined && v.secondHalfHours === undefined;
  const first = blank ? null : v.firstHalfHours ?? 0;
  const second = blank ? null : v.secondHalfHours ?? 0;
  // "As required" may have no fixed hours; everything else needs hours in a half, or a full day.
  if (!blank && first === 0 && second === 0 && v.frequency !== "AS_REQUIRED") throw new BusinessRuleError("Enter the hours for at least one half of the day, or leave both blank for a full day.");
  if (first !== null && first > cap.first) throw new BusinessRuleError(`The first half has only ${formatHours(cap.first)} working hours.`);
  if (second !== null && second > cap.second) throw new BusinessRuleError(`The second half has only ${formatHours(cap.second)} working hours.`);
  for (const [id, label] of [[v.reportsToEmployeeId, "reviewer"], [v.teamLeaderEmployeeId, "team leader"]] as const) {
    if (id && !(await prisma.employee.findFirst({ where: { id, organizationId: ctx.organization.id }, select: { id: true } }))) throw new BusinessRuleError(`Select a valid ${label}.`);
  }

  // The same person twice on the same client for overlapping dates is a mistake (sheet rule).
  const twice = await prisma.teamAllocation.findFirst({
    where: {
      organizationId: ctx.organization.id, clientId: client.id, employeeId: employee.id, status: { in: ["ACTIVE", "PLANNED", "ENDED"] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      ...(end ? { startDate: { lte: end } } : {}),
      OR: [{ endDate: null }, { endDate: { gte: start } }],
    },
    select: { startDate: true, endDate: true },
  });
  if (twice) {
    throw new BusinessRuleError(`${employee.firstName} is already allocated to ${client.tradeName} from ${formatDate(twice.startDate)}${twice.endDate ? ` to ${formatDate(twice.endDate)}` : " (ongoing)"}. Change or end that allocation instead.`);
  }

  const candidate: AllocationSpan = { startDate: start, endDate: end, firstHalfHours: first, secondHalfHours: second, weekDays, frequency: v.frequency ?? null, visitDays };
  // History (already ended) and "allow overlap" allocations are not checked for clashes.
  const conflicts = end && end < today
    ? null
    : findConflicts(candidate, await allocationSpans(ctx.organization.id, [employee.id], excludeId), cap);
  // Conflicts are never saved silently: the user must explicitly allow the overlap.
  if (conflicts?.isConflict && !v.allowOverlap) {
    throw new BusinessRuleError(
      `On ${formatDate(conflicts.clashDay)} this would book ${employee.firstName} for ${formatHours(conflicts.firstHours)} h in the first half and ${formatHours(conflicts.secondHours)} h in the second (available: ${formatHours(cap.first)} h and ${formatHours(cap.second)} h). Also on: ${conflicts.overlapping.map((o) => o.clientName).join(", ")}. Change the days or hours, or tick “allow overlap” to save anyway.`,
    );
  }
  const data: Prisma.TeamAllocationUncheckedCreateInput = {
    organizationId: ctx.organization.id,
    clientId: client.id,
    clientServiceId: v.clientServiceId,
    employeeId: employee.id,
    seniorityLevel: v.seniorityLevel,
    startDate: start,
    endDate: end,
    firstHalfHours: first,
    secondHalfHours: second,
    resourceType: v.resourceType,
    reportsToEmployeeId: v.reportsToEmployeeId,
    teamLeaderEmployeeId: v.teamLeaderEmployeeId,
    weekDays,
    frequency: v.frequency ?? null,
    visitDays,
    allowOverlap: !!v.allowOverlap,
    remark: v.remark,
    status: allocationStatusFor(start, end, today),
    createdById: ctx.user.id,
  };
  return { data, client, employee, conflictOverridden: !!conflicts?.isConflict };
}

async function insertAllocation(tx: Prisma.TransactionClient, ctx: AppContext, p: Awaited<ReturnType<typeof prepareAllocation>>, action: string) {
  const a = await tx.teamAllocation.create({ data: p.data });
  await audit(tx, ctx, action, "team_allocation", a.id, { conflictOverridden: p.conflictOverridden });
  await notifyEmployees(tx, ctx.organization.id, [p.employee.id], {
    type: "allocation.created",
    title: `You are allocated to ${p.client.tradeName}`,
    link: "/app/allocations",
  });
  return a;
}

export async function createAllocation(ctx: AppContext, v: AllocationInput) {
  const p = await prepareAllocation(ctx, v);
  return prisma.$transaction((tx) => insertAllocation(tx, ctx, p, "allocation.created"));
}

export const changeSchema = z.object({
  employeeId: z.uuid("Select a team member"),
  effectiveDate: zIsoDate,
  changeReason: zOptionalText(500),
  allowOverlap: zCheckbox.optional(),
});

/**
 * Change of allocation: the current row ends the day before the effective date
 * and a linked replacement starts on it — atomically. History is kept.
 */
export async function changeAllocation(ctx: AppContext, allocationId: string, v: z.infer<typeof changeSchema>) {
  const old = await prisma.teamAllocation.findFirst({
    where: { id: allocationId, organizationId: ctx.organization.id, status: { in: ["ACTIVE", "PLANNED"] } },
  });
  if (!old) throw new BusinessRuleError("Allocation not found or already ended.");
  const effective = dateOnly(v.effectiveDate);
  if (effective <= old.startDate) throw new BusinessRuleError("The change must take effect after the allocation start date.");
  if (old.endDate && effective > old.endDate) throw new BusinessRuleError("The allocation ends before that date.");

  const p = await prepareAllocation(
    ctx,
    {
      clientId: old.clientId,
      clientServiceId: old.clientServiceId ?? undefined,
      employeeId: v.employeeId,
      seniorityLevel: old.seniorityLevel ?? undefined,
      startDate: v.effectiveDate,
      endDate: old.endDate ? toIsoDate(old.endDate) : undefined,
      firstHalfHours: old.firstHalfHours === null ? undefined : Number(old.firstHalfHours),
      secondHalfHours: old.secondHalfHours === null ? undefined : Number(old.secondHalfHours),
      reportsToEmployeeId: old.reportsToEmployeeId ?? undefined,
      teamLeaderEmployeeId: old.teamLeaderEmployeeId ?? undefined,
      allowOverlap: v.allowOverlap || old.allowOverlap,
      "weekDays[]": old.weekDays,
      frequency: old.frequency ?? undefined,
      visitDays: old.visitDays ?? undefined,
      remark: old.remark ?? undefined,
    },
    old.id,
  );
  // The replacement keeps the same resource type (even one written in an imported sheet) and extra details.
  p.data.resourceType = old.resourceType;
  p.data.extraFields = old.extraFields ?? undefined;
  p.data.replacesAllocationId = old.id;
  p.data.changeReason = v.changeReason;

  return prisma.$transaction(async (tx) => {
    const ended = await tx.teamAllocation.updateMany({
      where: { id: old.id, status: old.status },
      data: { status: "ENDED", endDate: addDays(effective, -1) },
    });
    if (ended.count !== 1) throw new BusinessRuleError("The allocation was changed by someone else. Refresh and try again.");
    if (old.employeeId !== v.employeeId) {
      await notifyEmployees(tx, ctx.organization.id, [old.employeeId], {
        type: "allocation.ended", title: `Your allocation to ${p.client.tradeName} ends ${toIsoDate(addDays(effective, -1))}`, link: "/app/allocations",
      });
    }
    return insertAllocation(tx, ctx, p, "allocation.changed");
  });
}

export async function endAllocation(ctx: AppContext, allocationId: string, endIso: string) {
  const a = await prisma.teamAllocation.findFirst({ where: { id: allocationId, organizationId: ctx.organization.id, status: { in: ["ACTIVE", "PLANNED"] } } });
  if (!a) throw new BusinessRuleError("Allocation not found or already ended.");
  const end = dateOnly(endIso);
  await prisma.$transaction(async (tx) => {
    const res = await tx.teamAllocation.updateMany({
      where: { id: a.id, status: a.status },
      data: { status: end < a.startDate ? "CANCELLED" : "ENDED", endDate: end < a.startDate ? a.startDate : end },
    });
    if (res.count !== 1) throw new BusinessRuleError("The allocation was changed by someone else. Refresh and try again.");
    await audit(tx, ctx, "allocation.ended", "team_allocation", a.id);
    const client = await tx.client.findUniqueOrThrow({ where: { id: a.clientId }, select: { tradeName: true } });
    await notifyEmployees(tx, ctx.organization.id, [a.employeeId], { type: "allocation.ended", title: `Your allocation to ${client.tradeName} has ended`, link: "/app/allocations" });
  });
}
