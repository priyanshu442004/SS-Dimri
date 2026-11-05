import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dateOnly, isoDateInTz, toIsoDate } from "@/lib/dates";
import { isLateReview, isLateSubmission, minutesBetween, slaOf } from "@/lib/domain/timesheet";
import { can } from "@/lib/permissions";
import { timesheetReviewers } from "@/lib/services/timesheet-report";
import { getContext } from "@/lib/session";
import { xlsxResponse } from "@/lib/xlsx";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const REVIEW: Record<string, string> = { SUBMITTED: "Pending", REVIEWED: "Checked - OK", RETURNED: "Checked - Needs Correction", DRAFT: "Draft" };
const SLA: Record<string, string> = { WITHIN: "Within window", DUE_SOON: "Due soon", OVERDUE: "Escalated - overdue", REVIEWED: "Reviewed" };

/** The Daily Log, in the same columns as the firm's Team Timesheet workbook. */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "timesheet.view_all")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const sp = new URL(request.url).searchParams;
  const tz = ctx.organization.timezone;
  const today = isoDateInTz(new Date(), tz);
  const iso = (k: string) => (ISO.test(sp.get(k) ?? "") ? sp.get(k)! : today);
  const from = iso("from");
  const to = iso("to");
  const employee = UUID.test(sp.get("employee") ?? "") ? sp.get("employee")! : undefined;
  const client = UUID.test(sp.get("client") ?? "") ? sp.get("client")! : undefined;

  const [entries, org] = await Promise.all([
    prisma.timesheetEntry.findMany({
      where: { organizationId: ctx.organization.id, workDate: { gte: dateOnly(from), lte: dateOnly(to) }, ...(employee ? { employeeId: employee } : {}), ...(client ? { clientId: client } : {}) },
      orderBy: [{ workDate: "asc" }, { employee: { firstName: "asc" } }, { serialNumber: "asc" }],
      take: 20_000,
      include: { employee: { select: { firstName: true, lastName: true } }, reviewedBy: { select: { name: true } } },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { timesheetPenaltyRupees: true } }),
  ]);
  const people = await timesheetReviewers(ctx.organization.id, entries);
  const now = new Date();
  const local = (d: Date | null) => (d ? `${isoDateInTz(d, tz)} ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d)}` : "");

  const header = [
    "Date", "Team Member", "Client Name", "Resource Type", "Nature of Work", "Assessment Year (AY)", "Work Location", "Bank Name (if applicable)", "Period From (if applicable)", "Period To (if applicable)",
    "Start Time", "End Time", "Hours Invested", "Task / Compliance Description", "Remarks / Status", "Submitted On (date+time)", "Reviewer (auto)", "Review Status", "Reviewer Remarks", "Reviewed On (date+time)",
    "SLA Status", "Escalate To (Level 2)", "Late Submission Penalty (Rs) - Junior", "Late Review Penalty (Rs) - Senior", "Reviewed By (actual)",
  ];
  const rows = entries.map((e) => {
    const p = people.get(e.id);
    const minutes = minutesBetween(e.startTime, e.endTime) ?? e.approxMinutes ?? 0;
    return [
      e.workDate,
      `${e.employee.firstName} ${e.employee.lastName ?? ""}`.trim(),
      e.clientNameText ?? "",
      e.resourceType ?? "",
      e.typeOfWork ?? "",
      e.assessmentYear ?? "",
      e.placeOfWork ?? "",
      e.bankName ?? "",
      e.periodFrom,
      e.periodTo,
      e.startTime ?? "",
      e.endTime ?? "",
      Math.round((minutes / 60) * 100) / 100,
      e.workDetails ?? "",
      e.workStatus ? e.workStatus.charAt(0) + e.workStatus.slice(1).toLowerCase().replaceAll("_", " ") : "",
      local(e.createdAt),
      p?.reviewer ?? "Not Mapped",
      REVIEW[e.status] ?? e.status,
      e.reviewNote ?? "",
      local(e.reviewedAt),
      SLA[slaOf({ submittedAt: e.createdAt, status: e.status }, now)],
      p?.escalateTo ?? "Not Mapped",
      isLateSubmission(isoDateInTz(e.createdAt, tz), toIsoDate(e.workDate)) ? org.timesheetPenaltyRupees : 0,
      isLateReview({ submittedAt: e.createdAt, reviewedAt: e.reviewedAt, status: e.status }, now) ? org.timesheetPenaltyRupees : 0,
      e.reviewedBy?.name ?? "",
    ];
  });
  return xlsxResponse(`timesheet-${from}-to-${to}.xlsx`, [
    { name: "Daily Log", title: `${ctx.organization.tradeName} · Team Daily Timesheet · ${from} to ${to}`, rows: [header, ...rows] },
  ]);
}
