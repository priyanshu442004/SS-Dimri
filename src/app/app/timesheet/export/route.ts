import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dateOnly, isoDateInTz, toIsoDate } from "@/lib/dates";
import { isLateReview, isLateSubmission, minutesBetween, slaOf } from "@/lib/domain/timesheet";
import { daysAllowed, daysOpen, STATUS_OF_WORK_LABEL, timelineFlagOf, TIMELINE_FLAGS, workStatusOf, WORK_STATUSES } from "@/lib/domain/tracker";
import { can } from "@/lib/permissions";
import { timesheetReviewers } from "@/lib/services/timesheet-report";
import { getContext } from "@/lib/session";
import { xlsxResponse } from "@/lib/xlsx";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const REVIEW: Record<string, string> = { SUBMITTED: "Pending", REVIEWED: "Checked - OK", RETURNED: "Checked - Needs Correction", DRAFT: "Draft" };
const SLA: Record<string, string> = { WITHIN: "Within window", DUE_SOON: "Due soon", OVERDUE: "Escalated - overdue", REVIEWED: "Reviewed" };
const person = (e: { firstName: string; lastName: string | null } | null) => (e ? `${e.firstName} ${e.lastName ?? ""}`.trim() : "");

/** Team Daily Work Log (in the workbook's columns, review columns after) or the Accounting Workflow Tracker. */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "timesheet.view_all")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const sp = new URL(request.url).searchParams;
  const tz = ctx.organization.timezone;
  const todayIso = isoDateInTz(new Date(), tz);
  const today = dateOnly(todayIso);
  if (sp.get("sheet") === "tracker") return trackerSheet(ctx.organization, sp, today);

  const iso = (k: string) => (ISO.test(sp.get(k) ?? "") ? sp.get(k)! : todayIso);
  const from = iso("from");
  const to = iso("to");
  const employee = UUID.test(sp.get("employee") ?? "") ? sp.get("employee")! : undefined;
  const client = UUID.test(sp.get("client") ?? "") ? sp.get("client")! : undefined;

  const [entries, org] = await Promise.all([
    prisma.timesheetEntry.findMany({
      where: { organizationId: ctx.organization.id, workDate: { gte: dateOnly(from), lte: dateOnly(to) }, ...(employee ? { employeeId: employee } : {}), ...(client ? { clientId: client } : {}) },
      orderBy: [{ workDate: "asc" }, { employee: { firstName: "asc" } }, { serialNumber: "asc" }],
      take: 20_000,
      include: { employee: { select: { firstName: true, lastName: true } }, reviewedBy: { select: { name: true } }, trackerLine: { select: { refNo: true } } },
    }),
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { timesheetPenaltyRupees: true } }),
  ]);
  const people = await timesheetReviewers(ctx.organization.id, entries);
  const now = new Date();
  const local = (d: Date | null) => (d ? `${isoDateInTz(d, tz)} ${new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(d)}` : "");

  const header = [
    "Sr. No.", "Team Member", "Date of Visit / Work", "Client Name", "Branch", "Tracker Ref No.", "Place of Work", "Type of Work", "Bank Name", "Period From", "Period To",
    "No. of Transactions / Entries", "Approx. Time Taken (Hrs)", "Elaboration / Details of Work Done", "Status of Work", "Issue Level", "Issue / Discomfort Details", "Issue Status",
    "Pending Item – Client", "Raised On – Client", "Due By – Client", "Status – Client", "Days Pending – Client",
    "Pending Item – Team", "Raised On – Team", "Due By – Team", "Status – Team", "Days Pending – Team",
    "Start Time", "End Time", "Resource Type", "Assessment Year (AY)", "Submitted On", "Reviewer (auto)", "Review Status", "Reviewer Remarks", "Reviewed On", "SLA Status", "Escalate To",
    "Late Submission Penalty (Rs)", "Late Review Penalty (Rs)", "Reviewed By (actual)",
  ];
  const rows = entries.map((e, i) => {
    const p = people.get(e.id);
    const minutes = minutesBetween(e.startTime, e.endTime) ?? e.approxMinutes ?? 0;
    return [
      i + 1, person(e.employee), e.workDate, e.clientNameText ?? "", e.branch ?? "", e.trackerLine?.refNo ?? "", e.placeOfWork ?? "", e.typeOfWork ?? "", e.bankName ?? "", e.periodFrom, e.periodTo,
      e.transactionCount ?? "", Math.round((minutes / 60) * 100) / 100, e.workDetails ?? "", e.workStatus ? STATUS_OF_WORK_LABEL[e.workStatus] : "", e.issueLevel ?? "", e.issueDetails ?? "", e.issueStatus ?? "",
      e.clientPendingItem ?? "", e.clientRaisedOn, e.clientDueBy, e.clientPendingStatus ?? "", e.clientPendingItem ? daysOpen(e.clientRaisedOn, e.clientPendingStatus, today) ?? "" : "",
      e.teamPendingItem ?? "", e.teamRaisedOn, e.teamDueBy, e.teamPendingStatus ?? "", e.teamPendingItem ? daysOpen(e.teamRaisedOn, e.teamPendingStatus, today) ?? "" : "",
      e.startTime ?? "", e.endTime ?? "", e.resourceType ?? "", e.assessmentYear ?? "", local(e.createdAt), p?.reviewer ?? "Not Mapped", REVIEW[e.status] ?? e.status, e.reviewNote ?? "",
      local(e.reviewedAt), SLA[slaOf({ submittedAt: e.createdAt, status: e.status }, now)], p?.escalateTo ?? "Not Mapped",
      isLateSubmission(isoDateInTz(e.createdAt, tz), toIsoDate(e.workDate)) ? org.timesheetPenaltyRupees : 0,
      isLateReview({ submittedAt: e.createdAt, reviewedAt: e.reviewedAt, status: e.status }, now) ? org.timesheetPenaltyRupees : 0,
      e.reviewedBy?.name ?? "",
    ];
  });
  return xlsxResponse(`team-daily-work-log-${from}-to-${to}.xlsx`, [
    { name: "Daily Log", title: `${ctx.organization.tradeName} · Team Daily Work Log · ${from} to ${to}`, rows: [header, ...rows] },
  ]);
}

async function trackerSheet(org: { id: string; tradeName: string }, sp: URLSearchParams, today: Date) {
  const client = sp.get("client") ?? "";
  const maker = UUID.test(sp.get("maker") ?? "") ? sp.get("maker")! : "";
  const status = sp.get("status") ?? "";
  const flag = sp.get("flag") ?? "";
  const lines = (await prisma.trackerLine.findMany({
    where: { organizationId: org.id, ...(client ? { clientName: client } : {}), ...(maker ? { OR: [{ makerEmployeeId: maker }, { checkerEmployeeId: maker }] } : {}) },
    orderBy: [{ clientName: "asc" }, { refNo: "asc" }],
    take: 20_000,
    include: { maker: { select: { firstName: true, lastName: true } }, checker: { select: { firstName: true, lastName: true } } },
  }))
    .map((l) => ({ ...l, work: workStatusOf(l), flagged: timelineFlagOf(l, today) }))
    .filter((l) => (!(WORK_STATUSES as readonly string[]).includes(status) || l.work === status) && (!(TIMELINE_FLAGS as readonly string[]).includes(flag) || l.flagged === flag));
  const header = [
    "Sr", "Tracker Ref No.", "Client Name", "Branch", "Type of Work", "Bank Name", "Period From", "Period To", "Status of Work", "Issue Level", "Issue / Discomfort Details", "Issue Status",
    "Pending Item – Client", "Raised On – Client", "Due By – Client", "Status – Client", "Pending Item – Team", "Raised On – Team", "Due By – Team", "Status – Team",
    "Get From (Client Contact)", "Date Received", "Days Pending (Due − Raised)", "Maker", "Checker", "Checker Status", "Work Status (auto)", "Work Start Date", "Priority",
    "Next Follow-up Date", "Timeline Flag (auto)", "Remarks (internal)",
  ];
  const rows = lines.map((l, i) => [
    i + 1, l.refNo, l.clientName, l.branch ?? "", l.typeOfWork, l.bankName ?? "", l.periodFrom, l.periodTo ?? "Onwards", STATUS_OF_WORK_LABEL[l.statusOfWork] ?? l.statusOfWork,
    l.issueLevel ?? "", l.issueDetails ?? "", l.issueStatus ?? "", l.clientPendingItem ?? "", l.clientRaisedOn, l.clientDueBy, l.clientPendingStatus ?? "",
    l.teamPendingItem ?? "", l.teamRaisedOn, l.teamDueBy, l.teamPendingStatus ?? "", l.getFrom ?? "", l.dateReceived, daysAllowed(l.clientRaisedOn, l.clientDueBy) ?? "",
    person(l.maker), person(l.checker), l.checkerStatus ?? "", l.work, l.workStartDate, l.priority ?? "", l.nextFollowUpOn, l.flagged, l.remarks ?? "",
  ]);
  return xlsxResponse(`accounting-workflow-tracker-${toIsoDate(today)}.xlsx`, [
    { name: "Tracker", title: `${org.tradeName} · Accounting Workflow Tracker`, rows: [header, ...rows] },
  ]);
}
