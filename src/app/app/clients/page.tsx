import Link from "next/link";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { clientScope } from "@/lib/services/clients";
import { complianceChoices } from "@/lib/services/client-compliances";
import { CLIENT_SORTS, CLIENT_STATUS_TABS, clientFiltersQuery, clientListOrder, clientListWhere, parseClientFilters } from "@/lib/services/client-list";
import { employeeOptions } from "@/lib/services/lookups";
import { DownloadButton, EmptyState, LinkButton, PageHeader, Pagination, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { Building2 } from "lucide-react";

const PAGE_SIZE = 25;
const selectCls = "h-10 rounded-md border border-line bg-surface px-2 text-sm";

export default async function ClientsPage({ searchParams }: PageProps<"/app/clients">) {
  const ctx = await requireCapability("clients.use"); // list is scoped per user below
  const sp = await searchParams;
  const f = parseClientFilters(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const viewAll = can(ctx, "clients.view_all");
  const where = clientListWhere(ctx, f);

  const [clients, total, services, pendingCount, constitutions, states, departments, team] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy: clientListOrder(f.sort),
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, clientCode: true, tradeName: true, legalName: true, status: true, departments: true, state: true,
        constitution: { select: { name: true } },
        _count: { select: { gstRegistrations: true } },
        services: { where: { status: "ACTIVE" }, select: { service: { select: { name: true } } }, take: 3 },
        teamAllocations: { where: { status: { in: ["ACTIVE", "PLANNED"] } }, select: { employee: { select: { firstName: true } } }, take: 4 },
      },
    }),
    prisma.client.count({ where }),
    prisma.service.findMany({ where: { organizationId: ctx.organization.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.client.count({ where: { AND: [clientScope(ctx), { status: "PENDING_APPROVAL" }] } }),
    prisma.constitution.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { organizationId: ctx.organization.id, state: { not: null } }, distinct: ["state"], orderBy: { state: "asc" }, select: { state: true } }),
    complianceChoices().then((c) => c.departments),
    viewAll ? employeeOptions(ctx.organization.id) : Promise.resolve([]),
  ]);

  const qs = (extra: Record<string, string | number>) => `/app/clients${clientFiltersQuery(f, extra)}`;
  const narrowed = !!(f.q || f.service || f.department || f.constitution || f.state || f.team);

  return (
    <>
      <PageHeader icon={<Building2 />}
        title="Clients"
        description={viewAll ? "All registered businesses." : "Clients you are allocated to or have tasks for."}
        actions={
          <>
            {can(ctx, "clients.approve") && <LinkButton variant="secondary" href="/app/clients/approvals">Approval queue{pendingCount ? ` (${pendingCount})` : ""}</LinkButton>}
            {viewAll && <DownloadButton href={`/app/clients/export${clientFiltersQuery(f)}`}>Export to Excel</DownloadButton>}
            {can(ctx, "clients.import") && <LinkButton variant="secondary" href="/app/clients/import">Import from Excel</LinkButton>}
            {can(ctx, "clients.register") && <LinkButton href="/app/clients/new">Register a client</LinkButton>}
          </>
        }
      />
      <TabNav
        current={f.status}
        tabs={CLIENT_STATUS_TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: `/app/clients${t.key === "all" ? "" : `?status=${t.key}`}`,
          count: t.key === "PENDING_APPROVAL" ? pendingCount : undefined,
        }))}
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        {f.status !== "all" && <input type="hidden" name="status" value={f.status} />}
        <input name="q" defaultValue={f.q} placeholder="Search name, code, PAN, GSTIN, contact" aria-label="Search clients" className="h-10 w-full max-w-xs rounded-md border border-line bg-surface px-3 text-sm" />
        <select name="dept" defaultValue={f.department} aria-label="Filter by department" className={selectCls}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select name="service" defaultValue={f.service} aria-label="Filter by service" className={selectCls}>
          <option value="">All services</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="con" defaultValue={f.constitution} aria-label="Filter by constitution" className={selectCls}>
          <option value="">Any constitution</option>
          {constitutions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {states.length > 1 && (
          <select name="state" defaultValue={f.state} aria-label="Filter by state" className={selectCls}>
            <option value="">All states</option>
            {states.map((s) => <option key={s.state} value={s.state!}>{s.state}</option>)}
          </select>
        )}
        {viewAll && (
          <select name="team" defaultValue={f.team} aria-label="Filter by team member" className={`${selectCls} max-w-[14rem]`}>
            <option value="">Any team</option>
            <option value="none">No team allocated</option>
            {team.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        )}
        <select name="sort" defaultValue={f.sort} aria-label="Sort clients" className={selectCls}>
          {Object.entries(CLIENT_SORTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Apply</button>
        {(narrowed || f.sort !== "name") && <Link href={`/app/clients${f.status !== "all" ? `?status=${f.status}` : ""}`} className="flex h-10 items-center px-2 text-sm text-muted hover:text-ink">Clear</Link>}
      </form>
      {total > 0 && <p className="mb-2 text-xs text-muted">{total} {total === 1 ? "client" : "clients"}</p>}

      {clients.length === 0 ? (
        <EmptyState kind="clients" title="No clients found" action={can(ctx, "clients.register") && <LinkButton href="/app/clients/new">Register a client</LinkButton>}>
          {narrowed ? "Try a different search or filter." : "Registered clients will appear here."}
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface md:hidden">
            {clients.map((c) => (
              <li key={c.id}>
                <Link href={`/app/clients/${c.id}`} className="block px-4 py-3">
                  <span className="flex items-start justify-between gap-2"><span className="font-medium text-brand-700">{c.tradeName}</span><StatusBadge status={c.status} label={c.status === "INACTIVE" ? "Discontinued" : undefined} /></span>
                  <span className="mt-1 block text-xs text-muted">{[c.clientCode, c.constitution?.name, c.departments.join(", ")].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
          <Table minWidth={900}>
            <thead>
              <tr><Th>Code</Th><Th>Client</Th><Th>Constitution</Th><Th>Departments</Th><Th>Services</Th><Th>Team</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-subtle/50">
                  <Td className="font-mono text-xs">{c.clientCode ?? "—"}</Td>
                  <Td>
                    <Link href={`/app/clients/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.tradeName}</Link>
                    {c.legalName && <div className="text-xs text-muted">{c.legalName}</div>}
                    {c._count.gstRegistrations > 0 && <div className="text-xs text-muted">{c._count.gstRegistrations} GSTIN{c._count.gstRegistrations > 1 ? "s" : ""}{c.state ? ` · ${c.state}` : ""}</div>}
                  </Td>
                  <Td>{c.constitution?.name ?? "—"}</Td>
                  <Td className="text-xs">{c.departments.join(", ") || "—"}</Td>
                  <Td className="text-xs">{c.services.map((s) => s.service.name).join(", ") || "—"}</Td>
                  <Td className="text-xs">{c.teamAllocations.map((a) => a.employee.firstName).join(", ") || <span className="text-muted">None</span>}</Td>
                  <Td><StatusBadge status={c.status} label={c.status === "INACTIVE" ? "Discontinued" : undefined} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => qs({ page: p })} />
        </>
      )}
    </>
  );
}
