import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { BellRing } from "lucide-react";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDate, isoDateInTz } from "@/lib/dates";
import { upcomingDeadlines, formatDue } from "@/lib/deadlines";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { dueDateReport, noticeList, NOTICE_DEPARTMENTS, parseReminderFilters, pendingComplianceReport, reminderQuery, WINDOWS } from "@/lib/services/reminders";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, DownloadButton, EmptyState, PageHeader, Stat, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { addNoticeAction, setNoticeStatusAction } from "./actions";
import { NoticeForm } from "./forms";

export const metadata: Metadata = { title: "Reminders" };
const selectCls = "h-10 rounded-md border border-line bg-surface px-2 text-sm";
const left = (d: number) => (d < 0 ? <span className="font-semibold text-danger">{-d} day{d === -1 ? "" : "s"} overdue</span> : d === 0 ? <span className="font-semibold text-warn">Today</span> : <span>{d} day{d === 1 ? "" : "s"}</span>);

// Due dates (compliance and notice replies) and client-wise pending compliance (tracker S.No. 86, 87).
export default async function RemindersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCapability("compliance.use");
  const f = parseReminderFilters(await searchParams);
  const manage = can(ctx, "compliance.manage");
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const departments = [...new Set([...(await prisma.complianceItem.findMany({ distinct: ["department"], select: { department: true } })).map((d) => d.department), ...NOTICE_DEPARTMENTS])];

  const filters = (
    <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
      <input type="hidden" name="tab" value={f.tab} />
      {f.tab !== "notices" ? (
        <select name="days" defaultValue={String(f.days)} className={selectCls} aria-label="Window">
          {WINDOWS.map((d) => <option key={d} value={d}>Overdue + next {d} days</option>)}
        </select>
      ) : (
        <select name="status" defaultValue={f.status} className={selectCls} aria-label="Status">
          <option value="OPEN">Open</option><option value="REPLIED">Replied</option><option value="CLOSED">Closed</option><option value="all">All</option>
        </select>
      )}
      <select name="dept" defaultValue={f.dept} className={selectCls} aria-label="Department">
        <option value="">All departments</option>
        {departments.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <input name="q" defaultValue={f.q} placeholder="Client name or code" className={`${selectCls} w-56`} aria-label="Client" />
      <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Apply</button>
    </form>
  );

  return (
    <>
      <PageHeader icon={<BellRing />} title="Reminders"
        description={manage ? "Upcoming and overdue compliance filings and notice replies for all clients, and what each client still has pending." : "Your compliance filings and notice replies coming due, and what is pending client-wise."}
        actions={f.tab !== "notices" && <DownloadButton href={`/app/reminders/export${reminderQuery(f)}`}>Export to Excel</DownloadButton>} />
      <TabNav current={f.tab} tabs={[
        { key: "due", label: "Due-date report", href: `/app/reminders${reminderQuery({ ...f, tab: "due" })}` },
        { key: "pending", label: "Pending compliance", href: `/app/reminders${reminderQuery({ ...f, tab: "pending" })}` },
        { key: "notices", label: "Notices", href: `/app/reminders${reminderQuery({ ...f, tab: "notices" })}` },
      ]} />
      {filters}
      {f.tab === "pending" ? <Pending /> : f.tab === "notices" ? <Notices /> : <Due />}
    </>
  );

  async function Due() {
    const r = await dueDateReport(ctx, f);
    const statutory = upcomingDeadlines(6);
    return (
      <div className="grid gap-6 xl:grid-cols-[3fr_1fr]">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Overdue" value={r.overdue} tone={r.overdue ? "danger" : "ok"} />
            <Stat label="Due today" value={r.dueToday} tone={r.dueToday ? "warn" : "neutral"} />
            <Stat label={`Next ${f.days} days`} value={r.upcoming} tone="info" />
          </div>
          {r.rows.length === 0 ? <EmptyState kind="calendar" title="Nothing due">No compliance filing or notice reply is overdue or due in the next {f.days} days. Filings are entered in the Compliance tracker; notices on the Notices tab.</EmptyState> : (
            <Table minWidth={880}>
              <thead><tr><Th>Due date</Th><Th>Days left</Th><Th>Type</Th><Th>Client</Th><Th>Compliance / notice</Th><Th>Department</Th><Th>Responsible</Th></tr></thead>
              <tbody>
                {r.rows.map((x) => (
                  <tr key={`${x.kind}-${x.id}`} className={clsx(x.daysLeft < 0 && "bg-danger-bg/40")}>
                    <Td className="whitespace-nowrap">{formatDate(x.due)}</Td>
                    <Td className="whitespace-nowrap text-xs">{left(x.daysLeft)}</Td>
                    <Td><Badge tone={x.kind === "Compliance" ? "info" : "warn"}>{x.kind}</Badge></Td>
                    <Td>{x.clientId ? <Link href={`/app/clients/${x.clientId}`} className="font-medium hover:underline">{x.client}</Link> : x.client}</Td>
                    <Td><Link href={x.href} className="hover:underline">{x.item}</Link></Td>
                    <Td className="text-xs">{x.department}</Td>
                    <Td className="text-xs">{x.responsible}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        <Card title="Statutory due dates">
          <ul className="space-y-2 text-sm">
            {statutory.map((d) => <li key={d.title + d.date.toISOString()} className="flex justify-between gap-2"><span><span className="font-medium">{d.title}</span><span className="block text-xs text-muted">{d.form} · {d.department}</span></span><span className="shrink-0 text-xs text-muted">{formatDue(d.date)}{d.daysLeft === 0 ? " · today" : ` · ${d.daysLeft} d`}</span></li>)}
          </ul>
          <p className="mt-3 text-xs text-muted">Standard dates; government extensions are not applied.</p>
        </Card>
      </div>
    );
  }

  async function Pending() {
    const r = await pendingComplianceReport(ctx, f);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Clients with pending filings" value={r.clients.length} />
          <Stat label="Filings not done" value={r.total} tone="info" />
          <Stat label="Of which overdue" value={r.totalOverdue} tone={r.totalOverdue ? "danger" : "ok"} />
        </div>
        {r.clients.length === 0 ? <EmptyState kind="calendar" title="Nothing pending">No filing is overdue or due in the next {f.days} days.</EmptyState> : (
          <div className="space-y-4">
            {r.clients.map((c) => (
              <section key={c.clientId ?? "firm"} className="rounded-xl border border-line bg-surface">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
                  <h2 className="font-semibold">{c.clientId ? <Link href={`/app/clients/${c.clientId}`} className="hover:underline">{c.client}</Link> : c.client} {c.code && <span className="font-mono text-xs font-normal text-muted">{c.code}</span>}</h2>
                  <span className="flex gap-2 text-xs">{c.overdue > 0 && <Badge tone="danger">{`${c.overdue} overdue`}</Badge>}{c.dueSoon > 0 && <Badge tone="warn">{`${c.dueSoon} due soon`}</Badge>}</span>
                </header>
                <Table minWidth={640}>
                  <thead><tr><Th>Compliance</Th><Th>Department</Th><Th>Due date</Th><Th>Days left</Th><Th>Responsible</Th></tr></thead>
                  <tbody>{c.items.map((i, n) => <tr key={n}><Td>{i.type}</Td><Td className="text-xs">{i.department}</Td><Td className="whitespace-nowrap">{formatDate(i.due)}</Td><Td className="text-xs">{left(i.daysLeft)}</Td><Td className="text-xs">{i.responsible}</Td></tr>)}</tbody>
                </Table>
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  async function Notices() {
    const [rows, clients, employees] = await Promise.all([noticeList(ctx, f), manage ? activeClientOptions(ctx.organization.id) : Promise.resolve([]), manage ? employeeOptions(ctx.organization.id) : Promise.resolve([])]);
    return (
      <div className={clsx("grid gap-6", manage && "xl:grid-cols-[3fr_2fr]")}>
        <Card title={`Notices (${rows.length})`} padded={false}>
          {rows.length === 0 ? <p className="p-4 text-sm text-muted">No notices{f.status !== "all" ? ` with status ${f.status.toLowerCase()}` : ""}.</p> : (
            <Table minWidth={760}>
              <thead><tr><Th>Client</Th><Th>Notice</Th><Th>Reply due</Th><Th>Handled by</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {rows.map((n) => {
                  const days = Math.round((n.replyDueDate.getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86_400_000);
                  return (
                    <tr key={n.id}>
                      <Td><Link href={`/app/clients/${n.client.id}`} className="font-medium hover:underline">{n.client.tradeName}</Link></Td>
                      <Td className="text-xs">{n.department}{n.section ? ` · ${n.section}` : ""}{n.reference && <div className="text-muted">{n.reference}</div>}{n.remarks && <div className="text-muted">{n.remarks}</div>}</Td>
                      <Td className="whitespace-nowrap text-xs">{formatDate(n.replyDueDate)}{n.status === "OPEN" && <div>{left(days)}</div>}</Td>
                      <Td className="text-xs">{n.responsible ? `${n.responsible.firstName} ${n.responsible.lastName ?? ""}` : "—"}</Td>
                      <Td><StatusBadge status={n.status === "OPEN" ? "PENDING" : n.status === "REPLIED" ? "COMPLETED" : "INACTIVE"} label={n.status === "OPEN" ? "Open" : n.status === "REPLIED" ? `Replied${n.repliedOn ? ` ${formatDate(n.repliedOn)}` : ""}` : "Closed"} /></Td>
                      <Td>
                        <span className="flex flex-wrap gap-1">
                          {n.status === "OPEN" && <ActionButton variant="ghost" action={setNoticeStatusAction.bind(null, n.id, "REPLIED")}>Mark replied</ActionButton>}
                          {manage && n.status !== "CLOSED" && <ActionButton variant="ghost" action={setNoticeStatusAction.bind(null, n.id, "CLOSED")} confirm="Close this notice?">Close</ActionButton>}
                          {manage && n.status !== "OPEN" && <ActionButton variant="ghost" action={setNoticeStatusAction.bind(null, n.id, "OPEN")}>Reopen</ActionButton>}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card>
        {manage && (
          <Card title="Record a notice">
            <NoticeForm action={addNoticeAction} clients={clients} employees={employees} departments={NOTICE_DEPARTMENTS} today={today} />
          </Card>
        )}
      </div>
    );
  }
}
