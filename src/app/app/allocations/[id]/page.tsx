import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { NO_EMPLOYEE } from "@/lib/ids";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDate, formatDateTime, minutesToHhmm } from "@/lib/dates";
import { OPEN_STATUSES } from "@/lib/domain/task-workflow";
import { Card, DetailList, humanize, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";

/** Allocation detail: current assignment, full change history, related tasks and timesheet entries. */
export default async function AllocationDetail({ params }: PageProps<"/app/allocations/[id]">) {
  const ctx = await requireCapability("app.use");
  const { id } = await params;
  const a = await prisma.teamAllocation.findFirst({
    where: {
      id,
      organizationId: ctx.organization.id,
      // Team members may only open their own allocations.
      ...(can(ctx.role, "allocations.view_all") ? {} : { employeeId: ctx.employee?.id ?? NO_EMPLOYEE }),
    },
    include: {
      client: { select: { id: true, tradeName: true } },
      clientService: { select: { service: { select: { name: true } } } },
      employee: { select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
  });
  if (!a) notFound();

  // Walk the change chain in both directions.
  const chain: { id: string; employee: string; start: Date; end: Date | null; status: string; reason: string | null }[] = [];
  const pick = { id: true, startDate: true, endDate: true, status: true, changeReason: true, replacesAllocationId: true, employee: { select: { firstName: true, lastName: true } } } as const;
  let back = a.replacesAllocationId;
  while (back && chain.length < 50) {
    const r = await prisma.teamAllocation.findUnique({ where: { id: back }, select: pick });
    if (!r) break;
    chain.unshift({ id: r.id, employee: `${r.employee.firstName} ${r.employee.lastName ?? ""}`.trim(), start: r.startDate, end: r.endDate, status: r.status, reason: r.changeReason });
    back = r.replacesAllocationId;
  }
  chain.push({ id: a.id, employee: `${a.employee.firstName} ${a.employee.lastName ?? ""}`.trim(), start: a.startDate, end: a.endDate, status: a.status, reason: a.changeReason });
  let fwd = await prisma.teamAllocation.findFirst({ where: { replacesAllocationId: a.id }, select: pick });
  while (fwd && chain.length < 100) {
    chain.push({ id: fwd.id, employee: `${fwd.employee.firstName} ${fwd.employee.lastName ?? ""}`.trim(), start: fwd.startDate, end: fwd.endDate, status: fwd.status, reason: fwd.changeReason });
    fwd = await prisma.teamAllocation.findFirst({ where: { replacesAllocationId: fwd.id }, select: pick });
  }

  const [tasks, entries] = await Promise.all([
    prisma.task.findMany({
      where: { clientId: a.clientId, status: { in: OPEN_STATUSES }, assignments: { some: { employeeId: a.employeeId, removedAt: null } } },
      take: 20,
      select: { id: true, title: true, status: true, dueAt: true },
    }),
    prisma.timesheetEntry.findMany({
      where: { teamAllocationId: a.id },
      orderBy: { workDate: "desc" },
      take: 30,
      select: { id: true, workDate: true, typeOfWork: true, approxMinutes: true, workDetails: true },
    }),
  ]);
  const totalMinutes = entries.reduce((s, e) => s + (e.approxMinutes ?? 0), 0);

  return (
    <>
      <PageHeader
        title={`${a.client.tradeName} — ${a.employee.firstName} ${a.employee.lastName ?? ""}`}
        back={{ href: "/app/allocations", label: "Team allocation" }}
        description={<StatusBadge status={a.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title="Assignment">
            <DetailList items={[
              ["Client", <Link key="c" href={`/app/clients/${a.client.id}`} className="text-brand-700 hover:underline">{a.client.tradeName}</Link>],
              ["Service", a.clientService?.service.name],
              ["Team member", `${a.employee.firstName} ${a.employee.lastName ?? ""} · ${a.employee.designation?.name ?? ""}`],
              ["Level on this client", a.seniorityLevel ? humanize(a.seniorityLevel) : null],
              ["Period", `${formatDate(a.startDate)} – ${a.endDate ? formatDate(a.endDate) : "ongoing"}`],
              ["Share of time", a.allocationPercent ? `${a.allocationPercent}%` : "Full time"],
              ["Created", `${formatDateTime(a.createdAt)} by ${a.createdBy?.name ?? "—"}`],
            ]} />
          </Card>
          <Card title={`Timesheet entries under this allocation (${minutesToHhmm(totalMinutes)} logged)`} padded={false}>
            {entries.length === 0 ? <p className="p-4 text-sm text-muted">No timesheet entries linked yet.</p> : (
              <Table minWidth={520}>
                <thead><tr><Th>Date</Th><Th>Type of work</Th><Th>Time</Th><Th>Details</Th></tr></thead>
                <tbody>{entries.map((e) => <tr key={e.id}><Td>{formatDate(e.workDate)}</Td><Td>{e.typeOfWork ?? "—"}</Td><Td>{e.approxMinutes ? minutesToHhmm(e.approxMinutes) : "—"}</Td><Td className="text-xs">{e.workDetails}</Td></tr>)}</tbody>
              </Table>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Allocation history">
            <ol className="space-y-3 text-sm">
              {chain.map((c) => (
                <li key={c.id} className={`border-l-2 pl-3 ${c.id === a.id ? "border-brand-700" : "border-line"}`}>
                  {c.id === a.id ? <span className="font-medium">{c.employee}</span> : <Link href={`/app/allocations/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.employee}</Link>}
                  <span className="block text-xs text-muted">{formatDate(c.start)} – {c.end ? formatDate(c.end) : "ongoing"} · {humanize(c.status)}</span>
                  {c.reason && <span className="block text-xs text-muted">Reason: {c.reason}</span>}
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Open tasks for this client">
            {tasks.length === 0 ? <p className="text-sm text-muted">None.</p> : (
              <ul className="space-y-1 text-sm">{tasks.map((t) => <li key={t.id}><Link href={`/app/tasks/${t.id}`} className="text-brand-700 hover:underline">{t.title}</Link> <StatusBadge status={t.status} /></li>)}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
