import Link from "next/link";
import { requireCapability } from "@/lib/session";
import { formatDateTime, formatTime, minutesToHhmm, todayDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { leadOverview, orgOverview } from "@/lib/services/dashboard";
import { firmAnalytics } from "@/lib/services/analytics";
import { FirmCharts } from "../chart-sections";
import { AlarmClock, Building2, CalendarCheck2, ClipboardCheck, Clock, Flag, History, ListChecks, UserCheck, Users, Wallet } from "lucide-react";
import { Card, Stat } from "@/components/ui";
import { Deadlines, Greeting, ReviewQueue, StatutoryDue, TeamToday } from "../dashboard-sections";
import { teamToday } from "@/lib/services/team-today";
import { AiAssistant } from "./ai-assistant";

const inr = (n: number) => `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default async function AdminDashboard() {
  const ctx = await requireCapability("org.manage");
  const [o, lead, charts, myAttendance, today] = await Promise.all([
    orgOverview(ctx),
    leadOverview(ctx, "org"),
    firmAnalytics(ctx),
    ctx.employee ? prisma.attendanceRecord.findFirst({ where: { employeeId: ctx.employee.id, attendanceDate: todayDateOnly(ctx.organization.timezone) } }) : null,
    teamToday(ctx),
  ]);
  const c = o.clients as Record<string, number>;
  const section = (t: string) => <h2 className="mb-3 mt-2 font-editorial text-2xl text-ink">{t}</h2>;
  return (
    <>
      <Greeting ctx={ctx} subtitle={`${ctx.role === "OWNER" ? "Firm owner" : "Administrator"} dashboard · ${ctx.organization.tradeName}`} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><div className="min-w-60 flex-1 sm:max-w-sm"><Stat label="My attendance" value={myAttendance?.timeIn ? (myAttendance.timeOut ? "Done for today" : `In ${formatTime(myAttendance.timeIn, ctx.organization.timezone)}`) : "Not marked"} hint={myAttendance?.timeIn ? undefined : "Open to mark in"} href="/app/attendance" icon={<CalendarCheck2 />} tone={myAttendance?.timeIn ? "ok" : "warn"} /></div><AiAssistant /></div>
      {section("Needs attention")}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Clients pending approval" value={c.PENDING_APPROVAL ?? 0} href="/app/clients?status=PENDING_APPROVAL" icon={<Building2 />} tone={c.PENDING_APPROVAL ? "warn" : "neutral"} />
        <Stat label="Onboarding to approve" value={o.onboardingPending} href="/app/employees?status=pending" icon={<UserCheck />} tone={o.onboardingPending ? "warn" : "neutral"} />
        <Stat label="Overdue tasks" value={o.tasksOverdue} href="/app/tasks?scope=all&state=overdue" icon={<AlarmClock />} tone={o.tasksOverdue ? "danger" : "ok"} />
        <Stat label="Tasks awaiting review" value={o.tasksReview} href="/app/tasks?scope=review&state=all" icon={<ClipboardCheck />} tone={o.tasksReview ? "info" : "neutral"} />
      </div>
      {today && <TeamToday data={today} />}
      {section("Firm today")}
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active clients" value={c.ACTIVE ?? 0} hint={`${c.ON_HOLD ?? 0} on hold · ${c.INACTIVE ?? 0} discontinued`} href="/app/clients?status=ACTIVE" icon={<Building2 />} />
        <Stat label="Present today" value={`${o.presentToday} / ${o.employees}`} hint={`${o.leaveToday} on leave`} href="/app/attendance?tab=team" icon={<CalendarCheck2 />} />
        <Stat label="Time logged today" value={minutesToHhmm(o.timesheetMinutesToday)} hint={`${o.timesheetEntriesToday} timesheet entries`} href="/app/timesheet?tab=log" icon={<Clock />} spark={charts.hoursPerDay.map((p) => p.values[0])} />
        <Stat label="Outstanding dues" value={inr(o.duesAmount)} hint={`${o.duesCount} open`} href="/app/reports/clients" icon={<Wallet />} />
      </div>
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Open tasks" value={o.tasksOpen} href="/app/tasks?scope=all" icon={<ListChecks />} />
        <Stat label="Active allocations" value={o.activeAllocations} hint={o.clientsWithoutTeam ? `${o.clientsWithoutTeam} active ${o.clientsWithoutTeam === 1 ? "client has" : "clients have"} no team` : "Every active client has a team"} href={o.clientsWithoutTeam ? "/app/clients?status=ACTIVE&team=none" : "/app/allocations"} icon={<Users />} tone={o.clientsWithoutTeam ? "warn" : "neutral"} />
        <Stat label="Pending with clients" value={o.pendingClient} href="/app/pending?tab=daily&with=CLIENT" icon={<Flag />} />
        <Stat label="Pending with team" value={o.pendingTeam} href="/app/pending?tab=daily&with=TEAM_MEMBER" icon={<Flag />} />
      </div>
      {section("Your firm at a glance")}
      <div className="mb-8"><FirmCharts a={charts} /></div>
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-4">
        <ReviewQueue data={lead} />
        <Deadlines data={lead} />
        <StatutoryDue />
        <Card title="Recent activity" icon={<History />}>
          {o.recent.length === 0 ? <p className="text-sm text-muted">No activity yet.</p> : (
            <ol className="relative space-y-3 border-l border-line pl-4 text-sm">
              {o.recent.map((a) => (
                <li key={a.id} className="relative">
                  <span aria-hidden className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-ink/40" />
                  <span className="text-ink first-letter:uppercase">{a.action.replace(/[._]/g, " ")}</span>
                  <span className="block text-xs text-muted">{a.actor?.name ?? "System"} · {formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-4 text-xs"><Link href="/app/settings?tab=audit" className="font-medium text-muted underline-offset-2 hover:text-ink hover:underline">Full audit log →</Link></p>
        </Card>
      </div>
    </>
  );
}
