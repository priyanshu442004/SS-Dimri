import { NextResponse } from "next/server";
import { formatDate, formatTime, minutesToHhmm } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { getContext } from "@/lib/session";
import { getPolicy, parseTeamFilters, teamAttendanceRows, todayIso } from "@/lib/services/attendance";
import { lunchAllowanceMinutes } from "@/lib/domain/attendance-extras";
import { prisma } from "@/lib/db";
import { dateOnly, toIsoDate } from "@/lib/dates";
import { xlsxResponse } from "@/lib/xlsx";

const STATE_LABEL: Record<string, string> = { PRESENT: "Present", ABSENT: "Absent", HALF_DAY: "Half day", LEAVE: "On leave", NOT_MARKED: "Not marked" };

/** The team attendance list as an Excel file, with the same filters as the screen. */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "attendance.view_all")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const f = parseTeamFilters(sp, todayIso(ctx));
  const tz = ctx.organization.timezone;
  const { row: policyRow, params: policy } = await getPolicy(ctx.organization.id);
  const { rows } = await teamAttendanceRows(ctx, policy, f, { markOutReminderAt: policyRow.markOutReminderAt, lunchAllowance: lunchAllowanceMinutes(policyRow.lunchStart, policyRow.lunchEnd) });
  const visits = await prisma.clientVisit.findMany({
    where: { organizationId: ctx.organization.id, visitDate: { gte: dateOnly(f.from), lte: dateOnly(f.to) } },
    orderBy: { startedAt: "asc" },
    select: { employeeId: true, visitDate: true, placeName: true, startedAt: true, endedAt: true },
  });
  const visitText = (key: string) =>
    visits
      .filter((v) => `${v.employeeId}|${toIsoDate(v.visitDate)}` === key)
      .map((v) => `${v.placeName} ${formatTime(v.startedAt, tz)}-${v.endedAt ? formatTime(v.endedAt, tz) : ""}`)
      .join("; ");
  const REVIEW: Record<string, string> = { PENDING: "To check", ACCEPTED: "Accepted", REJECTED: "Marked absent" };

  // New columns go at the end so the existing column order stays the same.
  const header = ["Date", "Employee ID", "Team member", "Designation", "Department", "Status", "Late", "Time in", "Time out", "Hours worked", "Latitude (in)", "Longitude (in)", "Notes",
    "Lunch out", "Lunch in", "Lunch (minutes)", "No time out", "Marked by (colleague)", "Photo check", "Client visits"];
  const body = rows.map(({ key, date, employee: e, record: r, approvedLeave, state, isLate, workedMinutes, lunchMinutes, missingTimeOut }) => [
    date,
    e.permanentEmployeeCode ?? e.temporaryEmployeeCode,
    `${e.firstName} ${e.lastName ?? ""}`.trim(),
    e.designation?.name ?? "",
    e.department?.name ?? "",
    approvedLeave ? "Approved leave" : STATE_LABEL[state],
    isLate ? "Yes" : "",
    r?.timeIn ? formatTime(r.timeIn, tz) : "",
    r?.timeOut ? formatTime(r.timeOut, tz) : "",
    workedMinutes != null ? minutesToHhmm(workedMinutes) : "",
    r?.timeInLatitude ? Number(r.timeInLatitude) : null,
    r?.timeInLongitude ? Number(r.timeInLongitude) : null,
    r?.lateReason ?? r?.remarks ?? "",
    r?.lunchOutAt ? formatTime(r.lunchOutAt, tz) : "",
    r?.lunchInAt ? formatTime(r.lunchInAt, tz) : "",
    r?.lunchInAt && lunchMinutes != null ? lunchMinutes : null,
    missingTimeOut ? "Yes" : "",
    [r?.timeInProxyBy?.name, r?.timeOutProxyBy?.name].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", "),
    r?.photoReview ? REVIEW[r.photoReview] : "",
    visitText(key),
  ]);
  const period = f.from === f.to ? formatDate(new Date(`${f.from}T00:00:00Z`)) : `${formatDate(new Date(`${f.from}T00:00:00Z`))} to ${formatDate(new Date(`${f.to}T00:00:00Z`))}`;
  return xlsxResponse(`attendance-${f.from}${f.from === f.to ? "" : `-to-${f.to}`}.xlsx`, [
    { name: "Attendance", title: `${ctx.organization.tradeName} · Attendance · ${period}`, rows: [header, ...body] },
  ]);
}
