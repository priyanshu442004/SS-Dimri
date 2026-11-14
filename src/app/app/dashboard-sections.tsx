import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ArrowUpRight, CalendarCheck2, CalendarClock, ClipboardCheck, Clock, FileText, Flag, Hourglass, Inbox, ListChecks, Building2, NotebookPen, Users,
} from "lucide-react";
import { formatDate, formatDateTime, formatTime, minutesToHhmm } from "@/lib/dates";
import { formatDue, upcomingDeadlines } from "@/lib/deadlines";
import { isTaskOverdue } from "@/lib/domain/derived";
import type { AppContext } from "@/lib/session";
import type { leadOverview, myOverview } from "@/lib/services/dashboard";
import type { teamToday } from "@/lib/services/team-today";
import { EmptyArt, type EmptyKind } from "@/components/empty-art";
import { Avatar, Badge, Card, Stat, StatusBadge } from "@/components/ui";

type Lead = Awaited<ReturnType<typeof leadOverview>>;
type Mine = Awaited<ReturnType<typeof myOverview>>;

const allLink = (href: string, label = "All") => (
  <Link href={href} className="group inline-flex items-center gap-0.5 text-xs font-medium text-muted transition-colors hover:text-ink">
    {label} <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
  </Link>
);

/** Small illustrated "nothing here" line for dashboard lists. */
function Quiet({ kind = "done", children }: { kind?: EmptyKind; children: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <EmptyArt kind={kind} className="h-12 w-14 shrink-0" />
      <p className="text-sm text-muted">{children}</p>
    </div>
  );
}

export function Greeting({ ctx, subtitle }: { ctx: AppContext; subtitle: string }) {
  const name = ctx.employee?.firstName ?? ctx.user.name.split(" ")[0];
  const tz = ctx.organization.timezone;
  const now = new Date();
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(now));
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now);
  const next = upcomingDeadlines(1, now)[0];
  return (
    <div className="app-rise pub-night-grid relative mb-6 overflow-hidden rounded-2xl px-6 py-6 text-paper sm:px-8">
      <div aria-hidden className="absolute -right-16 -top-20 size-64 rounded-full bg-stamp-bright/25 blur-[80px]" />
      <div aria-hidden className="absolute -bottom-24 left-1/3 size-56 rounded-full bg-marigold/15 blur-[80px]" />
      <div className="relative flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <p className="font-mono text-xs text-paper/55">{today}</p>
          <h1 className="mt-2 font-editorial text-[2.2rem] leading-none tracking-[-0.01em] sm:text-5xl">
            {part}, <em className="text-marigold">{name}</em>
          </h1>
          <p className="mt-3 text-sm text-paper/65">{subtitle}</p>
        </div>
        {next && (
          <Link href="/app/compliances" className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-3 pr-4 transition-colors hover:bg-white/[0.1]">
            <span className="grid w-12 shrink-0 overflow-hidden rounded-lg bg-paper text-center text-ink">
              <span className="bg-stamp-bright py-0.5 font-mono text-[9px] uppercase text-white">{formatDue(next.date).split(" ")[1]}</span>
              <span className="py-1 font-editorial text-2xl leading-none">{formatDue(next.date).split(" ")[0]}</span>
            </span>
            <span className="min-w-0">
              <span className="block font-mono text-[10px] text-paper/50">NEXT STATUTORY DUE · {next.daysLeft === 0 ? "TODAY" : `IN ${next.daysLeft} D`}</span>
              <span className="block max-w-56 truncate text-sm font-medium">{next.title}</span>
              <span className="block text-xs text-paper/50">{next.form}</span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-paper/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
          </Link>
        )}
      </div>
    </div>
  );
}

/** Next standard statutory due dates (from the compliance master). */
export function StatutoryDue({ count = 5 }: { count?: number }) {
  const list = upcomingDeadlines(count);
  return (
    <Card title="Statutory due dates" icon={<CalendarClock />} actions={allLink("/app/compliances", "Calendar")}>
      <ul className="space-y-1">
        {list.map((d, i) => {
          const [day, mon] = formatDue(d.date).split(" ");
          return (
            <li key={`${d.title}-${i}`} className="flex items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-paper">
              <span className="grid w-10 shrink-0 overflow-hidden rounded-md border border-line text-center">
                <span className="bg-ink py-px font-mono text-[8px] uppercase text-paper">{mon}</span>
                <span className="py-0.5 font-editorial text-lg leading-none">{day}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{d.title}</span>
                <span className="block truncate text-xs text-muted">{d.form} · {d.department}</span>
              </span>
              <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${d.daysLeft <= 2 ? "bg-danger-bg text-danger" : d.daysLeft <= 7 ? "bg-warn-bg text-warn" : "bg-subtle text-muted"}`}>
                {d.daysLeft === 0 ? "Today" : `${d.daysLeft} d`}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted">Standard dates; extensions notified by the government are not applied.</p>
    </Card>
  );
}

export function ReviewQueue({ data }: { data: Lead }) {
  return (
    <Card title={`Awaiting review (${data.reviewQueue.length})`} icon={<ClipboardCheck />} actions={allLink("/app/tasks?scope=review&state=all")}>
      {data.reviewQueue.length === 0 ? <Quiet>Nothing waiting for your review.</Quiet> : (
        <ul className="-mx-1 space-y-0.5 text-sm">
          {data.reviewQueue.map((t) => (
            <li key={t.id}>
              <Link href={`/app/tasks/${t.id}`} className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-paper">
                <Avatar name={t.maker?.firstName ?? "?"} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{t.title}</span>
                  <span className="block truncate text-xs text-muted">{t.client?.tradeName ?? "Internal"} · maker {t.maker?.firstName ?? "—"}</span>
                </span>
                <span className="shrink-0 text-xs text-muted">{t.dueAt ? `due ${formatDate(t.dueAt)}` : ""}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Deadlines({ data }: { data: Lead }) {
  return (
    <Card title="Deadlines — next 7 days" icon={<Hourglass />}>
      {data.deadlines.length === 0 ? <Quiet kind="calendar">No deadlines this week.</Quiet> : (
        <ul className="-mx-1 space-y-0.5 text-sm">
          {data.deadlines.map((t) => (
            <li key={t.id}>
              <Link href={`/app/tasks/${t.id}`} className="flex items-center justify-between gap-2 rounded-lg px-1 py-2 transition-colors hover:bg-paper">
                <span className="min-w-0"><span className="block truncate font-medium">{t.title}</span><span className="block truncate text-xs text-muted">{t.client?.tradeName ?? "Internal"}</span></span>
                <span className="flex shrink-0 items-center gap-1">{t.isAsap && <Badge tone="danger">ASAP</Badge>}{isTaskOverdue(t) ? <StatusBadge status="OVERDUE" /> : <span className="text-xs text-muted">{formatDateTime(t.dueAt)}</span>}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function Workload({ data, title }: { data: Lead; title: string }) {
  const max = Math.max(1, ...data.workload.map((e) => e._count.taskAssignments));
  return (
    <Card title={title} icon={<Users />} padded={false}>
      {data.workload.length === 0 ? <div className="p-4"><Quiet kind="people">No team members yet. Set “Whom to report” on employee profiles.</Quiet></div> : (
        <ul className="divide-y divide-line text-sm">
          {data.workload.map((e, i) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-paper">
              <Avatar name={`${e.firstName} ${e.lastName ?? ""}`} size="sm" />
              <span className="min-w-0 flex-1 truncate">{e.firstName} {e.lastName}</span>
              <span aria-hidden className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-subtle sm:block">
                <span className="chart-hbar block h-full rounded-full bg-[var(--color-series-7)]" style={{ width: `${(e._count.taskAssignments / max) * 100}%`, "--i": i } as CSSProperties} />
              </span>
              <span className="flex gap-3 text-xs text-muted">
                <span><strong className="text-ink">{e._count.taskAssignments}</strong> open tasks</span>
                <span><strong className="text-ink">{e._count.teamAllocations}</strong> clients</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function DayReportsReceived({ data }: { data: Lead }) {
  return (
    <Card title="Day reports to read" icon={<Inbox />} actions={allLink("/app/day-reports?tab=received")}>
      {data.dayReports.length === 0 ? <Quiet>All caught up.</Quiet> : (
        <ul className="-mx-1 space-y-0.5 text-sm">
          {data.dayReports.map((r) => (
            <li key={r.id}>
              <Link href={`/app/day-reports/${r.id}`} className="flex items-center gap-3 rounded-lg px-1 py-1.5 transition-colors hover:bg-paper">
                <Avatar name={r.reportingEmployee.firstName} size="sm" />
                <span className="flex-1 font-medium">{r.reportingEmployee.firstName}</span>
                <span className="text-xs text-muted">{formatDate(r.reportDate)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function LeadStats({ data }: { data: Lead }) {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Awaiting my review" value={data.reviewQueue.length} href="/app/tasks?scope=review&state=all" icon={<ClipboardCheck />} tone={data.reviewQueue.length ? "info" : "neutral"} />
      <Stat label="Timesheet entries to review" value={data.timesheetToReview} href="/app/timesheet?tab=pending" icon={<Clock />} tone={data.timesheetToReview ? "info" : "neutral"} />
      <Stat label="Blocked on client" value={data.pendingClient} href="/app/pending?tab=daily&with=CLIENT" icon={<Flag />} tone={data.pendingClient ? "warn" : "neutral"} />
      <Stat label="Pending with team" value={data.pendingTeam} href="/app/pending?tab=daily&with=TEAM_MEMBER" icon={<Users />} tone={data.pendingTeam ? "warn" : "neutral"} />
    </div>
  );
}

const QUICK = [
  { href: "/app/attendance", label: "Attendance", hint: "Mark in / out with your location", icon: CalendarCheck2, tone: "#dcece2" },
  { href: "/app/timesheet?tab=plan", label: "Plan & EOD report", hint: "Morning plan, then the day's EOD", icon: NotebookPen, tone: "#fbeccb" },
  { href: "/app/attendance?tab=requests", label: "Inform my Team Lead", hint: "Late, can't come, leave early, overtime", icon: Hourglass, tone: "#dde7f3" },
  { href: "/app/tasks/new", label: "New task", hint: "Type it or record a voice note", icon: ListChecks, tone: "#f3e3dd" },
];

/** A Team Lead's (or the firm's) day under the office rules: each tile opens the list to act on. */
export function TeamToday({ data }: { data: NonNullable<Awaited<ReturnType<typeof teamToday>>> }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 font-editorial text-2xl">{data.firmWide ? "Firm today" : "My team today"} <span className="font-sans text-sm text-muted">· office rules</span></h2>
      {(data.escalate > 0 || data.staying > 0) && (
        <div className="mb-3 space-y-2">
          {data.escalate > 0 && <Link href="/app/timesheet?tab=team-plans" className="block rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger hover:underline"><strong>{data.escalate} EOD report{data.escalate === 1 ? "" : "s"} not filed</strong> — escalate today, or a ₹{data.leadPenalty} fine applies to the Team Lead.</Link>}
          {data.staying > 0 && <Link href="/app/attendance?tab=team&status=STAYING" className="block rounded-xl border border-marigold/40 bg-warn-bg px-4 py-3 text-sm text-warn hover:underline"><strong>{data.staying} still in</strong> after office hours without approved overtime — you are answerable for team members working late.</Link>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="In today" value={`${data.present} / ${data.team}`} hint={data.off ? "Sunday / holiday" : `${data.onLeave} on leave`} href="/app/attendance?tab=team" icon={<CalendarCheck2 />} tone="ok" />
        <Stat label="Not in yet" value={data.notIn} hint={`Absent automatically at ${data.absentAt}`} href="/app/attendance?tab=team&status=NOT_MARKED" icon={<Clock />} tone={data.notIn ? "warn" : "neutral"} />
        <Stat label="Late today" value={data.late} hint={data.absent ? `${data.absent} absent` : undefined} href="/app/attendance?tab=team&status=LATE" icon={<Hourglass />} tone={data.late ? "warn" : "neutral"} />
        <Stat label="Morning plans missing" value={data.noPlan} hint={data.planDue ? `Due by ${data.morningPlanBy}` : `Due by ${data.morningPlanBy} (not yet)`} href="/app/timesheet?tab=team-plans" icon={<NotebookPen />} tone={data.noPlan && data.planDue ? "danger" : "neutral"} />
        <Stat label="Plans to approve" value={data.plansToApprove} href="/app/timesheet?tab=team-plans" icon={<ClipboardCheck />} tone={data.plansToApprove ? "info" : "neutral"} />
        <Stat label="Overtime / early-leave requests" value={data.requests} href="/app/attendance?tab=requests" icon={<Inbox />} tone={data.requests ? "info" : "neutral"} />
        <Stat label="Leave requests" value={data.leaveWaiting} href="/app/attendance?tab=leave" icon={<CalendarClock />} tone={data.leaveWaiting ? "info" : "neutral"} />
        <Stat label="EOD to escalate" value={data.escalate} href="/app/timesheet?tab=team-plans" icon={<Flag />} tone={data.escalate ? "danger" : "ok"} />
      </div>
    </section>
  );
}

export function MyDay({ ctx, data, withDue }: { ctx: AppContext; data: Mine; withDue?: boolean }) {
  const tz = ctx.organization.timezone;
  const marked = !!data.attendance?.timeIn;
  const absentByErp = data.attendance?.status === "ABSENT" && !marked;
  const plan = data.plan?.today;
  const prev = data.plan?.previous;
  return (
    <>
      {(data.rulesPending || prev) && (
        <div className="mb-4 space-y-2">
          {prev && (
            <Link href={`/app/timesheet?tab=plan&date=${prev.iso}`} className="block rounded-xl border border-danger/30 bg-danger-bg px-4 py-3 text-sm text-danger hover:underline">
              {prev.view.state === "MISSED"
                ? <>Your EOD report for {formatDate(new Date(`${prev.iso}T00:00:00Z`))} was not filed in time (₹{data.eodPenalty} fine). File it now so your Team Lead has the record.</>
                : <><strong>EOD report for {formatDate(new Date(`${prev.iso}T00:00:00Z`))} still due</strong> — file it before {formatDateTime(prev.view.deadlines.fileBy, tz)} to avoid a ₹{data.eodPenalty} fine.</>}
            </Link>
          )}
          {data.rulesPending && <Link href="/app/rules" className="block rounded-xl border border-info/30 bg-info-bg px-4 py-3 text-sm text-info hover:underline">Please read and accept the <strong>Leave, Timing and Office Decorum rules</strong>.</Link>}
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Attendance today" value={absentByErp ? "Absent" : marked ? (data.attendance!.timeOut ? "Done" : `In ${formatTime(data.attendance!.timeIn, tz)}`) : "Not marked"} hint={absentByErp ? "Marked by the ERP" : marked ? undefined : "Mark in with your location"} href="/app/attendance" icon={<CalendarCheck2 />} tone={absentByErp ? "danger" : marked ? "ok" : "warn"} />
        {plan ? (
          <Stat label={`Morning plan (by ${data.morningPlanBy})`} value={plan.plan?.planSubmittedAt ? (plan.plan.approvedAt ? "Approved" : "Sent") : "Not sent"} hint={plan.plan?.planSubmittedAt ? (plan.planLate ? "Sent late" : `at ${formatTime(plan.plan.planSubmittedAt, tz)}`) : "Enter today's tasks"} href="/app/timesheet?tab=plan" icon={<NotebookPen />} tone={plan.plan?.planSubmittedAt ? (plan.planLate ? "warn" : "ok") : new Date() > plan.planDueBy ? "danger" : "warn"} />
        ) : (
          <Stat label="Time logged today" value={minutesToHhmm(data.timesheetMinutes)} hint={`${data.timesheetEntries} entries`} href="/app/timesheet?tab=daily" icon={<Clock />} />
        )}
        {plan ? (
          <Stat label="EOD report today" value={plan.plan?.eodSubmittedAt ? "Filed" : "Due"} hint={plan.plan?.eodSubmittedAt ? undefined : `By ${formatDateTime(plan.deadlines.fileBy, tz)}`} href="/app/timesheet?tab=plan" icon={<FileText />} tone={plan.plan?.eodSubmittedAt ? "ok" : "neutral"} />
        ) : (
          <Stat label="Day report" value={data.dayReport ? data.dayReport.status.charAt(0) + data.dayReport.status.slice(1).toLowerCase() : "Not started"} href="/app/day-reports" icon={<FileText />} tone={data.dayReport ? "ok" : "neutral"} />
        )}
        <Stat label="My pending items" value={data.pending} href="/app/pending" icon={<Flag />} tone={data.pending ? "warn" : "neutral"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title="My tasks" icon={<ListChecks />} actions={allLink("/app/tasks?scope=mine", "All tasks")}>
          {data.tasks.length === 0 ? <Quiet kind="tasks">No open tasks assigned to you.</Quiet> : (
            <ul className="-mx-1 space-y-0.5 text-sm">
              {data.tasks.map((t) => (
                <li key={t.id}>
                  <Link href={`/app/tasks/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-1 py-2 transition-colors hover:bg-paper">
                    <span className="min-w-0"><span className="block font-medium text-ink">{t.title}</span><span className="block text-xs text-muted">{t.client?.tradeName ?? "Internal"}{t.dueAt && ` · due ${formatDateTime(t.dueAt)}`}</span></span>
                    <span className="flex items-center gap-1">{t.isAsap && <Badge tone="danger">ASAP</Badge>}{isTaskOverdue(t) && <StatusBadge status="OVERDUE" />}<StatusBadge status={t.status} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Quick actions">
            <div className="grid gap-2">
              {QUICK.map((q) => (
                <Link key={q.href} href={q.href} data-ripple className="group flex items-center gap-3 rounded-xl border border-line p-2.5 transition-[border-color,box-shadow,translate] duration-300 hover:-translate-y-0.5 hover:border-ink/25 hover:shadow-[0_12px_24px_-20px_rgb(15_29_51/.6)] active:translate-y-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg text-ink" style={{ background: q.tone }}><q.icon className="size-4 transition-transform duration-300 group-hover:scale-110" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{q.label}</span>
                    <span className="block text-xs text-muted">{q.hint}</span>
                  </span>
                  <ArrowUpRight className="size-4 text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
                </Link>
              ))}
            </div>
          </Card>
          <Card title="My clients" icon={<Building2 />}>
            {data.allocations.length === 0 ? <Quiet kind="clients">No current allocations.</Quiet> : (
              <ul className="-mx-1 space-y-0.5 text-sm">
                {data.allocations.map((a) => (
                  <li key={a.id}>
                    <Link href={`/app/clients/${a.client.id}`} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-paper">
                      <Avatar name={a.client.tradeName} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{a.client.tradeName}</span>
                        <span className="block truncate text-xs text-muted">{a.schedule}</span>
                      </span>
                      {a.today ? <Badge tone="ok">Today</Badge> : a.tomorrow ? <Badge tone="info">Tomorrow</Badge> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {withDue && <StatutoryDue count={4} />}
        </div>
      </div>
    </>
  );
}
