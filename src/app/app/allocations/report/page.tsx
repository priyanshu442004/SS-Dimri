import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireCapability } from "@/lib/session";
import { formatDate, isoDateInTz } from "@/lib/dates";
import { clientAllocationReport, parseReportFilters, reportQuery, teamAllocationReport } from "@/lib/services/allocation-report";
import { Badge, DownloadButton, EmptyState, PageHeader, Stat, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";

export const metadata: Metadata = { title: "Allocation reports" };
const selectCls = "h-10 rounded-md border border-line bg-surface px-2 text-sm";

// Client allocation (allocated / not allocated) and team-wise allocation reports (tracker S.No. 80, 81).
export default async function AllocationReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCapability("allocations.view_all");
  const f = parseReportFilters(await searchParams);
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  return (
    <>
      <PageHeader icon={<ClipboardList />} title="Allocation reports" back={{ href: "/app/allocations", label: "Team allocation" }}
        description="Which clients have a team and which have none, and which clients each person handles — with role, days and hours. Counts allocations that are active or planned and not yet ended."
        actions={<DownloadButton href={`/app/allocations/report/export${reportQuery(f)}`}>Export to Excel</DownloadButton>} />
      <TabNav current={f.tab} tabs={[
        { key: "clients", label: "Client allocation", href: `/app/allocations/report${reportQuery({ ...f, tab: "clients" })}` },
        { key: "team", label: "Team-wise allocation", href: `/app/allocations/report${reportQuery({ ...f, tab: "team" })}` },
      ]} />
      {f.tab === "team" ? <Team /> : <Clients />}
    </>
  );

  async function Clients() {
    const r = await clientAllocationReport(ctx.organization.id, f, today);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="Clients" value={r.total} hint={f.status === "all" ? "Any status" : `Status: ${f.status.toLowerCase().replace("_", " ")}`} />
          <Stat label="Allocated" value={r.allocatedCount} tone="ok" href={`/app/allocations/report${reportQuery({ ...f, allocated: "yes" })}`} />
          <Stat label="Not allocated to anyone" value={r.notAllocated} tone={r.notAllocated ? "warn" : "ok"} href={`/app/allocations/report${reportQuery({ ...f, allocated: "no" })}`} />
        </div>
        <form className="flex flex-wrap items-end gap-2" role="search">
          <input type="hidden" name="tab" value="clients" />
          <input name="q" defaultValue={f.q} placeholder="Client name or code" className={`${selectCls} w-56`} aria-label="Search clients" />
          <select name="allocated" defaultValue={f.allocated} className={selectCls} aria-label="Allocation">
            <option value="">Allocated and not allocated</option>
            <option value="yes">Allocated only</option>
            <option value="no">Not allocated only</option>
          </select>
          <select name="status" defaultValue={f.status} className={selectCls} aria-label="Client status">
            <option value="ACTIVE">Active clients</option>
            <option value="ON_HOLD">On hold</option>
            <option value="PENDING_APPROVAL">Pending approval</option>
            <option value="INACTIVE">Discontinued</option>
            <option value="all">Any status</option>
          </select>
          <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Apply</button>
        </form>
        {r.rows.length === 0 ? <EmptyState kind="clients" title="No clients match">Change the filters.</EmptyState> : (
          <Table minWidth={900}>
            <thead><tr><Th>Client</Th><Th>Status</Th><Th>Allocated</Th><Th>Team (role on this client)</Th><Th>Services</Th></tr></thead>
            <tbody>
              {r.rows.map((c) => (
                <tr key={c.id}>
                  <Td><Link href={`/app/clients/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.client}</Link><div className="font-mono text-xs text-muted">{c.code}</div></Td>
                  <Td><StatusBadge status={c.status} label={c.status === "INACTIVE" ? "Discontinued" : undefined} /></Td>
                  <Td>{c.people ? <Badge tone="ok">{`Yes · ${c.people}`}</Badge> : <Badge tone="warn">Not allocated</Badge>}</Td>
                  <Td className="text-xs">{c.team.join(", ") || <Link href="/app/allocations" className="font-medium text-brand-700 hover:underline">Allocate</Link>}</Td>
                  <Td className="text-xs text-muted">{c.services || "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    );
  }

  async function Team() {
    const r = await teamAllocationReport(ctx.organization.id, f, today);
    const groups = new Map<string, typeof r.rows>();
    for (const row of r.rows) groups.set(row.employeeId, [...(groups.get(row.employeeId) ?? []), row]);
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label="People with clients" value={r.members} />
          <Stat label="Allocations" value={r.rows.length} />
          <Stat label="People without any client" value={r.withoutClients.length} tone={r.withoutClients.length ? "warn" : "ok"} />
        </div>
        <form className="flex flex-wrap items-end gap-2" role="search">
          <input type="hidden" name="tab" value="team" />
          <select name="member" defaultValue={f.member} className={selectCls} aria-label="Team member">
            <option value="">Everyone</option>
            {r.people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <input name="q" defaultValue={f.q} placeholder="Client name" className={`${selectCls} w-56`} aria-label="Search clients" />
          <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Apply</button>
        </form>
        {groups.size === 0 ? <EmptyState kind="people" title="No allocations match">Change the filters.</EmptyState> : (
          <div className="space-y-5">
            {[...groups.values()].map((list) => (
              <section key={list[0].employeeId} className="rounded-xl border border-line bg-surface">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
                  <h2 className="font-semibold">{list[0].member} <span className="text-sm font-normal text-muted">{list[0].designation}{list[0].code ? ` · ${list[0].code}` : ""}</span></h2>
                  <span className="text-xs text-muted">{list.length} client{list.length === 1 ? "" : "s"} · {Math.round(list.reduce((t, x) => t + x.hoursPerDay, 0) * 10) / 10} h a planned day in all</span>
                </header>
                <Table minWidth={860}>
                  <thead><tr><Th>Client</Th><Th>Role</Th><Th>Days</Th><Th>Hours</Th><Th>From – to</Th><Th>Reports to</Th></tr></thead>
                  <tbody>
                    {list.map((a) => (
                      <tr key={a.id}>
                        <Td className="font-medium">{a.client}{a.planned && <span className="ml-1"><Badge tone="info">Planned</Badge></span>}</Td>
                        <Td>{a.role || "—"}{a.resourceType && <div className="text-xs text-muted">{a.resourceType}</div>}</Td>
                        <Td className="text-xs">{a.days}</Td>
                        <Td className="text-xs">{a.hours}</Td>
                        <Td className="whitespace-nowrap text-xs">{formatDate(a.from)} – {a.to ? formatDate(a.to) : "ongoing"}</Td>
                        <Td className="text-xs">{a.reportsTo || "—"}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </section>
            ))}
          </div>
        )}
        {r.withoutClients.length > 0 && <p className="text-sm text-muted"><strong className="text-ink">Without any client:</strong> {r.withoutClients.map((p) => p.member).join(", ")}.</p>}
      </div>
    );
  }
}
