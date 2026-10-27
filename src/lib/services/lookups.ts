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

export async function activeClientOptions(organizationId: string) {
  const rows = await prisma.client.findMany({
    where: { organizationId, status: { in: ["ACTIVE", "ON_HOLD"] } },
    orderBy: { tradeName: "asc" },
    select: { id: true, tradeName: true },
  });
  return rows.map((c) => ({ value: c.id, label: c.tradeName }));
}
