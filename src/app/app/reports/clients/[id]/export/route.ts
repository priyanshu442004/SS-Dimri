import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getContext } from "@/lib/session";
import { isoDateInTz, minutesToHhmm } from "@/lib/dates";
import { buildClientReport } from "@/lib/services/client-report";
import { audit } from "@/lib/services/audit";
import { toCsv } from "@/lib/csv";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Client-facing CSV of the client report (13A + 13B). Same authorization as
 * the report page. Internal remarks (due follow-up notes, our-side pending
 * descriptions, maker/checker status, timesheet details) are deliberately left out.
 */
export async function GET(req: Request, { params }: RouteContext<"/app/reports/clients/[id]/export">) {
  const ctx = await getContext();
  if (!ctx || ctx.access.state === "locked" || !can(ctx.role, "reports.client")) return new NextResponse("Not found", { status: 404 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const exists = await prisma.client.findFirst({ where: { id, organizationId: ctx.organization.id }, select: { id: true } });
  if (!exists) return new NextResponse("Not found", { status: 404 });

  const url = new URL(req.url);
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const fromQ = url.searchParams.get("from") ?? "";
  const toQ = url.searchParams.get("to") ?? "";
  const from = ISO.test(fromQ) ? fromQ : `${today.slice(0, 7)}-01`;
  const to = ISO.test(toQ) ? toQ : today;
  const r = await buildClientReport(ctx.organization.id, id, from, to);

  const rows: (string | number | null)[][] = [
    ["Client report", r.client.tradeName],
    ["Period", `${from} to ${to}`],
    ["GSTIN", r.client.gstins.join(" ")],
    [],
    ["Team member", "Designation", "Hours recorded", "Hours reviewed", "Tasks completed", "Open tasks"],
    ...r.team.map((t) => [t.name, t.designation, minutesToHhmm(t.minutes), minutesToHhmm(t.reviewedMinutes), t.tasksCompleted, t.openTasks]),
    [],
    ["Date", "Hours recorded"],
    ...r.hoursByDay.map((d) => [d.date, minutesToHhmm(d.minutes)]),
    [],
    ["Task", "Status", "Due", "Your observation"],
    ...r.tasks.map((t) => [t.title, t.status, t.dueAt?.slice(0, 10) ?? null, t.observation]),
    [],
    ["Pending from your side", "Requested on", "Due by", "Status", "Days pending"],
    ...r.pendingClientSide.map((p) => [p.what, p.requestedOn, p.dueBy, p.status, p.daysPending]),
    ["Items pending with our team", r.pendingOurSide.filter((p) => p.status !== "CLOSED").length],
    [],
    ["Due", "Service", "Reference", "Amount (INR)", "Due date", "Status"],
    ...r.dues.map((d) => [d.description, d.service, d.reference, d.amount, d.dueDate, d.status]),
    ["Outstanding total", null, null, r.duesOutstanding],
  ];
  await prisma.$transaction((tx) => audit(tx, ctx, "client_report.exported", "client", id, { from, to }));

  const filename = `client-report-${(r.client.code ?? r.client.tradeName).replace(/[^A-Za-z0-9-]+/g, "-")}-${from}-${to}.csv`;
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
