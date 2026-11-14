import { NO_EMPLOYEE } from "@/lib/ids";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { addDays, dateOnly, formatDate, formatDateTime, formatTime, hhmmToMinutes, minutesOfDayInTz, minutesToHhmm, monthRange, toIsoDate } from "@/lib/dates";
import { DownloadButton } from "@/components/ui";
import { DeleteButton } from "@/components/delete-dialog";
import { canDelete } from "@/lib/services/deletions";
import { CalendarCheck2, CalendarOff, Camera, CircleSlash, Clock4, LogOut, MapPin, MoonStar, UserCheck, Users, UtensilsCrossed } from "lucide-react";
import { hhmm, noticeDays } from "@/lib/domain/attendance-policy";
import { leaveUsedThisMonth, parseTeamFilters, teamAttendanceRows, todayIso, type AttendanceFilter } from "@/lib/services/attendance";
import { getPolicy, hasAcceptedRules, holidaySet, isOffDay, reporteeIds, scheduleOf, workLocationLabels } from "@/lib/services/office-rules";
import { ownWorkClientOptions } from "@/lib/services/lookups";
import { KIND_LABEL, myRequests, pendingRequestCount, requestsToDecide } from "@/lib/services/attendance-requests";
import { scheduleRows } from "@/lib/services/team-schedules";
import { payrollForMonth } from "@/lib/services/payroll";
import { myPlanStatus } from "@/lib/services/daily-plans";
import { Badge, Card, EmptyState, humanize, Notice, PageHeader, Stat, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import Link from "next/link";
import { cancelRequestAction, decideLeaveAction, decideRequestAction, endVisitAction, lunchAction, markAction, raiseRequestAction, requestLeaveAction, setScheduleAction, shiftLunchAction, startVisitAction } from "./actions";
import { lunchAllowanceMinutes, lunchMinutes, lunchOverMinutes, markOutReminderDue } from "@/lib/domain/attendance-extras";
import { pendingPhotoChecks } from "@/lib/services/attendance-proxy";
import { clientPendency, myVisitsToday, visitClientOptions } from "@/lib/services/client-visits";
import { LunchButton, VisitEndForm, VisitStartForm } from "./extra-forms";
import { OthersTab, PhotosTab, ReviewBadge, Thumb, VisitsTab, WorkersTab } from "./extra-tabs";
import { LeaveDecisionForm, LeaveRequestForm, LunchShiftForm, RequestDecisionForm, RequestForm, ScheduleForm } from "./forms";
import { MarkCard } from "./mark-card";
import { DayFlags } from "./day-flags";
import { LiveClock } from "@/components/live-clock";
import { CalendarDays } from "lucide-react";

const nameOf = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();

export default async function AttendancePage({ searchParams }: PageProps<"/app/attendance">) {
  const ctx = await requireCapability("attendance.mark_own");
  const sp = await searchParams;
  const viewAll = can(ctx, "attendance.view_all");
  // Team Lead = the person others report to (or an administrator, for everyone).
  const myTeam = await reporteeIds(ctx);
  const lead = can(ctx, "org.manage") || myTeam.length > 0;
  const markOthers = can(ctx, "attendance.mark_others");
  const manageWorkers = can(ctx, "attendance.workers");
  const [photoChecks, requestCount] = await Promise.all([pendingPhotoChecks(ctx), lead ? pendingRequestCount(ctx) : Promise.resolve(0)]);
  const seePhotos = viewAll || can(ctx, "attendance.review_photos") || photoChecks > 0;
  const allowed: Record<string, boolean> = { team: viewAll, myteam: myTeam.length > 0, leave: true, requests: true, schedules: lead, others: markOthers, photos: seePhotos, visits: viewAll, workers: manageWorkers };
  // Team Lead portal: "My team" (only those who report to them) and "All attendance" (everyone, with the right).
  // Links to the team list from a lead who cannot see everyone open their own team.
  const requested = sp.tab === "team" && !viewAll && myTeam.length ? "myteam" : sp.tab;
  const tab = typeof requested === "string" && allowed[requested] ? requested : "mine";
  const today = todayIso(ctx);
  const tz = ctx.organization.timezone;
  const policy = await getPolicy(ctx.organization.id);
  const policyRow = policy.row;
  const labels = workLocationLabels(policyRow.officeName);
  const lunchAllowance = lunchAllowanceMinutes(policyRow.lunchStart, policyRow.lunchEnd);

  return (
    <>
      <PageHeader icon={<CalendarDays />} title="Attendance" description="Mark in and out with your location, inform your Team Lead, and see how each day counts under the office rules."
        actions={<Link href="/app/rules" className="text-sm font-medium text-brand-700 hover:underline">Office rules</Link>} />
      <TabNav
        current={tab}
        tabs={[
          { key: "mine", label: "My attendance", href: "/app/attendance" },
          { key: "requests", label: lead ? "Requests & intimations" : "Inform / request", href: "/app/attendance?tab=requests", ...(requestCount ? { count: requestCount } : {}) },
          { key: "leave", label: "Leave", href: "/app/attendance?tab=leave" },
          ...(myTeam.length ? [{ key: "myteam", label: "My team", href: "/app/attendance?tab=myteam" }] : []),
          ...(viewAll ? [{ key: "team", label: myTeam.length ? "All attendance" : "Team attendance", href: "/app/attendance?tab=team" }] : []),
          ...(lead ? [{ key: "schedules", label: "Team timings", href: "/app/attendance?tab=schedules" }] : []),
          ...(markOthers ? [{ key: "others", label: "Mark for others", href: "/app/attendance?tab=others" }] : []),
          ...(seePhotos ? [{ key: "photos", label: "Photo check", href: "/app/attendance?tab=photos", ...(photoChecks ? { count: photoChecks } : {}) }] : []),
          ...(viewAll ? [{ key: "visits", label: "Client visits", href: "/app/attendance?tab=visits" }] : []),
          ...(manageWorkers ? [{ key: "workers", label: "Daily workers", href: "/app/attendance?tab=workers" }] : []),
        ]}
      />
      {tab === "mine" && <Mine />}
      {tab === "requests" && <Requests />}
      {tab === "others" && <OthersTab ctx={ctx} />}
      {(tab === "team" || tab === "myteam") && <Team scope={tab} />}
      {tab === "schedules" && <Schedules />}
      {tab === "photos" && <PhotosTab ctx={ctx} sp={sp} today={today} />}
      {tab === "visits" && <VisitsTab ctx={ctx} sp={sp} today={today} />}
      {tab === "workers" && <WorkersTab ctx={ctx} sp={sp} today={today} />}
      {tab === "leave" && <Leave />}
    </>
  );

  async function Mine() {
    const clientNames = (await ownWorkClientOptions(ctx, dateOnly(today))).map((c) => c.label);
    if (!ctx.employee) {
      // The owner and administrators get their attendance record at their first mark-in.
      if (!can(ctx, "org.manage")) return <EmptyState kind="people" title="No staff record">Your login is not linked to an employee, so there is no attendance to mark.</EmptyState>;
      return (
        <Card title={`Today · ${formatDate(dateOnly(today))}`} className="max-w-xl">
          <div className="mb-4 border-b border-line pb-4"><LiveClock timeZone={tz} /></div>
          <MarkCard action={markAction.bind(null, "in")} kind="in" showLateReason={false} labels={labels} clients={clientNames} />
          <p className="mt-4 border-t border-line pt-3 text-xs text-muted">Marking in here works exactly as it does for your team, so you can try it yourself. Your name then also appears in Team attendance.</p>
        </Card>
      );
    }
    const me = ctx.employee.id;
    const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
    const { start, end } = monthRange(`${month}-01`);
    const day = dateOnly(today);
    const [todayRec, records, emp, visits, missed, leaveToday, myForms, pay, plans, holidays] = await Promise.all([
      prisma.attendanceRecord.findFirst({ where: { employeeId: me, attendanceDate: day }, orderBy: { createdAt: "desc" }, include: { timeInProxyBy: { select: { name: true } } } }),
      prisma.attendanceRecord.findMany({ where: { employeeId: me, attendanceDate: { gte: start, lte: end } }, orderBy: { attendanceDate: "asc" } }),
      prisma.employee.findUniqueOrThrow({ where: { id: me }, select: { attendanceProfile: true, siteReportingTime: true, siteName: true, rulesAcknowledgedAt: true } }),
      myVisitsToday(ctx),
      // Earlier days (last month) with a time in and no time out: their hours cannot be counted.
      prisma.attendanceRecord.findMany({
        where: { employeeId: me, attendanceDate: { lt: day, gte: addDays(day, -31) }, timeIn: { not: null }, timeOut: null, status: { in: ["PRESENT", "HALF_DAY"] } },
        orderBy: { attendanceDate: "asc" },
        select: { attendanceDate: true },
      }),
      prisma.leaveRequest.findFirst({ where: { employeeId: me, status: { in: ["APPROVED", "PENDING"] }, fromDate: { lte: day }, toDate: { gte: day } } }),
      prisma.attendanceRequest.findMany({ where: { employeeId: me, requestDate: day, status: { not: "CANCELLED" } } }),
      payrollForMonth(ctx, month, me),
      myPlanStatus(ctx),
      holidaySet(ctx.organization.id, day, day),
    ]);
    const now = new Date();
    const nowMin = minutesOfDayInTz(now, tz);
    const schedule = scheduleOf(policy, emp, todayRec);
    const reminderDue = markOutReminderDue(now, policyRow.markOutReminderAt, tz);
    const markedInOpen = !!todayRec?.timeIn && !todayRec.timeOut;
    const currentVisit = visits.find((v) => !v.endedAt) ?? null;
    const [clients, pendency] = markedInOpen
      ? await Promise.all([visitClientOptions(ctx), currentVisit?.clientId ? clientPendency(ctx.organization.id, currentVisit.clientId, me) : Promise.resolve(null)])
      : [[], null];
    const lunchTaken = todayRec ? lunchMinutes(todayRec.lunchOutAt, todayRec.lunchInAt, now) : null;
    const lunchFrom = todayRec?.lunchShiftedTo ?? policyRow.lunchStart;
    const lunchTo = hhmm(hhmmToMinutes(lunchFrom) + lunchAllowance);
    const lateNow = nowMin > schedule.graceUntil;
    const pastCutoff = nowMin >= schedule.absentAt && ctx.role !== "OWNER";
    const form = (k: string) => myForms.find((f) => f.kind === k);
    const ot = form("OVERTIME");
    const early = form("EARLY_LEAVE");
    const row = pay.rows[0];
    const s = row?.score;
    const scoreBy = new Map((s?.days ?? []).map((d) => [d.iso, d]));
    const off = isOffDay(today, holidays);
    const outWarning = !markedInOpen ? null
      : nowMin < schedule.halfDayBefore ? `It is before ${hhmm(schedule.halfDayBefore)}: leaving now counts as a half day${early?.status === "APPROVED" ? "" : ", and leaving early needs your Team Lead's permission"}.`
      : nowMin < schedule.end && early?.status !== "APPROVED" ? `Your day ends at ${hhmm(schedule.end)}. Leaving before that needs your Team Lead's permission.`
      : nowMin > schedule.overtimeAfter && ot?.status !== "APPROVED" ? `You are past ${hhmm(schedule.overtimeAfter)} without approved overtime: the extra time is not counted.`
      : null;
    const needsRules = !hasAcceptedRules(emp.rulesAcknowledgedAt, policyRow.updatedAt);

    return (
      <div className="space-y-6">
        {needsRules && (
          <Notice tone="info">
            Please read the <Link href="/app/rules" className="font-medium underline">Leave, Timing and Office Decorum rules</Link> and accept them. They decide how every day below is counted.
          </Notice>
        )}
        <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
          <Card title={`Today · ${formatDate(day)}`}>
            <div className="mb-3 border-b border-line pb-4"><LiveClock timeZone={tz} /></div>
            <p className="mb-4 text-xs text-muted">
              {schedule.site ? <>Client site{emp.siteName ? ` · ${emp.siteName}` : ""}: </> : <>{labels.OFFICE}: </>}
              <strong className="text-ink">{hhmm(schedule.start)}–{hhmm(schedule.end)}</strong> · grace till {hhmm(schedule.graceUntil)} · not in by {hhmm(schedule.absentAt)} = absent
            </p>
            {todayRec?.autoAbsentAt || (todayRec?.status === "ABSENT" && !todayRec.timeIn) ? (
              <Notice tone="danger">
                You were marked <strong>Absent</strong> by the ERP at {formatTime(todayRec.autoAbsentAt ?? todayRec.updatedAt, tz)}. Attendance cannot be changed to Present now.{" "}
                {!leaveToday && <Link href="/app/attendance?tab=leave" className="font-medium underline">Raise a leave request</Link>}{!leaveToday && " so it is not counted as an absence without intimation."}
              </Notice>
            ) : todayRec?.status === "LEAVE" || (leaveToday && !todayRec?.timeIn && !leaveToday.isHalfDay) ? (
              <Notice tone="info">You are on leave today{leaveToday?.status === "PENDING" ? " (request waiting for your Team Lead)" : ""}.</Notice>
            ) : off && !todayRec?.timeIn ? (
              <Notice tone="info">Today is a Sunday or office holiday. If you are working, you can still mark in.</Notice>
            ) : null}
            {!todayRec?.timeIn ? (
              !todayRec?.autoAbsentAt && todayRec?.status !== "LEAVE" && (!pastCutoff || leaveToday) ? (
                <>
                  {nowMin < schedule.start && !form("LATE_ARRIVAL") && (
                    <p className="mb-3 text-sm">Running late? <Link href="/app/attendance?tab=requests&kind=LATE_ARRIVAL" className="font-medium text-brand-700 hover:underline">Inform your Team Lead before {hhmm(schedule.start)}</Link>.</p>
                  )}
                  {form("LATE_ARRIVAL") && <p className="mb-3 text-sm text-muted">You told your Team Lead you would arrive at {form("LATE_ARRIVAL")!.atTime}.</p>}
                  <MarkCard action={markAction.bind(null, "in")} kind="in" showLateReason={lateNow} labels={labels} clients={clientNames} defaultLocation={emp.attendanceProfile === "ONSITE" ? "CLIENT_OFFICE" : null} defaultPlace={emp.siteName}
                    warning={lateNow ? `It is past ${hhmm(schedule.graceUntil)}, so this counts as a late arrival${nowMin - schedule.start > policy.numbers.veryLateAfterMinutes ? " of more than an hour (a half day)" : ""}.` : null} />
                </>
              ) : !todayRec && pastCutoff && !off ? (
                <Notice tone="danger">It is past {hhmm(schedule.absentAt)} and you have not marked in, so today counts as <strong>Absent</strong>. <Link href="/app/attendance?tab=leave" className="font-medium underline">Raise a leave request</Link> if you are on leave.</Notice>
              ) : null
            ) : !todayRec.timeOut ? (
              <>
                <p className="mb-1 text-sm">Marked in at <strong>{formatTime(todayRec.timeIn, tz)}</strong>{todayRec.workLocation && <> · {labels[todayRec.workLocation]}{todayRec.workPlace ? ` (${todayRec.workPlace})` : ""}</>}.</p>
                {scoreBy.get(today) && <div className="mb-3"><DayFlags s={scoreBy.get(today)!} halfDayAt={hhmm(schedule.halfDayBefore)} /></div>}
                {todayRec.timeInProxyBy && <p className="mb-3 text-xs text-muted">Recorded for you by {todayRec.timeInProxyBy.name} with your photo.</p>}
                {reminderDue && <div className="mb-3"><Notice tone="warn">It is past {policyRow.markOutReminderAt}. Remember to mark out before you leave, so your hours and salary are worked out correctly.</Notice></div>}
                <div className="mb-4 rounded-lg border border-line bg-paper p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><UtensilsCrossed className="size-4 text-muted" aria-hidden /> Lunch</p>
                  {!todayRec.lunchOutAt ? (
                    <><p className="mb-2 text-xs text-muted">{lunchFrom}–{lunchTo} ({lunchAllowance} minutes){todayRec.lunchShiftedTo && " · moved by your Team Lead today"}. Never more than {lunchAllowance} minutes.</p><LunchButton action={lunchAction.bind(null, "out")} kind="out" /></>
                  ) : !todayRec.lunchInAt ? (
                    <><p className="mb-2 text-sm">On lunch since <strong>{formatTime(todayRec.lunchOutAt, tz)}</strong> ({minutesToHhmm(lunchTaken ?? 0)} so far).</p><LunchButton action={lunchAction.bind(null, "in")} kind="in" /></>
                  ) : (
                    <p className="text-sm">
                      Lunch {formatTime(todayRec.lunchOutAt, tz)} – {formatTime(todayRec.lunchInAt, tz)} · <strong>{minutesToHhmm(lunchTaken ?? 0)}</strong>
                      {lunchOverMinutes(lunchTaken, lunchAllowance) > 0 && <> · <Badge tone="warn">{minutesToHhmm(lunchOverMinutes(lunchTaken, lunchAllowance))} over</Badge></>}
                    </p>
                  )}
                </div>
                <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {early ? <span className="text-muted">Leave early at {early.atTime}: <StatusBadge status={early.status} /></span>
                    : nowMin < schedule.end && <Link href="/app/attendance?tab=requests&kind=EARLY_LEAVE" className="font-medium text-brand-700 hover:underline">Need to leave early?</Link>}
                  {ot ? <span className="text-muted">Overtime{ot.atTime ? ` till ${ot.atTime}` : ""}: <StatusBadge status={ot.status} /></span>
                    : nowMin < schedule.overtimeAfter && <Link href="/app/attendance?tab=requests&kind=OVERTIME" className="font-medium text-brand-700 hover:underline">Need to stay after {hhmm(schedule.overtimeAfter)}?</Link>}
                </div>
                <MarkCard action={markAction.bind(null, "out")} kind="out" showLateReason={false} labels={labels} clients={clientNames} defaultLocation={todayRec.workLocation} defaultPlace={todayRec.workPlace} warning={outWarning} />
              </>
            ) : (
              <div className="space-y-2">
                <p className="text-sm">
                  In {formatTime(todayRec.timeIn, tz)} · Out {formatTime(todayRec.timeOut, tz)} ·{" "}
                  <strong>{minutesToHhmm((todayRec.timeOut.getTime() - todayRec.timeIn.getTime()) / 60000)}</strong>
                  {todayRec.lunchOutAt && <> · lunch {minutesToHhmm(lunchTaken ?? 0)}</>}
                </p>
                {scoreBy.get(today) && <DayFlags s={scoreBy.get(today)!} halfDayAt={hhmm(schedule.halfDayBefore)} />}
              </div>
            )}
          </Card>
          <div className="space-y-4">
            {s && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Days present" value={s.worked + s.halfDays * 0.5} icon={<UserCheck />} tone="ok" />
                <Stat label="Leave" value={s.paidLeave + s.unpaidLeave + s.excessLeave + s.sandwichDays} hint={`${s.paidLeave} paid of ${policy.numbers.paidLeavesPerMonth} allowed`} icon={<CalendarOff />} tone="info" />
                <Stat label="Late arrivals" value={s.lateArrivals + s.veryLateArrivals} hint={`${s.lateArrivals % policy.numbers.lateArrivalsPerHalfDay} of ${policy.numbers.lateArrivalsPerHalfDay} toward the next ½ day${s.lateExcused ? ` · ${s.lateExcused} excused` : ""}`} icon={<Clock4 />} tone={s.lateArrivals + s.veryLateArrivals ? "warn" : "neutral"} />
                <Stat label="Deducted (days)" value={s.unpaidDays} hint={s.unpaidDays ? "Absences, half days, unpaid leave" : "Nothing deducted"} tone={s.unpaidDays ? "danger" : "ok"} href="/app/payroll" />
                <Stat label="Approved overtime" value={minutesToHhmm(s.overtimeMinutes)} hint={s.stayedUnapprovedMinutes ? `${minutesToHhmm(s.stayedUnapprovedMinutes)} not approved` : "Real minutes after 6:45 PM"} icon={<MoonStar />} />
                <Stat label="Absent" value={s.absent} hint={s.absentUnrequested ? `${s.absentUnrequested} without a request (counts double)` : undefined} tone={s.absent ? "danger" : "neutral"} />
                {plans && <Stat label="EOD fines" value={`₹${row.fines.eodMissed.length * policyRow.eodPenaltyRupees}`} hint={row.fines.eodMissed.length ? `${row.fines.eodMissed.length} not filed in time` : "All filed in time"} tone={row.fines.eodMissed.length ? "danger" : "neutral"} href="/app/timesheet?tab=plan" />}
                <Stat label="No-leave bonus" value={s.tookLeave ? "—" : `+${policy.numbers.noLeaveBonusDays} days`} hint={s.tookLeave ? "Not this month (leave or a deduction)" : "On track: no leave so far"} tone={s.tookLeave ? "neutral" : "ok"} />
              </div>
            )}
            {plans && (
              <Card title="Morning plan & EOD" actions={<Link href="/app/timesheet?tab=plan" className="text-xs font-medium text-brand-700 hover:underline">Open</Link>}>
                <ul className="space-y-1.5 text-sm">
                  <li>Morning plan (due {policyRow.morningPlanBy}): {plans.today.plan?.planSubmittedAt ? <><Badge tone={plans.today.planLate ? "warn" : "ok"}>{plans.today.planLate ? "Sent late" : "Sent"} {formatTime(plans.today.plan.planSubmittedAt, tz)}</Badge>{plans.today.plan.approvedAt && <> <Badge tone="ok">Approved</Badge></>}</> : <Badge tone={now > plans.today.planDueBy ? "danger" : "warn"}>Not sent yet</Badge>}</li>
                  <li>Today&apos;s EOD report: {plans.today.plan?.eodSubmittedAt ? <Badge tone="ok">Filed</Badge> : <span className="text-muted">due by {formatDateTime(plans.today.deadlines.fileBy, tz)}</span>}</li>
                  {plans.previous && (
                    <li className="text-danger">EOD for {formatDate(dateOnly(plans.previous.iso))} {plans.previous.view.state === "MISSED" ? `was not filed in time (₹${policyRow.eodPenaltyRupees} fine).` : `is still due: file it before ${formatDateTime(plans.previous.view.deadlines.fileBy, tz)}.`} <Link href={`/app/timesheet?tab=plan&date=${plans.previous.iso}`} className="font-medium underline">File it now</Link></li>
                  )}
                </ul>
              </Card>
            )}
          </div>
        </div>
        {missed.length > 0 && (
          <Notice tone="warn">
            No time out on {missed.map((m) => formatDate(m.attendanceDate)).join(", ")}. Attendance cannot be changed by hand, so hours and overtime for {missed.length === 1 ? "that day" : "those days"} cannot be counted. Always mark out before you leave.
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
        <Card title={`My attendance — ${new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}`} padded={false}
          actions={<form className="flex items-center gap-2"><input type="month" name="month" defaultValue={month} max={today.slice(0, 7)} aria-label="Month" className="h-8 rounded-md border border-line bg-surface px-2 text-xs" /><button className="h-8 rounded-md border border-line px-2 text-xs hover:bg-subtle">Show</button></form>}>
          {records.length === 0 ? (
            <p className="p-4 text-sm text-muted">No attendance recorded this month.</p>
          ) : (
            <Table minWidth={820}>
              <thead><tr><Th>Date</Th><Th>Status</Th><Th>Where</Th><Th>In</Th><Th>Out</Th><Th>Hours</Th><Th>Lunch</Th><Th>How it counts</Th></tr></thead>
              <tbody>
                {records.map((r) => {
                  const iso = toIsoDate(r.attendanceDate);
                  const sc = scoreBy.get(iso);
                  const lunch = r.lunchInAt ? lunchMinutes(r.lunchOutAt, r.lunchInAt) : null;
                  return (
                    <tr key={r.id}>
                      <Td className="whitespace-nowrap">{formatDate(r.attendanceDate)}</Td>
                      <Td><StatusBadge status={r.status} />{r.autoAbsentAt && <div className="text-xs text-muted">by the ERP at {formatTime(r.autoAbsentAt, tz)}</div>}</Td>
                      <Td className="text-xs">{r.workLocation ? labels[r.workLocation] : "—"}{r.workPlace && <div className="text-muted">{r.workPlace}</div>}</Td>
                      <Td>{formatTime(r.timeIn, tz)}</Td>
                      <Td>{formatTime(r.timeOut, tz)}</Td>
                      <Td>{sc?.times?.workedMinutes != null ? minutesToHhmm(sc.times.workedMinutes) : "—"}</Td>
                      <Td>{lunch !== null ? <>{minutesToHhmm(lunch)}{lunchOverMinutes(lunch, lunchAllowance) > 0 && <div><Badge tone="warn">Long lunch</Badge></div>}</> : "—"}</Td>
                      <Td className="text-xs">
                        {sc && <DayFlags s={sc} halfDayAt={hhmm(scheduleOf(policy, emp, r).halfDayBefore)} />}
                        {r.photoReview && <div className="mt-1"><Badge tone="info">Marked by a colleague</Badge> <ReviewBadge review={r.photoReview === "PENDING" ? null : r.photoReview} /></div>}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
          {s && (s.sandwichDays > 0 || s.days.some((d) => d.kind === "ABSENT" && !records.some((r) => toIsoDate(r.attendanceDate) === d.iso))) && (
            <p className="border-t border-line p-3 text-xs text-muted">
              Also counted: {[
                ...s.days.filter((d) => d.kind === "ABSENT" && !records.some((r) => toIsoDate(r.attendanceDate) === d.iso)).map((d) => `${formatDate(dateOnly(d.iso))} not marked${d.absentUnrequested ? " (no request: counts double)" : ""}`),
                ...s.days.filter((d) => d.sandwiched).map((d) => `${formatDate(dateOnly(d.iso))} counts as leave (Sunday/holiday inside a leave)`),
              ].join(" · ")}
            </p>
          )}
        </Card>
      </div>
    );
  }

  async function Requests() {
    const kind = typeof sp.kind === "string" ? sp.kind : undefined;
    const [mine, toDecide, emp] = await Promise.all([
      myRequests(ctx),
      lead ? requestsToDecide(ctx) : Promise.resolve([]),
      ctx.employee ? prisma.employee.findUnique({ where: { id: ctx.employee.id }, select: { attendanceProfile: true, siteReportingTime: true } }) : Promise.resolve(null),
    ]);
    const s = scheduleOf(policy, emp);
    const waiting = toDecide.filter((r) => r.status === "PENDING" && r.kind !== "LATE_ARRIVAL");
    const lateNotes = toDecide.filter((r) => r.kind === "LATE_ARRIVAL");
    const when = (d: Date) => (toIsoDate(d) === today ? "Today" : formatDate(d));
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {ctx.employee && (
            <Card title="Inform or ask your Team Lead">
              <RequestForm action={raiseRequestAction} today={today} initialKind={kind}
                defaults={{ arrival: hhmm(s.start + 30), leaving: hhmm(s.halfDayBefore), overtimeUntil: hhmm(s.overtimeAfter + 60) }} />
            </Card>
          )}
          <Card title="My requests">
            {mine.length === 0 ? <p className="text-sm text-muted">Nothing raised yet.</p> : (
              <ul className="divide-y divide-line text-sm">
                {mine.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">{KIND_LABEL[r.kind]}</span> · {when(r.requestDate)}{r.atTime && ` · ${r.atTime}`}
                      {!r.inAdvance && <> · <Badge tone="warn">not in advance</Badge></>}
                      <span className="block text-xs text-muted">{r.kind === "OVERTIME" ? `${r.task} — ${r.whyNotTomorrow}` : r.reason}</span>
                      {r.decidedBy && <span className="block text-xs text-muted">{r.decidedBy.name}{r.decisionNote ? `: ${r.decisionNote}` : ""}</span>}
                    </span>
                    <span className="flex items-center gap-1">
                      <StatusBadge status={r.status} label={r.kind === "LATE_ARRIVAL" ? (r.status === "REJECTED" ? "Not accepted" : r.status === "APPROVED" ? "Accepted" : "Informed") : undefined} />
                      {r.status === "PENDING" && <ActionButton variant="ghost" action={cancelRequestAction.bind(null, r.id)} confirm="Withdraw this request?">Withdraw</ActionButton>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        {lead && (
          <div className="space-y-6">
            <Card title={`Waiting for your decision (${waiting.length})`}>
              {waiting.length === 0 ? <p className="text-sm text-muted">Nothing waiting. Leave requests are on the Leave tab.</p> : (
                <ul className="space-y-4">
                  {waiting.map((r) => (
                    <li key={r.id} className="rounded-md border border-line p-3 text-sm">
                      <p className="font-medium">{nameOf(r.employee)} · {KIND_LABEL[r.kind]} · {when(r.requestDate)}{r.atTime && (r.kind === "OVERTIME" ? ` till ${r.atTime}` : ` at ${r.atTime}`)}</p>
                      {r.kind === "OVERTIME" ? (
                        <dl className="mt-1 space-y-0.5 text-xs"><div><dt className="inline font-medium">Task: </dt><dd className="inline">{r.task}</dd></div><div><dt className="inline font-medium">Why it can&apos;t wait: </dt><dd className="inline">{r.whyNotTomorrow}</dd></div></dl>
                      ) : <p className="mt-1">{r.reason}</p>}
                      {r.kind === "EARLY_LEAVE" && r.atTime && hhmmToMinutes(r.atTime) < hhmmToMinutes(policyRow.halfDayIfLeavingBefore) && <p className="mt-1 text-xs text-warn">Before {policyRow.halfDayIfLeavingBefore}: it counts as a half day even if you approve.</p>}
                      {r.kind === "OVERTIME" && <p className="mt-1 text-xs text-muted">You are answerable for team members working late. Approve only if it is really urgent.</p>}
                      <div className="mt-2"><RequestDecisionForm action={decideRequestAction.bind(null, r.id)} late={false} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Late-arrival intimations (last 7 days)">
              <p className="mb-3 text-xs text-muted">Informed before the reporting time, the first late arrival of the month is a warning only. Mark a reason &ldquo;not genuine&rdquo; to count the day as late.</p>
              {lateNotes.length === 0 ? <p className="text-sm text-muted">None.</p> : (
                <ul className="space-y-3">
                  {lateNotes.map((r) => (
                    <li key={r.id} className="rounded-md border border-line p-3 text-sm">
                      <p className="font-medium">{nameOf(r.employee)} · {when(r.requestDate)} · arriving {r.atTime} {!r.inAdvance && <Badge tone="warn">after the reporting time</Badge>}</p>
                      <p className="mt-1">{r.reason}</p>
                      <p className="mt-1 text-xs text-muted">{r.status === "PENDING" ? "Accepted (no action needed)" : r.status === "APPROVED" ? `Accepted by ${r.decidedBy?.name}` : `Not accepted by ${r.decidedBy?.name}`}</p>
                      <div className="mt-2"><RequestDecisionForm action={decideRequestAction.bind(null, r.id)} late /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    );
  }

  async function Team({ scope }: { scope: "team" | "myteam" }) {
    const f = { ...parseTeamFilters(sp, today), ...(scope === "myteam" ? { onlyEmployeeIds: myTeam } : {}) };
    const [{ rows, counts, employeeCount }, departments, visitGroups] = await Promise.all([
      teamAttendanceRows(ctx, policy, f),
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
    const singleDay = f.from === f.to;

    const query = (extra: Record<string, string>) => {
      const p = new URLSearchParams({ tab: scope, from: f.from, to: f.to, ...(f.q && { q: f.q }), ...(f.departmentId && { department: f.departmentId }), ...(f.employeeId && { employee: f.employeeId }), ...(f.status && { status: f.status }), ...extra });
      for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
      return p.toString();
    };
    const tile = (status: AttendanceFilter | "") => `/app/attendance?${query({ status })}#attendance-list`;
    const exportHref = `/app/attendance/export?${query({ tab: "", ...(scope === "myteam" ? { scope: "mine" } : {}) })}`;
    const LIST_TITLE: Record<string, string> = { PRESENT: "Present", ABSENT: "Absent", HALF_DAY: "Half day", LEAVE: "On leave", NOT_MARKED: "Not marked", LATE: "Late arrivals", NO_OUT: "No time out", PROXY: "Marked by a colleague", STAYING: "Staying late without approval", "": "All team members" };
    const map = (lat: unknown, lng: unknown) => (lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null);
    const monthStart = `${today.slice(0, 7)}-01`;
    const personHref = (id: string) => `/app/attendance?tab=${scope}&employee=${id}&from=${monthStart}&to=${today}`;

    return (
      <div className="space-y-6">
        <form className="flex flex-wrap items-end gap-2" aria-label="Filter attendance">
          <input type="hidden" name="tab" value={scope} />
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
              <option value="NO_OUT">No time out</option>
              <option value="STAYING">Staying late without approval</option>
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
          <a href={`/app/attendance?tab=${scope}`} className="flex h-10 items-center px-2 text-sm text-muted hover:text-ink">Clear</a>
          <span className="ml-auto"><DownloadButton href={exportHref}>Export to Excel</DownloadButton></span>
        </form>

        {person && (
          <Notice tone="info">
            Showing only <strong>{person.firstName} {person.lastName}</strong>. Change the dates above to see another period.{" "}
            <Link href={`/app/attendance?tab=${scope}&from=${f.from}&to=${f.to}`} className="font-medium underline">Show everyone</Link>
          </Notice>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-5">
          <Stat label="Team" value={singleDay ? employeeCount : counts.total} hint={singleDay ? "Click to see everyone" : "Person-days in this period"} href={tile("")} active={!f.status} icon={<Users />} />
          <Stat label="Present" value={counts.PRESENT} hint="Click to see who" href={tile("PRESENT")} active={f.status === "PRESENT"} icon={<UserCheck />} tone="ok" />
          <Stat label="Not marked yet" value={counts.NOT_MARKED} hint={`Absent automatically at ${policyRow.autoAbsentAt}`} href={tile("NOT_MARKED")} active={f.status === "NOT_MARKED"} icon={<CircleSlash />} tone={counts.NOT_MARKED ? "warn" : "neutral"} />
          <Stat label="On leave" value={counts.LEAVE} href={tile("LEAVE")} active={f.status === "LEAVE"} icon={<CalendarOff />} tone="info" />
          <Stat label="Absent" value={counts.ABSENT} href={tile("ABSENT")} active={f.status === "ABSENT"} icon={<CalendarCheck2 />} tone={counts.ABSENT ? "danger" : "neutral"} />
          <Stat label="Late arrivals" value={counts.LATE} hint={`After ${policyRow.reportingGraceUntil}`} href={tile("LATE")} active={f.status === "LATE"} icon={<Clock4 />} tone={counts.LATE ? "warn" : "neutral"} />
          <Stat label="Staying late, not approved" value={counts.STAYING} hint={`After ${policyRow.leavingGraceUntil}: you are answerable`} href={tile("STAYING")} active={f.status === "STAYING"} icon={<MoonStar />} tone={counts.STAYING ? "danger" : "neutral"} />
          <Stat label="No time out" value={counts.NO_OUT} hint={counts.NO_OUT ? "Hours can't be counted" : `Reminder at ${policyRow.markOutReminderAt}`} href={tile("NO_OUT")} active={f.status === "NO_OUT"} icon={<LogOut />} tone={counts.NO_OUT ? "danger" : "neutral"} />
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
            <Table minWidth={1260}>
              <thead><tr>{!singleDay && <Th>Date</Th>}<Th>Team member</Th><Th>Status</Th><Th>Where</Th><Th>In</Th><Th>Out</Th><Th>Hours</Th><Th>Lunch</Th><Th>Client visits</Th><Th>Map</Th><Th>Photo</Th><Th>Notes</Th></tr></thead>
              <tbody>
                {rows.map((x) => {
                  const { key, date, employee: e, record: r, approvedLeave, missingTimeOut, lunchMinutes: lunch, lunchOver, onLunch } = x;
                  const inMap = r ? map(r.timeInLatitude, r.timeInLongitude) : null;
                  const stops = visitsBy.get(key) ?? [];
                  return (
                    <tr key={key}>
                      {!singleDay && <Td className="whitespace-nowrap text-xs">{formatDate(date)}</Td>}
                      <Td>
                        {f.employeeId ? <span className="font-medium">{e.firstName} {e.lastName}</span> : <Link href={personHref(e.id)} className="font-medium hover:underline" title="See all of this person's attendance this month">{e.firstName} {e.lastName}</Link>}
                        <div className="text-xs text-muted">{e.designation?.name}{x.schedule.site && ` · site ${hhmm(x.schedule.start)}`}</div>
                      </Td>
                      <Td>
                        {r ? <StatusBadge status={r.status} /> : approvedLeave ? <StatusBadge status="LEAVE" label={x.halfDayLeave ? "Half-day leave" : "Approved leave"} /> : <span className="text-xs text-muted">Not marked</span>}
                        {r?.autoAbsentAt && <div className="text-xs text-muted">by the ERP</div>}
                      </Td>
                      <Td className="text-xs">{r?.workLocation ? labels[r.workLocation] : "—"}{r?.workPlace && <div className="text-muted">{r.workPlace}</div>}</Td>
                      <Td>
                        {formatTime(r?.timeIn, tz)}
                        {x.isLate && <div><Badge tone={x.lateBand === "VERY_LATE" ? "danger" : "warn"}>Late {x.lateMinutes} min</Badge></div>}
                        {x.lateIntimation && <div className="text-xs text-muted">{x.lateIntimation.inAdvance ? "Informed" : "Informed late"}: {x.lateIntimation.reason}</div>}
                      </Td>
                      <Td>
                        {formatTime(r?.timeOut, tz)}
                        {x.earlyHalfDay ? <div><Badge tone="danger">½ day (early)</Badge></div> : x.leftEarly && <div><Badge tone={x.earlyApproved ? "neutral" : "warn"}>{x.earlyApproved ? "Early, permitted" : "Early, no permission"}</Badge></div>}
                        {x.stayedMinutes > 0 && <div><Badge tone={x.otApproved ? "ok" : "warn"}>{x.otApproved ? "OT" : "Late stay"} {minutesToHhmm(x.stayedMinutes)}</Badge></div>}
                        {x.stayingNow && !x.otApproved && <div><Badge tone="danger">Still in · {x.otRequested ? "OT not approved yet" : "no OT request"}</Badge></div>}
                        {missingTimeOut && <div><Badge tone="danger">No time out</Badge></div>}
                      </Td>
                      <Td>{x.workedMinutes != null ? minutesToHhmm(x.workedMinutes) : "—"}</Td>
                      <Td className="text-xs">{onLunch ? <Badge tone="info">On lunch</Badge> : lunch != null ? minutesToHhmm(lunch) : "—"}{lunchOver > 0 && <div><Badge tone="warn">+{minutesToHhmm(lunchOver)}</Badge></div>}{r?.lunchShiftedTo && <div className="text-muted">moved to {r.lunchShiftedTo}</div>}</Td>
                      <Td className="text-xs">
                        {stops.length === 0 ? "—" : (
                          <ul className="space-y-0.5">
                            {stops.map((v, i) => <li key={i}><span className="font-medium text-ink">{v.placeName}</span> <span className="text-muted">{formatTime(v.startedAt, tz)}–{v.endedAt ? formatTime(v.endedAt, tz) : "now"}</span></li>)}
                          </ul>
                        )}
                      </Td>
                      <Td>{inMap ? <a href={inMap} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline">Map</a> : r?.timeIn ? <Badge tone="danger">No map</Badge> : "—"}</Td>
                      <Td>
                        {r?.photoReview ? (
                          <div className="space-y-1">
                            <span className="flex gap-1"><Thumb fileId={r.timeInPhotoFileId} label={`${e.firstName} – time in`} size="sm" />{r.timeOutPhotoFileId && <Thumb fileId={r.timeOutPhotoFileId} label={`${e.firstName} – time out`} size="sm" />}</span>
                            <div className="text-xs text-muted">by {r.timeInProxyBy?.name ?? r.timeOutProxyBy?.name ?? "a colleague"}</div>
                            <Link href={`/app/attendance?tab=photos&show=ALL&employee=${e.id}&from=${toIsoDate(date)}&to=${toIsoDate(date)}`} className="inline-block"><ReviewBadge review={r.photoReview} /></Link>
                          </div>
                        ) : r?.timeInPhotoFileId ? <a href={`/api/files/${r.timeInPhotoFileId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-brand-700 hover:underline">View</a> : "—"}
                      </Td>
                      <Td className="max-w-48 text-xs text-muted">{r?.lateReason ?? (r?.autoAbsentAt ? "" : r?.remarks) ?? ""}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </section>
        <p className="text-xs text-muted">Attendance is system-driven: nobody marks or changes it by hand (office rule 1). Absences are marked by the ERP at the cut-off; leave approved later still counts as leave in payroll.</p>
      </div>
    );
  }

  async function Schedules() {
    const rows = await scheduleRows(ctx);
    const office = scheduleOf(policy, null);
    const officeHours = `${hhmm(office.start)}–${hhmm(office.end)}`;
    const editId = typeof sp.edit === "string" ? sp.edit : "";
    const editing = rows.find((r) => r.id === editId);
    const options = rows.map((r) => ({ value: r.id, label: nameOf(r) + (r.designation ? ` — ${r.designation.name}` : "") }));
    const inToday = rows.filter((r) => r.today?.timeIn && !r.today.timeOut && !r.today.lunchOutAt).map((r) => ({ value: r.id, label: nameOf(r) }));
    return (
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card title="Team timings" padded={false}>
          {rows.length === 0 ? <p className="p-4 text-sm text-muted">Nobody reports to you yet. Reporting is set on each employee&apos;s record (Whom to report).</p> : (
            <Table minWidth={620}>
              <thead><tr><Th>Team member</Th><Th>Works at</Th><Th>Day</Th><Th>Today&apos;s lunch</Th><Th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td className="font-medium">{nameOf(r)}<div className="text-xs font-normal text-muted">{r.designation?.name}</div></Td>
                    <Td>{r.schedule.site ? <><Badge tone="info">Client site</Badge> <span className="text-xs">{r.siteName}</span></> : <span className="text-xs">{labels.OFFICE}</span>}</Td>
                    <Td className="whitespace-nowrap text-xs">{hhmm(r.schedule.start)}–{hhmm(r.schedule.end)} · grace {hhmm(r.schedule.graceUntil)}</Td>
                    <Td className="text-xs">{r.today?.lunchShiftedTo ? `Moved to ${r.today.lunchShiftedTo}` : r.today?.timeIn ? `${policyRow.lunchStart}–${policyRow.lunchEnd}` : "—"}</Td>
                    <Td><Link href={`/app/attendance?tab=schedules&edit=${r.id}#timing`} className="text-xs font-medium text-brand-700 hover:underline">Change</Link></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Set a client-site timing">
            <p id="timing" className="mb-3 scroll-mt-24 text-xs text-muted">For team members working at a client: fix the reporting time from the client&apos;s timing and location. Their day is then 8 hours from it; grace, half-day and overtime times move with it. Office team: {officeHours}.</p>
            <ScheduleForm key={editId} action={setScheduleAction} employees={options} officeHours={officeHours}
              defaults={editing ? { employeeId: editing.id, place: editing.schedule.site ? "SITE" : "OFFICE", time: editing.siteReportingTime ?? undefined, site: editing.siteName ?? undefined } : undefined} />
          </Card>
          <Card title="Move today's lunch (urgent work)">
            <p className="mb-3 text-xs text-muted">Lunch is {policyRow.lunchStart}–{policyRow.lunchEnd}. You may shift it for urgent work; it is never more than {lunchAllowance} minutes.</p>
            {inToday.length === 0 ? <p className="text-sm text-muted">Nobody in your team is in and yet to take lunch.</p> : <LunchShiftForm action={shiftLunchAction} employees={inToday} defaultTime="14:00" />}
          </Card>
        </div>
      </div>
    );
  }

  async function Leave() {
    const decide = lead;
    const [mine, pending, used] = await Promise.all([
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
      leaveUsedThisMonth(ctx),
    ]);
    const notice = policyRow.plannedLeaveNoticeDays;
    const earliestPlanned = toIsoDate(addDays(dateOnly(today), notice));
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {ctx.employee && (
            <Card title="Request leave">
              <ul className="mb-4 space-y-1 rounded-lg border border-line bg-paper p-3 text-xs text-muted">
                <li>This month: <strong className="text-ink">{used} of {policy.numbers.paidLeavesPerMonth}</strong> leave used. One leave a month is paid when asked for before your reporting time.</li>
                <li>No leave all month adds <strong className="text-ink">{policy.numbers.noLeaveBonusDays} days</strong> to your salary.</li>
                <li>Absent without a request in the ERP counts as <strong className="text-ink">double</strong> absent.</li>
                <li>Planned leave: request it at least {notice} days ahead. Sundays and holidays inside a continuous leave count as leave (Sat + Mon makes Sunday leave too).</li>
              </ul>
              <LeaveRequestForm action={requestLeaveAction} today={today} plannedNotice={notice} earliestPlanned={earliestPlanned} />
            </Card>
          )}
          <Card title="My leave requests">
            {mine.length === 0 ? <p className="text-sm text-muted">No leave requests.</p> : (
              <ul className="divide-y divide-line text-sm">
                {mine.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{formatDate(l.fromDate)}{l.toDate.getTime() !== l.fromDate.getTime() && ` – ${formatDate(l.toDate)}`} · {humanize(l.leaveType)}{l.isHalfDay && " (half day)"}{!l.withIntimation && <> · <Badge tone="warn">without prior intimation</Badge></>}</span>
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
                {pending.map((l) => {
                  const days = noticeDays(today, toIsoDate(l.fromDate));
                  const decideBy = addDays(l.fromDate, -notice);
                  return (
                    <li key={l.id} className="rounded-md border border-line p-3 text-sm">
                      <p className="font-medium">{l.employee.firstName} {l.employee.lastName}</p>
                      <p className="text-muted">
                        {formatDate(l.fromDate)} – {formatDate(l.toDate)} · {humanize(l.leaveType)}{l.isHalfDay && " · half day"}{!l.withIntimation && " · asked after the reporting time"}
                      </p>
                      {l.leaveType === "PLANNED" && (
                        <p className={`mt-1 text-xs ${days < notice ? "text-danger" : "text-muted"}`}>Planned leave should be approved {notice} days ahead: decide by {formatDate(decideBy)}{days < notice ? " (already past)" : ""}.</p>
                      )}
                      {l.reason && <p className="mt-1">{l.reason}</p>}
                      <div className="mt-2"><LeaveDecisionForm action={decideLeaveAction.bind(null, l.id)} /></div>
                      {canDelete(ctx, "leave") && <div className="mt-2"><DeleteButton entity="leave" id={l.id} variant="ghost" label="Delete request" /></div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
      </div>
    );
  }
}
