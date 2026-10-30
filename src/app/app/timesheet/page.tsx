import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { addDays, dateOnly, formatDate, formatDateTime, isoDateInTz, minutesToHhmm, toIsoDate } from "@/lib/dates";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { taskScope } from "@/lib/services/tasks";
import { ActionButton } from "@/components/action-button";
import { BarList, ChartCard } from "@/components/charts";
import { Badge, Card, EmptyState, PageHeader, Stat, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { addTimesheetAction, deleteTimesheetAction, reviewTimesheetAction } from "../worklog-actions";
import { ReviewForm, TimesheetForm } from "../worklog-forms";
import { CircleAlert, Clock, ListChecks, TimerReset, Users } from "lucide-react";

// Review window for a submitted entry, as in the team timesheet: within 24 h is
// on time, 24–36 h is due soon, after 36 h it is overdue (escalated).
const DUE_SOON_HOURS = 24;
const OVERDUE_HOURS = 36;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

type Sla = "WITHIN" | "DUE_SOON" | "OVERDUE";
function slaOf(submittedAt: Date, now: Date): Sla {
  const hours = (now.getTime() - submittedAt.getTime()) / 3_600_000;
  return hours > OVERDUE_HOURS ? "OVERDUE" : hours > DUE_SOON_HOURS ? "DUE_SOON" : "WITHIN";
}
function SlaBadge({ sla }: { sla: Sla }) {
  return sla === "OVERDUE" ? <Badge tone="danger">Overdue · over {OVERDUE_HOURS} h</Badge>
    : sla === "DUE_SOON" ? <Badge tone="warn">Due soon</Badge>
    : <Badge tone="ok">Within {DUE_SOON_HOURS} h</Badge>;
}
const nameOf = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();

export default async function TimesheetPage({ searchParams }: PageProps<"/app/timesheet">) {
  const ctx = await requireCapability("timesheet.fill_own");
  const sp = await searchParams;
  const viewAll = can(ctx.role, "timesheet.view_all");
  const canReview = can(ctx.role, "timesheet.review");
  const tz = ctx.organization.timezone;
  const today = isoDateInTz(new Date(), tz);
  const date = typeof sp.date === "string" && ISO.test(sp.date) ? sp.date : today;
  const employeeId = typeof sp.employee === "string" && UUID.test(sp.employee) ? sp.employee : "";
  const clientId = typeof sp.client === "string" && UUID.test(sp.client) ? sp.client : "";

  // Leads and admins see the team views (Tracker, Pending, Dashboard); everyone else fills the daily log.
  // "collective" is the old name of the tracker and is kept so existing links still work.
  const requested = sp.tab === "collective" ? "tracker" : sp.tab;
  const tab = !viewAll ? "daily"
    : requested === "pending" || requested === "dashboard" || (requested === "daily" && ctx.employee) ? requested
    : "tracker";

  return (
    <>
      <PageHeader icon={<Clock />}
        title="Timesheet"
        description={viewAll ? "Tracker of every entry the team logs, entries pending review, and the time dashboard." : "Your daily work log — record each piece of work you do."}
      />
      {viewAll && (
        <TabNav
          current={tab}
          tabs={[
            { key: "tracker", label: "Tracker", href: "/app/timesheet?tab=tracker" },
            { key: "pending", label: "Pending", href: "/app/timesheet?tab=pending" },
            { key: "dashboard", label: "Dashboard", href: "/app/timesheet?tab=dashboard" },
            ...(ctx.employee ? [{ key: "daily", label: "My daily log", href: `/app/timesheet?tab=daily&date=${date}` }] : []),
          ]}
        />
      )}
      {tab === "daily" && <Daily />}
      {tab === "tracker" && <Tracker />}
      {tab === "pending" && <Pending />}
      {tab === "dashboard" && <Dashboard />}
    </>
  );

  async function Daily() {
    if (!ctx.employee) return <EmptyState kind="people" title="No staff record">Your login is not linked to an employee.</EmptyState>;
    const [entries, clients, workTypes, places, tasks] = await Promise.all([
      prisma.timesheetEntry.findMany({ where: { employeeId: ctx.employee.id, workDate: dateOnly(date) }, orderBy: { serialNumber: "asc" }, include: { task: { select: { id: true, title: true } } } }),
      activeClientOptions(ctx.organization.id),
      prisma.workType.findMany({ where: { organizationId: ctx.organization.id, isActive: true }, orderBy: { sortOrder: "asc" } }),
      prisma.classificationOption.findMany({ where: { basis: "PLACE_OF_WORK", isActive: true }, orderBy: { sortOrder: "asc" } }),
      prisma.task.findMany({ where: { AND: [taskScope(ctx), { status: { notIn: ["COMPLETED", "CANCELLED"] } }] }, select: { id: true, title: true }, take: 100 }),
    ]);
    const total = entries.reduce((s, e) => s + (e.approxMinutes ?? 0), 0);
    const dayHref = (d: string) => `/app/timesheet?${viewAll ? "tab=daily&" : ""}date=${d}`;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={dayHref(toIsoDate(addDays(dateOnly(date), -1)))} className="rounded border border-line px-2 py-1 hover:bg-subtle">← Previous day</Link>
          <strong>{formatDate(dateOnly(date))}</strong>
          {date !== today && <Link href={dayHref(toIsoDate(addDays(dateOnly(date), 1)))} className="rounded border border-line px-2 py-1 hover:bg-subtle">Next day →</Link>}
          <span className="ml-auto text-muted">Total time: <strong className="text-ink">{minutesToHhmm(total)}</strong></span>
        </div>
        {entries.length > 0 && (
          <Table minWidth={1000}>
            <thead><tr><Th>#</Th><Th>Client</Th><Th>Place</Th><Th>Type of work</Th><Th>Bank</Th><Th>Period</Th><Th>Entries</Th><Th>Time</Th><Th>Details</Th><Th>Status</Th><Th /></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <Td><Link href={`/app/timesheet/${e.id}`} className="font-medium text-brand-700 hover:underline" aria-label={`Open entry ${e.serialNumber}`}>#{e.serialNumber}</Link></Td>
                  <Td>{e.clientNameText ?? "—"}</Td>
                  <Td>{e.placeOfWork ?? "—"}</Td>
                  <Td>{e.typeOfWork ?? "—"}</Td>
                  <Td>{e.bankName ?? "—"}</Td>
                  <Td className="text-xs">{e.periodFrom ? `${formatDate(e.periodFrom)} – ${formatDate(e.periodTo)}` : "—"}</Td>
                  <Td>{e.transactionCount ?? "—"}</Td>
                  <Td>{e.approxMinutes ? minutesToHhmm(e.approxMinutes) : "—"}</Td>
                  <Td className="max-w-xs text-xs">{e.workDetails}{e.task && <div><Link href={`/app/tasks/${e.task.id}`} className="text-brand-700 hover:underline">{e.task.title}</Link></div>}</Td>
                  <Td>{e.workStatus && <StatusBadge status={e.workStatus} />}<div className="mt-1"><StatusBadge status={e.status} /></div></Td>
                  <Td>{e.status !== "REVIEWED" && <ActionButton variant="ghost" confirm="Remove this entry?" action={deleteTimesheetAction.bind(null, e.id)}>Remove</ActionButton>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Card title="Add work entry">
          <TimesheetForm
            action={addTimesheetAction}
            clients={clients}
            workTypes={workTypes.map((w) => ({ value: w.id, label: w.name }))}
            places={places.map((p) => p.label)}
            tasks={tasks.map((t) => ({ value: t.id, label: t.title }))}
            date={date}
          />
        </Card>
      </div>
    );
  }

  /** Filter bar shared by the team views: period and team member. */
  function Filters({ tabKey, from, to, withPeriod = true }: { tabKey: string; from?: string; to?: string; withPeriod?: boolean }) {
    return (
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value={tabKey} />
        {clientId && <input type="hidden" name="client" value={clientId} />}
        {withPeriod && (
          <>
            <label className="text-sm"><span className="mb-1 block font-medium">From</span><input type="date" name="from" defaultValue={from} className="h-10 rounded-md border border-line bg-surface px-2 text-sm" /></label>
            <label className="text-sm"><span className="mb-1 block font-medium">To</span><input type="date" name="to" defaultValue={to} className="h-10 rounded-md border border-line bg-surface px-2 text-sm" /></label>
          </>
        )}
        <TeamMemberSelect />
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
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    const totals = new Map<string, number>();
    for (const e of entries) totals.set(nameOf(e.employee), (totals.get(nameOf(e.employee)) ?? 0) + (e.approxMinutes ?? 0));
    return (
      <div className="space-y-4">
        <Filters tabKey="tracker" from={from} to={to} />
        {totals.size > 0 && (
          <div className="flex flex-wrap gap-2 text-xs">
            {[...totals.entries()].map(([n, m]) => <Badge key={n} tone="brand">{n}: {minutesToHhmm(m)}</Badge>)}
          </div>
        )}
        {entries.length === 0 ? <EmptyState kind="calendar" title="No entries for this period" /> : (
          <ReviewForm action={reviewTimesheetAction}>
            <Table minWidth={1100}>
              <thead><tr>{canReview && <Th><span className="sr-only">Select</span></Th>}<Th>Date</Th><Th>Team member</Th><Th>Client</Th><Th>Place</Th><Th>Type of work</Th><Th>Period</Th><Th>Entries</Th><Th>Time</Th><Th>Details</Th><Th>Status</Th></tr></thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    {canReview && <Td>{e.status === "SUBMITTED" && <input type="checkbox" name="entryIds[]" value={e.id} aria-label="Select entry" className="accent-brand-700" />}</Td>}
                    <Td className="whitespace-nowrap"><Link href={`/app/timesheet/${e.id}`} className="font-medium text-brand-700 hover:underline">{formatDate(e.workDate)}</Link></Td>
                    <Td>{nameOf(e.employee)}</Td>
                    <Td>{e.clientNameText ?? "—"}</Td>
                    <Td>{e.placeOfWork ?? "—"}</Td>
                    <Td>{e.typeOfWork ?? "—"}{e.bankName && <div className="text-xs text-muted">{e.bankName}</div>}</Td>
                    <Td className="text-xs">{e.periodFrom ? `${formatDate(e.periodFrom)} – ${formatDate(e.periodTo)}` : "—"}</Td>
                    <Td>{e.transactionCount ?? "—"}</Td>
                    <Td>{e.approxMinutes ? minutesToHhmm(e.approxMinutes) : "—"}</Td>
                    <Td className="max-w-xs text-xs">{e.workDetails}{e.whatsappMessage && <div className="text-muted">WhatsApp: {e.whatsappMessage}</div>}</Td>
                    <Td>{e.workStatus && <StatusBadge status={e.workStatus} />} <StatusBadge status={e.status} /></Td>
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
      const sla = slaOf(e.createdAt, now);
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
    const overdue = toReview.filter((e) => slaOf(e.createdAt, now) === "OVERDUE").length;
    const daysWaiting = (d: Date) => Math.floor((now.getTime() - d.getTime()) / 86_400_000);

    return (
      <div className="space-y-6">
        <Filters tabKey="pending" withPeriod={false} />
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
              <Table minWidth={1000}>
                <thead><tr>{canReview && <Th><span className="sr-only">Select</span></Th>}<Th>Date</Th><Th>Team member</Th><Th>Client</Th><Th>Type of work</Th><Th>Time</Th><Th>Details</Th><Th>Submitted</Th><Th>Review window</Th></tr></thead>
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
                      <Td><SlaBadge sla={slaOf(e.createdAt, now)} /></Td>
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
    const scope: Prisma.TimesheetEntryWhereInput = { organizationId: ctx.organization.id, ...(employeeId ? { employeeId } : {}) };
    const [entries, lastEntry, employees] = await Promise.all([
      prisma.timesheetEntry.findMany({
        where: { ...scope, workDate: { gte: dateOnly(from), lte: dateOnly(to) } },
        select: {
          employeeId: true, workDate: true, createdAt: true, approxMinutes: true, status: true, clientId: true, clientNameText: true,
          typeOfWork: true, placeOfWork: true, workType: { select: { name: true } },
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
    const trackerHref = (q: string) => `/app/timesheet?tab=tracker&from=${from}&to=${to}${q}`;

    return (
      <div className="space-y-6">
        <Filters tabKey="dashboard" from={from} to={to} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Hours logged" value={minutesToHhmm(minutes)} hint={`${formatDate(dateOnly(from))} – ${formatDate(dateOnly(to))}`} icon={<Clock />} href={trackerHref(employeeId ? `&employee=${employeeId}` : "")} />
          <Stat label="Entries" value={entries.length} icon={<ListChecks />} />
          <Stat label="Team members logging" value={new Set(entries.map((e) => e.employeeId)).size} hint={`of ${employees.length} active`} icon={<Users />} />
          <Stat label="Waiting for review" value={entries.filter((e) => e.status === "SUBMITTED").length} icon={<TimerReset />} href="/app/timesheet?tab=pending" tone="info" />
          <Stat label="Late submissions" value={entries.filter(isLate).length} hint="Not logged on the day of work" icon={<CircleAlert />} tone={entries.some(isLate) ? "warn" : "neutral"} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Hours by client" table={table(byClient, "Client")}><BarList data={byClient.slice(0, 12)} format="minutes" /></ChartCard>
          <ChartCard title="Hours by team member" table={table(byMember, "Team member")}><BarList data={byMember} format="minutes" /></ChartCard>
          <ChartCard title="Hours by type of work" table={table(byWork, "Type of work")}><BarList data={byWork.slice(0, 12)} format="minutes" /></ChartCard>
          <ChartCard title="Hours by place of work" table={table(byPlace, "Place of work")}><BarList data={byPlace} format="minutes" /></ChartCard>
        </div>

        <Card title="Team member scorecard" padded={false}>
          <Table minWidth={860}>
            <thead><tr><Th>Team member</Th><Th>Hours</Th><Th>Entries</Th><Th>Last entry</Th><Th>Reviewed OK</Th><Th>Returned</Th><Th>Waiting for review</Th><Th>Late submissions</Th></tr></thead>
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
                </tr>
              ))}
            </tbody>
          </Table>
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
