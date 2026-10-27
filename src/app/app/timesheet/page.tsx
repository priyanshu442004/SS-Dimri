import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { addDays, dateOnly, formatDate, isoDateInTz, minutesToHhmm, toIsoDate } from "@/lib/dates";
import { daysPending } from "@/lib/domain/derived";
import { pendingScope } from "@/lib/services/worklog";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { taskScope } from "@/lib/services/tasks";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, EmptyState, PageHeader, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { addTimesheetAction, createPendingAction, deleteTimesheetAction, reviewTimesheetAction } from "../worklog-actions";
import { PendingForm, ReviewForm, TimesheetForm } from "../worklog-forms";
import { Clock } from "lucide-react";

export default async function TimesheetPage({ searchParams }: PageProps<"/app/timesheet">) {
  const ctx = await requireCapability("timesheet.fill_own");
  const sp = await searchParams;
  const viewAll = can(ctx.role, "timesheet.view_all");
  const tab = sp.tab === "communication" ? "communication" : sp.tab === "collective" && viewAll ? "collective" : "daily";
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;

  return (
    <>
      <PageHeader icon={<Clock />}
        title="Timesheet"
        description={viewAll ? "Daily work entries (10A), communication & follow-ups (10B), and the collective team view for review." : "Record each piece of work you do and what is pending."}
      />
      <TabNav
        current={tab}
        tabs={[
          { key: "daily", label: "Daily (10A)", href: `/app/timesheet?date=${date}` },
          { key: "communication", label: "Communication (10B)", href: "/app/timesheet?tab=communication" },
          ...(viewAll ? [{ key: "collective", label: "Collective — team", href: `/app/timesheet?tab=collective&date=${date}` }] : []),
        ]}
      />
      {tab === "daily" && <Daily />}
      {tab === "communication" && <Communication />}
      {tab === "collective" && <Collective />}
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
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={`/app/timesheet?date=${toIsoDate(addDays(dateOnly(date), -1))}`} className="rounded border border-line px-2 py-1 hover:bg-subtle">← Previous day</Link>
          <strong>{formatDate(dateOnly(date))}</strong>
          {date !== today && <Link href={`/app/timesheet?date=${toIsoDate(addDays(dateOnly(date), 1))}`} className="rounded border border-line px-2 py-1 hover:bg-subtle">Next day →</Link>}
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

  async function Communication() {
    const [items, clients, employees] = await Promise.all([
      prisma.pendingItem.findMany({
        where: { AND: [pendingScope(ctx), { category: "COMMUNICATION", status: { not: "CLOSED" } }] },
        orderBy: { requestedOn: "asc" },
        include: { client: { select: { tradeName: true } }, pendingWithEmployee: { select: { firstName: true } } },
        take: 200,
      }),
      activeClientOptions(ctx.organization.id),
      employeeOptions(ctx.organization.id),
    ]);
    const Section = ({ who }: { who: "CLIENT" | "TEAM_MEMBER" }) => {
      const rows = items.filter((i) => i.pendingWith === who);
      return (
        <Card title={who === "CLIENT" ? `Pending with client (${rows.length})` : `Pending with team member (${rows.length})`} padded={false}>
          {rows.length === 0 ? <p className="p-4 text-sm text-muted">Nothing open.</p> : (
            <Table minWidth={720}>
              <thead><tr><Th>Client</Th><Th>{who === "CLIENT" ? "What we asked" : "What client asked us"}</Th>{who === "TEAM_MEMBER" && <Th>With</Th>}<Th>Asked on</Th><Th>Due by</Th><Th>Days pending</Th><Th>Status</Th></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <Td>{i.client?.tradeName ?? "—"}</Td>
                    <Td className="max-w-sm">{i.requestDescription}{i.remark && <div className="text-xs text-muted">{i.remark}</div>}</Td>
                    {who === "TEAM_MEMBER" && <Td>{i.pendingWithEmployee?.firstName ?? "—"}</Td>}
                    <Td>{formatDate(i.requestedOn)}</Td>
                    <Td>{formatDate(i.dueBy)}{i.dueBy && i.dueBy < dateOnly(today) && <div><StatusBadge status="OVERDUE" /></div>}</Td>
                    <Td>{daysPending(i, undefined, ctx.organization.pendingDaysBasis)}</Td>
                    <Td><StatusBadge status={i.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      );
    };
    return (
      <div className="space-y-6">
        <Section who="CLIENT" />
        <Section who="TEAM_MEMBER" />
        <Card title="Add communication / follow-up">
          <PendingForm action={createPendingAction} clients={clients} employees={employees} category="COMMUNICATION" today={today} />
        </Card>
        <p className="text-sm text-muted">Update or close items from the <Link href="/app/pending?tab=communication" className="text-brand-700 hover:underline">Pending tracker</Link>.</p>
      </div>
    );
  }

  async function Collective() {
    const employeeId = typeof sp.employee === "string" && /^[0-9a-f-]{36}$/i.test(sp.employee) ? sp.employee : "";
    const clientId = typeof sp.client === "string" && /^[0-9a-f-]{36}$/i.test(sp.client) ? sp.client : "";
    const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : date;
    const to = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : date;
    const where: Prisma.TimesheetEntryWhereInput = {
      organizationId: ctx.organization.id,
      workDate: { gte: dateOnly(from), lte: dateOnly(to) },
      ...(employeeId ? { employeeId } : {}),
      ...(clientId ? { clientId } : {}),
    };
    const [entries, employees] = await Promise.all([
      prisma.timesheetEntry.findMany({
        where,
        orderBy: [{ workDate: "desc" }, { employee: { firstName: "asc" } }, { serialNumber: "asc" }],
        take: 500,
        include: { employee: { select: { firstName: true, lastName: true } } },
      }),
      employeeOptions(ctx.organization.id),
    ]);
    const totals = new Map<string, number>();
    for (const e of entries) totals.set(`${e.employee.firstName} ${e.employee.lastName ?? ""}`.trim(), (totals.get(`${e.employee.firstName} ${e.employee.lastName ?? ""}`.trim()) ?? 0) + (e.approxMinutes ?? 0));
    const canReview = can(ctx.role, "timesheet.review");
    return (
      <div className="space-y-4">
        <form className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="tab" value="collective" />
          {clientId && <input type="hidden" name="client" value={clientId} />}
          <label className="text-sm"><span className="mb-1 block font-medium">From</span><input type="date" name="from" defaultValue={from} className="h-10 rounded-md border border-line bg-surface px-2 text-sm" /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">To</span><input type="date" name="to" defaultValue={to} className="h-10 rounded-md border border-line bg-surface px-2 text-sm" /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">Team member</span>
            <select name="employee" defaultValue={employeeId} className="h-10 rounded-md border border-line bg-surface px-2 text-sm">
              <option value="">Everyone</option>
              {employees.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </label>
          <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show</button>
        </form>
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
                    <Td>{e.employee.firstName} {e.employee.lastName}</Td>
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
}
