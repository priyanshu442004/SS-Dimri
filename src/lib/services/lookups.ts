import "server-only";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { clientScope } from "./clients";

/** Approved, non-exited employees for pickers. */
export async function employeeOptions(organizationId: string) {
  const rows = await prisma.employee.findMany({
    where: { organizationId, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } },
    orderBy: { firstName: "asc" },
    select: { id: true, firstName: true, lastName: true, designation: { select: { name: true, seniorityLevel: true } } },
  });
  return rows.map((e) => ({
    value: e.id,
    label: `${e.firstName} ${e.lastName ?? ""}`.trim() + (e.designation ? ` — ${e.designation.name}` : ""),
    level: e.designation?.seniorityLevel ?? null,
  }));
}

/** Pickers for tasks: leaves out people whose module access does not include tasks (e.g. a peon). */
export async function taskEmployeeOptions(organizationId: string) {
  const [options, restricted] = await Promise.all([
    employeeOptions(organizationId),
    prisma.organizationMembership.findMany({
      where: { organizationId, moduleRestricted: true, NOT: { allowedModules: { has: "tasks" } }, employeeId: { not: null } },
      select: { employeeId: true },
    }),
  ]);
  const without = new Set(restricted.map((m) => m.employeeId));
  return options.filter((o) => !without.has(o.value));
}

export async function activeClientOptions(organizationId: string) {
  const rows = await prisma.client.findMany({
    where: { organizationId, status: { in: ["ACTIVE", "ON_HOLD"] } },
    orderBy: { tradeName: "asc" },
    select: { id: true, tradeName: true },
  });
  return rows.map((c) => ({ value: c.id, label: c.tradeName }));
}

/** Label for work that is not for an allocated client (office work, or a client not in the list). */
export const OFFICE_OTHER = "Office / Other";

/**
 * Clients a person works on, on one day: active allocations that day, plus clients of open tasks
 * and of open tracker work given to them (so assigned work can always be logged).
 */
export async function ownWorkClientIds(organizationId: string, employeeId: string, day: Date): Promise<Set<string>> {
  const [allocations, tasks, lines] = await Promise.all([
    prisma.teamAllocation.findMany({
      where: { organizationId, employeeId, status: { in: ["ACTIVE", "PLANNED", "ENDED"] }, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] },
      select: { clientId: true },
    }),
    prisma.task.findMany({
      where: {
        organizationId, clientId: { not: null }, status: { notIn: ["COMPLETED", "CANCELLED"] },
        OR: [{ assignments: { some: { employeeId, removedAt: null } } }, { makerEmployeeId: employeeId }, { checkerEmployeeId: employeeId }],
      },
      select: { clientId: true },
    }),
    prisma.trackerLine.findMany({
      where: { organizationId, clientId: { not: null }, AND: [{ OR: [{ makerEmployeeId: employeeId }, { checkerEmployeeId: employeeId }] }, { OR: [{ checkerStatus: null }, { checkerStatus: { not: "Approved" } }] }] },
      select: { clientId: true },
    }),
  ]);
  return new Set([...allocations, ...tasks, ...lines].map((r) => r.clientId).filter((x): x is string => !!x));
}

/**
 * Client choices for a person's own timesheet and morning plan (tracker, 14 Nov 2026): only the
 * clients allocated to them on that day, plus "Office / Other". Owner and administrators see all.
 */
export async function ownWorkClientOptions(ctx: AppContext, day: Date) {
  if (can(ctx, "org.manage") || !ctx.employee) return activeClientOptions(ctx.organization.id);
  const ids = await ownWorkClientIds(ctx.organization.id, ctx.employee.id, day);
  if (!ids.size) return [];
  const rows = await prisma.client.findMany({ where: { id: { in: [...ids] }, organizationId: ctx.organization.id }, orderBy: { tradeName: "asc" }, select: { id: true, tradeName: true } });
  return rows.map((c) => ({ value: c.id, label: c.tradeName }));
}

/** May this person log own work on the client that day? Owner and administrators always. */
export async function mayLogWorkFor(ctx: AppContext, clientId: string, day: Date) {
  if (can(ctx, "org.manage") || !ctx.employee) return true;
  return (await ownWorkClientIds(ctx.organization.id, ctx.employee.id, day)).has(clientId);
}

/** Client pickers elsewhere (new task, pending items, client visits): those the person can see in Clients. */
export async function visibleClientOptions(ctx: AppContext) {
  if (can(ctx, "clients.view_all")) return activeClientOptions(ctx.organization.id);
  const rows = await prisma.client.findMany({
    where: { AND: [clientScope(ctx), { status: { in: ["ACTIVE", "ON_HOLD"] } }] },
    orderBy: { tradeName: "asc" },
    select: { id: true, tradeName: true },
  });
  return rows.map((c) => ({ value: c.id, label: c.tradeName }));
}
