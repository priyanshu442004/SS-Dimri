import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { addDays, dateOnly, formatDate, formatDateTime, isoDateInTz, minutesToHhmm, toIsoDate } from "@/lib/dates";
import { assessmentYears, isLateReview, isLateSubmission, OVERDUE_HOURS, slaOf, type Sla } from "@/lib/domain/timesheet";
import { timesheetExportHref, timesheetReviewers } from "@/lib/services/timesheet-report";
import { DeleteButton } from "@/components/delete-dialog";
import { canDelete } from "@/lib/services/deletions";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { taskScope } from "@/lib/services/tasks";
import { ActionButton } from "@/components/action-button";
import { BarList, ChartCard } from "@/components/charts";
import { Badge, Card, DownloadButton, EmptyState, PageHeader, Stat, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { addTimesheetAction, deleteTimesheetAction, reviewTimesheetAction } from "../worklog-actions";
import { ReviewForm, TimesheetForm } from "../worklog-forms";
import { myOpenLines, pendingPointsFor } from "@/lib/services/tracker";
import { dueStateOf, STATUS_OF_WORK_LABEL, timelineFlagOf, workStatusOf } from "@/lib/domain/tracker";
import { ClientPendingReportTab, DayReportTab, FlagBadge, MyPendingTab, TrackerDashboardTab, TrackerTab, WorkStatusBadge } from "./sections";
import { CircleAlert, Clock, IndianRupee, ListChecks, TimerReset, Users } from "lucide-react";
import { MyPlanTab, TeamPlansTab } from "./plan-tabs";
import { getPolicy, plansApplyTo, reporteeIds } from "@/lib/services/office-rules";
import { finesForMonth } from "@/lib/services/daily-plans";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

function SlaBadge({ sla }: { sla: Sla }) {
  return sla === "OVERDUE" ? <Badge tone="danger">Escalated – overdue</Badge>
    : sla === "DUE_SOON" ? <Badge tone="warn">Due soon</Badge>
    : sla === "REVIEWED" ? <Badge tone="neutral">Reviewed</Badge>
    : <Badge tone="ok">Within window</Badge>;
}
const REVIEW_LABEL: Record<string, string> = { SUBMITTED: "Pending", REVIEWED: "Checked – OK", RETURNED: "Checked – Needs correction", DRAFT: "Draft" };
const inr = (n: number) => `₹ ${n.toLocaleString("en-IN")}`;
const nameOf = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();

export default async function TimesheetPage({ searchParams }: PageProps<"/app/timesheet">) {
  const ctx = await requireCapability("timesheet.fill_own");
  const sp = await searchParams;
  const viewAll = can(ctx, "timesheet.view_all");
  const canReview = can(ctx, "timesheet.review");
  const tz = ctx.organization.timezone;
  const today = isoDateInTz(new Date(), tz);
  const date = typeof sp.date === "string" && ISO.test(sp.date) ? sp.date : today;
  const employeeId = typeof sp.employee === "string" && UUID.test(sp.employee) ? sp.employee : "";
  const clientId = typeof sp.client === "string" && UUID.test(sp.client) ? sp.client : "";

  // Admin, Manager and Senior see the Accounting Workflow Tracker; everyone else the Team Daily Work Log.
  // Office rules (14 Nov 2026): everyone who fills the timesheet sends a morning plan and files the EOD
  // report ("plan"); a Team Lead (anyone others report to, and administrators) sees "team-plans" first.
  // Older tab names are kept so existing links still work.
  const ownPlan = plansApplyTo(ctx);
  const teamLead = can(ctx, "org.manage") || (await reporteeIds(ctx)).length > 0;
  const LEAD_TABS = ["tracker", "dashboard", "report", "log", "hours", "reviews", "daily", "day", "mine", "plan", "team-plans"];
  const STAFF_TABS = ["plan", "daily", "day", "mine", ...(teamLead ? ["team-plans"] : [])];
  const legacy: Record<string, string> = { collective: "log", pending: "reviews" };
  const requested = typeof sp.tab === "string" ? (legacy[sp.tab] ?? sp.tab) : "";
  const tab = viewAll
    ? (LEAD_TABS.includes(requested) && (ctx.employee || !["daily", "day", "mine", "plan"].includes(requested)) && (requested !== "team-plans" || teamLead) ? requested : teamLead ? "team-plans" : "tracker")
    : (STAFF_TABS.includes(requested) ? requested : ownPlan ? "plan" : "daily");

  return (
    <>
      <PageHeader icon={<Clock />}
        title="Timesheet"
        description={tab === "plan" ? "Your morning plan (by 10:30) and your EOD report — the timesheet the office rules ask for every working day." : tab === "team-plans" ? "Your team's morning plans and EOD reports: approve or edit plans, and escalate a missing EOD the next day." : viewAll ? "Accounting Workflow Tracker: work given to the team, what they log against it, and what is pending with clients." : "Your Team Daily Work Log: record each piece of work, your day report and what is pending."}
        actions={viewAll && (tab === "log" || tab === "hours") && <DownloadButton href={timesheetExportHref({ from: typeof sp.from === "string" ? sp.from : undefined, to: typeof sp.to === "string" ? sp.to : undefined, date, employeeId, clientId, tab: tab === "hours" ? "dashboard" : "tracker" })}>Export to Excel</DownloadButton>}
      />
      <TabNav
        current={tab === "reviews" ? "log" : tab}
        tabs={viewAll ? [
          ...(teamLead ? [{ key: "team-plans", label: "Team plans & EOD", href: "/app/timesheet?tab=team-plans" }] : []),
          ...(ownPlan ? [{ key: "plan", label: "My plan & EOD", href: "/app/timesheet?tab=plan" }] : []),
          { key: "tracker", label: "Tracker", href: "/app/timesheet?tab=tracker" },
          { key: "dashboard", label: "Dashboard", href: "/app/timesheet?tab=dashboard" },
          { key: "report", label: "Client Pending Report", href: "/app/timesheet?tab=report" },
          { key: "log", label: "Team daily log", href: "/app/timesheet?tab=log" },
          { key: "hours", label: "Hours & reviews", href: "/app/timesheet?tab=hours" },
          ...(ctx.employee ? [{ key: "daily", label: "My daily log", href: `/app/timesheet?tab=daily&date=${date}` }] : []),
        ] : [
          ...(ownPlan ? [{ key: "plan", label: "Plan & EOD report", href: "/app/timesheet?tab=plan" }] : []),
          ...(teamLead ? [{ key: "team-plans", label: "Team plans & EOD", href: "/app/timesheet?tab=team-plans" }] : []),
          { key: "daily", label: "Daily Log", href: `/app/timesheet?tab=daily&date=${date}` },
          { key: "day", label: "Day Report", href: `/app/timesheet?tab=day&date=${date}` },
          { key: "mine", label: "Pending Tracker", href: "/app/timesheet?tab=mine" },
        ]}
      />
      {tab === "plan" && <MyPlanTab ctx={ctx} sp={sp} />}
      {tab === "team-plans" && <TeamPlansTab ctx={ctx} sp={sp} />}
      {tab === "daily" && <Daily />}
      {tab === "day" && <DayReportTab ctx={ctx} sp={sp} viewAll={viewAll} />}
      {tab === "mine" && <MyPendingTab ctx={ctx} sp={sp} viewAll={viewAll} />}
      {tab === "tracker" && <TrackerTab ctx={ctx} sp={sp} />}
      {tab === "dashboard" && <TrackerDashboardTab ctx={ctx} />}
      {tab === "report" && <ClientPendingReportTab ctx={ctx} sp={sp} />}
      {tab === "log" && <Tracker />}
      {tab === "reviews" && <Pending />}
      {tab === "hours" && <Dashboard />}
    </>
  );

  async function Daily() {
    if (!ctx.employee) return <EmptyState kind="people" title="No staff record">Your login is not linked to an employee.</EmptyState>;
    const todayDate = dateOnly(today);
    const [entries, clients, workTypes, tasks, lines, points] = await Promise.all([
      prisma.timesheetEntry.findMany({ where: { employeeId: ctx.employee.id, workDate: dateOnly(date) }, orderBy: { serialNumber: "asc" }, include: { task: { select: { id: true, title: true } }, trackerLine: { select: { refNo: true } } } }),
      activeClientOptions(ctx.organization.id),
      prisma.workType.findMany({ where: { organizationId: ctx.organization.id, isActive: true }, orderBy: { sortOrder: "asc" } }),
      prisma.task.findMany({ where: { AND: [taskScope(ctx), { status: { notIn: ["COMPLETED", "CANCELLED"] } }] }, select: { id: true, title: true }, take: 100 }),
      myOpenLines(ctx),
      pendingPointsFor(ctx.organization.id, ctx.employee.id),
    ]);
    const total = entries.reduce((s, e) => s + (e.approxMinutes ?? 0), 0);
    const overdue = (xs: { dueBy: Date | null; status: string }[]) => xs.filter((p) => dueStateOf(p.dueBy, p.status, todayDate) === "OVERDUE").length;
    const dayHref = (d: string) => `/app/timesheet?tab=daily&date=${d}`;
    // "Log work on this" from the work given in the tracker fills the form with the line's columns.
    const ref = typeof sp.ref === "string" ? lines.find((l) => l.id === sp.ref) : undefined;
    const wt = ref ? workTypes.find((w) => w.name.toLowerCase() === ref.typeOfWork.toLowerCase()) : undefined;
    const iso = (x: Date | null) => (x ? toIsoDate(x) : "");
    const prefill: Record<string, string> = ref ? {
      trackerLineId: ref.id, branch: ref.branch ?? "", clientId: ref.clientId ?? "", clientNameText: ref.clientId ? "" : ref.clientName, workTypeId: wt?.id ?? "",
      bankName: ref.bankName ?? "", periodFrom: iso(ref.periodFrom), periodTo: iso(ref.periodTo),
      clientPendingItem: ref.clientPendingItem ?? "", clientRaisedOn: iso(ref.clientRaisedOn), clientDueBy: iso(ref.clientDueBy), clientPendingStatus: ref.clientPendingStatus ?? "",
      teamPendingItem: ref.teamPendingItem ?? "", teamRaisedOn: iso(ref.teamRaisedOn), teamDueBy: iso(ref.teamDueBy), teamPendingStatus: ref.teamPendingStatus ?? "",
    } : {};
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={dayHref(toIsoDate(addDays(dateOnly(date), -1)))} className="rounded border border-line px-2 py-1 hover:bg-subtle">← Previous day</Link>
          <strong>{formatDate(dateOnly(date))}</strong>
          {date !== today && <Link href={dayHref(toIsoDate(addDays(dateOnly(date), 1)))} className="rounded border border-line px-2 py-1 hover:bg-subtle">Next day →</Link>}
          {viewAll && <span className="ml-auto flex gap-2"><Link href={`/app/timesheet?tab=day&date=${date}`} className="text-brand-700 hover:underline">My day report</Link><Link href="/app/timesheet?tab=mine" className="text-brand-700 hover:underline">My pending tracker</Link></span>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Total hours" value={minutesToHhmm(total)} />
          <Stat label="Total entries" value={entries.length} />
          <Stat label="Open with CLIENT" value={points.client.length} tone={points.client.length ? "warn" : "neutral"} href="/app/timesheet?tab=mine" />
          <Stat label="Open with ME" value={points.team.length} tone={points.team.length ? "info" : "neutral"} href="/app/timesheet?tab=mine" />
          <Stat label="OVERDUE with CLIENT" value={overdue(points.client)} tone={overdue(points.client) ? "danger" : "neutral"} />
          <Stat label="OVERDUE with ME" value={overdue(points.team)} tone={overdue(points.team) ? "danger" : "neutral"} />
        </div>
        {lines.length > 0 && (
          <Card title={`Work given to you in the tracker (${lines.length})`} padded={false}>
            <Table minWidth={900}>
              <thead><tr><Th>Ref No.</Th><Th>Client</Th><Th>Type of work</Th><Th>Period</Th><Th>Priority</Th><Th>Work status</Th><Th>Timeline</Th><Th /></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <Td className="font-mono text-xs font-medium">{l.refNo}</Td>
                    <Td className="font-medium">{l.clientName}{l.branch && <span className="text-xs font-normal text-muted"> · {l.branch}</span>}</Td>
                    <Td>{l.typeOfWork}{l.bankName && <div className="text-xs text-muted">{l.bankName}</div>}</Td>
                    <Td className="whitespace-nowrap text-xs">{l.periodFrom ? `${formatDate(l.periodFrom)} – ${l.periodTo ? formatDate(l.periodTo) : "Onwards"}` : "—"}</Td>
                    <Td className="text-xs">{l.priority ?? "—"}</Td>
                    <Td><WorkStatusBadge s={workStatusOf(l)} /></Td>
                    <Td><FlagBadge f={timelineFlagOf(l, todayDate)} /></Td>
                    <Td><Link href={`/app/timesheet?tab=daily&date=${date}&ref=${l.id}#log-form`} className="whitespace-nowrap text-sm font-medium text-brand-700 hover:underline">Log work on this</Link></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
        {entries.length > 0 && (
          <Table minWidth={1500}>
            <thead><tr><Th>Sr. No.</Th><Th>Client Name</Th><Th>Branch</Th><Th>Tracker Ref No.</Th><Th>Place of Work</Th><Th>Type of Work</Th><Th>Bank Name</Th><Th>Period</Th><Th>Txns</Th><Th>Time</Th><Th>Elaboration / Details</Th><Th>Status of Work</Th><Th>Issue</Th><Th>Pending – client / team</Th><Th>Review</Th><Th /></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <Td><Link href={`/app/timesheet/${e.id}`} className="font-medium text-brand-700 hover:underline" aria-label={`Open entry ${e.serialNumber}`}>#{e.serialNumber}</Link></Td>
                  <Td>{e.clientNameText ?? "—"}</Td>
                  <Td className="text-xs">{e.branch ?? "—"}</Td>
                  <Td className="font-mono text-xs">{e.trackerLine?.refNo ?? "—"}</Td>
                  <Td className="text-xs">{e.placeOfWork ?? "—"}</Td>
                  <Td>{e.typeOfWork ?? "—"}</Td>
                  <Td className="text-xs">{e.bankName ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-xs">{e.periodFrom ? `${formatDate(e.periodFrom)} – ${formatDate(e.periodTo)}` : "—"}</Td>
                  <Td className="text-xs">{e.transactionCount ?? "—"}</Td>
                  <Td>{e.approxMinutes ? minutesToHhmm(e.approxMinutes) : "—"}</Td>
                  <Td className="max-w-xs text-xs">{e.workDetails}{e.task && <div><Link href={`/app/tasks/${e.task.id}`} className="text-brand-700 hover:underline">{e.task.title}</Link></div>}</Td>
                  <Td className="text-xs">{e.workStatus ? STATUS_OF_WORK_LABEL[e.workStatus] : "—"}</Td>
                  <Td className="max-w-40 text-xs">{e.issueLevel ? <><Badge tone={e.issueLevel === "High" || e.issueLevel === "Critical" ? "danger" : "warn"}>{e.issueLevel}</Badge> {e.issueStatus}</> : "—"}{e.issueDetails && <div className="text-muted">{e.issueDetails}</div>}</Td>
                  <Td className="max-w-56 text-xs">
                    {e.clientPendingItem && <div><Badge tone="warn">Client · {e.clientPendingStatus ?? "Open"}</Badge> {e.clientPendingItem}</div>}
                    {e.teamPendingItem && <div className="mt-1"><Badge tone="info">Team · {e.teamPendingStatus ?? "Open"}</Badge> {e.teamPendingItem}</div>}
                    {!e.clientPendingItem && !e.teamPendingItem && "—"}
                  </Td>
                  <Td><StatusBadge status={e.status} label={REVIEW_LABEL[e.status]} /></Td>
                  <Td>{e.status !== "REVIEWED" && <ActionButton variant="ghost" confirm="Remove this entry?" action={deleteTimesheetAction.bind(null, e.id)}>Remove</ActionButton>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <div id="log-form" className="scroll-mt-6">
          <Card title={ref ? `Log work on ${ref.refNo} · ${ref.clientName}` : "Add work entry"}>
            <TimesheetForm
              key={ref?.id ?? "new"}
              action={addTimesheetAction}
              clients={clients}
              workTypes={workTypes.map((w) => ({ value: w.id, label: w.name }))}
              tasks={tasks.map((t) => ({ value: t.id, label: t.title }))}
              lines={lines.map((l) => ({ value: l.id, label: `${l.refNo} · ${l.clientName} · ${l.typeOfWork}` }))}
              date={date}
              years={assessmentYears(dateOnly(today))}
              prefill={prefill}
            />
          </Card>
        </div>
      </div>
    );
  }

  /** Filter bar shared by the team views: period and team member. */
  function Filters({ tabKey, from, to, withPeriod = true }: { tabKey: string; from?: string; to?: string; withPeriod?: boolean }) {
    return (
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value={tabKey} />
        {withPeriod && (
          <>
            <label className="text-sm"><span className="mb-1 block font-medium">From</span><input type="date" name="from" defaultValue={from} className="h-10 rounded-md border border-line bg-surface px-2 text-sm" /></label>
            <label className="text-sm"><span className="mb-1 block font-medium">To</span><input type="date" name="to" defaultValue={to} className="h-10 rounded-md border border-line bg-surface px-2 text-sm" /></label>
          </>
        )}
        <TeamMemberSelect />
        <ClientSelect />
        <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show</button>
      </form>
    );
  }

  async function TeamMemberSelect() {
    const employees = await employeeOptions(ctx.organization.id);
    return (
      <label className="text-sm"><span className="mb-1 block font-medium">Team member</span>
        <select name="employee" defaultValue={employeeId} className="h-10 rounded-md border border-line bg-surface px-2 text-sm">
          <option value="">Everyone</option>
          {employees.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
      </label>
    );
  }

  async function ClientSelect() {
    const clients = await activeClientOptions(ctx.organization.id);
    return (
      <label className="text-sm"><span className="mb-1 block font-medium">Client</span>
        <select name="client" defaultValue={clientId} className="h-10 max-w-48 rounded-md border border-line bg-surface px-2 text-sm">
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
    );
  }

  /** Tracker: every entry the team logged in the period, with review. */
  async function Tracker() {
    const from = typeof sp.from === "string" && ISO.test(sp.from) ? sp.from : date;
    const to = typeof sp.to === "string" && ISO.test(sp.to) ? sp.to : date;
    const where: Prisma.TimesheetEntryWhereInput = {
      organizationId: ctx.organization.id,
      workDate: { gte: dateOnly(from), lte: dateOnly(to) },
      ...(employeeId ? { employeeId } : {}),
      ...(clientId ? { clientId } : {}),
    };
    const entries = await prisma.timesheetEntry.findMany({
      where,
      orderBy: [{ workDate: "desc" }, { employee: { firstName: "asc" } }, { serialNumber: "asc" }],
      take: 500,
      include: {
        employee: { select: { firstName: true, lastName: true } },
        reviewedBy: { select: { name: true } },
      },
    });
    const now = new Date();
    const reviewers = await timesheetReviewers(ctx.organization.id, entries);
    const penalty = (await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { timesheetPenaltyRupees: true } })).timesheetPenaltyRupees;
    const mayDelete = canDelete(ctx, "timesheet");
    const totals = new Map<string, number>();
    for (const e of entries) totals.set(nameOf(e.employee), (totals.get(nameOf(e.employee)) ?? 0) + (e.approxMinutes ?? 0));
    return (
      <div className="space-y-4">
        <Filters tabKey="log" from={from} to={to} />
        {totals.size > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {[...totals.entries()].map(([n, m]) => <Badge key={n} tone="brand">{n}: {minutesToHhmm(m)}</Badge>)}
          </div>
        )}
        {entries.length === 0 ? <EmptyState kind="calendar" title="No entries for this period" /> : (
          <ReviewForm action={reviewTimesheetAction}>
            <Table minWidth={1720}>
              <thead><tr>{canReview && <Th><span className="sr-only">Select</span></Th>}<Th>Date</Th><Th>Team member</Th><Th>Client</Th><Th>Resource type</Th><Th>Nature of work</Th><Th>AY</Th><Th>Location</Th><Th>Period</Th><Th>Start – end</Th><Th>Hours</Th><Th>Description</Th><Th>Submitted on</Th><Th>Reviewer (auto)</Th><Th>Review status</Th><Th>Reviewed by</Th><Th>SLA</Th><Th>Escalate to</Th><Th>Logged after the day</Th><Th>Late review</Th>{mayDelete && <Th />}</tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    {canReview && <Td>{e.status === "SUBMITTED" && <input type="checkbox" name="entryIds[]" value={e.id} aria-label="Select entry" className="accent-brand-700" />}</Td>}
                    <Td className="whitespace-nowrap"><Link href={`/app/timesheet/${e.id}`} className="font-medium text-brand-700 hover:underline">{formatDate(e.workDate)}</Link></Td>
                    <Td>{nameOf(e.employee)}</Td>
                    <Td>{e.clientNameText ?? "—"}</Td>
                    <Td className="text-xs">{e.resourceType ?? "—"}</Td>
                    <Td>{e.typeOfWork ?? "—"}{e.bankName && <div className="text-xs text-muted">{e.bankName}</div>}</Td>
                    <Td className="whitespace-nowrap text-xs">{e.assessmentYear ?? "—"}</Td>
                    <Td className="text-xs">{e.placeOfWork ?? "—"}</Td>
                    <Td className="text-xs">{e.periodFrom ? `${formatDate(e.periodFrom)} – ${formatDate(e.periodTo)}` : "—"}</Td>
                    <Td className="whitespace-nowrap text-xs">{e.startTime && e.endTime ? `${e.startTime} – ${e.endTime}` : "—"}</Td>
                    <Td>{e.approxMinutes ? minutesToHhmm(e.approxMinutes) : "—"}</Td>
                    <Td className="max-w-xs text-xs">{e.workDetails}{e.whatsappMessage && <div className="text-muted">WhatsApp: {e.whatsappMessage}</div>}{e.reviewNote && <div className="text-muted">Reviewer: {e.reviewNote}</div>}</Td>
                    <Td className="whitespace-nowrap text-xs">{formatDateTime(e.createdAt, tz)}</Td>
                    <Td className="text-xs">{reviewers.get(e.id)?.reviewer ?? "Not mapped"}</Td>
                    <Td><StatusBadge status={e.status} label={REVIEW_LABEL[e.status]} />{e.workStatus && <div className="mt-1"><StatusBadge status={e.workStatus} /></div>}</Td>
                    <Td className="text-xs">{e.reviewedBy ? <>{e.reviewedBy.name}<div className="text-muted">{e.reviewedAt ? formatDateTime(e.reviewedAt, tz) : ""}</div></> : "—"}</Td>
                    <Td><SlaBadge sla={slaOf({ submittedAt: e.createdAt, status: e.status }, now)} /></Td>
                    <Td className="text-xs">{reviewers.get(e.id)?.escalateTo ?? "Not mapped"}</Td>
                    <Td className="text-xs">{isLateSubmission(isoDateInTz(e.createdAt, tz), toIsoDate(e.workDate)) ? <Badge tone="warn">Yes</Badge> : "—"}</Td>
                    <Td className="text-xs">{isLateReview({ submittedAt: e.createdAt, reviewedAt: e.reviewedAt, status: e.status }, now) ? <Badge tone="danger">{inr(penalty)}</Badge> : "—"}</Td>
                    {mayDelete && <Td><DeleteButton entity="timesheet" id={e.id} variant="ghost" /></Td>}
                  </tr>
                ))}
              </tbody>
            </Table>
          </ReviewForm>
        )}
      </div>
    );
  }

  /** Pending: entries waiting for review (with the 24 h / 36 h window) and entries returned for correction. */
  async function Pending() {
    const now = new Date();
    const [open, workPending] = await Promise.all([
      prisma.timesheetEntry.findMany({
        where: { organizationId: ctx.organization.id, status: { in: ["SUBMITTED", "RETURNED"] }, ...(employeeId ? { employeeId } : {}) },
        orderBy: { createdAt: "asc" },
        take: 500,
        include: { employee: { select: { id: true, firstName: true, lastName: true } } },
      }),
      // Work the team member marked as not finished, over the last 30 days.
      prisma.timesheetEntry.groupBy({
        by: ["employeeId"],
        where: { organizationId: ctx.organization.id, workStatus: { in: ["PENDING", "IN_PROGRESS"] }, workDate: { gte: addDays(dateOnly(today), -30) }, ...(employeeId ? { employeeId } : {}) },
        _count: { _all: true },
      }),
    ]);
    const toReview = open.filter((e) => e.status === "SUBMITTED");
    const returned = open.filter((e) => e.status === "RETURNED");

    const rows = new Map<string, { name: string; awaiting: number; dueSoon: number; overdue: number; returned: number; workPending: number; oldest: Date | null }>();
    const row = (id: string, name: string) => {
      if (!rows.has(id)) rows.set(id, { name, awaiting: 0, dueSoon: 0, overdue: 0, returned: 0, workPending: 0, oldest: null });
      return rows.get(id)!;
    };
    for (const e of toReview) {
      const r = row(e.employee.id, nameOf(e.employee));
      const sla = slaOf({ submittedAt: e.createdAt, status: e.status }, now);
      r.awaiting++;
      if (sla === "DUE_SOON") r.dueSoon++;
      if (sla === "OVERDUE") r.overdue++;
      if (!r.oldest || e.createdAt < r.oldest) r.oldest = e.createdAt;
    }
    for (const e of returned) row(e.employee.id, nameOf(e.employee)).returned++;
    if (workPending.length) {
      const names = new Map((await employeeOptions(ctx.organization.id)).map((o) => [o.value, o.label]));
      for (const g of workPending) row(g.employeeId, (names.get(g.employeeId) ?? "—").split(" — ")[0]).workPending = g._count._all;
    }
    const summary = [...rows.values()].sort((a, b) => b.overdue - a.overdue || b.awaiting - a.awaiting || a.name.localeCompare(b.name));
    const overdue = toReview.filter((e) => slaOf({ submittedAt: e.createdAt, status: e.status }, now) === "OVERDUE").length;
    const reviewers = await timesheetReviewers(ctx.organization.id, toReview);
    const daysWaiting = (d: Date) => Math.floor((now.getTime() - d.getTime()) / 86_400_000);

    return (
      <div className="space-y-6">
        <Filters tabKey="reviews" withPeriod={false} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Waiting for review" value={toReview.length} icon={<ListChecks />} tone={toReview.length ? "info" : "neutral"} />
          <Stat label={`Overdue (over ${OVERDUE_HOURS} h)`} value={overdue} icon={<CircleAlert />} tone={overdue ? "danger" : "neutral"} />
          <Stat label="Returned for correction" value={returned.length} icon={<TimerReset />} tone={returned.length ? "warn" : "neutral"} />
          <Stat label="Work marked pending (30 days)" value={workPending.reduce((s, g) => s + g._count._all, 0)} icon={<Users />} />
        </div>

        <Card title="Pending by team member" padded={false}>
          {summary.length === 0 ? <p className="p-4 text-sm text-muted">Nothing pending — every entry has been reviewed.</p> : (
            <Table minWidth={760}>
              <thead><tr><Th>Team member</Th><Th>Waiting for review</Th><Th>Due soon</Th><Th>Overdue</Th><Th>Returned</Th><Th>Work pending</Th><Th>Oldest waiting</Th></tr></thead>
              <tbody>
                {summary.map((r) => (
                  <tr key={r.name}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td>{r.awaiting}</Td>
                    <Td>{r.dueSoon ? <Badge tone="warn">{r.dueSoon}</Badge> : 0}</Td>
                    <Td>{r.overdue ? <Badge tone="danger">{r.overdue}</Badge> : 0}</Td>
                    <Td>{r.returned}</Td>
                    <Td>{r.workPending}</Td>
                    <Td>{r.oldest ? `${daysWaiting(r.oldest)} d` : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Waiting for review ({toReview.length})</h2>
          {toReview.length === 0 ? <p className="text-sm text-muted">No entries waiting for review.</p> : (
            <ReviewForm action={reviewTimesheetAction}>
              <Table minWidth={1180}>
                <thead><tr>{canReview && <Th><span className="sr-only">Select</span></Th>}<Th>Date</Th><Th>Team member</Th><Th>Client</Th><Th>Nature of work</Th><Th>Hours</Th><Th>Description</Th><Th>Submitted</Th><Th>Reviewer (auto)</Th><Th>Escalate to</Th><Th>SLA</Th></tr></thead>
                <tbody>
                  {toReview.map((e) => (
                    <tr key={e.id}>
                      {canReview && <Td><input type="checkbox" name="entryIds[]" value={e.id} aria-label="Select entry" className="accent-brand-700" /></Td>}
                      <Td className="whitespace-nowrap"><Link href={`/app/timesheet/${e.id}`} className="font-medium text-brand-700 hover:underline">{formatDate(e.workDate)}</Link></Td>
                      <Td>{nameOf(e.employee)}</Td>
                      <Td>{e.clientNameText ?? "—"}</Td>
                      <Td>{e.typeOfWork ?? "—"}</Td>
                      <Td>{e.approxMinutes ? minutesToHhmm(e.approxMinutes) : "—"}</Td>
                      <Td className="max-w-xs text-xs">{e.workDetails ?? "—"}</Td>
                      <Td className="whitespace-nowrap text-xs">{formatDateTime(e.createdAt, tz)}</Td>
                      <Td className="text-xs">{reviewers.get(e.id)?.reviewer ?? "Not mapped"}</Td>
                      <Td className="text-xs">{reviewers.get(e.id)?.escalateTo ?? "Not mapped"}</Td>
                      <Td><SlaBadge sla={slaOf({ submittedAt: e.createdAt, status: e.status }, now)} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </ReviewForm>
          )}
        </section>

        {returned.length > 0 && (
          <Card title={`Returned for correction (${returned.length})`} padded={false}>
            <Table minWidth={760}>
              <thead><tr><Th>Date</Th><Th>Team member</Th><Th>Client</Th><Th>Type of work</Th><Th>Review remark</Th><Th>Returned on</Th></tr></thead>
              <tbody>
                {returned.map((e) => (
                  <tr key={e.id}>
                    <Td className="whitespace-nowrap"><Link href={`/app/timesheet/${e.id}`} className="font-medium text-brand-700 hover:underline">{formatDate(e.workDate)}</Link></Td>
                    <Td>{nameOf(e.employee)}</Td>
                    <Td>{e.clientNameText ?? "—"}</Td>
                    <Td>{e.typeOfWork ?? "—"}</Td>
                    <Td className="max-w-sm text-xs">{e.reviewNote ?? "—"}</Td>
                    <Td className="whitespace-nowrap text-xs">{e.reviewedAt ? formatDateTime(e.reviewedAt, tz) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    );
  }

  /** Dashboard: where the team's time went in the period, and a scorecard per team member. */
  async function Dashboard() {
    const from = typeof sp.from === "string" && ISO.test(sp.from) ? sp.from : `${today.slice(0, 8)}01`;
    const to = typeof sp.to === "string" && ISO.test(sp.to) ? sp.to : today;
    const scope: Prisma.TimesheetEntryWhereInput = { organizationId: ctx.organization.id, ...(employeeId ? { employeeId } : {}), ...(clientId ? { clientId } : {}) };
    const now = new Date();
    const [entries, lastEntry, employees] = await Promise.all([
      prisma.timesheetEntry.findMany({
        where: { ...scope, workDate: { gte: dateOnly(from), lte: dateOnly(to) } },
        select: {
          id: true, employeeId: true, workDate: true, createdAt: true, approxMinutes: true, status: true, clientId: true, clientNameText: true,
          typeOfWork: true, placeOfWork: true, assessmentYear: true, resourceType: true, reviewedAt: true, reviewedById: true, teamAllocationId: true,
          workType: { select: { name: true } }, reviewedBy: { select: { name: true } },
        },
        take: 10_000,
      }),
      prisma.timesheetEntry.groupBy({ by: ["employeeId"], where: scope, _max: { workDate: true } }),
      employeeOptions(ctx.organization.id),
    ]);
    const lastByEmployee = new Map(lastEntry.map((g) => [g.employeeId, g._max.workDate]));
    const minutes = entries.reduce((s, e) => s + (e.approxMinutes ?? 0), 0);
    // Late = not logged on the day the work was done.
    const isLate = (e: (typeof entries)[number]) => isoDateInTz(e.createdAt, tz) !== toIsoDate(e.workDate);

    const sumBy = (key: (e: (typeof entries)[number]) => string) => {
      const m = new Map<string, number>();
      for (const e of entries) m.set(key(e), (m.get(key(e)) ?? 0) + (e.approxMinutes ?? 0));
      return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };
    const names = new Map(employees.map((o) => [o.value, o.label]));
    const byClient = sumBy((e) => e.clientNameText ?? "No client");
    const byMember = sumBy((e) => names.get(e.employeeId) ?? "—");
    const byWork = sumBy((e) => e.typeOfWork ?? e.workType?.name ?? "Not given");
    const byPlace = sumBy((e) => e.placeOfWork ?? "Not given");
    const byYear = sumBy((e) => e.assessmentYear ?? "Not given");
    const byResource = sumBy((e) => e.resourceType ?? "Not given");
    const penalty = (await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { timesheetPenaltyRupees: true } })).timesheetPenaltyRupees;
    // Office rule 2: ₹100 per EOD report not filed by the next day's reporting time, ₹200 to a Team Lead who did not escalate it.
    const months = [...new Set([from.slice(0, 7), to.slice(0, 7)])];
    const [policy, ...fineMaps] = await Promise.all([getPolicy(ctx.organization.id), ...months.map((m) => finesForMonth(ctx.organization.id, tz, m))]);
    const inPeriod = (d: string) => d >= from && d <= to;
    const eodMissed = new Map<string, number>();
    const leadMissed = new Map<string, number>();
    for (const fm of fineMaps) for (const [id, f] of fm) {
      if (employeeId && id !== employeeId) continue;
      eodMissed.set(id, (eodMissed.get(id) ?? 0) + f.eodMissed.filter(inPeriod).length);
      leadMissed.set(id, (leadMissed.get(id) ?? 0) + f.leadMissed.filter((x) => inPeriod(x.date)).length);
    }
    const eodTotal = [...eodMissed.values()].reduce((a, b) => a + b, 0);
    const leadTotal = [...leadMissed.values()].reduce((a, b) => a + b, 0);

    // Reviewer performance: entries reviewed by each person, what is still with them, and late reviews.
    const assigned = await timesheetReviewers(ctx.organization.id, entries);
    const perReviewer = new Map<string, { reviewed: number; pending: number; overdue: number; lateReviews: number }>();
    const reviewerRow = (name: string) => {
      if (!perReviewer.has(name)) perReviewer.set(name, { reviewed: 0, pending: 0, overdue: 0, lateReviews: 0 });
      return perReviewer.get(name)!;
    };
    for (const e of entries) {
      const responsible = assigned.get(e.id)?.reviewer ?? "Not mapped";
      if (e.status === "SUBMITTED") {
        const row = reviewerRow(responsible);
        row.pending++;
        if (slaOf({ submittedAt: e.createdAt, status: e.status }, now) === "OVERDUE") { row.overdue++; row.lateReviews++; }
      } else if (e.reviewedBy) {
        const row = reviewerRow(e.reviewedBy.name);
        row.reviewed++;
        if (isLateReview({ submittedAt: e.createdAt, reviewedAt: e.reviewedAt, status: e.status }, now)) row.lateReviews++;
      }
    }
    const reviewerStats = [...perReviewer.entries()].map(([name, r]) => ({ name, ...r })).sort((a, b) => b.overdue - a.overdue || b.reviewed - a.reviewed);
    const table = (rows: { label: string; value: number }[], head: string) => ({ head: [head, "Hours"], rows: rows.map((r) => [r.label, minutesToHhmm(r.value)]) });

    const members = (employeeId ? employees.filter((o) => o.value === employeeId) : employees).map((o) => {
      const mine = entries.filter((e) => e.employeeId === o.value);
      return {
        id: o.value,
        name: o.label,
        minutes: mine.reduce((s, e) => s + (e.approxMinutes ?? 0), 0),
        entries: mine.length,
        reviewed: mine.filter((e) => e.status === "REVIEWED").length,
        returned: mine.filter((e) => e.status === "RETURNED").length,
        awaiting: mine.filter((e) => e.status === "SUBMITTED").length,
        late: mine.filter(isLate).length,
        last: lastByEmployee.get(o.value) ?? null,
      };
    }).sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));

    // Team member × client: each person's share of time on the busiest clients.
    const topClients = byClient.slice(0, 6).map((c) => c.label);
    const matrix = members.filter((m) => m.entries > 0).map((m) => ({
      name: m.name,
      cells: topClients.map((c) => entries.filter((e) => e.employeeId === m.id && (e.clientNameText ?? "No client") === c).reduce((s, e) => s + (e.approxMinutes ?? 0), 0)),
    }));
    const trackerHref = (q: string) => `/app/timesheet?tab=log&from=${from}&to=${to}${q}`;

    return (
      <div className="space-y-6">
        <Filters tabKey="hours" from={from} to={to} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Hours logged" value={minutesToHhmm(minutes)} hint={`${formatDate(dateOnly(from))} – ${formatDate(dateOnly(to))}`} icon={<Clock />} href={trackerHref(employeeId ? `&employee=${employeeId}` : "")} />
          <Stat label="Entries" value={entries.length} icon={<ListChecks />} />
          <Stat label="Team members logging" value={new Set(entries.map((e) => e.employeeId)).size} hint={`of ${employees.length} active`} icon={<Users />} />
          <Stat label="Waiting for review" value={entries.filter((e) => e.status === "SUBMITTED").length} icon={<TimerReset />} href="/app/timesheet?tab=reviews" tone="info" />
          <Stat label="EOD reports not filed" value={eodTotal} hint="By the next day's reporting time" icon={<CircleAlert />} tone={eodTotal ? "danger" : "neutral"} href="/app/timesheet?tab=team-plans" />
        </div>
        <Card title="Penalty summary" icon={<IndianRupee />}>
          <p className="mb-3 text-xs text-muted">Office rules: {inr(policy.row.eodPenaltyRupees)} for each EOD report (timesheet) not filed by the next day&apos;s reporting time, and {inr(policy.row.leadPenaltyRupees)} to the Team Lead who did not escalate it that day. These are deducted in Payroll. Late reviews ({inr(penalty)}, not reviewed within {OVERDUE_HOURS} hours) follow the Team Timesheet workbook and are shown for information.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Stat label="EOD not filed" value={inr(eodTotal * policy.row.eodPenaltyRupees)} hint={`${eodTotal} day(s)`} tone={eodTotal ? "danger" : "neutral"} />
            <Stat label="Team Leads not escalating" value={inr(leadTotal * policy.row.leadPenaltyRupees)} hint={`${leadTotal} case(s)`} tone={leadTotal ? "danger" : "neutral"} />
            <Stat label="Late review (workbook)" value={inr(reviewerStats.reduce((s, r) => s + r.lateReviews, 0) * penalty)} tone={reviewerStats.some((r) => r.lateReviews) ? "warn" : "neutral"} />
            <Stat label="Fines deducted in Payroll" value={inr(eodTotal * policy.row.eodPenaltyRupees + leadTotal * policy.row.leadPenaltyRupees)} />
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Hours by client" table={table(byClient, "Client")}><BarList data={byClient.slice(0, 12)} format="minutes" /></ChartCard>
          <ChartCard title="Hours by team member" table={table(byMember, "Team member")}><BarList data={byMember} format="minutes" /></ChartCard>
          <ChartCard title="Hours by type of work" table={table(byWork, "Type of work")}><BarList data={byWork.slice(0, 12)} format="minutes" /></ChartCard>
          <ChartCard title="Hours by work location" table={table(byPlace, "Work location")}><BarList data={byPlace} format="minutes" /></ChartCard>
          <ChartCard title="Hours by assessment year" table={table(byYear, "Assessment year")}><BarList data={byYear} format="minutes" /></ChartCard>
          <ChartCard title="Hours by resource type" table={table(byResource, "Resource type")}><BarList data={byResource} format="minutes" /></ChartCard>
        </div>

        <Card title="Team member scorecard" padded={false}>
          <Table minWidth={860}>
            <thead><tr><Th>Team member</Th><Th>Hours</Th><Th>Entries</Th><Th>Last entry</Th><Th>Reviewed OK</Th><Th>Returned</Th><Th>Waiting for review</Th><Th>Logged after the day</Th><Th>EOD fines</Th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <Td className="font-medium"><Link href={trackerHref(`&employee=${m.id}`)} className="text-brand-700 hover:underline">{m.name}</Link></Td>
                  <Td>{minutesToHhmm(m.minutes)}</Td>
                  <Td>{m.entries}</Td>
                  <Td className="whitespace-nowrap">{m.last ? formatDate(m.last) : <span className="text-muted">No entries yet</span>}</Td>
                  <Td>{m.reviewed}</Td>
                  <Td>{m.returned ? <Badge tone="warn">{m.returned}</Badge> : 0}</Td>
                  <Td>{m.awaiting}</Td>
                  <Td>{m.late ? <Badge tone="danger">{m.late}</Badge> : 0}</Td>
                  <Td>{eodMissed.get(m.id) || leadMissed.get(m.id) ? inr((eodMissed.get(m.id) ?? 0) * policy.row.eodPenaltyRupees + (leadMissed.get(m.id) ?? 0) * policy.row.leadPenaltyRupees) : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card title="Reviewer performance" padded={false}>
          {reviewerStats.length === 0 ? <p className="p-4 text-sm text-muted">No reviews in this period.</p> : (
            <Table minWidth={680}>
              <thead><tr><Th>Reviewer</Th><Th>Entries reviewed</Th><Th>Still pending</Th><Th>Currently overdue</Th><Th>Late reviews</Th><Th>Penalty</Th></tr></thead>
              <tbody>
                {reviewerStats.map((r) => (
                  <tr key={r.name}>
                    <Td className="font-medium">{r.name}</Td>
                    <Td>{r.reviewed}</Td>
                    <Td>{r.pending}</Td>
                    <Td>{r.overdue ? <Badge tone="danger">{r.overdue}</Badge> : 0}</Td>
                    <Td>{r.lateReviews}</Td>
                    <Td>{r.lateReviews ? inr(r.lateReviews * penalty) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        {matrix.length > 0 && topClients.length > 0 && (
          <Card title="Hours by team member × client" padded={false}>
            <Table minWidth={240 + topClients.length * 120}>
              <thead><tr><Th>Team member</Th>{topClients.map((c) => <Th key={c}>{c}</Th>)}</tr></thead>
              <tbody>
                {matrix.map((m) => (
                  <tr key={m.name}>
                    <Td className="font-medium">{m.name}</Td>
                    {m.cells.map((v, i) => <Td key={topClients[i]} className={v ? "" : "text-muted"}>{v ? minutesToHhmm(v) : "—"}</Td>)}
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    );
  }
}
