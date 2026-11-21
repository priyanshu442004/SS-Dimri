import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getContext } from "@/lib/session";
import { isoDateInTz } from "@/lib/dates";
import { xlsxResponse, type Sheet } from "@/lib/xlsx";
import { clientAllocationReport, parseReportFilters, teamAllocationReport } from "@/lib/services/allocation-report";

/** The allocation report on screen (client-wise or team-wise), as Excel. */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "allocations.view_all")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const f = parseReportFilters(Object.fromEntries(new URL(request.url).searchParams));
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const firm = ctx.organization.tradeName;
  if (f.tab === "team") {
    const r = await teamAllocationReport(ctx.organization.id, f, today);
    const head = ["Team member", "Employee ID", "Designation", "Client", "Client code", "Role on client", "Resource type", "Days", "Hours", "Hours a planned day", "From", "To", "Status", "Reports to"];
    const rows = r.rows.map((a) => [a.member, a.code, a.designation, a.client, a.clientCode, a.role, a.resourceType, a.days, a.hours, a.hoursPerDay, a.from, a.to, a.planned ? "Planned" : "Active", a.reportsTo]);
    const sheets: Sheet[] = [{ name: "Team-wise", title: `${firm} – Team-wise client allocation (${today})`, rows: [head, ...rows] }];
    if (r.withoutClients.length) sheets.push({ name: "Without clients", title: `${firm} – Team members without any client`, rows: [["Team member", "Designation"], ...r.withoutClients.map((p) => [p.member, p.designation])] });
    return xlsxResponse(`team-wise-allocation-${today}.xlsx`, sheets);
  }
  const r = await clientAllocationReport(ctx.organization.id, f, today);
  const head = ["Client", "Client code", "Status", "Allocated", "People", "Team (role on this client)", "Services", "Departments"];
  const rows = r.rows.map((c) => [c.client, c.code, c.status === "INACTIVE" ? "Discontinued" : c.status.replace("_", " ").toLowerCase(), c.people ? "Yes" : "No", c.people, c.team.join(", "), c.services, c.departments]);
  return xlsxResponse(`client-allocation-${today}.xlsx`, [{ name: "Client allocation", title: `${firm} – Client allocation (${r.allocatedCount} allocated, ${r.notAllocated} not allocated) · ${today}`, rows: [head, ...rows] }]);
}
