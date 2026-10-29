import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { clientScope } from "@/lib/services/clients";
import { EmptyState, LinkButton, PageHeader, Pagination, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { Building2 } from "lucide-react";

const PAGE_SIZE = 25;
const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "PENDING_APPROVAL", label: "Pending approval" },
  { key: "ACTIVE", label: "Active" },
  { key: "ON_HOLD", label: "On hold" },
  { key: "INACTIVE", label: "Discontinued" },
  { key: "REJECTED", label: "Rejected" },
];

export default async function ClientsPage({ searchParams }: PageProps<"/app/clients">) {
  const ctx = await requireCapability("app.use"); // list is scoped per user below
  const sp = await searchParams;
  const status = typeof sp.status === "string" && STATUS_TABS.some((t) => t.key === sp.status) ? sp.status : "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const serviceId = typeof sp.service === "string" && /^[0-9a-f-]{36}$/i.test(sp.service) ? sp.service : "";
  const sort = sp.sort === "newest" || sp.sort === "code" || sp.sort === "name_desc" ? sp.sort : "name";
  const orderBy: Prisma.ClientOrderByWithRelationInput[] =
    sort === "newest" ? [{ createdAt: "desc" }] : sort === "code" ? [{ clientCode: { sort: "asc", nulls: "last" } }, { tradeName: "asc" }] : [{ tradeName: sort === "name_desc" ? "desc" : "asc" }];
  const page = Math.max(1, Number(sp.page) || 1);

  const where: Prisma.ClientWhereInput = {
    AND: [
      clientScope(ctx),
      status === "all" ? {} : { status: status as Prisma.EnumClientStatusFilter["equals"] },
      q
        ? {
            OR: [
              { tradeName: { contains: q, mode: "insensitive" } },
              { legalName: { contains: q, mode: "insensitive" } },
              { clientCode: { contains: q, mode: "insensitive" } },
              { pan: { contains: q.toUpperCase() } },
              { gstRegistrations: { some: { gstin: { contains: q.toUpperCase() } } } },
            ],
          }
        : {},
      serviceId ? { services: { some: { serviceId, status: "ACTIVE" } } } : {},
    ],
  };

  const [clients, total, services, pendingCount] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, clientCode: true, tradeName: true, legalName: true, status: true,
        constitution: { select: { name: true } },
        _count: { select: { gstRegistrations: true } },
        services: { where: { status: "ACTIVE" }, select: { service: { select: { name: true } } }, take: 3 },
        teamAllocations: { where: { status: "ACTIVE" }, select: { employee: { select: { firstName: true } } }, take: 4 },
      },
    }),
    prisma.client.count({ where }),
    prisma.service.findMany({ where: { organizationId: ctx.organization.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.client.count({ where: { AND: [clientScope(ctx), { status: "PENDING_APPROVAL" }] } }),
  ]);

  const qs = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams({ ...(status !== "all" && { status }), ...(q && { q }), ...(serviceId && { service: serviceId }), ...(sort !== "name" && { sort }) });
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return `/app/clients?${p}`;
  };

  return (
    <>
      <PageHeader icon={<Building2 />}
        title="Clients"
        description={can(ctx.role, "clients.view_all") ? "All registered businesses." : "Clients you are allocated to or have tasks for."}
        actions={
          <>
            {can(ctx.role, "clients.approve") && <LinkButton variant="secondary" href="/app/clients/approvals">Approval queue{pendingCount ? ` (${pendingCount})` : ""}</LinkButton>}
            {can(ctx.role, "clients.register") && <LinkButton href="/app/clients/new">Register a client</LinkButton>}
          </>
        }
      />
      <TabNav
        current={status}
        tabs={STATUS_TABS.map((t) => ({
          key: t.key,
          label: t.label,
          href: `/app/clients${t.key === "all" ? "" : `?status=${t.key}`}`,
          count: t.key === "PENDING_APPROVAL" ? pendingCount : undefined,
        }))}
      />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Search name, code, PAN or GSTIN" aria-label="Search clients" className="h-10 w-full max-w-xs rounded-md border border-line bg-surface px-3 text-sm" />
        <select name="service" defaultValue={serviceId} aria-label="Filter by service" className="h-10 rounded-md border border-line bg-surface px-2 text-sm">
          <option value="">All services</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="sort" defaultValue={sort} aria-label="Sort clients" className="h-10 rounded-md border border-line bg-surface px-2 text-sm">
          <option value="name">Name A–Z</option>
          <option value="name_desc">Name Z–A</option>
          <option value="code">Client code</option>
          <option value="newest">Newest first</option>
        </select>
        <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Apply</button>
      </form>

      {clients.length === 0 ? (
        <EmptyState kind="clients" title="No clients found" action={can(ctx.role, "clients.register") && <LinkButton href="/app/clients/new">Register a client</LinkButton>}>
          {q || serviceId ? "Try a different search or filter." : "Registered clients will appear here."}
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface md:hidden">
            {clients.map((c) => (
              <li key={c.id}>
                <Link href={`/app/clients/${c.id}`} className="block px-4 py-3">
                  <span className="flex items-start justify-between gap-2"><span className="font-medium text-brand-700">{c.tradeName}</span><StatusBadge status={c.status} label={c.status === "INACTIVE" ? "Discontinued" : undefined} /></span>
                  <span className="mt-1 block text-xs text-muted">{[c.clientCode, c.constitution?.name, c.services.map((x) => x.service.name).join(", ")].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
          <Table minWidth={820}>
            <thead>
              <tr><Th>Code</Th><Th>Client</Th><Th>Constitution</Th><Th>Services</Th><Th>Team</Th><Th>Status</Th></tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-subtle/50">
                  <Td className="font-mono text-xs">{c.clientCode ?? "—"}</Td>
                  <Td>
                    <Link href={`/app/clients/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.tradeName}</Link>
                    {c.legalName && <div className="text-xs text-muted">{c.legalName}</div>}
                    {c._count.gstRegistrations > 0 && <div className="text-xs text-muted">{c._count.gstRegistrations} GSTIN{c._count.gstRegistrations > 1 ? "s" : ""}</div>}
                  </Td>
                  <Td>{c.constitution?.name ?? "—"}</Td>
                  <Td className="text-xs">{c.services.map((s) => s.service.name).join(", ") || "—"}</Td>
                  <Td className="text-xs">{c.teamAllocations.map((a) => a.employee.firstName).join(", ") || "—"}</Td>
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
