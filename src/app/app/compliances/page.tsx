import Link from "next/link";
import { clsx } from "clsx";
import { BookOpen } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDate, todayDateOnly, toIsoDate } from "@/lib/dates";
import { COMPLIANCE_STATUS_LABELS, complianceStatus, daysRemaining, isEscalated, type ComplianceStatus } from "@/lib/domain/compliance";
import { complianceScope } from "@/lib/services/compliance";
import { canDelete } from "@/lib/services/deletions";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { ActionButton } from "@/components/action-button";
import { DeleteButton } from "@/components/delete-dialog";
import { Badge, Card, DownloadButton, EmptyState, Notice, PageHeader, Stat, TabNav, Table, Td, Th } from "@/components/ui";
import { addComplianceColumnAction, completeComplianceEntryAction, createComplianceEntryAction, removeComplianceColumnAction, setAppliesToFirmAction, updateComplianceEntryAction } from "./actions";
import { AddColumnForm, AppliesToFirmSelect, ComplianceEntryForm } from "./forms";

const STATUS_TONE: Record<ComplianceStatus, "ok" | "warn" | "danger" | "info" | "neutral"> = { COMPLETED: "neutral", OVERDUE: "danger", DUE_THIS_WEEK: "warn", UPCOMING: "info", OK: "ok" };
const STATUSES = Object.keys(COMPLIANCE_STATUS_LABELS) as ComplianceStatus[];

export default async function CompliancesPage({ searchParams }: PageProps<"/app/compliances">) {
  const ctx = await requireCapability("compliance.use");
  const sp = await searchParams;
  const manage = can(ctx, "compliance.manage");
  const mayDelete = canDelete(ctx, "compliance");

  const [items, settings] = await Promise.all([
    prisma.complianceItem.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.organizationComplianceSetting.findMany({ where: { organizationId: ctx.organization.id } }),
  ]);
  const departments = [...new Set(items.map((i) => i.department))];
  const dept = typeof sp.dept === "string" && departments.includes(sp.dept) ? sp.dept : departments[0] ?? "";
  const rows = items.filter((i) => i.department === dept);
  const selected = typeof sp.item === "string" ? rows.find((r) => r.id === sp.item) : undefined;
  const tab = sp.tab === "calendar" ? "calendar" : "tracker";
  const status = STATUSES.find((s) => s === sp.status);
  const appliesTo = new Map(settings.map((s) => [s.complianceItemId, s.appliesToFirm]));

  const href = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { tab, dept, item: selected?.id, status, ...extra };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/app/compliances?${p}`;
  };

  return (
    <>
      <PageHeader
        icon={<BookOpen />}
        title="Compliance"
        description="Choose a module such as GST to see its compliances, then track each filing: who is responsible, when it is due, and whether it is done."
        actions={tab === "tracker" && <DownloadButton href={`/app/compliances/export?dept=${encodeURIComponent(dept)}${selected ? `&item=${selected.id}` : ""}`}>Export to Excel</DownloadButton>}
      />

      <h2 className="mb-2 text-xs font-medium text-muted">Module</h2>
      <TabNav current={dept} tabs={departments.map((d) => ({ key: d, label: d, href: `/app/compliances?tab=${tab}&dept=${encodeURIComponent(d)}`, count: items.filter((i) => i.department === d).length }))} />

      <h2 className="mb-2 mt-1 text-xs font-medium text-muted">{dept} compliances</h2>
      <div className="mb-6 flex flex-wrap gap-1.5" role="group" aria-label={`${dept} compliances`}>
        <Link href={href({ item: undefined })} aria-current={!selected ? "true" : undefined} className={clsx("rounded-full border px-3 py-1 text-sm transition-colors", !selected ? "border-ink bg-ink text-paper" : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink")}>All {dept}</Link>
        {rows.map((r) => (
          <Link key={r.id} href={href({ item: r.id })} aria-current={selected?.id === r.id ? "true" : undefined} className={clsx("rounded-full border px-3 py-1 text-sm transition-colors", selected?.id === r.id ? "border-ink bg-ink text-paper" : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink")}>
            {r.name}
          </Link>
        ))}
      </div>

      {selected && (
        <Card title={selected.name} className="mb-6">
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {([["Form / return", selected.form], ["Applicable to", selected.applicableTo], ["Frequency", selected.frequency], ["Due date", selected.dueDateRule], ["Late fee / penalty", selected.penalty], ["Remarks", selected.remarks]] as const).map(([k, v]) => (
              <div key={k} className="min-w-0"><dt className="text-xs font-medium text-muted">{k}</dt><dd className="mt-0.5 break-words">{v ?? "—"}</dd></div>
            ))}
          </dl>
        </Card>
      )}

      <nav className="mb-4 inline-flex gap-1 rounded-lg border border-line bg-paper/70 p-1 text-sm" aria-label="View">
        <Link href={href({ tab: "tracker" })} aria-current={tab === "tracker" ? "page" : undefined} className={clsx("rounded-md px-3 py-1", tab === "tracker" ? "bg-ink text-paper" : "text-muted hover:text-ink")}>Tracker</Link>
        <Link href={href({ tab: "calendar" })} aria-current={tab === "calendar" ? "page" : undefined} className={clsx("rounded-md px-3 py-1", tab === "calendar" ? "bg-ink text-paper" : "text-muted hover:text-ink")}>Due-date calendar</Link>
      </nav>

      {tab === "calendar" ? <Calendar /> : <Tracker />}
    </>
  );

  function Calendar() {
    const shown = selected ? [selected] : rows;
    return (
      <>
        <div className="mb-4"><Notice tone="warn">Due dates are as compiled in October 2026 and change by notification. Verify each year before relying on them.</Notice></div>
        <Table minWidth={1120}>
          <thead><tr><Th>Compliance</Th><Th>Form</Th><Th>Applicable to</Th><Th>Frequency</Th><Th>Due date</Th><Th>Late fee / penalty</Th><Th>Applies to our firm?</Th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.name}{r.remarks && <div className="text-xs font-normal text-muted">{r.remarks}</div>}</Td>
                <Td className="text-xs">{r.form ?? "—"}</Td>
                <Td className="text-xs">{r.applicableTo ?? "—"}</Td>
                <Td className="text-xs">{r.frequency ?? "—"}</Td>
                <Td className="text-xs">{r.dueDateRule ?? "—"}</Td>
                <Td className="text-xs">{r.penalty ?? "—"}</Td>
                <Td className="text-xs">
                  {manage
                    ? <AppliesToFirmSelect action={setAppliesToFirmAction.bind(null, r.id)} value={!!appliesTo.get(r.id)} label={`Does ${r.name} apply to our firm?`} />
                    : appliesTo.get(r.id) ? "Yes" : "No"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </>
    );
  }

  async function Tracker() {
    const today = todayDateOnly(ctx.organization.timezone);
    const where: Prisma.ComplianceEntryWhereInput = {
      AND: [complianceScope(ctx), { department: dept }, selected ? { OR: [{ complianceItemId: selected.id }, { complianceType: { contains: selected.name, mode: "insensitive" } }] } : {}],
    };
    const [entries, columns, clients, employees] = await Promise.all([
      prisma.complianceEntry.findMany({
        where,
        orderBy: [{ actionTaken: "asc" }, { dueDate: "asc" }],
        take: 500,
        include: { client: { select: { id: true, tradeName: true } }, responsible: { select: { firstName: true, lastName: true } } },
      }),
      prisma.complianceColumn.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { sortOrder: "asc" } }),
      manage ? activeClientOptions(ctx.organization.id) : Promise.resolve([]),
      manage ? employeeOptions(ctx.organization.id) : Promise.resolve([]),
    ]);
    const withStatus = entries.map((e) => ({ e, s: complianceStatus(e, today), left: daysRemaining(e.dueDate, today), escalated: isEscalated(e, today) }));
    // The Upcoming tile counts everything not yet pressing, so its list does too.
    const shown = status ? withStatus.filter((r) => r.s === status || (status === "UPCOMING" && r.s === "OK")) : withStatus;
    const count = (s: ComplianceStatus) => withStatus.filter((r) => r.s === s).length;
    const choices = items.map((i) => ({ id: i.id, department: i.department, name: i.name, form: i.form, frequency: i.frequency }));
    const custom = (v: unknown) => (v ?? {}) as Record<string, string>;
    const d = (x: Date | null) => (x ? toIsoDate(x) : "");

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Overdue" value={count("OVERDUE")} href={href({ status: status === "OVERDUE" ? undefined : "OVERDUE" })} active={status === "OVERDUE"} tone={count("OVERDUE") ? "danger" : "neutral"} />
          <Stat label="Due this week" value={count("DUE_THIS_WEEK")} href={href({ status: status === "DUE_THIS_WEEK" ? undefined : "DUE_THIS_WEEK" })} active={status === "DUE_THIS_WEEK"} tone={count("DUE_THIS_WEEK") ? "warn" : "neutral"} />
          <Stat label="Upcoming" value={count("UPCOMING") + count("OK")} href={href({ status: status === "UPCOMING" ? undefined : "UPCOMING" })} active={status === "UPCOMING"} tone="info" />
          <Stat label="Completed" value={count("COMPLETED")} href={href({ status: status === "COMPLETED" ? undefined : "COMPLETED" })} active={status === "COMPLETED"} tone="ok" />
        </div>

        {shown.length === 0 ? (
          <EmptyState kind="calendar" title={`Nothing tracked for ${selected?.name ?? dept} yet`}>{manage ? "Add a filing below to start tracking it." : "Filings you are responsible for will appear here."}</EmptyState>
        ) : (
          <Table minWidth={1500 + columns.length * 140}>
            <thead>
              <tr>
                <Th>S.No</Th><Th>Client</Th><Th>Compliance / licence type</Th><Th>Issuing authority</Th><Th>Licence / reg. no.</Th><Th>Due date</Th><Th>Renewal frequency</Th><Th>Responsible person</Th><Th>Reminder lead days</Th><Th>Days remaining</Th><Th>Status</Th><Th>Action taken</Th><Th>Action taken date</Th><Th>Escalated</Th>
                {columns.map((c) => <Th key={c.id}>{c.label}</Th>)}
                <Th>Remarks</Th><Th />
              </tr>
            </thead>
            <tbody>
              {shown.map(({ e, s, left, escalated }, i) => (
                <tr key={e.id}>
                  <Td>{i + 1}</Td>
                  <Td className="font-medium">{e.client ? <Link href={`/app/clients/${e.client.id}`} className="text-brand-700 hover:underline">{e.client.tradeName}</Link> : ctx.organization.tradeName}</Td>
                  <Td>{e.complianceType}</Td>
                  <Td className="text-xs">{e.issuingAuthority ?? "—"}</Td>
                  <Td className="font-mono text-xs">{e.registrationNumber ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-xs">{formatDate(e.dueDate)}</Td>
                  <Td className="text-xs">{e.frequency ?? "—"}</Td>
                  <Td className="text-xs">{e.responsible ? `${e.responsible.firstName} ${e.responsible.lastName ?? ""}`.trim() : "—"}</Td>
                  <Td className="text-xs">{e.reminderLeadDays}</Td>
                  <Td className={clsx("text-xs", !e.actionTaken && left < 0 && "font-medium text-danger")}>{e.actionTaken ? "—" : left}</Td>
                  <Td><Badge tone={STATUS_TONE[s]}>{COMPLIANCE_STATUS_LABELS[s]}</Badge></Td>
                  <Td className="text-xs">{e.actionTaken ? "Yes" : "No"}</Td>
                  <Td className="whitespace-nowrap text-xs">{e.actionTakenOn ? formatDate(e.actionTakenOn) : "—"}</Td>
                  <Td className="text-xs">{escalated ? <Badge tone="danger">Escalated</Badge> : "—"}</Td>
                  {columns.map((c) => <Td key={c.id} className="text-xs">{custom(e.customValues)[c.id] ?? "—"}</Td>)}
                  <Td className="max-w-xs text-xs">{e.remarks ?? "—"}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      {!e.actionTaken && <ActionButton action={completeComplianceEntryAction.bind(null, e.id)}>Mark done</ActionButton>}
                      {manage && (
                        <details className="text-sm">
                          <summary className="cursor-pointer rounded-md px-2 py-1 text-brand-700 hover:bg-subtle">Edit</summary>
                          <div className="absolute right-4 z-20 mt-2 w-[min(46rem,calc(100vw-3rem))] rounded-xl border border-line bg-surface p-4 shadow-[0_18px_40px_-20px_rgb(15_29_51/.5)]">
                            <ComplianceEntryForm
                              action={updateComplianceEntryAction.bind(null, e.id)}
                              departments={departments}
                              items={choices}
                              clients={clients}
                              employees={employees}
                              columns={columns}
                              submitLabel="Save"
                              defaults={{
                                department: e.department, complianceItemId: e.complianceItemId ?? "", complianceType: e.complianceType, clientId: e.clientId ?? "",
                                issuingAuthority: e.issuingAuthority ?? "", registrationNumber: e.registrationNumber ?? "", dueDate: d(e.dueDate), frequency: e.frequency ?? "",
                                responsibleEmployeeId: e.responsibleEmployeeId ?? "", reminderLeadDays: String(e.reminderLeadDays), actionTaken: e.actionTaken, actionTakenOn: d(e.actionTakenOn), remarks: e.remarks ?? "",
                                custom: custom(e.customValues),
                              }}
                            />
                          </div>
                        </details>
                      )}
                      {mayDelete && <DeleteButton entity="compliance" id={e.id} variant="ghost" />}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        {manage && (
          <>
            <Card title="Track a filing or licence">
              <ComplianceEntryForm
                key={`${dept}-${selected?.id ?? ""}`}
                action={createComplianceEntryAction}
                departments={departments}
                items={choices}
                clients={clients}
                employees={employees}
                columns={columns}
                submitLabel="Add to tracker"
                resetOnSuccess
                defaults={{ department: dept, complianceItemId: selected?.id, complianceType: selected?.name }}
              />
            </Card>
            <Card title="Extra tracker columns">
              <p className="mb-3 text-sm text-muted">Need a column that is not listed? Add it here and it appears in this table, in the form above, and in the Excel export.</p>
              {columns.length > 0 && (
                <ul className="mb-4 flex flex-wrap gap-2">
                  {columns.map((c) => (
                    <li key={c.id} className="inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-sm">
                      {c.label}
                      <ActionButton variant="ghost" confirm={`Remove the “${c.label}” column?`} action={removeComplianceColumnAction.bind(null, c.id)}>Remove</ActionButton>
                    </li>
                  ))}
                </ul>
              )}
              <AddColumnForm action={addComplianceColumnAction} />
            </Card>
          </>
        )}
      </div>
    );
  }
}
