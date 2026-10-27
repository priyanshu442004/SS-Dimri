import Link from "next/link";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDate } from "@/lib/dates";
import { clientScope } from "@/lib/services/clients";
import { taskScope } from "@/lib/services/tasks";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Search } from "lucide-react";

/** Global search across the records the signed-in user is allowed to see. */
export default async function SearchPage({ searchParams }: PageProps<"/app/search">) {
  const ctx = await requireCapability("app.use");
  const q = typeof (await searchParams).q === "string" ? String((await searchParams).q).trim().slice(0, 100) : "";
  if (q.length < 2) {
    return (
      <>
        <PageHeader icon={<Search />} title="Search" />
        <EmptyState kind="search" title="Type at least two characters">Search by client name, client code, PAN or GSTIN, task title, or staff name and ID.</EmptyState>
      </>
    );
  }
  const text = { contains: q, mode: "insensitive" as const };
  const [clients, tasks, staff] = await Promise.all([
    prisma.client.findMany({
      where: { AND: [clientScope(ctx), { OR: [{ tradeName: text }, { legalName: text }, { clientCode: text }, { pan: q.toUpperCase() }, { gstRegistrations: { some: { gstin: { contains: q.toUpperCase() } } } }] }] },
      take: 10,
      orderBy: { tradeName: "asc" },
      select: { id: true, tradeName: true, clientCode: true, status: true },
    }),
    prisma.task.findMany({
      where: { AND: [taskScope(ctx), { OR: [{ title: text }, { description: text }] }] },
      take: 10,
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, status: true, dueAt: true, client: { select: { tradeName: true } } },
    }),
    can(ctx.role, "employees.view")
      ? prisma.employee.findMany({
          where: { organizationId: ctx.organization.id, OR: [{ firstName: text }, { lastName: text }, { permanentEmployeeCode: text }, { temporaryEmployeeCode: text }] },
          take: 10,
          orderBy: { firstName: "asc" },
          select: { id: true, firstName: true, lastName: true, permanentEmployeeCode: true, designation: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);
  const none = clients.length + tasks.length + staff.length === 0;
  return (
    <>
      <PageHeader icon={<Search />} title={`Results for “${q}”`} />
      {none ? <EmptyState kind="search" title="Nothing found">Try a different spelling, a client code (CL-001), PAN or GSTIN.</EmptyState> : (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title={`Clients (${clients.length})`}>
            <ul className="space-y-2 text-sm">
              {clients.map((c) => <li key={c.id} className="flex items-center justify-between gap-2"><Link href={`/app/clients/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.tradeName}</Link><StatusBadge status={c.status} /></li>)}
              {clients.length === 0 && <li className="text-muted">No clients.</li>}
            </ul>
          </Card>
          <Card title={`Tasks (${tasks.length})`}>
            <ul className="space-y-2 text-sm">
              {tasks.map((t) => <li key={t.id}><Link href={`/app/tasks/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.title}</Link><span className="block text-xs text-muted">{t.client?.tradeName ?? "Internal"}{t.dueAt && ` · due ${formatDate(t.dueAt)}`}</span></li>)}
              {tasks.length === 0 && <li className="text-muted">No tasks.</li>}
            </ul>
          </Card>
          {can(ctx.role, "employees.view") && (
            <Card title={`Staff (${staff.length})`}>
              <ul className="space-y-2 text-sm">
                {staff.map((e) => <li key={e.id}><Link href={`/app/employees/${e.id}`} className="font-medium text-brand-700 hover:underline">{e.firstName} {e.lastName}</Link><span className="block text-xs text-muted">{[e.permanentEmployeeCode, e.designation?.name].filter(Boolean).join(" · ")}</span></li>)}
                {staff.length === 0 && <li className="text-muted">No staff.</li>}
              </ul>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
