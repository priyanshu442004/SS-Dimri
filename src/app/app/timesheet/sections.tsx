import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { dateOnly, formatDate, isoDateInTz, minutesToHhmm } from "@/lib/dates";
import {
  daysAllowed, daysOpen, dueStateOf, onClientReport, STATUS_OF_WORK_LABEL, timelineFlagOf, trackerDashboard, workStatusOf,
  TIMELINE_FLAGS, WORK_STATUSES, type DueState, type TimelineFlag, type WorkStatusLabel,
} from "@/lib/domain/tracker";
import type { AppContext } from "@/lib/session";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { pendingPointsFor, type PendingPoint } from "@/lib/services/tracker";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, DownloadButton, EmptyState, Notice, Stat, Table, Td, Th } from "@/components/ui";
import { PrintButton } from "../payroll/print-button";
import { createTrackerLineAction, markTrackerLineReviewedAction } from "../worklog-actions";
import { TrackerLineForm } from "./tracker-forms";
import { AlarmClock, CircleAlert, ClipboardList, Clock, FileWarning, Inbox, ListChecks, Users } from "lucide-react";

type SP = Record<string, string | string[] | undefined>;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const str = (v: unknown) => (typeof v === "string" ? v : "");
const nameOf = (e: { firstName: string; lastName: string | null } | null | undefined) => (e ? `${e.firstName} ${e.lastName ?? ""}`.trim() : "");
const fmt = (d: Date | null | undefined) => (d ? formatDate(d) : "");

const STATUS_TONE: Record<WorkStatusLabel, "ok" | "warn" | "danger" | "info" | "brand" | "neutral"> = {
  "Awaiting Data": "warn", "Partial Data": "warn", "Not Started": "neutral", "Maker In Progress": "info", "On Hold": "neutral",
  "Ready for Check": "brand", "Under Check": "info", Rework: "danger", Completed: "ok",
};
const FLAG_TONE: Record<TimelineFlag, "ok" | "warn" | "danger" | "info" | "neutral"> = {
  OVERDUE: "danger", "CLIENT DELAY": "warn", "FOLLOW-UP DUE": "info", "On Track": "ok", Done: "neutral",
};
const DUE_TONE: Record<DueState, "danger" | "warn" | "ok" | "neutral"> = { OVERDUE: "danger", "Due today": "warn", "On time": "ok", Cleared: "neutral" };
export const WorkStatusBadge = ({ s }: { s: WorkStatusLabel }) => <Badge tone={STATUS_TONE[s]}>{s}</Badge>;
export const FlagBadge = ({ f }: { f: TimelineFlag }) => <Badge tone={FLAG_TONE[f]}>{f}</Badge>;
const todayOf = (ctx: AppContext) => dateOnly(isoDateInTz(new Date(), ctx.organization.timezone));

const lineInclude = { maker: { select: { firstName: true, lastName: true } }, checker: { select: { firstName: true, lastName: true } } } as const;

// ============================================================ Tracker (Admin, Manager, Senior)

export async function TrackerTab({ ctx, sp }: { ctx: AppContext; sp: SP }) {
  const organizationId = ctx.organization.id;
  const today = todayOf(ctx);
  const client = str(sp.client);
  const maker = UUID.test(str(sp.maker)) ? str(sp.maker) : "";
  const status = (WORK_STATUSES as readonly string[]).includes(str(sp.status)) ? str(sp.status) : "";
  const flag = (TIMELINE_FLAGS as readonly string[]).includes(str(sp.flag)) ? str(sp.flag) : "";
  const fresh = sp.new === "1";
  const where: Prisma.TrackerLineWhereInput = {
    organizationId,
    ...(client ? { clientName: client } : {}),
    ...(maker ? { OR: [{ makerEmployeeId: maker }, { checkerEmployeeId: maker }] } : {}),
    ...(fresh ? { reviewedAt: null } : {}),
  };
  const [all, clientNames, people, clients, workTypes, newCount] = await Promise.all([
    prisma.trackerLine.findMany({ where, orderBy: [{ clientName: "asc" }, { refNo: "asc" }], take: 2000, include: lineInclude }),
    prisma.trackerLine.findMany({ where: { organizationId }, distinct: ["clientName"], select: { clientName: true }, orderBy: { clientName: "asc" } }),
    employeeOptions(organizationId),
    activeClientOptions(organizationId),
    prisma.workType.findMany({ where: { organizationId, isActive: true }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
    prisma.trackerLine.count({ where: { organizationId, reviewedAt: null } }),
  ]);
  const lines = all
    .map((l) => ({ ...l, work: workStatusOf(l), flag: timelineFlagOf(l, today) }))
    .filter((l) => (!status || l.work === status) && (!flag || l.flag === flag));
  const qs = new URLSearchParams(Object.entries({ tab: "tracker", client, maker, status, flag }).filter(([, v]) => v) as [string, string][]);

  return (
    <div className="space-y-4">
      {newCount > 0 && !fresh && (
        <Notice tone="info">
          {newCount} {newCount === 1 ? "line" : "lines"} came in new from the team&apos;s daily logs. <Link href="/app/timesheet?tab=tracker&new=1" className="font-medium underline">Review them</Link>
        </Notice>
      )}
      <form className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value="tracker" />
        <label className="text-sm"><span className="mb-1 block font-medium">Client</span>
          <select name="client" defaultValue={client} className="h-10 max-w-56 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="">All clients</option>
            {clientNames.map((c) => <option key={c.clientName} value={c.clientName}>{c.clientName}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className="mb-1 block font-medium">Maker / checker</span>
          <select name="maker" defaultValue={maker} className="h-10 max-w-56 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className="mb-1 block font-medium">Work status</span>
          <select name="status" defaultValue={status} className="h-10 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="">Any</option>
            {WORK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className="mb-1 block font-medium">Timeline flag</span>
          <select name="flag" defaultValue={flag} className="h-10 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="">Any</option>
            {TIMELINE_FLAGS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="flex h-10 items-center gap-2 text-sm"><input type="checkbox" name="new" value="1" defaultChecked={fresh} className="accent-brand-700" /> New from logs only</label>
        <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show</button>
        <span className="ml-auto"><DownloadButton href={`/app/timesheet/export?sheet=tracker&${qs}`}>Export to Excel</DownloadButton></span>
      </form>

      {lines.length === 0 ? (
        <EmptyState kind="calendar" title="No tracker lines yet">Add a line below. Work the team logs without a Ref No. also arrives here as a new line.</EmptyState>
      ) : (
        <Table minWidth={3900}>
          <thead>
            <tr>
              <Th>Sr</Th><Th>Tracker Ref No.</Th><Th>Client Name</Th><Th>Branch</Th><Th>Type of Work</Th><Th>Bank Name</Th><Th>Period From</Th><Th>Period To</Th>
              <Th>Status of Work</Th><Th>Issue Level</Th><Th>Issue / Discomfort Details</Th><Th>Issue Status</Th>
              <Th>Pending Item – Client</Th><Th>Raised On – Client</Th><Th>Due By – Client</Th><Th>Status – Client</Th>
              <Th>Pending Item – Team</Th><Th>Raised On – Team</Th><Th>Due By – Team</Th><Th>Status – Team</Th>
              <Th>Get From (Client Contact)</Th><Th>Date Received</Th><Th>Days Pending (Due − Raised)</Th><Th>Maker</Th><Th>Checker</Th><Th>Checker Status</Th>
              <Th>Work Status (auto)</Th><Th>Work Start Date</Th><Th>Priority</Th><Th>Next Follow-up Date</Th><Th>Timeline Flag (auto)</Th><Th>Remarks (internal)</Th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id}>
                <Td className="text-xs text-muted">{i + 1}</Td>
                <Td className="whitespace-nowrap">
                  <Link href={`/app/timesheet/tracker/${l.id}`} className="font-mono font-medium text-brand-700 hover:underline">{l.refNo}</Link>
                  {!l.reviewedAt && (
                    <div className="mt-1 flex items-center gap-1">
                      <Badge tone="brand">New from log</Badge>
                      <ActionButton variant="ghost" action={markTrackerLineReviewedAction.bind(null, l.id)}>Mark reviewed</ActionButton>
                    </div>
                  )}
                </Td>
                <Td className="font-medium">{l.clientName}</Td>
                <Td className="text-xs">{l.branch ?? ""}</Td>
                <Td>{l.typeOfWork}</Td>
                <Td className="text-xs">{l.bankName ?? ""}</Td>
                <Td className="whitespace-nowrap text-xs">{fmt(l.periodFrom)}</Td>
                <Td className="whitespace-nowrap text-xs">{l.periodTo ? fmt(l.periodTo) : <span className="text-muted">Onwards</span>}</Td>
                <Td className="text-xs">{STATUS_OF_WORK_LABEL[l.statusOfWork] ?? l.statusOfWork}</Td>
                <Td className="text-xs">{l.issueLevel && <Badge tone={l.issueLevel === "Critical" || l.issueLevel === "High" ? "danger" : l.issueLevel === "Medium" ? "warn" : "neutral"}>{l.issueLevel}</Badge>}</Td>
                <Td className="max-w-xs text-xs">{l.issueDetails ?? ""}</Td>
                <Td className="text-xs">{l.issueStatus ?? ""}</Td>
                <Td className="max-w-xs text-xs">{l.clientPendingItem ?? ""}</Td>
                <Td className="whitespace-nowrap text-xs">{fmt(l.clientRaisedOn)}</Td>
                <Td className="whitespace-nowrap text-xs">{fmt(l.clientDueBy)}</Td>
                <Td className="text-xs">{l.clientPendingStatus ?? ""}</Td>
                <Td className="max-w-xs text-xs">{l.teamPendingItem ?? ""}</Td>
                <Td className="whitespace-nowrap text-xs">{fmt(l.teamRaisedOn)}</Td>
                <Td className="whitespace-nowrap text-xs">{fmt(l.teamDueBy)}</Td>
                <Td className="text-xs">{l.teamPendingStatus ?? ""}</Td>
                <Td className="text-xs">{l.getFrom ?? ""}</Td>
                <Td className="whitespace-nowrap text-xs">{fmt(l.dateReceived)}</Td>
                <Td className="text-xs">{daysAllowed(l.clientRaisedOn, l.clientDueBy) ?? ""}</Td>
                <Td className="text-xs">{nameOf(l.maker)}</Td>
                <Td className="text-xs">{nameOf(l.checker)}</Td>
                <Td className="text-xs">{l.checkerStatus ?? ""}</Td>
                <Td><WorkStatusBadge s={l.work} /></Td>
                <Td className="whitespace-nowrap text-xs">{fmt(l.workStartDate)}</Td>
                <Td className="text-xs">{l.priority ?? ""}</Td>
                <Td className="whitespace-nowrap text-xs">{fmt(l.nextFollowUpOn)}</Td>
                <Td><FlagBadge f={l.flag} /></Td>
                <Td className="max-w-xs text-xs">{l.remarks ?? ""}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Card title="Add a line to the tracker" icon={<ClipboardList />}>
        <p className="mb-3 text-sm text-muted">The Maker sees this work in their timesheet and logs against its Ref No.; what they log (status, pending points, issues) updates this line.</p>
        <TrackerLineForm action={createTrackerLineAction} clients={clients} workTypes={workTypes.map((w) => w.name)} people={people} submitLabel="Add to tracker" />
      </Card>
    </div>
  );
}

export async function TrackerDashboardTab({ ctx }: { ctx: AppContext }) {
  const today = todayOf(ctx);
  const lines = await prisma.trackerLine.findMany({ where: { organizationId: ctx.organization.id }, take: 5000, include: lineInclude });
  const dash = trackerDashboard(lines.map((l) => ({ ...l, makerName: nameOf(l.maker) || null, checkerName: nameOf(l.checker) || null })), today);
  const s = dash.summary;
  const t = (q: string) => `/app/timesheet?tab=tracker&${q}`;
  if (!lines.length) return <EmptyState kind="calendar" title="Nothing tracked yet">Add lines on the Tracker tab, or let the team log work.</EmptyState>;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total items tracked" value={s.total} icon={<ListChecks />} href={t("")} />
        <Stat label="Items pending from client" value={s.pendingFromClient} icon={<Inbox />} tone={s.pendingFromClient ? "warn" : "neutral"} hint="Not cleared" href="/app/timesheet?tab=report" />
        <Stat label="Items received from client" value={s.received} icon={<CircleAlert />} tone="ok" hint="Cleared" />
        <Stat label="Open issues" value={s.openIssues} icon={<FileWarning />} tone={s.openIssuesSerious ? "danger" : s.openIssues ? "warn" : "neutral"} hint={`${s.openIssuesSerious} High or Critical`} />
        <Stat label="OVERDUE" value={s.overdue} icon={<AlarmClock />} tone={s.overdue ? "danger" : "neutral"} href={t("flag=OVERDUE")} />
        <Stat label="CLIENT DELAY" value={s.clientDelay} icon={<Clock />} tone={s.clientDelay ? "warn" : "neutral"} href={t("flag=CLIENT+DELAY")} />
        <Stat label="FOLLOW-UP DUE" value={s.followUpDue} icon={<Clock />} tone={s.followUpDue ? "info" : "neutral"} href={t("flag=FOLLOW-UP+DUE")} />
        <Stat label="Team members" value={dash.team.length} icon={<Users />} />
      </div>
      <Card title="By work status" padded={false}>
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-9">
          {WORK_STATUSES.map((w) => (
            <Link key={w} href={t(`status=${encodeURIComponent(w)}`)} className="bg-surface p-3 text-sm hover:bg-paper">
              <span className="block text-xs text-muted">{w}</span>
              <span className="text-lg font-semibold tabular-nums">{dash.statusCounts[w]}</span>
            </Link>
          ))}
        </div>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="By client" padded={false}>
          <Table minWidth={640}>
            <thead><tr><Th>Client</Th><Th>Total items</Th><Th>Pending from client</Th><Th>Completed</Th><Th>Open</Th><Th>Overdue</Th><Th>Open issues</Th></tr></thead>
            <tbody>
              {dash.byClient.map((c) => (
                <tr key={c.name}>
                  <Td className="font-medium"><Link href={t(`client=${encodeURIComponent(c.name)}`)} className="text-brand-700 hover:underline">{c.name}</Link></Td>
                  <Td>{c.total}</Td><Td>{c.pendingFromClient || 0}</Td><Td>{c.completed}</Td><Td>{c.open}</Td>
                  <Td>{c.overdue ? <Badge tone="danger">{c.overdue}</Badge> : 0}</Td><Td>{c.openIssues ? <Badge tone="warn">{c.openIssues}</Badge> : 0}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title="By type of work" padded={false}>
          <Table minWidth={420}>
            <thead><tr><Th>Type of work</Th><Th>Total items</Th><Th>Pending from client</Th></tr></thead>
            <tbody>{dash.byType.map((x) => <tr key={x.name}><Td>{x.name}</Td><Td>{x.total}</Td><Td>{x.pendingFromClient}</Td></tr>)}</tbody>
          </Table>
        </Card>
      </div>
      <Card title="Team workload" padded={false}>
        <Table minWidth={620}>
          <thead><tr><Th>Team member</Th><Th>Open as maker</Th><Th>Open as checker</Th><Th>Overdue (maker or checker)</Th><Th>Completed as maker</Th></tr></thead>
          <tbody>
            {dash.team.map((m) => (
              <tr key={m.name}><Td className="font-medium">{m.name}</Td><Td>{m.openMaker}</Td><Td>{m.openChecker}</Td><Td>{m.overdue ? <Badge tone="danger">{m.overdue}</Badge> : 0}</Td><Td>{m.completedMaker}</Td></tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

/** The letter to the client: what we still need from them. Internal columns and issues never show. */
export async function ClientPendingReportTab({ ctx, sp }: { ctx: AppContext; sp: SP }) {
  const organizationId = ctx.organization.id;
  const asOnIso = ISO.test(str(sp.ason)) ? str(sp.ason) : isoDateInTz(new Date(), ctx.organization.timezone);
  const asOn = dateOnly(asOnIso);
  const lines = await prisma.trackerLine.findMany({
    where: { organizationId, clientPendingItem: { not: null }, OR: [{ clientPendingStatus: null }, { clientPendingStatus: { not: "Cleared" } }] },
    orderBy: [{ clientName: "asc" }, { refNo: "asc" }],
    take: 3000,
  });
  const open = lines.filter((l) => onClientReport(l));
  const names = [...new Set(open.map((l) => l.clientName))];
  const client = names.includes(str(sp.client)) ? str(sp.client) : names[0] ?? "";
  const rows = open.filter((l) => l.clientName === client);
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-2 print:hidden">
        <input type="hidden" name="tab" value="report" />
        <label className="text-sm"><span className="mb-1 block font-medium">Select client</span>
          <select name="client" defaultValue={client} className="h-10 max-w-64 rounded-md border border-line bg-surface px-2 text-sm">
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="text-sm"><span className="mb-1 block font-medium">As on</span><input type="date" name="ason" defaultValue={asOnIso} className="h-10 rounded-md border border-line bg-surface px-2 text-sm" /></label>
        <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show</button>
        {client && <span className="ml-auto"><PrintButton /></span>}
      </form>
      {!client ? <EmptyState kind="done" title="Nothing pending from any client">Every pending item in the tracker is cleared.</EmptyState> : (
        <article className="mx-auto max-w-4xl rounded-xl border border-line bg-surface p-6 print:max-w-none print:border-0 print:p-0">
          <header className="border-b border-line pb-4 text-center">
            <p className="text-sm font-semibold">{ctx.organization.tradeName}</p>
            <h2 className="mt-1 text-lg font-bold tracking-wide">PENDING INFORMATION / DOCUMENTS LIST</h2>
          </header>
          <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-xs text-muted">Client</dt><dd className="font-medium">{client}</dd></div>
            <div><dt className="text-xs text-muted">As on</dt><dd className="font-medium">{formatDate(asOn)}</dd></div>
            <div><dt className="text-xs text-muted">Items pending</dt><dd className="font-medium">{rows.length}</dd></div>
          </dl>
          <p className="mt-4 text-sm">Dear Sir/Madam, kindly share the following information/documents at the earliest so that we can complete the work on your books of accounts without delay.</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top [&_th]:border [&_th]:border-line [&_th]:bg-paper [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-xs">
              <thead><tr><th>Sr</th><th>Ref No.</th><th>Branch</th><th>Period From</th><th>Period To</th><th>Information / Document Needed</th><th>Requested On</th><th>Please Send By</th><th>Status</th><th>Client Remarks</th></tr></thead>
              <tbody>
                {rows.map((l, i) => {
                  const late = l.clientDueBy && l.clientDueBy < asOn;
                  return (
                    <tr key={l.id}>
                      <td>{i + 1}</td><td className="font-mono text-xs">{l.refNo}</td><td>{l.branch ?? ""}</td>
                      <td className="whitespace-nowrap">{fmt(l.periodFrom)}</td><td className="whitespace-nowrap">{l.periodTo ? fmt(l.periodTo) : "Onwards"}</td>
                      <td className="whitespace-pre-line">{l.clientPendingItem}</td>
                      <td className="whitespace-nowrap">{fmt(l.clientRaisedOn)}</td>
                      <td className={late ? "whitespace-nowrap font-semibold text-danger" : "whitespace-nowrap"}>{fmt(l.clientDueBy)}</td>
                      <td>{l.clientPendingStatus ?? "Open"}</td><td className="w-40" />
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </div>
  );
}

// ============================================================ Team member views

function PendingList({ title, items, today }: { title: string; items: PendingPoint[]; today: Date }) {
  const byClient = new Map<string, PendingPoint[]>();
  for (const p of items) byClient.set(p.clientName, [...(byClient.get(p.clientName) ?? []), p]);
  return (
    <Card title={`${title} (${items.length})`}>
      {items.length === 0 ? <p className="text-sm text-muted">Nothing open.</p> : (
        <ul className="divide-y divide-line text-sm">
          {[...byClient.entries()].map(([client, list]) => (
            <li key={client} className="py-2">
              <p className="font-medium">{client}</p>
              {list.map((p) => {
                const due = dueStateOf(p.dueBy, p.status, today);
                const open = daysOpen(p.raisedOn, p.status, today);
                return (
                  <p key={p.key} className="mt-0.5 text-xs">
                    {p.item} <span className="text-muted">– asked {fmt(p.raisedOn) || "—"} | due {fmt(p.dueBy) || "—"} | {typeof open === "number" ? `${open} days` : open ?? "—"}</span>
                    {due === "OVERDUE" && <> <Badge tone="danger">OVERDUE</Badge></>}
                  </p>
                );
              })}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function memberFor(ctx: AppContext, sp: SP, viewAll: boolean) {
  const requested = UUID.test(str(sp.employee)) ? str(sp.employee) : "";
  if (viewAll && requested) {
    const e = await prisma.employee.findFirst({ where: { id: requested, organizationId: ctx.organization.id }, select: { id: true, firstName: true, lastName: true } });
    if (e) return e;
  }
  return ctx.employee ? { id: ctx.employee.id, firstName: ctx.employee.firstName, lastName: ctx.employee.lastName } : null;
}

async function MemberPicker({ ctx, tab, current, extra }: { ctx: AppContext; tab: string; current: string; extra?: React.ReactNode }) {
  const people = await employeeOptions(ctx.organization.id);
  return (
    <label className="text-sm"><span className="mb-1 block font-medium">Team member</span>
      <select name="employee" defaultValue={current} className="h-10 max-w-56 rounded-md border border-line bg-surface px-2 text-sm">
        {people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      <input type="hidden" name="tab" value={tab} />
      {extra}
    </label>
  );
}

/** The Day Report sheet: fills itself from the day's log; print or save as PDF. */
export async function DayReportTab({ ctx, sp, viewAll }: { ctx: AppContext; sp: SP; viewAll: boolean }) {
  const member = await memberFor(ctx, sp, viewAll);
  if (!member) return <EmptyState kind="people" title="No staff record">Your login is not linked to an employee.</EmptyState>;
  const iso = ISO.test(str(sp.date)) ? str(sp.date) : isoDateInTz(new Date(), ctx.organization.timezone);
  const day = dateOnly(iso);
  const today = todayOf(ctx);
  const [entries, points] = await Promise.all([
    prisma.timesheetEntry.findMany({ where: { employeeId: member.id, workDate: day }, orderBy: { serialNumber: "asc" } }),
    pendingPointsFor(ctx.organization.id, member.id),
  ]);
  const minutes = entries.reduce((s, e) => s + (e.approxMinutes ?? 0), 0);
  const clients = new Set(entries.map((e) => e.clientNameText ?? "")).size;
  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-2 print:hidden">
        <label className="text-sm"><span className="mb-1 block font-medium">Report date</span><input type="date" name="date" defaultValue={iso} className="h-10 rounded-md border border-line bg-surface px-2 text-sm" /></label>
        {viewAll ? <MemberPicker ctx={ctx} tab="day" current={member.id} /> : <input type="hidden" name="tab" value="day" />}
        <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show</button>
        <span className="ml-auto flex gap-2"><PrintButton /><Link href="/app/day-reports" className="inline-flex h-10 items-center rounded-md border border-line px-3 text-sm hover:bg-subtle">Send to manager</Link></span>
      </form>
      <header className="text-center">
        <h2 className="text-lg font-bold tracking-wide">DAILY WORK REPORT</h2>
        <p className="text-sm text-muted">{ctx.organization.tradeName} · {nameOf(member)} · {formatDate(day)}</p>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Total time (hrs)" value={minutesToHhmm(minutes)} />
        <Stat label="Work entries" value={entries.length} />
        <Stat label="Clients visited" value={clients} />
        <Stat label="Pending with client" value={points.client.length} tone={points.client.length ? "warn" : "neutral"} />
        <Stat label="Pending with team member" value={points.team.length} tone={points.team.length ? "info" : "neutral"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <PendingList title="Pending with client (we asked – client has not given)" items={points.client} today={today} />
        <PendingList title="Pending with team member (our side – still to do)" items={points.team} today={today} />
      </div>
      <Card title="Work done on the day" padded={false}>
        {entries.length === 0 ? <p className="p-4 text-sm text-muted">No work logged on this day.</p> : (
          <Table minWidth={980}>
            <thead><tr><Th>Sr.</Th><Th>Client Name</Th><Th>Place of Work</Th><Th>Work Done</Th><Th>Bank Name</Th><Th>Period</Th><Th>Txns / Entries</Th><Th>Time (Hrs)</Th><Th>Elaboration / Details</Th><Th>Status</Th></tr></thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id}>
                  <Td>{i + 1}</Td><Td className="font-medium">{e.clientNameText ?? ""}</Td><Td className="text-xs">{e.placeOfWork ?? ""}</Td><Td>{e.typeOfWork ?? ""}</Td>
                  <Td className="text-xs">{e.bankName ?? ""}</Td><Td className="whitespace-nowrap text-xs">{e.periodFrom ? `${fmt(e.periodFrom)} – ${fmt(e.periodTo)}` : ""}</Td>
                  <Td>{e.transactionCount ?? ""}</Td><Td>{e.approxMinutes ? minutesToHhmm(e.approxMinutes) : ""}</Td>
                  <Td className="max-w-xs text-xs">{e.workDetails ?? ""}</Td><Td className="text-xs">{e.workStatus ? STATUS_OF_WORK_LABEL[e.workStatus] : ""}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function PointsTable({ items, today }: { items: PendingPoint[]; today: Date }) {
  if (!items.length) return <p className="p-4 text-sm text-muted">Nothing open.</p>;
  return (
    <Table minWidth={860}>
      <thead><tr><Th>Sr</Th><Th>Client Name</Th><Th>Work Date</Th><Th>Pending Item</Th><Th>Asked / Raised On</Th><Th>Due By</Th><Th>Days Pending</Th><Th>Status</Th></tr></thead>
      <tbody>
        {items.map((p, i) => {
          const due = dueStateOf(p.dueBy, p.status, today);
          const open = daysOpen(p.raisedOn, p.status, today);
          return (
            <tr key={p.key}>
              <Td>{i + 1}</Td><Td className="font-medium">{p.clientName}</Td><Td className="whitespace-nowrap text-xs">{fmt(p.workDate)}</Td>
              <Td className="max-w-sm whitespace-pre-line text-xs">{p.item}{p.refNo && <span className="ml-1 font-mono text-muted">({p.refNo})</span>}</Td>
              <Td className="whitespace-nowrap text-xs">{fmt(p.raisedOn)}</Td><Td className="whitespace-nowrap text-xs">{fmt(p.dueBy)}</Td>
              <Td>{open ?? "—"}</Td><Td><Badge tone={DUE_TONE[due]}>{due}</Badge></Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}

/** The Pending Tracker sheet: nothing to type, everything comes from the log. */
export async function MyPendingTab({ ctx, sp, viewAll }: { ctx: AppContext; sp: SP; viewAll: boolean }) {
  const member = await memberFor(ctx, sp, viewAll);
  if (!member) return <EmptyState kind="people" title="No staff record">Your login is not linked to an employee.</EmptyState>;
  const today = todayOf(ctx);
  const points = await pendingPointsFor(ctx.organization.id, member.id);
  const overdue = (xs: PendingPoint[]) => xs.filter((p) => dueStateOf(p.dueBy, p.status, today) === "OVERDUE").length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-sm text-muted">As on <strong className="text-ink">{formatDate(today)}</strong> · {nameOf(member)}. Clear an item by logging work with its status set to Cleared.</p>
        {viewAll && <form className="flex items-end gap-2"><MemberPicker ctx={ctx} tab="mine" current={member.id} /><button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show</button></form>}
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open with client" value={points.client.length} tone={points.client.length ? "warn" : "neutral"} />
        <Stat label="OVERDUE with client" value={overdue(points.client)} tone={overdue(points.client) ? "danger" : "neutral"} />
        <Stat label="Open with me" value={points.team.length} tone={points.team.length ? "info" : "neutral"} />
        <Stat label="OVERDUE with me" value={overdue(points.team)} tone={overdue(points.team) ? "danger" : "neutral"} />
      </div>
      <Card title="Pending with client" padded={false}><PointsTable items={points.client} today={today} /></Card>
      <Card title="Pending with me (team member)" padded={false}><PointsTable items={points.team} today={today} /></Card>
    </div>
  );
}

