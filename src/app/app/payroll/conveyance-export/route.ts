import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isoDateInTz, monthRange } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { getContext } from "@/lib/session";
import { validMonth } from "@/lib/services/payroll";
import { isOwnVehicle } from "@/lib/services/claims";
import { styledXlsxResponse, type XSheet } from "@/lib/xlsx-styled";

const STATUS: Record<string, string> = { PENDING: "Waiting", APPROVED: "Approved", REJECTED: "Rejected" };

/**
 * The month's conveyance as the SSDA conveyance sheet (25 Nov 2026): one sheet per person — Date, Name of
 * client, Total run, Mode, Commuted home to office, KM run for office, Rate per KM, Amount, Remark, Status —
 * with the month's total. `&mine=1` = own sheet; administrators get everyone's.
 */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "payroll.view_own")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const sp = new URL(request.url).searchParams;
  const month = validMonth(sp.get("month"), isoDateInTz(new Date(), ctx.organization.timezone));
  const mine = sp.get("mine") === "1" || !can(ctx, "payroll.manage");
  if (mine && !ctx.employee) return new NextResponse("Not found", { status: 404 });
  const { start, end } = monthRange(`${month}-01`);
  const claims = await prisma.conveyanceClaim.findMany({
    where: { organizationId: ctx.organization.id, claimDate: { gte: start, lte: end }, status: { not: "CANCELLED" }, ...(mine ? { employeeId: ctx.employee!.id } : {}) },
    orderBy: [{ claimDate: "asc" }, { createdAt: "asc" }],
    include: { client: { select: { tradeName: true } }, employee: { select: { id: true, firstName: true, lastName: true, permanentEmployeeCode: true, temporaryEmployeeCode: true } } },
  });
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const period = `${start.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" })} to ${end.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit", timeZone: "UTC" })}`;
  const people = new Map<string, typeof claims>();
  for (const c of claims) people.set(c.employeeId, [...(people.get(c.employeeId) ?? []), c]);
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const sheets: XSheet[] = [...people.values()].map((rows) => {
    const e = rows[0].employee;
    const name = `${e.firstName} ${e.lastName ?? ""}`.trim();
    const approved = rows.filter((r) => r.status === "APPROVED").reduce((t, r) => t + Number(r.amount), 0);
    return {
      name,
      title: `${name} Conveyance Sheet`,
      subtitle: period,
      meta: [["Employee ID", e.permanentEmployeeCode ?? e.temporaryEmployeeCode], ["Firm", ctx.organization.tradeName]],
      kpis: [{ label: "Claims", value: rows.length, type: "int" }, { label: "KM run for office", value: rows.reduce((t, r) => t + (n(r.km) ?? 0), 0), type: "number" }, { label: "Approved (paid with salary)", value: approved, type: "inr" }],
      columns: [
        { header: "Date", type: "date" }, { header: "Name of Client", type: "text", width: 28 }, { header: "Total Run (km)", type: "number" },
        { header: "Mode of Conveyance", type: "text" }, { header: "Commuted Home to Office (km)", type: "number" }, { header: "KM run for Office", type: "number" },
        { header: "Rate per KM", type: "inr", total: "none" }, { header: "Amount", type: "inr" }, { header: "Remark if any", type: "text", width: 30 }, { header: "Status", type: "text" },
      ],
      rows: rows.map((r) => {
        const own = isOwnVehicle(r.mode);
        return [
          r.claimDate, r.client?.tradeName ?? r.place ?? "", own ? n(r.totalRunKm) ?? n(r.km) : null, r.mode ?? "",
          own ? n(r.commuteKm) ?? 0 : null, n(r.km), own ? n(r.ratePerKm) : null, Number(r.amount),
          [r.client && r.place ? r.place : null, r.purpose, r.remark].filter(Boolean).join(" · "), STATUS[r.status] ?? r.status,
        ];
      }),
      totals: true,
      notes: ["Own vehicle: KM run for office = total run − home to office km; amount = KM × rate per KM. Metro / bus / cab: the fare paid.", `Approved claims are paid with the ${label} salary as “Conveyance reimbursement”.`],
    };
  });
  if (!sheets.length) sheets.push({ name: "Conveyance", title: "Conveyance Sheet", subtitle: period, columns: [{ header: "Date", type: "date" }, { header: "Name of Client" }, { header: "Amount", type: "inr" }], rows: [], notes: ["No claim this month."] });
  return styledXlsxResponse(`Conveyance-Sheet-${month}.xlsx`, sheets);
}
