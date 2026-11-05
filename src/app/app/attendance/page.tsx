import { NO_EMPLOYEE } from "@/lib/ids";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { dateOnly, formatDate, formatTime, hhmmToMinutes, minutesOfDayInTz, minutesToHhmm, monthRange } from "@/lib/dates";
import { DeleteButton } from "@/components/delete-dialog";
import { canDelete } from "@/lib/services/deletions";
import { DownloadButton } from "@/components/ui";
import { CalendarCheck2, CalendarOff, CircleSlash, Clock4, UserCheck, Users } from "lucide-react";
import { evaluateDay, summarizeMonth } from "@/lib/domain/attendance-policy";
import { getPolicy, parseTeamFilters, teamAttendanceRows, todayIso, type AttendanceFilter } from "@/lib/services/attendance";
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
  const viewAll = can(ctx, "attendance.view_all");
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
    if (!ctx.employee) {
      // The owner and administrators get their attendance record at their first mark-in.
      if (!can(ctx, "org.manage")) return <EmptyState kind="people" title="No staff record">Your login is not linked to an employee, so there is no attendance to mark.</EmptyState>;
      return (
        <Card title={`Today · ${formatDate(dateOnly(today))}`} className="max-w-xl">
          <div className="mb-4 border-b border-line pb-4"><LiveClock timeZone={tz} /></div>
          <MarkCard action={markAction.bind(null, "in")} kind="in" showLateReason={minutesOfDayInTz(new Date(), tz) > hhmmToMinutes(policyRow.reportingGraceUntil)} />
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Marking in here works exactly as it does for your team, so you can try it yourself. Your name then also appears in Team attendance.</p>
        </Card>
      );
    }
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
              <p className="mt-2 text-xs text-muted">Indicative figures under the Leave & Timing Policy ({humanize(summary.basis)} basis). Payroll stays provisional until the firm confirms the policy.</p>
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
    const f = parseTeamFilters(sp, today);
    const [{ rows, counts, employeeCount }, departments] = await Promise.all([
      teamAttendanceRows(ctx, policy, f),
      prisma.department.findMany({ where: { organizationId: ctx.organization.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    const mayCorrect = can(ctx, "attendance.correct");
    const mayDelete = canDelete(ctx, "attendance");
    const options = mayCorrect ? await employeeOptions(ctx.organization.id) : [];
    const singleDay = f.from === f.to;

    const query = (extra: Record<string, string>) => {
      const p = new URLSearchParams({ tab: "team", from: f.from, to: f.to, ...(f.q && { q: f.q }), ...(f.departmentId && { department: f.departmentId }), ...(f.status && { status: f.status }), ...extra });
      for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
      return p.toString();
    };
    const tile = (status: AttendanceFilter | "") => `/app/attendance?${query({ status })}#attendance-list`;
    const exportHref = `/app/attendance/export?${query({ tab: "" })}`;
    const LIST_TITLE: Record<string, string> = { PRESENT: "Present", ABSENT: "Absent", HALF_DAY: "Half day", LEAVE: "On leave", NOT_MARKED: "Not marked", LATE: "Late arrivals", "": "All team members" };
    const map = (lat: unknown, lng: unknown) => (lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null);

    return (
      <div className="space-y-6">
        <form className="flex flex-wrap items-end gap-2" aria-label="Filter attendance">
          <input type="hidden" name="tab" value="team" />
          <label className="text-sm">
            <span className="mb-1 block font-medium">From</span>
            <input type="date" name="from" defaultValue={f.from} max={today} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">To</span>
            <input type="date" name="to" defaultValue={f.to} max={today} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
          </label>
          <label className="min-w-44 flex-1 text-sm sm:max-w-xs">
            <span className="mb-1 block font-medium">Employee name</span>
            <input type="search" name="q" defaultValue={f.q} placeholder="Search by name or ID" className="h-10 w-full rounded-md border border-line bg-surface px-3 text-sm" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Status</span>
            <select name="status" defaultValue={f.status} className="h-10 rounded-md border border-line bg-surface px-2 text-sm">
              <option value="">All statuses</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
              <option value="HALF_DAY">Half day</option>
              <option value="LEAVE">On leave</option>
              <option value="NOT_MARKED">Not marked</option>
              <option value="LATE">Late arrivals</option>
            </select>
          </label>
          {departments.length > 0 && (
            <label className="text-sm">
              <span className="mb-1 block font-medium">Department</span>
              <select name="department" defaultValue={f.departmentId} className="h-10 max-w-44 rounded-md border border-line bg-surface px-2 text-sm">
                <option value="">All departments</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
          <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Apply</button>
          <a href="/app/attendance?tab=team" className="flex h-10 items-center px-2 text-sm text-muted hover:text-ink">Clear</a>
          <span className="ml-auto"><DownloadButton href={exportHref}>Export to Excel</DownloadButton></span>
        </form>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Stat label="Team" value={singleDay ? employeeCount : counts.total} hint={singleDay ? "Click to see everyone" : "Person-days in this period"} href={tile("")} active={!f.status} icon={<Users />} />
          <Stat label="Present" value={counts.PRESENT} hint="Click to see who" href={tile("PRESENT")} active={f.status === "PRESENT"} icon={<UserCheck />} tone="ok" />
          <Stat label="Not marked" value={counts.NOT_MARKED} hint="Click to see who" href={tile("NOT_MARKED")} active={f.status === "NOT_MARKED"} icon={<CircleSlash />} tone={counts.NOT_MARKED ? "warn" : "neutral"} />
          <Stat label="On leave" value={counts.LEAVE} href={tile("LEAVE")} active={f.status === "LEAVE"} icon={<CalendarOff />} tone="info" />
          <Stat label="Absent" value={counts.ABSENT} href={tile("ABSENT")} active={f.status === "ABSENT"} icon={<CalendarCheck2 />} tone={counts.ABSENT ? "danger" : "neutral"} />
          <Stat label="Late arrivals" value={counts.LATE} href={tile("LATE")} active={f.status === "LATE"} icon={<Clock4 />} tone={counts.LATE ? "warn" : "neutral"} />
        </div>

        <section id="attendance-list" className="scroll-mt-24 space-y-3">
          <h2 className="text-sm font-semibold text-ink">
            {LIST_TITLE[f.status]} ({rows.length})
            <span className="ml-2 font-normal text-muted">{singleDay ? formatDate(dateOnly(f.from)) : `${formatDate(dateOnly(f.from))} – ${formatDate(dateOnly(f.to))}`}</span>
          </h2>
          {rows.length === 0 ? (
            <EmptyState kind="calendar" title="Nobody here">No attendance matches these filters.</EmptyState>
          ) : (
            <Table minWidth={980}>
              <thead><tr>{!singleDay && <Th>Date</Th>}<Th>Team member</Th><Th>Department</Th><Th>Status</Th><Th>In</Th><Th>Out</Th><Th>Hours</Th><Th>Location</Th><Th>Photo</Th><Th>Notes</Th>{mayDelete && <Th />}</tr></thead>
              <tbody>
                {rows.map(({ key, date, employee: e, record: r, approvedLeave, isLate, workedMinutes }) => {
                  const inMap = r ? map(r.timeInLatitude, r.timeInLongitude) : null;
                  return (
                    <tr key={key}>
                      {!singleDay && <Td className="whitespace-nowrap text-xs">{formatDate(date)}</Td>}
                      <Td><span className="font-medium">{e.firstName} {e.lastName}</span><div className="text-xs text-muted">{e.designation?.name}</div></Td>
                      <Td className="text-xs">{e.department?.name ?? "—"}</Td>
                      <Td>{r ? <StatusBadge status={r.status} /> : approvedLeave ? <StatusBadge status="LEAVE" label="Approved leave" /> : <span className="text-xs text-muted">Not marked</span>}</Td>
                      <Td>{formatTime(r?.timeIn, tz)}{isLate && <div><StatusBadge status="PENDING" label="Late" /></div>}</Td>
                      <Td>{formatTime(r?.timeOut, tz)}</Td>
                      <Td>{workedMinutes != null ? minutesToHhmm(workedMinutes) : "—"}</Td>
                      <Td>{inMap ? <a href={inMap} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline">Map</a> : "—"}</Td>
                      <Td>{r?.timeInPhotoFileId ? <a href={`/api/files/${r.timeInPhotoFileId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline">View</a> : "—"}</Td>
                      <Td className="text-xs text-muted">{r?.lateReason ?? r?.remarks ?? ""}</Td>
                      {mayDelete && <Td>{r && <DeleteButton entity="attendance" id={r.id} variant="ghost" />}</Td>}
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </section>
        {mayCorrect && (
          <Card title="Record or correct attendance" className="max-w-3xl">
            <p className="mb-3 text-sm text-muted">For absences, missed entries or corrections. The original values, your name and the reason are kept.</p>
            <CorrectionForm action={correctAttendanceAction} employees={options} date={f.to} />
          </Card>
        )}
      </div>
    );
  }

  async function Leave() {
    const decide = can(ctx, "leave.decide");
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
              ...(can(ctx, "org.manage") ? {} : { employee: { reportsTo: { some: { managerId: ctx.employee?.id ?? NO_EMPLOYEE } } } }),
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
                    <span className="flex items-center gap-1"><StatusBadge status={l.status} />{canDelete(ctx, "leave") && <DeleteButton entity="leave" id={l.id} variant="ghost" />}</span>
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
                    {canDelete(ctx, "leave") && <div className="mt-2"><DeleteButton entity="leave" id={l.id} variant="ghost" label="Delete request" /></div>}
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
