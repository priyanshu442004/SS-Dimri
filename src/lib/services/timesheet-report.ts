import "server-only";
import { prisma } from "@/lib/db";

const nameOf = (e: { firstName: string; lastName: string | null } | null | undefined) => (e ? `${e.firstName} ${e.lastName ?? ""}`.trim() : null);

/**
 * "Reviewer (auto)" and "Escalate To" per entry, as the workbook looks them up: the
 * allocation's Reports To / Team Leader first, then the person's usual manager, then the
 * firm's owner as the last line of escalation.
 */
export async function timesheetReviewers(organizationId: string, entries: { id: string; employeeId: string; teamAllocationId: string | null }[]) {
  const allocationIds = [...new Set(entries.map((e) => e.teamAllocationId).filter((x): x is string => !!x))];
  const employeeIds = [...new Set(entries.map((e) => e.employeeId))];
  const [allocations, reporting, owner] = await Promise.all([
    allocationIds.length
      ? prisma.teamAllocation.findMany({
          where: { id: { in: allocationIds } },
          select: { id: true, reportsTo: { select: { firstName: true, lastName: true } }, teamLeader: { select: { firstName: true, lastName: true } } },
        })
      : [],
    employeeIds.length
      ? prisma.employeeReportingRelationship.findMany({
          where: { employeeId: { in: employeeIds } },
          orderBy: { isPrimary: "desc" },
          select: { employeeId: true, manager: { select: { firstName: true, lastName: true } } },
        })
      : [],
    prisma.organizationMembership.findFirst({ where: { organizationId, role: "OWNER" }, select: { user: { select: { name: true } } } }),
  ]);
  const byAllocation = new Map(allocations.map((a) => [a.id, a]));
  const managerOf = new Map<string, string>();
  for (const r of reporting) if (!managerOf.has(r.employeeId)) managerOf.set(r.employeeId, nameOf(r.manager)!);
  const out = new Map<string, { reviewer: string | null; escalateTo: string | null }>();
  for (const e of entries) {
    const a = e.teamAllocationId ? byAllocation.get(e.teamAllocationId) : undefined;
    out.set(e.id, {
      reviewer: nameOf(a?.reportsTo) ?? managerOf.get(e.employeeId) ?? null,
      escalateTo: nameOf(a?.teamLeader) ?? owner?.user.name ?? null,
    });
  }
  return out;
}

export function timesheetExportHref(q: { from?: string; to?: string; date: string; employeeId: string; clientId: string; tab: string }) {
  const p = new URLSearchParams();
  // The dashboard defaults to the month so far; the tracker to one day.
  const from = q.from ?? (q.tab === "dashboard" ? `${q.date.slice(0, 8)}01` : q.date);
  p.set("from", from);
  p.set("to", q.to ?? q.date);
  if (q.employeeId) p.set("employee", q.employeeId);
  if (q.clientId) p.set("client", q.clientId);
  return `/app/timesheet/export?${p}`;
}
