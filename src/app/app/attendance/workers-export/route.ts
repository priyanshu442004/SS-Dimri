import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dateOnly, formatDate, formatTime } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { getContext } from "@/lib/session";
import { todayIso } from "@/lib/services/attendance";
import { workerPayoffs } from "@/lib/services/daily-workers";
import { xlsxResponse } from "@/lib/xlsx";

const STATUS: Record<string, string> = { PRESENT: "Present", HALF_DAY: "Half day", ABSENT: "Absent" };

/** Daily workers' pay for a period (summary) and every marked day (detail), as Excel. */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "attendance.workers")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const sp = new URL(request.url).searchParams;
  const today = todayIso(ctx);
  const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  const to = iso(sp.get("to")) || today;
  let from = iso(sp.get("from")) || `${today.slice(0, 7)}-01`;
  if (from > to) from = to;
  const tz = ctx.organization.timezone;
  const [summary, days] = await Promise.all([
    workerPayoffs(ctx.organization.id, from, to),
    prisma.dailyWorkerDay.findMany({
      where: { organizationId: ctx.organization.id, workDate: { gte: dateOnly(from), lte: dateOnly(to) } },
      orderBy: [{ workDate: "asc" }],
      include: { worker: { select: { name: true, workType: true, contractor: true } }, markedBy: { select: { name: true } } },
    }),
  ]);
  const period = `${formatDate(dateOnly(from))} to ${formatDate(dateOnly(to))}`;
  return xlsxResponse(`daily-workers-${from}-to-${to}.xlsx`, [
    {
      name: "Pay",
      title: `${ctx.organization.tradeName} · Daily workers' pay · ${period}`,
      rows: [
        ["Worker", "Mobile", "Kind of work", "Contractor", "Wage per day", "Full days", "Half days", "Absent days", "Days worked", "Earned", "Paid", "To pay"],
        ...summary.map((r) => [r.worker.name, r.worker.mobile ?? "", r.worker.workType ?? "", r.worker.contractor ?? "", Number(r.worker.dailyWage), r.fullDays, r.halfDays, r.absentDays, r.daysWorked, r.earned, r.paid, r.due]),
      ],
    },
    {
      name: "Days",
      title: `${ctx.organization.tradeName} · Daily workers' attendance · ${period}`,
      rows: [
        ["Date", "Worker", "Kind of work", "Contractor", "Status", "Time in", "Time out", "Wage", "Paid", "Marked by", "Remarks"],
        ...days.map((d) => [
          d.workDate, d.worker.name, d.worker.workType ?? "", d.worker.contractor ?? "", STATUS[d.status] ?? d.status,
          d.timeIn ? formatTime(d.timeIn, tz) : "", d.timeOut ? formatTime(d.timeOut, tz) : "", Number(d.wage), d.paidAt ? "Yes" : "No", d.markedBy?.name ?? "", d.remarks ?? "",
        ]),
      ],
    },
  ]);
}
