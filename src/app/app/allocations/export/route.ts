import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { xlsxResponse } from "@/lib/xlsx";
import { ALLOCATION_ROLES } from "@/lib/domain/allocation-import";
import { FREQUENCIES, formatWeekDays } from "@/lib/domain/allocation-schedule";
import { allocationWhere, parseAllocationFilters } from "@/lib/services/allocation-views";

/** The allocation list as Excel, in the import columns (so it can be edited and imported again elsewhere). */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "allocations.view_all")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const filters = parseAllocationFilters(Object.fromEntries(new URL(request.url).searchParams));
  const rows = await prisma.teamAllocation.findMany({
    where: allocationWhere(ctx.organization.id, filters),
    orderBy: [{ client: { tradeName: "asc" } }, { startDate: "asc" }],
    take: 20_000,
    include: {
      client: { select: { tradeName: true, clientCode: true } },
      employee: { select: { firstName: true, lastName: true } },
      reportsTo: { select: { firstName: true, lastName: true } },
      teamLeader: { select: { firstName: true, lastName: true } },
    },
  });
  const name = (e: { firstName: string; lastName: string | null } | null) => (e ? `${e.firstName} ${e.lastName ?? ""}`.trim() : "");
  const extraKeys = [...new Set(rows.flatMap((r) => (r.extraFields && typeof r.extraFields === "object" && !Array.isArray(r.extraFields) ? Object.keys(r.extraFields) : [])))];
  const head = ["Client", "Client code", "Team member", "Role on this client", "Resource type", "From", "To", "Week days", "Full Day", "Frequency", "Visit day(s) of month",
    "1st half (hours)", "2nd half (hours)", "Reports to (timesheet reviewer)", "Team leader (escalation)", "Allow overlap with other allocations", "Remark", "Status", ...extraKeys];
  const body = rows.map((a) => {
    const full = a.firstHalfHours === null && a.secondHalfHours === null;
    const extra = (a.extraFields ?? {}) as Record<string, string>;
    return [
      a.client.tradeName, a.client.clientCode ?? "", name(a.employee), a.seniorityLevel ? ALLOCATION_ROLES[a.seniorityLevel] : "", a.resourceType ?? "",
      a.startDate, a.endDate, a.frequency === "TWICE_A_MONTH" || a.frequency === "MONTHLY" || a.frequency === "AS_REQUIRED" ? (a.weekDays.length ? formatWeekDays(a.weekDays) : "") : formatWeekDays(a.weekDays),
      full ? "Yes" : "No", a.frequency ? FREQUENCIES[a.frequency] : "", a.visitDays ?? "",
      full ? null : Number(a.firstHalfHours ?? 0), full ? null : Number(a.secondHalfHours ?? 0),
      name(a.reportsTo), name(a.teamLeader), a.allowOverlap ? "Yes" : "No", a.remark ?? "", a.status === "ENDED" ? "Ended" : a.status === "PLANNED" ? "Planned" : a.status === "CANCELLED" ? "Cancelled" : "Active",
      ...extraKeys.map((k) => extra[k] ?? ""),
    ];
  });
  return xlsxResponse("team-allocation.xlsx", [{ name: "Allocation", title: `${ctx.organization.tradeName} – Team Allocation`, rows: [head, ...body] }]);
}
