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
  const header = [
    "Employee ID", "Name", "Designation", "Department", "Monthly salary", "Paid by", "Per-day rate", "Days counted", "Present", "Half days",
    "Paid leave", "Leave beyond allowance", "Unpaid leave", "Absent", "Absent without request (x2)", "Sundays/holidays inside leave",
    "Late 15 min-1 h", "Late over 1 h", "Late excused", "Half days from late", "Half days from leaving early", "Days deducted", "Payable days",
    "Pay for payable days", "Overtime (minutes)", "Overtime pay", "No-leave bonus", "EOD fines (days)", "Team Lead fines (cases)", "Fines", p.complete ? "Net pay" : "Earned so far",
  ];
  const rows = p.rows.map((r) => {
    const s = r.score;
    return [
      r.code, r.name, r.designation ?? "", r.department ?? "", r.monthlySalary, r.salaryMode === "CASH" ? "Cash" : r.salaryMode === "TRANSFER" ? "Bank transfer" : "", r.pay.perDay,
      s.employedDays, s.worked, s.halfDays, s.paidLeave, s.excessLeave, s.unpaidLeave, s.absent, s.absentUnrequested, s.sandwichDays,
      s.lateArrivals, s.veryLateArrivals, s.lateExcused, s.lateHalfDays, s.earlyHalfDays, s.unpaidDays, s.payableDays,
      r.pay.basePay, s.overtimeMinutes, r.pay.overtimePay, r.pay.bonus, r.fines.eodMissed.length, r.fines.leadMissed.length, r.fines.amount, r.pay.net,
    ];
  });
  return xlsxResponse(`payroll-${month}.xlsx`, [
    { name: `Payroll ${month}`, title: `${ctx.organization.tradeName} · Payroll · ${month}${p.complete ? "" : " (to date)"}`, rows: [header, ...rows] },
  ]);
}
