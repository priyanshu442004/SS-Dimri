import { NextResponse } from "next/server";
import { isoDateInTz } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { payrollForMonth, validMonth } from "@/lib/services/payroll";
import { getContext } from "@/lib/session";
import { xlsxResponse } from "@/lib/xlsx";

export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "payroll.manage")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const month = validMonth(new URL(request.url).searchParams.get("month"), isoDateInTz(new Date(), ctx.organization.timezone));
  const p = await payrollForMonth(ctx, month);
  const header = ["Employee ID", "Name", "Designation", "Department", "Monthly salary", "Paid by", "Per-day rate", "Present", "Half days", "Paid leave", "Leave beyond allowance", "Unpaid leave", "Absent", "Not marked", "Unpaid days", "Payable days", p.complete ? "Net pay" : "Earned so far"];
  const rows = p.rows.map((r) => [
    r.code, r.name, r.designation ?? "", r.department ?? "", r.monthlySalary, r.salaryMode === "CASH" ? "Cash" : r.salaryMode === "TRANSFER" ? "Bank transfer" : "", r.perDay,
    r.present, r.halfDays, r.paidLeave, r.excessLeave, r.unpaidLeave, r.absent, r.unmarked, r.unpaidDays, r.payableDays, r.gross,
  ]);
  return xlsxResponse(`payroll-${month}.xlsx`, [
    { name: `Payroll ${month}`, title: `${ctx.organization.tradeName} · Payroll · ${month}${p.policyConfirmed ? "" : " (provisional)"}`, rows: [header, ...rows] },
  ]);
}
