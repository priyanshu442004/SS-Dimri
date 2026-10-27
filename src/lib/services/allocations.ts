import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zIsoDate, zOptionalText } from "@/lib/actions";
import { addDays, dateOnly, toIsoDate } from "@/lib/dates";
import { findConflicts } from "@/lib/domain/allocation";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { notifyEmployees } from "./notifications";

export const allocationSchema = z.object({
  clientId: z.uuid("Select a client"),
  clientServiceId: z.uuid().optional(),
  employeeId: z.uuid("Select a team member"),
  seniorityLevel: z.enum(["JUNIOR", "MID_LEVEL", "SENIOR"]).optional(),
  startDate: zIsoDate,
  endDate: zIsoDate.optional(),
  allocationPercent: z.coerce.number().int().min(1).max(100).optional(),
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

  const existing = await prisma.teamAllocation.findMany({
    where: { organizationId: ctx.organization.id, employeeId: employee.id, status: { in: ["ACTIVE", "PLANNED"] }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, startDate: true, endDate: true, allocationPercent: true, client: { select: { tradeName: true } } },
  });
  const conflicts = findConflicts(
    { startDate: start, endDate: end, allocationPercent: v.allocationPercent ?? null },
    existing.map((r) => ({ ...r, clientName: r.client.tradeName })),
  );
  // Conflicts are never saved silently: the user must explicitly allow the overlap.
  if (conflicts.isConflict && !v.allowOverlap) {
    throw new BusinessRuleError(
      `This would allocate the team member at ${conflicts.totalPercent}% on overlapping dates (also on: ${conflicts.overlapping.map((o) => o.clientName).join(", ")}). Reduce the percentage, change the dates, or tick “allow overlap” to save anyway.`,
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
    allocationPercent: v.allocationPercent,
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
      allocationPercent: old.allocationPercent ?? undefined,
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
