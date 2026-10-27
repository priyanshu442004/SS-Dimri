import { NO_EMPLOYEE } from "@/lib/ids";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { dateOnly, formatDate, formatTime, hhmmToMinutes, minutesOfDayInTz, minutesToHhmm, monthRange } from "@/lib/dates";
import { evaluateDay, summarizeMonth } from "@/lib/domain/attendance-policy";
import { getPolicy, todayIso } from "@/lib/services/attendance";
import { employeeOptions } from "@/lib/services/lookups";
import { Card, EmptyState, humanize, Notice, PageHeader, Stat, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { correctAttendanceAction, decideLeaveAction, markAction, requestLeaveAction } from "./actions";
import { CorrectionForm, LeaveDecisionForm, LeaveRequestForm } from "./forms";
import { MarkCard } from "./mark-card";
import { LiveClock } from "@/components/live-clock";
import { CalendarDays } from "lucide-react";

export default async function AttendancePage({ searchParams }: PageProps<"/app/attendance">) {
  const ctx = await requireCapability("attendance.mark_own");
  const sp = await searchParams;
  const viewAll = can(ctx.role, "attendance.view_all");
  const tab = sp.tab === "team" && viewAll ? "team" : sp.tab === "leave" ? "leave" : "mine";
  const today = todayIso(ctx);
  const tz = ctx.organization.timezone;
  const { row: policyRow, params: policy } = await getPolicy(ctx.organization.id);

  return (
    <>
      <PageHeader icon={<CalendarDays />} title="Attendance" description="Mark your own attendance; team-wide views are available to administrators, managers and seniors." />
      <TabNav
        current={tab}
        tabs={[
          { key: "mine", label: "My attendance", href: "/app/attendance" },
          ...(viewAll ? [{ key: "team", label: "Team attendance", href: "/app/attendance?tab=team" }] : []),
          { key: "leave", label: "Leave", href: "/app/attendance?tab=leave" },
        ]}
      />
      {tab === "mine" && <Mine />}
      {tab === "team" && <Team />}
      {tab === "leave" && <Leave />}
    </>
  );

  async function Mine() {
    if (!ctx.employee) return <EmptyState kind="people" title="No staff record">Your login is not linked to an employee, so there is no attendance to mark.</EmptyState>;
    const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
    const { start, end } = monthRange(`${month}-01`);
    const [todayRec, records, emp] = await Promise.all([
      prisma.attendanceRecord.findFirst({ where: { employeeId: ctx.employee.id, attendanceDate: dateOnly(today) }, orderBy: { createdAt: "desc" } }),
      prisma.attendanceRecord.findMany({ where: { employeeId: ctx.employee.id, attendanceDate: { gte: start, lte: end } }, orderBy: { attendanceDate: "asc" } }),
      prisma.employee.findUniqueOrThrow({ where: { id: ctx.employee.id }, select: { attendanceProfile: true } }),
    ]);
    const nowLate = minutesOfDayInTz(new Date(), tz) > hhmmToMinutes(policyRow.reportingGraceUntil);
    const summary = summarizeMonth(
      records.map((r) => ({ dayOfMonth: r.attendanceDate.getUTCDate(), status: r.status, timeIn: r.timeIn, timeOut: r.timeOut, lateReason: r.lateReason })),
      emp.attendanceProfile,
      policy,
      tz,
    );
    return (
      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <Card title={`Today · ${formatDate(dateOnly(today))}`}>
            <div className="mb-4 border-b border-line pb-4"><LiveClock timeZone={tz} /></div>
            {!todayRec?.timeIn ? (
              <MarkCard action={markAction.bind(null, "in")} kind="in" showLateReason={nowLate} />
            ) : !todayRec.timeOut ? (
              <>
                <p className="mb-3 text-sm">Marked in at <strong>{formatTime(todayRec.timeIn, tz)}</strong>.</p>
                <MarkCard action={markAction.bind(null, "out")} kind="out" showLateReason={false} />
              </>
            ) : (
              <p className="text-sm">
                In {formatTime(todayRec.timeIn, tz)} · Out {formatTime(todayRec.timeOut, tz)} ·{" "}
                <strong>{minutesToHhmm((todayRec.timeOut.getTime() - todayRec.timeIn.getTime()) / 60000)}</strong>
              </p>
            )}
            <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
              Office {policyRow.officeStart}–{policyRow.officeEnd} · grace till {policyRow.reportingGraceUntil} · lunch {policyRow.lunchStart}–{policyRow.lunchEnd}
            </p>
          </Card>
          <div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Present" value={summary.presentDays + summary.halfDays * 0.5} />
              <Stat label="Leave" value={summary.leaveDays} />
              <Stat label="Late arrivals" value={summary.lateArrivals} hint={summary.lateArrivalsExcusedByGrace ? `${summary.lateArrivalsExcusedByGrace} excused` : undefined} />
              <Stat label="Overtime" value={minutesToHhmm(summary.overtimeMinutes)} hint={`≈ ${summary.overtimeDays} day(s)`} />
            </div>
            {!policyRow.policyConfirmed && (
              <p className="mt-2 text-xs text-muted">Indicative figures under the Leave & Timing Policy ({humanize(summary.basis)} basis). Not used for salary until the firm confirms the policy.</p>
            )}
          </div>
        </div>
        <Card title={`My attendance — ${new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}`} padded={false}>
          {records.length === 0 ? (
            <p className="p-4 text-sm text-muted">No attendance recorded this month.</p>
          ) : (
            <Table minWidth={620}>
              <thead><tr><Th>Date</Th><Th>Status</Th><Th>In</Th><Th>Out</Th><Th>Hours</Th><Th>Flags</Th></tr></thead>
              <tbody>
                {records.map((r) => {
                  const ev = evaluateDay({ dayOfMonth: r.attendanceDate.getUTCDate(), status: r.status, timeIn: r.timeIn, timeOut: r.timeOut }, emp.attendanceProfile, policy, tz);
                  return (
                    <tr key={r.id}>
                      <Td>{formatDate(r.attendanceDate)}</Td>
                      <Td><StatusBadge status={r.status} /></Td>
                      <Td>{formatTime(r.timeIn, tz)}</Td>
                      <Td>{formatTime(r.timeOut, tz)}</Td>
                      <Td>{ev.workedMinutes !== null ? minutesToHhmm(ev.workedMinutes) : "—"}</Td>
                      <Td className="text-xs">
                        {ev.isLate && <StatusBadge status="PENDING" label={r.lateReason ? "Late (reason given)" : "Late"} />}{" "}
                        {ev.leftBeforeHalfDayCutoff && <StatusBadge status="HALF_DAY" label="Left before 5:30" />}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    );
  }

  async function Team() {
    const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
    const [employees, records, leaves] = await Promise.all([
      prisma.employee.findMany({
        where: { organizationId: ctx.organization.id, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } },
        orderBy: { firstName: "asc" },
        select: { id: true, firstName: true, lastName: true, attendanceProfile: true, designation: { select: { name: true } } },
      }),
      prisma.attendanceRecord.findMany({ where: { organizationId: ctx.organization.id, attendanceDate: dateOnly(date) } }),
      prisma.leaveRequest.findMany({ where: { organizationId: ctx.organization.id, status: "APPROVED", fromDate: { lte: dateOnly(date) }, toDate: { gte: dateOnly(date) } }, select: { employeeId: true } }),
    ]);
    const recBy = new Map(records.map((r) => [r.employeeId, r]));
    const onLeave = new Set(leaves.map((l) => l.employeeId));
    const present = records.filter((r) => r.status === "PRESENT" || r.status === "HALF_DAY").length;
    const options = can(ctx.role, "attendance.correct") ? await employeeOptions(ctx.organization.id) : [];
    return (
      <div className="space-y-6">
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="team" />
          <label className="text-sm">
            <span className="mb-1 block font-medium">Date</span>
            <input type="date" name="date" defaultValue={date} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
          </label>
          <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show</button>
        </form>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Team" value={employees.length} />
          <Stat label="Present" value={present} />
          <Stat label="On leave" value={onLeave.size} />
          <Stat label="Not marked" value={employees.filter((e) => !recBy.has(e.id) && !onLeave.has(e.id)).length} />
        </div>
        <Table minWidth={900}>
          <thead><tr><Th>Team member</Th><Th>Status</Th><Th>In</Th><Th>Out</Th><Th>Hours</Th><Th>Location</Th><Th>Photo</Th><Th>Notes</Th></tr></thead>
          <tbody>
            {employees.map((e) => {
              const r = recBy.get(e.id);
              const ev = r ? evaluateDay({ dayOfMonth: r.attendanceDate.getUTCDate(), status: r.status, timeIn: r.timeIn, timeOut: r.timeOut }, e.attendanceProfile, policy, tz) : null;
              const map = (lat: unknown, lng: unknown) => (lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null);
              const inMap = r ? map(r.timeInLatitude, r.timeInLongitude) : null;
              return (
                <tr key={e.id}>
                  <Td><span className="font-medium">{e.firstName} {e.lastName}</span><div className="text-xs text-muted">{e.designation?.name}</div></Td>
                  <Td>{r ? <StatusBadge status={r.status} /> : onLeave.has(e.id) ? <StatusBadge status="LEAVE" label="Approved leave" /> : <span className="text-xs text-muted">Not marked</span>}</Td>
                  <Td>{formatTime(r?.timeIn, tz)}{ev?.isLate && <div><StatusBadge status="PENDING" label="Late" /></div>}</Td>
                  <Td>{formatTime(r?.timeOut, tz)}</Td>
                  <Td>{ev?.workedMinutes != null ? minutesToHhmm(ev.workedMinutes) : "—"}</Td>
                  <Td>{inMap ? <a href={inMap} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline">Map</a> : "—"}</Td>
                  <Td>{r?.timeInPhotoFileId ? <a href={`/api/files/${r.timeInPhotoFileId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline">View</a> : "—"}</Td>
                  <Td className="text-xs text-muted">{r?.lateReason ?? r?.remarks ?? ""}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {can(ctx.role, "attendance.correct") && (
          <Card title="Record or correct attendance" className="max-w-3xl">
            <p className="mb-3 text-sm text-muted">For absences, missed entries or corrections. The original values, your name and the reason are kept.</p>
            <CorrectionForm action={correctAttendanceAction} employees={options} date={date} />
          </Card>
        )}
      </div>
    );
  }

  async function Leave() {
    const decide = can(ctx.role, "leave.decide");
    const [mine, pending] = await Promise.all([
      ctx.employee
        ? prisma.leaveRequest.findMany({ where: { employeeId: ctx.employee.id }, orderBy: { fromDate: "desc" }, take: 20 })
        : Promise.resolve([]),
      decide
        ? prisma.leaveRequest.findMany({
            where: {
              organizationId: ctx.organization.id,
              status: "PENDING",
              employeeId: { not: ctx.employee?.id ?? NO_EMPLOYEE },
              // Seniors and managers decide for people who report to them; admins for everyone.
              ...(can(ctx.role, "org.manage") ? {} : { employee: { reportsTo: { some: { managerId: ctx.employee?.id ?? NO_EMPLOYEE } } } }),
            },
            orderBy: { fromDate: "asc" },
            include: { employee: { select: { firstName: true, lastName: true } } },
          })
        : Promise.resolve([]),
    ]);
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {ctx.employee && (
            <Card title="Request leave">
              <div className="mb-3"><Notice tone="info">Policy: one leave a month with prior intimation; planned leave needs senior approval {policyRow.plannedLeaveNoticeDays} days in advance.</Notice></div>
              <LeaveRequestForm action={requestLeaveAction} today={today} />
            </Card>
          )}
          <Card title="My leave requests">
            {mine.length === 0 ? <p className="text-sm text-muted">No leave requests.</p> : (
              <ul className="divide-y divide-line text-sm">
                {mine.map((l) => (
                  <li key={l.id} className="flex items-center justify-between py-2">
                    <span>{formatDate(l.fromDate)}{l.toDate.getTime() !== l.fromDate.getTime() && ` – ${formatDate(l.toDate)}`} · {humanize(l.leaveType)}{l.isHalfDay && " (half day)"}</span>
                    <StatusBadge status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        {decide && (
          <Card title={`Requests to decide (${pending.length})`}>
            {pending.length === 0 ? <p className="text-sm text-muted">Nothing waiting.</p> : (
              <ul className="space-y-4">
                {pending.map((l) => (
                  <li key={l.id} className="rounded-md border border-line p-3 text-sm">
                    <p className="font-medium">{l.employee.firstName} {l.employee.lastName}</p>
                    <p className="text-muted">
                      {formatDate(l.fromDate)} – {formatDate(l.toDate)} · {humanize(l.leaveType)}{l.isHalfDay && " · half day"}{!l.withIntimation && " · without prior intimation"}
                    </p>
                    {l.reason && <p className="mt-1">{l.reason}</p>}
                    <div className="mt-2"><LeaveDecisionForm action={decideLeaveAction.bind(null, l.id)} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    );
  }
}
