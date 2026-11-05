import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zIsoDate, zOptionalText } from "@/lib/actions";
import { addDays, dateOnly, toIsoDate } from "@/lib/dates";
import { capacityFromPolicy, findConflicts, formatHours } from "@/lib/domain/allocation";
import { RESOURCE_TYPES } from "@/lib/domain/timesheet";
import { getPolicy } from "./attendance";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { notifyEmployees } from "./notifications";

const zHours = z.coerce.number("Enter hours as a number").min(0, "Hours cannot be negative").max(24).optional();

export const allocationSchema = z.object({
  clientId: z.uuid("Select a client"),
  clientServiceId: z.uuid().optional(),
  employeeId: z.uuid("Select a team member"),
  seniorityLevel: z.enum(["JUNIOR", "MID_LEVEL", "SENIOR"]).optional(),
  startDate: zIsoDate,
  endDate: zIsoDate.optional(),
  /** Hours in each half of the day; both blank = full day. */
  firstHalfHours: zHours,
  secondHalfHours: zHours,
  resourceType: z.enum(RESOURCE_TYPES).optional(),
  reportsToEmployeeId: z.uuid().optional(),
  teamLeaderEmployeeId: z.uuid().optional(),
  allowOverlap: zCheckbox.optional(),
});
type AllocationInput = z.infer<typeof allocationSchema>;

/** Validate an allocation (ownership, dates, conflicts) and return the row data to insert. */
async function prepareAllocation(ctx: AppContext, v: AllocationInput, excludeId?: string) {
  const [client, employee] = await Promise.all([
    prisma.client.findFirst({ where: { id: v.clientId, organizationId: ctx.organization.id, status: { in: ["ACTIVE", "ON_HOLD"] } } }),
    prisma.employee.findFirst({ where: { id: v.employeeId, organizationId: ctx.organization.id, approvalStatus: "APPROVED" } }),
  ]);
  if (!client) throw new BusinessRuleError("Only active clients can be allocated.");
  if (!employee) throw new BusinessRuleError("Select an approved team member.");
  const start = dateOnly(v.startDate);
  const end = v.endDate ? dateOnly(v.endDate) : null;
  if (end && end < start) throw new BusinessRuleError("End date must be on or after the start date.");

  const { row: policy } = await getPolicy(ctx.organization.id);
  const cap = capacityFromPolicy(policy);
  const blank = v.firstHalfHours === undefined && v.secondHalfHours === undefined;
  const first = blank ? null : v.firstHalfHours ?? 0;
  const second = blank ? null : v.secondHalfHours ?? 0;
  if (!blank && first === 0 && second === 0) throw new BusinessRuleError("Enter the hours for at least one half of the day, or leave both blank for a full day.");
  if (first !== null && first > cap.first) throw new BusinessRuleError(`The first half has only ${formatHours(cap.first)} working hours.`);
  if (second !== null && second > cap.second) throw new BusinessRuleError(`The second half has only ${formatHours(cap.second)} working hours.`);
  for (const [id, label] of [[v.reportsToEmployeeId, "reviewer"], [v.teamLeaderEmployeeId, "team leader"]] as const) {
    if (id && !(await prisma.employee.findFirst({ where: { id, organizationId: ctx.organization.id }, select: { id: true } }))) throw new BusinessRuleError(`Select a valid ${label}.`);
  }

  const existing = await prisma.teamAllocation.findMany({
    where: { organizationId: ctx.organization.id, employeeId: employee.id, status: { in: ["ACTIVE", "PLANNED"] }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, startDate: true, endDate: true, firstHalfHours: true, secondHalfHours: true, client: { select: { tradeName: true } } },
  });
  const conflicts = findConflicts(
    { startDate: start, endDate: end, firstHalfHours: first, secondHalfHours: second },
    existing.map((r) => ({
      id: r.id, startDate: r.startDate, endDate: r.endDate, clientName: r.client.tradeName,
      firstHalfHours: r.firstHalfHours === null ? null : Number(r.firstHalfHours),
      secondHalfHours: r.secondHalfHours === null ? null : Number(r.secondHalfHours),
    })),
    cap,
  );
  // Conflicts are never saved silently: the user must explicitly allow the overlap.
  if (conflicts.isConflict && !v.allowOverlap) {
    throw new BusinessRuleError(
      `This would book the team member for ${formatHours(conflicts.firstHours)} h in the first half and ${formatHours(conflicts.secondHours)} h in the second (available: ${formatHours(cap.first)} h and ${formatHours(cap.second)} h). Also on: ${conflicts.overlapping.map((o) => o.clientName).join(", ")}. Reduce the hours, change the dates, or tick “allow overlap” to save anyway.`,
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
    status: start > new Date() ? "PLANNED" : "ACTIVE",
    createdById: ctx.user.id,
  };
  return { data, client, employee, conflictOverridden: conflicts.isConflict };
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
      resourceType: (RESOURCE_TYPES as readonly string[]).includes(old.resourceType ?? "") ? (old.resourceType as (typeof RESOURCE_TYPES)[number]) : undefined,
      reportsToEmployeeId: old.reportsToEmployeeId ?? undefined,
      teamLeaderEmployeeId: old.teamLeaderEmployeeId ?? undefined,
      allowOverlap: v.allowOverlap,
    },
    old.id,
  );
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
