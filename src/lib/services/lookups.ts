import "server-only";
import { prisma } from "@/lib/db";

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
