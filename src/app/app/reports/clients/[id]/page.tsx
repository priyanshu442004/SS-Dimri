import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { formatDate, formatDateTime, isoDateInTz, minutesToHhmm } from "@/lib/dates";
import { buildClientReport } from "@/lib/services/client-report";
import { Card, DetailList, EmptyState, humanize, Notice, PageHeader, Stat, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { addDueAction, saveSnapshotAction, setObservationAction, updateDueAction } from "../actions";
import { DueForm, DueUpdateForm, ObservationForm, PrintButton, SnapshotForm } from "./forms";
import { BarList, ChartCard, TrendLine } from "@/components/charts";

const inr = (n: number) => `₹ ${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default async function ClientReportPage({ params, searchParams }: PageProps<"/app/reports/clients/[id]">) {
  const ctx = await requireCapability("reports.client");
  const { id } = await params;
  const sp = await searchParams;
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : `${today.slice(0, 7)}-01`;
  const to = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : today;
  const tab = sp.tab === "dues" ? "dues" : sp.tab === "history" ? "history" : "report";

  const exists = await prisma.client.findFirst({ where: { id, organizationId: ctx.organization.id }, select: { id: true } });
  if (!exists) notFound();
  const r = await buildClientReport(ctx.organization.id, id, from, to);
  const base = `/app/reports/clients/${id}?from=${from}&to=${to}`;
  const services = await prisma.clientService.findMany({ where: { clientId: id }, include: { service: { select: { name: true } } } });

  return (
    <>
      <PageHeader
        title={`Client report — ${r.client.tradeName}`}
        back={{ href: "/app/reports/clients", label: "Client reports" }}
        description={`${r.client.code ?? ""} · ${r.client.constitution ?? ""} · GSTIN ${r.client.gstins.join(", ") || "—"} · ${formatDate(new Date(from))} – ${formatDate(new Date(to))}`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <PrintButton />
            <a href={`/app/reports/clients/${id}/export?from=${from}&to=${to}`} className="inline-flex h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-subtle">Client-facing CSV</a>
          </div>
        }
      />
      <form className="mb-4 flex flex-wrap items-end gap-2 text-sm print:hidden">
        <input type="hidden" name="tab" value={tab} />
        <label><span className="mb-1 block font-medium">From</span><input type="date" name="from" defaultValue={from} className="h-10 rounded-md border border-line bg-surface px-2" /></label>
        <label><span className="mb-1 block font-medium">To</span><input type="date" name="to" defaultValue={to} className="h-10 rounded-md border border-line bg-surface px-2" /></label>
        <button className="h-10 rounded-md border border-line bg-surface px-4 hover:bg-subtle">Update period</button>
      </form>
      <TabNav
        current={tab}
        tabs={[
          { key: "report", label: "Report (13A)", href: base },
          { key: "dues", label: "Client pending report — dues (13B)", href: `${base}&tab=dues` },
          { key: "history", label: "Saved snapshots", href: `${base}&tab=history` },
        ]}
      />

      {tab === "report" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Team involved" value={r.team.length} />
            <Stat label="Hours recorded" value={minutesToHhmm(r.team.reduce((s, t) => s + t.minutes, 0))} hint={`${minutesToHhmm(r.team.reduce((s, t) => s + t.reviewedMinutes, 0))} reviewed`} />
            <Stat label="Pending — our side" value={r.pendingOurSide.filter((p) => p.status !== "CLOSED").length} />
            <Stat label="Pending — client side" value={r.pendingClientSide.filter((p) => p.status !== "CLOSED").length} />
            <Stat label="Outstanding dues" value={inr(r.duesOutstanding)} />
          </div>

          <Card title="Team list & team-wise work" padded={false}>
            <p className="px-4 pt-3 text-xs text-muted print:px-0">Hours are taken from timesheet entries dated in this period: <em>recorded</em> includes entries not yet reviewed; <em>reviewed</em> counts only entries a leader has marked reviewed. Committed work is listed separately below.</p>
            {r.team.length === 0 ? <p className="p-4 text-sm text-muted">No team activity in this period.</p> : (
              <Table minWidth={640}>
                <thead><tr><Th>Team member</Th><Th>Allocated</Th><Th>Hours recorded</Th><Th>Of which reviewed</Th><Th>Transactions / entries</Th><Th>Tasks completed</Th><Th>Open tasks</Th></tr></thead>
                <tbody>
                  {r.team.map((t) => (
                    <tr key={t.name}>
                      <Td className="font-medium"><Link href={`/app/employees/${t.id}`} className="text-brand-700 hover:underline">{t.name}</Link><div className="text-xs font-normal text-muted">{t.designation}</div></Td>
                      <Td>{t.allocated ? <Link href={`/app/allocations?client=${id}`} className="text-brand-700 hover:underline">Yes</Link> : "—"}</Td>
                      <Td><Link href={`/app/timesheet?tab=collective&client=${id}&employee=${t.id}&from=${from}&to=${to}`} className="text-brand-700 hover:underline">{minutesToHhmm(t.minutes)}</Link></Td>
                      <Td>{minutesToHhmm(t.reviewedMinutes)}</Td>
                      <Td>{t.entries || "—"}</Td>
                      <Td>{t.tasksCompleted}</Td>
                      <Td>{t.openTasks}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          {r.hoursByDay.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2 print:hidden">
              <ChartCard title="Hours recorded per day" subtitle="Days with timesheet entries for this client" table={{ head: ["Date", "Hours"], rows: r.hoursByDay.map((d) => [d.date, minutesToHhmm(d.minutes)]) }}>
                <TrendLine points={r.hoursByDay.map((d) => ({ date: d.date, values: [d.minutes] }))} series={["Hours"]} format="minutes" />
              </ChartCard>
              <ChartCard title="Hours by team member" table={{ head: ["Team member", "Recorded", "Reviewed"], rows: r.team.map((t) => [t.name, minutesToHhmm(t.minutes), minutesToHhmm(t.reviewedMinutes)]) }}>
                <BarList data={r.team.map((t) => ({ label: t.name, value: t.minutes, href: `/app/employees/${t.id}` }))} format="minutes" color="var(--color-series-3)" />
              </ChartCard>
            </div>
          )}

          <Card title="Hours by day" padded={false}>
            {r.hoursByDay.length === 0 ? <p className="p-4 text-sm text-muted">No timesheet entries for this client in this period.</p> : (
              <Table minWidth={360}>
                <thead><tr><Th>Date</Th><Th>Hours</Th></tr></thead>
                <tbody>
                  {r.hoursByDay.map((d) => (
                    <tr key={d.date}>
                      <Td><Link href={`/app/timesheet?tab=collective&client=${id}&from=${d.date}&to=${d.date}`} className="text-brand-700 hover:underline">{formatDate(new Date(d.date))}</Link></Td>
                      <Td>{minutesToHhmm(d.minutes)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <Card title="Tasks — maker, checker and client observation" padded={false} actions={<Link href={`/app/observations?client=${id}&state=all`} className="text-sm text-brand-700 hover:underline print:hidden">Observation register</Link>}>
            {r.tasks.length === 0 ? <p className="p-4 text-sm text-muted">No tasks in this period.</p> : (
              <Table minWidth={1000}>
                <thead><tr><Th>Task</Th><Th>Status</Th><Th>Maker</Th><Th>Checker</Th><Th>Client observation</Th></tr></thead>
                <tbody>
                  {r.tasks.map((t) => (
                    <tr key={t.id}>
                      <Td><a href={`/app/tasks/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.title}</a><div className="text-xs text-muted">{t.assignees}{t.dueAt && ` · due ${formatDateTime(new Date(t.dueAt))}`}</div></Td>
                      <Td><StatusBadge status={t.status} />{t.overdue && <div className="mt-1"><StatusBadge status="OVERDUE" /></div>}</Td>
                      <Td className="text-xs">{t.maker ?? "—"}<div className="text-muted">{humanize(t.makerStatus)}</div></Td>
                      <Td className="text-xs">{t.checker ?? "—"}<div className="text-muted">{humanize(t.checkerStatus)}</div></Td>
                      <Td><ObservationForm action={setObservationAction.bind(null, id, t.id)} status={t.observation} note={t.observationNote ?? ""} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {([["Pending — our side", r.pendingOurSide], ["Pending — client side", r.pendingClientSide]] as const).map(([title, rows]) => (
              <Card key={title} title={title} actions={<Link href={`/app/pending?client=${id}`} className="text-sm text-brand-700 hover:underline print:hidden">Open tracker</Link>}>
                {rows.length === 0 ? <p className="text-sm text-muted">Nothing pending.</p> : (
                  <ul className="divide-y divide-line text-sm">
                    {rows.map((p) => (
                      <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                        <span>{p.what}<span className="block text-xs text-muted">asked {formatDate(new Date(p.requestedOn))}{p.dueBy && ` · due ${formatDate(new Date(p.dueBy))}`}</span></span>
                        <span className="text-right text-xs"><StatusBadge status={p.status} /><span className="block text-muted">{p.daysPending} days</span></span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Fee details">
              {r.fees.length === 0 ? <p className="text-sm text-muted">No agreed fees are recorded on this client&apos;s services.</p> : (
                <>
                  <ul className="divide-y divide-line text-sm">
                    {r.fees.map((f, i) => (
                      <li key={i} className="flex justify-between py-2"><span>{f.service}{f.nature && <span className="text-xs text-muted"> · {humanize(f.nature)}</span>} <StatusBadge status={f.status} /></span><span>{inr(f.agreedFee)}</span></li>
                    ))}
                  </ul>
                  <p className="mt-2 flex justify-between border-t border-line pt-2 text-sm font-semibold"><span>Total (active services)</span><span>{inr(r.feesTotal)}</span></p>
                </>
              )}
            </Card>
            <Card title="Team-wise committed work">
              {r.commitments.length === 0 ? <p className="text-sm text-muted">No commitments recorded for this period.</p> : (
                <ul className="space-y-2 text-sm">{r.commitments.map((c, i) => <li key={i}><strong>{c.employee}</strong>: {c.description} <StatusBadge status={c.status} /></li>)}</ul>
              )}
            </Card>
          </div>

          <Card title="End-of-month summary — save snapshot" className="print:hidden">
            <p className="mb-3 text-sm text-muted">Saves this report exactly as shown, so later changes to tasks or timesheets do not alter it.</p>
            <SnapshotForm action={saveSnapshotAction.bind(null, id)} from={from} to={to} />
          </Card>
        </div>
      )}

      {tab === "dues" && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-3">
            <Notice tone="info">Dues are recorded manually until the fee, invoice and payment process is confirmed. This is not an accounting ledger.</Notice>
            {r.dues.length === 0 ? <EmptyState kind="chart" title="No dues recorded" /> : r.dues.map((d) => (
              <article key={d.id} className="rounded-lg border border-line bg-surface p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{d.description}</p>
                    <p className="text-xs text-muted">{[d.service, d.reference && `Ref ${d.reference}`, d.dueDate && `due ${formatDate(new Date(d.dueDate))}`].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="text-right"><p className="font-semibold">{inr(d.amount)}</p><StatusBadge status={d.status} /></div>
                </div>
                {d.followUps.length > 0 && <ul className="mt-2 space-y-0.5 text-xs text-muted">{d.followUps.map((f, i) => <li key={i}>{formatDateTime(new Date(f.at))}: {f.note}</li>)}</ul>}
                <div className="mt-3 border-t border-line pt-3"><DueUpdateForm action={updateDueAction.bind(null, id, d.id)} status={d.status} /></div>
              </article>
            ))}
          </div>
          <Card title="Record a due" className="h-fit">
            <DueForm action={addDueAction.bind(null, id)} services={services.map((s) => ({ value: s.id, label: s.service.name }))} />
          </Card>
        </div>
      )}

      {tab === "history" && <History clientId={id} />}
    </>
  );
}

async function History({ clientId }: { clientId: string }) {
  const reports = await prisma.clientReport.findMany({
    where: { clientId },
    orderBy: { generatedAt: "desc" },
    include: { generatedBy: { select: { name: true } } },
  });
  if (reports.length === 0) return <EmptyState kind="documents" title="No saved snapshots yet" />;
  return (
    <div className="space-y-3">
      {reports.map((rep) => {
        const s = rep.snapshot as { team?: { name: string; minutes: number }[]; duesOutstanding?: number; feesTotal?: number } | null;
        return (
          <Card key={rep.id} title={`${formatDate(rep.periodStart)} – ${formatDate(rep.periodEnd)}`}>
            <DetailList
              items={[
                ["Saved", `${formatDateTime(rep.generatedAt)} by ${rep.generatedBy?.name ?? "—"}`],
                ["Team", s?.team?.map((t) => t.name).join(", ")],
                ["Fees total", s?.feesTotal !== undefined ? inr(s.feesTotal) : null],
                ["Outstanding dues", s?.duesOutstanding !== undefined ? inr(s.duesOutstanding) : null],
                ["Summary", rep.summaryNotes],
              ]}
            />
          </Card>
        );
      })}
    </div>
  );
}
