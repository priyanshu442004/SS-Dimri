import { NO_EMPLOYEE } from "@/lib/ids";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { addDays, dateOnly, dateTimeLocalInTz, formatDate, formatTime, hhmmToMinutes, minutesOfDayInTz, minutesToHhmm, monthRange, toIsoDate } from "@/lib/dates";
import { DeleteButton } from "@/components/delete-dialog";
import { canDelete } from "@/lib/services/deletions";
import { DownloadButton } from "@/components/ui";
import { CalendarCheck2, CalendarOff, Camera, CircleSlash, Clock4, LogOut, MapPin, UserCheck, Users, UtensilsCrossed } from "lucide-react";
import { evaluateDay, summarizeMonth } from "@/lib/domain/attendance-policy";
import { getPolicy, parseTeamFilters, teamAttendanceRows, todayIso, type AttendanceFilter } from "@/lib/services/attendance";
import { employeeOptions } from "@/lib/services/lookups";
import { Badge, Card, EmptyState, humanize, Notice, PageHeader, Stat, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import Link from "next/link";
import { correctAttendanceAction, decideLeaveAction, endVisitAction, lunchAction, markAction, requestLeaveAction, startVisitAction } from "./actions";
import { lunchAllowanceMinutes, lunchMinutes, lunchOverMinutes, markOutReminderDue } from "@/lib/domain/attendance-extras";
import { pendingPhotoChecks } from "@/lib/services/attendance-proxy";
import { clientPendency, myVisitsToday, visitClientOptions } from "@/lib/services/client-visits";
import { LunchButton, VisitEndForm, VisitStartForm } from "./extra-forms";
import { OthersTab, PhotosTab, ReviewBadge, Thumb, VisitsTab, WorkersTab } from "./extra-tabs";
import { CorrectionForm, LeaveDecisionForm, LeaveRequestForm } from "./forms";
import { MarkCard } from "./mark-card";
import { LiveClock } from "@/components/live-clock";
import { CalendarDays } from "lucide-react";

export default async function AttendancePage({ searchParams }: PageProps<"/app/attendance">) {
  const ctx = await requireCapability("attendance.mark_own");
  const sp = await searchParams;
  const viewAll = can(ctx, "attendance.view_all");
  const markOthers = can(ctx, "attendance.mark_others");
  const manageWorkers = can(ctx, "attendance.workers");
  const photoChecks = await pendingPhotoChecks(ctx);
  const seePhotos = viewAll || can(ctx, "attendance.review_photos") || photoChecks > 0;
  const allowed: Record<string, boolean> = { team: viewAll, leave: true, others: markOthers, photos: seePhotos, visits: viewAll, workers: manageWorkers };
  const tab = typeof sp.tab === "string" && allowed[sp.tab] ? sp.tab : "mine";
  const today = todayIso(ctx);
  const tz = ctx.organization.timezone;
  const { row: policyRow, params: policy } = await getPolicy(ctx.organization.id);
  const lunchAllowance = lunchAllowanceMinutes(policyRow.lunchStart, policyRow.lunchEnd);

  return (
    <>
      <PageHeader icon={<CalendarDays />} title="Attendance" description="Mark your own attendance; team-wide views are available to administrators, managers and seniors." />
      <TabNav
        current={tab}
        tabs={[
          { key: "mine", label: "My attendance", href: "/app/attendance" },
          ...(markOthers ? [{ key: "others", label: "Mark for others", href: "/app/attendance?tab=others" }] : []),
          ...(viewAll ? [{ key: "team", label: "Team attendance", href: "/app/attendance?tab=team" }] : []),
          ...(seePhotos ? [{ key: "photos", label: "Photo check", href: "/app/attendance?tab=photos", ...(photoChecks ? { count: photoChecks } : {}) }] : []),
          ...(viewAll ? [{ key: "visits", label: "Client visits", href: "/app/attendance?tab=visits" }] : []),
          ...(manageWorkers ? [{ key: "workers", label: "Daily workers", href: "/app/attendance?tab=workers" }] : []),
          { key: "leave", label: "Leave", href: "/app/attendance?tab=leave" },
        ]}
      />
      {tab === "mine" && <Mine />}
      {tab === "others" && <OthersTab ctx={ctx} />}
      {tab === "team" && <Team />}
      {tab === "photos" && <PhotosTab ctx={ctx} sp={sp} today={today} />}
      {tab === "visits" && <VisitsTab ctx={ctx} sp={sp} today={today} />}
      {tab === "workers" && <WorkersTab ctx={ctx} sp={sp} today={today} />}
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
    const [todayRec, records, emp, visits, missed] = await Promise.all([
      prisma.attendanceRecord.findFirst({ where: { employeeId: ctx.employee.id, attendanceDate: dateOnly(today) }, orderBy: { createdAt: "desc" }, include: { timeInProxyBy: { select: { name: true } } } }),
      prisma.attendanceRecord.findMany({ where: { employeeId: ctx.employee.id, attendanceDate: { gte: start, lte: end } }, orderBy: { attendanceDate: "asc" } }),
      prisma.employee.findUniqueOrThrow({ where: { id: ctx.employee.id }, select: { attendanceProfile: true } }),
      myVisitsToday(ctx),
      // Earlier days (last month) with a time in and no time out: their hours cannot be counted until fixed.
      prisma.attendanceRecord.findMany({
        where: { employeeId: ctx.employee.id, attendanceDate: { lt: dateOnly(today), gte: addDays(dateOnly(today), -31) }, timeIn: { not: null }, timeOut: null, status: { in: ["PRESENT", "HALF_DAY"] } },
        orderBy: { attendanceDate: "asc" },
        select: { attendanceDate: true },
      }),
    ]);
    const now = new Date();
    const reminderDue = markOutReminderDue(now, policyRow.markOutReminderAt, tz);
    const markedInOpen = !!todayRec?.timeIn && !todayRec.timeOut;
    const currentVisit = visits.find((v) => !v.endedAt) ?? null;
    const [clients, pendency] = markedInOpen
      ? await Promise.all([visitClientOptions(ctx), currentVisit?.clientId ? clientPendency(ctx.organization.id, currentVisit.clientId, ctx.employee.id) : Promise.resolve(null)])
      : [[], null];
    const lunchTaken = todayRec ? lunchMinutes(todayRec.lunchOutAt, todayRec.lunchInAt, now) : null;
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
                {todayRec.timeInProxyBy && <p className="mb-3 text-xs text-muted">Recorded for you by {todayRec.timeInProxyBy.name} with your photo.</p>}
                {reminderDue && (
                  <div className="mb-3"><Notice tone="warn">It is past {policyRow.markOutReminderAt}. Remember to mark out before you leave, so your hours and salary are worked out correctly.</Notice></div>
                )}
                <div className="mb-4 rounded-lg border border-line bg-paper p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><UtensilsCrossed className="size-4 text-muted" aria-hidden /> Lunch</p>
                  {!todayRec.lunchOutAt ? (
                    <><p className="mb-2 text-xs text-muted">Allowed: {minutesToHhmm(lunchAllowance)} ({policyRow.lunchStart}–{policyRow.lunchEnd}).</p><LunchButton action={lunchAction.bind(null, "out")} kind="out" /></>
                  ) : !todayRec.lunchInAt ? (
                    <><p className="mb-2 text-sm">On lunch since <strong>{formatTime(todayRec.lunchOutAt, tz)}</strong> ({minutesToHhmm(lunchTaken ?? 0)} so far).</p><LunchButton action={lunchAction.bind(null, "in")} kind="in" /></>
                  ) : (
                    <p className="text-sm">
                      Lunch {formatTime(todayRec.lunchOutAt, tz)} – {formatTime(todayRec.lunchInAt, tz)} · <strong>{minutesToHhmm(lunchTaken ?? 0)}</strong>
                      {lunchOverMinutes(lunchTaken, lunchAllowance) > 0 && <> · <Badge tone="warn">{minutesToHhmm(lunchOverMinutes(lunchTaken, lunchAllowance))} over</Badge></>}
                    </p>
                  )}
                </div>
                <MarkCard action={markAction.bind(null, "out")} kind="out" showLateReason={false} />
              </>
            ) : (
              <p className="text-sm">
                In {formatTime(todayRec.timeIn, tz)} · Out {formatTime(todayRec.timeOut, tz)} ·{" "}
                <strong>{minutesToHhmm((todayRec.timeOut.getTime() - todayRec.timeIn.getTime()) / 60000)}</strong>
                {todayRec.lunchOutAt && <> · lunch {minutesToHhmm(lunchTaken ?? 0)}</>}
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
        {missed.length > 0 && (
          <Notice tone="warn">
            No time out on {missed.map((m) => formatDate(m.attendanceDate)).join(", ")}. Hours for {missed.length === 1 ? "that day" : "those days"} cannot be counted: ask your senior or administrator to enter your time out.
          </Notice>
        )}
        {(markedInOpen || visits.length > 0) && (
          <Card title="Client visits today" icon={<MapPin />}>
            {visits.length > 0 && (
              <ol className="mb-4 space-y-1.5 text-sm">
                {visits.map((v, i) => (
                  <li key={v.id} className="flex flex-wrap items-center gap-x-2">
                    <span className="text-xs text-muted">{i + 1}.</span>
                    <strong>{v.placeName}</strong>
                    <span className="text-xs text-muted">{formatTime(v.startedAt, tz)} – {v.endedAt ? formatTime(v.endedAt, tz) : "now"}{v.endedAt && ` · ${minutesToHhmm((v.endedAt.getTime() - v.startedAt.getTime()) / 60000)}`}</span>
                    {!v.endedAt && <Badge tone="info">You are here</Badge>}
                  </li>
                ))}
              </ol>
            )}
            {currentVisit && pendency && (pendency.tasks.length > 0 || pendency.pending.length > 0) && (
              <div className="mb-4 rounded-lg border border-info/25 bg-info-bg p-3 text-sm">
                <p className="mb-1 font-medium text-info">Pending for {currentVisit.placeName}</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {pendency.tasks.map((t) => <li key={t.id}><Link href={`/app/tasks/${t.id}`} className="hover:underline">{t.title}</Link>{t.dueAt && <span className="text-xs text-muted"> · due {formatDate(t.dueAt)}</span>}</li>)}
                  {pendency.pending.map((p) => <li key={p.id}>{p.requestDescription}<span className="text-xs text-muted"> · {p.pendingWith === "CLIENT" ? "from the client" : "with you"}{p.dueBy && `, due ${formatDate(p.dueBy)}`}</span></li>)}
                </ul>
              </div>
            )}
            {markedInOpen ? (
              <div className="space-y-3">
                <p className="text-xs text-muted">Visiting clients today? Check in when you reach each one{currentVisit ? ", and use Move to next client when you go on" : ""}. Your office can then see where you are, and you see what is pending for that client.</p>
                <VisitStartForm action={startVisitAction} clients={clients} atClient={!!currentVisit} />
                {currentVisit && <VisitEndForm action={endVisitAction} />}
              </div>
            ) : (
              <p className="text-xs text-muted">Visits end automatically when you mark out.</p>
            )}
          </Card>
        )}
        <Card title={`My attendance — ${new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}`} padded={false}>
          {records.length === 0 ? (
            <p className="p-4 text-sm text-muted">No attendance recorded this month.</p>
          ) : (
            <Table minWidth={620}>
              <thead><tr><Th>Date</Th><Th>Status</Th><Th>In</Th><Th>Out</Th><Th>Hours</Th><Th>Lunch</Th><Th>Flags</Th></tr></thead>
              <tbody>
                {records.map((r) => {
                  const ev = evaluateDay({ dayOfMonth: r.attendanceDate.getUTCDate(), status: r.status, timeIn: r.timeIn, timeOut: r.timeOut }, emp.attendanceProfile, policy, tz);
                  const lunch = r.lunchInAt ? lunchMinutes(r.lunchOutAt, r.lunchInAt) : null;
                  return (
                    <tr key={r.id}>
                      <Td>{formatDate(r.attendanceDate)}</Td>
                      <Td><StatusBadge status={r.status} /></Td>
                      <Td>{formatTime(r.timeIn, tz)}</Td>
                      <Td>{formatTime(r.timeOut, tz)}</Td>
                      <Td>{ev.workedMinutes !== null ? minutesToHhmm(ev.workedMinutes) : "—"}</Td>
                      <Td>{lunch !== null ? minutesToHhmm(lunch) : "—"}</Td>
                      <Td className="text-xs">
                        {ev.isLate && <StatusBadge status="PENDING" label={r.lateReason ? "Late (reason given)" : "Late"} />}{" "}
                        {ev.leftBeforeHalfDayCutoff && <StatusBadge status="HALF_DAY" label="Left before 5:30" />}{" "}
                        {r.timeIn && !r.timeOut && r.attendanceDate < dateOnly(today) && <Badge tone="warn">No time out</Badge>}{" "}
                        {lunchOverMinutes(lunch, lunchAllowance) > 0 && <Badge tone="warn">Long lunch</Badge>}{" "}
                        {r.photoReview && <><Badge tone="info">Marked by a colleague</Badge> <ReviewBadge review={r.photoReview === "PENDING" ? null : r.photoReview} /></>}
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
    const [{ rows, counts, employeeCount }, departments, visitGroups] = await Promise.all([
      teamAttendanceRows(ctx, policy, f, { markOutReminderAt: policyRow.markOutReminderAt, lunchAllowance }),
      prisma.department.findMany({ where: { organizationId: ctx.organization.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      // Client stops, shown per person and day (a single day keeps this cheap; ranges show them too).
      prisma.clientVisit.findMany({
        where: { organizationId: ctx.organization.id, visitDate: { gte: dateOnly(f.from), lte: dateOnly(f.to) } },
        orderBy: { startedAt: "asc" },
        select: { employeeId: true, visitDate: true, placeName: true, startedAt: true, endedAt: true },
      }),
    ]);
    const visitsBy = new Map<string, typeof visitGroups>();
    for (const v of visitGroups) {
      const k = `${v.employeeId}|${toIsoDate(v.visitDate)}`;
      visitsBy.set(k, [...(visitsBy.get(k) ?? []), v]);
    }
    const person = f.employeeId ? rows[0]?.employee : null;
    const fixEmployee = typeof sp.fix === "string" && /^[0-9a-f-]{36}$/i.test(sp.fix) ? sp.fix : "";
    const fixDate = typeof sp.fixDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.fixDate) ? sp.fixDate : "";
    const fixRecord = fixEmployee && fixDate ? rows.find((r) => r.employee.id === fixEmployee && toIsoDate(r.date) === fixDate)?.record : null;
    const mayCorrect = can(ctx, "attendance.correct");
    const mayDelete = canDelete(ctx, "attendance");
    const options = mayCorrect ? await employeeOptions(ctx.organization.id) : [];
    const singleDay = f.from === f.to;

    const query = (extra: Record<string, string>) => {
      const p = new URLSearchParams({ tab: "team", from: f.from, to: f.to, ...(f.q && { q: f.q }), ...(f.departmentId && { department: f.departmentId }), ...(f.employeeId && { employee: f.employeeId }), ...(f.status && { status: f.status }), ...extra });
      for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
      return p.toString();
    };
    const tile = (status: AttendanceFilter | "") => `/app/attendance?${query({ status })}#attendance-list`;
    const exportHref = `/app/attendance/export?${query({ tab: "" })}`;
    const LIST_TITLE: Record<string, string> = { PRESENT: "Present", ABSENT: "Absent", HALF_DAY: "Half day", LEAVE: "On leave", NOT_MARKED: "Not marked", LATE: "Late arrivals", NO_OUT: "No time out", PROXY: "Marked by a colleague", "": "All team members" };
    const map = (lat: unknown, lng: unknown) => (lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null);
    const monthStart = `${today.slice(0, 7)}-01`;
    const personHref = (id: string) => `/app/attendance?tab=team&employee=${id}&from=${monthStart}&to=${today}`;
    const fixHref = (employeeId: string, date: Date) => `/app/attendance?${query({ fix: employeeId, fixDate: toIsoDate(date) })}#correct`;

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

        {person && (
          <Notice tone="info">
            Showing only <strong>{person.firstName} {person.lastName}</strong>. Change the dates above to see another period.{" "}
            <Link href={`/app/attendance?tab=team&from=${f.from}&to=${f.to}`} className="font-medium underline">Show everyone</Link>
          </Notice>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Team" value={singleDay ? employeeCount : counts.total} hint={singleDay ? "Click to see everyone" : "Person-days in this period"} href={tile("")} active={!f.status} icon={<Users />} />
          <Stat label="Present" value={counts.PRESENT} hint="Click to see who" href={tile("PRESENT")} active={f.status === "PRESENT"} icon={<UserCheck />} tone="ok" />
          <Stat label="Not marked" value={counts.NOT_MARKED} hint="Click to see who" href={tile("NOT_MARKED")} active={f.status === "NOT_MARKED"} icon={<CircleSlash />} tone={counts.NOT_MARKED ? "warn" : "neutral"} />
          <Stat label="On leave" value={counts.LEAVE} href={tile("LEAVE")} active={f.status === "LEAVE"} icon={<CalendarOff />} tone="info" />
          <Stat label="Absent" value={counts.ABSENT} href={tile("ABSENT")} active={f.status === "ABSENT"} icon={<CalendarCheck2 />} tone={counts.ABSENT ? "danger" : "neutral"} />
          <Stat label="Late arrivals" value={counts.LATE} href={tile("LATE")} active={f.status === "LATE"} icon={<Clock4 />} tone={counts.LATE ? "warn" : "neutral"} />
          <Stat label="No time out" value={counts.NO_OUT} hint={counts.NO_OUT ? "Hours can't be counted: fix them" : `Reminder at ${policyRow.markOutReminderAt}`} href={tile("NO_OUT")} active={f.status === "NO_OUT"} icon={<LogOut />} tone={counts.NO_OUT ? "danger" : "neutral"} />
          <Stat label="Marked by a colleague" value={counts.PROXY} hint="Photo attendance" href={tile("PROXY")} active={f.status === "PROXY"} icon={<Camera />} tone={counts.PROXY ? "info" : "neutral"} />
        </div>

        <section id="attendance-list" className="scroll-mt-24 space-y-3">
          <h2 className="text-sm font-semibold text-ink">
            {LIST_TITLE[f.status]} ({rows.length})
            <span className="ml-2 font-normal text-muted">{singleDay ? formatDate(dateOnly(f.from)) : `${formatDate(dateOnly(f.from))} – ${formatDate(dateOnly(f.to))}`}</span>
          </h2>
          {rows.length === 0 ? (
            <EmptyState kind="calendar" title="Nobody here">No attendance matches these filters.</EmptyState>
          ) : (
            <Table minWidth={1180}>
              <thead><tr>{!singleDay && <Th>Date</Th>}<Th>Team member</Th><Th>Department</Th><Th>Status</Th><Th>In</Th><Th>Out</Th><Th>Hours</Th><Th>Lunch</Th><Th>Client visits</Th><Th>Location</Th><Th>Photo</Th><Th>Notes</Th>{mayDelete && <Th />}</tr></thead>
              <tbody>
                {rows.map(({ key, date, employee: e, record: r, approvedLeave, isLate, workedMinutes, lunchMinutes: lunch, lunchOver, onLunch, missingTimeOut }) => {
                  const inMap = r ? map(r.timeInLatitude, r.timeInLongitude) : null;
                  const stops = visitsBy.get(key) ?? [];
                  return (
                    <tr key={key}>
                      {!singleDay && <Td className="whitespace-nowrap text-xs">{formatDate(date)}</Td>}
                      <Td>
                        {f.employeeId ? <span className="font-medium">{e.firstName} {e.lastName}</span> : <Link href={personHref(e.id)} className="font-medium hover:underline" title="See all of this person's attendance this month">{e.firstName} {e.lastName}</Link>}
                        <div className="text-xs text-muted">{e.designation?.name}</div>
                      </Td>
                      <Td className="text-xs">{e.department?.name ?? "—"}</Td>
                      <Td>{r ? <StatusBadge status={r.status} /> : approvedLeave ? <StatusBadge status="LEAVE" label="Approved leave" /> : <span className="text-xs text-muted">Not marked</span>}</Td>
                      <Td>{formatTime(r?.timeIn, tz)}{isLate && <div><StatusBadge status="PENDING" label="Late" /></div>}</Td>
                      <Td>
                        {formatTime(r?.timeOut, tz)}
                        {missingTimeOut && (
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            <Badge tone="danger">No time out</Badge>
                            {mayCorrect && <Link href={fixHref(e.id, date)} className="text-xs font-medium text-brand-700 hover:underline">Fix</Link>}
                          </div>
                        )}
                      </Td>
                      <Td>{workedMinutes != null ? minutesToHhmm(workedMinutes) : "—"}</Td>
                      <Td className="text-xs">{onLunch ? <Badge tone="info">On lunch</Badge> : lunch != null ? minutesToHhmm(lunch) : "—"}{lunchOver > 0 && <div><Badge tone="warn">+{minutesToHhmm(lunchOver)}</Badge></div>}</Td>
                      <Td className="text-xs">
                        {stops.length === 0 ? "—" : (
                          <ul className="space-y-0.5">
                            {stops.map((v, i) => <li key={i}><span className="font-medium text-ink">{v.placeName}</span> <span className="text-muted">{formatTime(v.startedAt, tz)}–{v.endedAt ? formatTime(v.endedAt, tz) : "now"}</span></li>)}
                          </ul>
                        )}
                      </Td>
                      <Td>{inMap ? <a href={inMap} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline">Map</a> : "—"}</Td>
                      <Td>
                        {r?.photoReview ? (
                          <div className="space-y-1">
                            <span className="flex gap-1"><Thumb fileId={r.timeInPhotoFileId} label={`${e.firstName} – time in`} size="sm" />{r.timeOutPhotoFileId && <Thumb fileId={r.timeOutPhotoFileId} label={`${e.firstName} – time out`} size="sm" />}</span>
                            <div className="text-xs text-muted">by {r.timeInProxyBy?.name ?? r.timeOutProxyBy?.name ?? "a colleague"}</div>
                            <Link href={`/app/attendance?tab=photos&show=ALL&employee=${e.id}&from=${toIsoDate(date)}&to=${toIsoDate(date)}`} className="inline-block"><ReviewBadge review={r.photoReview} /></Link>
                          </div>
                        ) : r?.timeInPhotoFileId ? <a href={`/api/files/${r.timeInPhotoFileId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline">View</a> : "—"}
                      </Td>
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
          <section id="correct" className="max-w-3xl scroll-mt-24">
            <Card title="Record or correct attendance">
              <p className="mb-3 text-sm text-muted">For absences, missed entries or corrections. The original values, your name and the reason are kept.</p>
              {fixRecord?.timeIn && (
                <div className="mb-3"><Notice tone="warn">Enter the time out for this day. The time in is filled in so it stays as it was.</Notice></div>
              )}
              <CorrectionForm
                key={`${fixEmployee}|${fixDate}`}
                action={correctAttendanceAction}
                employees={options}
                date={fixDate || f.to}
                defaults={fixRecord?.timeIn ? { employeeId: fixEmployee, timeIn: dateTimeLocalInTz(fixRecord.timeIn, tz).slice(11), reason: "Forgot to mark out" } : undefined}
              />
            </Card>
          </section>
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
