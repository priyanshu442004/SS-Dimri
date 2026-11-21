import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getContext } from "@/lib/session";
import { isoDateInTz } from "@/lib/dates";
import { xlsxResponse } from "@/lib/xlsx";
import { dueDateReport, parseReminderFilters, pendingComplianceReport } from "@/lib/services/reminders";

/** The due-date or pending-compliance report on screen, as Excel. */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "compliance.use")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const f = parseReminderFilters(Object.fromEntries(new URL(request.url).searchParams));
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const firm = ctx.organization.tradeName;
  const days = (d: number) => (d < 0 ? `${-d} overdue` : d === 0 ? "Today" : d);
  if (f.tab === "pending") {
    const r = await pendingComplianceReport(ctx, f);
    const rows = r.clients.flatMap((c) => c.items.map((i) => [c.client, c.code, i.type, i.department, i.due, days(i.daysLeft), i.responsible]));
    return xlsxResponse(`pending-compliance-${today}.xlsx`, [{ name: "Pending compliance", title: `${firm} – Pending compliance (overdue + next ${f.days} days) · ${today}`, rows: [["Client", "Client code", "Compliance", "Department", "Due date", "Days left", "Responsible"], ...rows] }]);
  }
  const r = await dueDateReport(ctx, f);
  const rows = r.rows.map((x) => [x.due, days(x.daysLeft), x.kind, x.client, x.item, x.department, x.responsible]);
  return xlsxResponse(`due-dates-${today}.xlsx`, [{ name: "Due dates", title: `${firm} – Due-date report (overdue + next ${f.days} days) · ${today}`, rows: [["Due date", "Days left", "Type", "Client", "Compliance / notice", "Department", "Responsible"], ...rows] }]);
}
