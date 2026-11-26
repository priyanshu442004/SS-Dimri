import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, ConfirmRequired, zCheckbox, zIsoDate, zOptionalText } from "@/lib/actions";
import { addDays, dateOnly, formatDate, isoDateInTz, toIsoDate } from "@/lib/dates";
import { ALLOCATION_RESOURCE_TYPES, ALLOCATION_ROLES, LEGACY_RESOURCE_TYPES, type AllocationRole } from "@/lib/domain/allocation-import";
import { FREQUENCY_KEYS, type Frequency } from "@/lib/domain/allocation-schedule";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { notifyEmployees } from "./notifications";
import { prepareAllocation } from "./allocations";

// Bulk work on Team allocation (tracker S.No. 105 and 106, 25 Nov 2026):
//   - allocate one person to many clients at once (a new junior joins a team that has 30 clients:
//     pick them all — optionally with the same days and hours as the senior on each client);
//   - transfer many clients from one person to another in one go (someone leaves or moves): each old
//     allocation ends the day before the effective date and a linked replacement starts on it, so the
//     history is kept exactly as for a single "Change".
// Each client is saved on its own: one client that cannot be allocated does not stop the others, and
// the result lists what was done and why anything was skipped.

export type BulkResult = { client: string; ok: boolean; message: string };

const zHours = z.coerce.number("Enter hours as a number").min(0).max(24).optional();

export const bulkAllocateSchema = z.object({
  employeeId: z.uuid("Select the team member"),
  "clientIds[]": z.array(z.uuid()).min(1, "Tick at least one client").max(500),
  startDate: zIsoDate,
  endDate: zIsoDate.optional(),
  seniorityLevel: z.enum(Object.keys(ALLOCATION_ROLES) as [AllocationRole, ...AllocationRole[]]).optional(),
  resourceType: z.enum([...ALLOCATION_RESOURCE_TYPES, ...LEGACY_RESOURCE_TYPES]).optional(),
  /** Copy days, hours and frequency from this person's allocation on each client (the senior). */
  copyFromEmployeeId: z.uuid().optional(),
  firstHalfHours: zHours,
  secondHalfHours: zHours,
  "weekDays[]": z.array(z.coerce.number().int().min(0).max(6)).max(7).default([]),
  frequency: z.enum(FREQUENCY_KEYS as [Frequency, ...Frequency[]]).optional(),
  visitDays: zOptionalText(80),
  reportsToEmployeeId: z.uuid().optional(),
  teamLeaderEmployeeId: z.uuid().optional(),
  allowOverlap: zCheckbox.optional(),
  remark: zOptionalText(1000),
});

export async function bulkAllocate(ctx: AppContext, v: z.infer<typeof bulkAllocateSchema>): Promise<BulkResult[]> {
  const employee = await prisma.employee.findFirst({ where: { id: v.employeeId, organizationId: ctx.organization.id, approvalStatus: "APPROVED" }, select: { id: true, firstName: true } });
  if (!employee) throw new BusinessRuleError("Select an approved team member.");
  const clientIds = [...new Set(v["clientIds[]"])];
  const [clients, source] = await Promise.all([
    prisma.client.findMany({ where: { id: { in: clientIds }, organizationId: ctx.organization.id }, select: { id: true, tradeName: true } }),
    v.copyFromEmployeeId
      ? prisma.teamAllocation.findMany({
          where: { organizationId: ctx.organization.id, employeeId: v.copyFromEmployeeId, clientId: { in: clientIds }, status: { in: ["ACTIVE", "PLANNED"] } },
          orderBy: { startDate: "desc" },
        })
      : Promise.resolve([]),
  ]);
  const name = new Map(clients.map((c) => [c.id, c.tradeName]));
  const results: BulkResult[] = [];
  const done: string[] = [];
  for (const clientId of clientIds) {
    const client = name.get(clientId);
    if (!client) { results.push({ client: "Unknown client", ok: false, message: "Not found." }); continue; }
    const copy = source.find((a) => a.clientId === clientId);
    const num = (d: unknown) => (d === null || d === undefined ? undefined : Number(d));
    try {
      const p = await prepareAllocation(ctx, {
        clientId, employeeId: employee.id, startDate: v.startDate, endDate: v.endDate,
        seniorityLevel: v.seniorityLevel, resourceType: v.resourceType,
        firstHalfHours: copy ? num(copy.firstHalfHours) : v.firstHalfHours,
        secondHalfHours: copy ? num(copy.secondHalfHours) : v.secondHalfHours,
        "weekDays[]": copy ? copy.weekDays : v["weekDays[]"],
        frequency: copy ? copy.frequency ?? undefined : v.frequency,
        visitDays: copy ? copy.visitDays ?? undefined : v.visitDays,
        reportsToEmployeeId: v.reportsToEmployeeId ?? (copy ? copy.employeeId : undefined),
        teamLeaderEmployeeId: v.teamLeaderEmployeeId ?? copy?.teamLeaderEmployeeId ?? undefined,
        allowOverlap: v.allowOverlap || copy?.allowOverlap,
        remark: v.remark,
        // Picking the clients one by one is the confirmation that others are already on them.
        confirmed: true,
      });
      await prisma.$transaction(async (tx) => {
        const a = await tx.teamAllocation.create({ data: p.data });
        await audit(tx, ctx, "allocation.created", "team_allocation", a.id, { bulk: true, conflictOverridden: p.conflictOverridden });
      });
      done.push(client);
      results.push({ client, ok: true, message: copy ? "Allocated (same days and hours as on the senior's allocation)" : "Allocated" });
    } catch (e) {
      results.push({ client, ok: false, message: e instanceof BusinessRuleError || e instanceof ConfirmRequired ? e.message : "Could not be saved." });
      if (!(e instanceof BusinessRuleError || e instanceof ConfirmRequired)) console.error("bulk allocate failed", e instanceof Error ? e.message : e);
    }
  }
  if (done.length) {
    await prisma.$transaction((tx) => notifyEmployees(tx, ctx.organization.id, [employee.id], {
      type: "allocation.created",
      title: done.length === 1 ? `You are allocated to ${done[0]}` : `You are allocated to ${done.length} clients`,
      body: done.slice(0, 30).join(", ") + (done.length > 30 ? ` and ${done.length - 30} more` : ""),
      link: "/app/allocations",
    }));
  }
  return results;
}

export const bulkTransferSchema = z.object({
  fromEmployeeId: z.uuid("Select whose clients to move"),
  toEmployeeId: z.uuid("Select who takes them over"),
  "allocationIds[]": z.array(z.uuid()).min(1, "Tick at least one client").max(500),
  effectiveDate: zIsoDate,
  changeReason: zOptionalText(500),
  allowOverlap: zCheckbox.optional(),
  /** Also hand over the "Reports to" / "Team leader" roles the person had on other people's allocations. */
  handOverRoles: zCheckbox.optional(),
});

export async function bulkTransfer(ctx: AppContext, v: z.infer<typeof bulkTransferSchema>): Promise<BulkResult[]> {
  if (v.fromEmployeeId === v.toEmployeeId) throw new BusinessRuleError("Choose a different person to take the clients over.");
  const [from, to] = await Promise.all([
    prisma.employee.findFirst({ where: { id: v.fromEmployeeId, organizationId: ctx.organization.id }, select: { id: true, firstName: true, lastName: true } }),
    prisma.employee.findFirst({ where: { id: v.toEmployeeId, organizationId: ctx.organization.id, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  if (!from) throw new BusinessRuleError("The person whose clients you are moving was not found.");
  if (!to) throw new BusinessRuleError("Select an approved, current team member to take the clients over.");
  const effective = dateOnly(v.effectiveDate);
  const today = dateOnly(isoDateInTz(new Date(), ctx.organization.timezone));
  const olds = await prisma.teamAllocation.findMany({
    where: { id: { in: [...new Set(v["allocationIds[]"])] }, organizationId: ctx.organization.id, employeeId: from.id, status: { in: ["ACTIVE", "PLANNED"] } },
    include: { client: { select: { tradeName: true } } },
  });
  const results: BulkResult[] = [];
  const moved: string[] = [];
  for (const old of olds) {
    const client = old.client.tradeName;
    try {
      if (old.endDate && effective > old.endDate) throw new BusinessRuleError(`This allocation ends on ${formatDate(old.endDate)}, before the effective date.`);
      // A planned allocation that has not started yet (or starts on the day) simply goes to the new person from its own start.
      const startsLater = effective <= old.startDate;
      const p = await prepareAllocation(ctx, {
        clientId: old.clientId, clientServiceId: old.clientServiceId ?? undefined, employeeId: to.id, seniorityLevel: old.seniorityLevel ?? undefined,
        startDate: toIsoDate(startsLater ? old.startDate : effective), endDate: old.endDate ? toIsoDate(old.endDate) : undefined,
        firstHalfHours: old.firstHalfHours === null ? undefined : Number(old.firstHalfHours),
        secondHalfHours: old.secondHalfHours === null ? undefined : Number(old.secondHalfHours),
        reportsToEmployeeId: old.reportsToEmployeeId && old.reportsToEmployeeId !== to.id ? old.reportsToEmployeeId : undefined,
        teamLeaderEmployeeId: old.teamLeaderEmployeeId && old.teamLeaderEmployeeId !== to.id ? old.teamLeaderEmployeeId : undefined,
        allowOverlap: v.allowOverlap || old.allowOverlap,
        "weekDays[]": old.weekDays, frequency: old.frequency ?? undefined, visitDays: old.visitDays ?? undefined, remark: old.remark ?? undefined,
        confirmed: true,
      }, old.id);
      p.data.resourceType = old.resourceType;
      p.data.extraFields = old.extraFields ?? undefined;
      p.data.replacesAllocationId = old.id;
      p.data.changeReason = v.changeReason ?? `Transferred from ${from.firstName}`;
      await prisma.$transaction(async (tx) => {
        const ended = await tx.teamAllocation.updateMany({
          where: { id: old.id, status: old.status },
          data: startsLater ? { status: "CANCELLED" } : { status: "ENDED", endDate: addDays(effective, -1) },
        });
        if (ended.count !== 1) throw new BusinessRuleError("It was changed by someone else meanwhile.");
        const a = await tx.teamAllocation.create({ data: p.data });
        await audit(tx, ctx, "allocation.changed", "team_allocation", a.id, { bulk: true, from: from.id });
      });
      moved.push(client);
      results.push({ client, ok: true, message: startsLater ? `Moved (starts ${formatDate(old.startDate)})` : `Moved from ${formatDate(effective)}; ${from.firstName}'s allocation ends ${formatDate(addDays(effective, -1))}` });
    } catch (e) {
      results.push({ client, ok: false, message: e instanceof BusinessRuleError || e instanceof ConfirmRequired ? e.message : "Could not be saved." });
      if (!(e instanceof BusinessRuleError || e instanceof ConfirmRequired)) console.error("bulk transfer failed", e instanceof Error ? e.message : e);
    }
  }
  let roles = 0;
  if (v.handOverRoles) {
    await prisma.$transaction(async (tx) => {
      const live = { organizationId: ctx.organization.id, status: { in: ["ACTIVE" as const, "PLANNED" as const] } };
      const a = await tx.teamAllocation.updateMany({ where: { ...live, reportsToEmployeeId: from.id, employeeId: { not: to.id } }, data: { reportsToEmployeeId: to.id } });
      const b = await tx.teamAllocation.updateMany({ where: { ...live, teamLeaderEmployeeId: from.id, employeeId: { not: to.id } }, data: { teamLeaderEmployeeId: to.id } });
      roles = a.count + b.count;
      if (roles) await audit(tx, ctx, "allocation.roles_handed_over", "employee", from.id, { to: to.id, count: roles });
    });
    if (roles) results.push({ client: "Reviewer / team-leader roles", ok: true, message: `${roles} allocation${roles === 1 ? "" : "s"} of other people now report to ${to.firstName}` });
  }
  if (moved.length) {
    const list = moved.slice(0, 30).join(", ") + (moved.length > 30 ? ` and ${moved.length - 30} more` : "");
    const when = effective <= today ? "from today" : `from ${formatDate(effective)}`;
    await prisma.$transaction(async (tx) => {
      await notifyEmployees(tx, ctx.organization.id, [to.id], { type: "allocation.created", title: `${moved.length} client${moved.length === 1 ? " is" : "s are"} moved to you from ${from.firstName} ${when}`, body: list, link: "/app/allocations" });
      await notifyEmployees(tx, ctx.organization.id, [from.id], { type: "allocation.ended", title: `${moved.length} of your client${moved.length === 1 ? " is" : "s are"} moved to ${to.firstName} ${when}`, body: list, link: "/app/allocations" });
    });
  }
  return results;
}
