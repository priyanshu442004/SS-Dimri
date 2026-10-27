import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { dateOnly, isoDateInTz, minutesToHhmm } from "@/lib/dates";
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/ui";
import { ChartColumn } from "lucide-react";

const inr = (n: number) => `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export default async function ClientReportsIndex() {
  const ctx = await requireCapability("reports.client");
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const monthStart = dateOnly(`${today.slice(0, 7)}-01`);
  const org = ctx.organization.id;

  const [clients, openTasks, pending, dues, hours] = await Promise.all([
    prisma.client.findMany({ where: { organizationId: org, status: { in: ["ACTIVE", "ON_HOLD"] } }, orderBy: { tradeName: "asc" }, select: { id: true, tradeName: true, clientCode: true } }),
    prisma.task.groupBy({ by: ["clientId"], where: { organizationId: org, status: { notIn: ["COMPLETED", "CANCELLED"] }, clientId: { not: null } }, _count: true }),
    prisma.pendingItem.groupBy({ by: ["clientId", "pendingWith"], where: { organizationId: org, status: { not: "CLOSED" }, clientId: { not: null } }, _count: true }),
    prisma.clientDue.groupBy({ by: ["clientId"], where: { organizationId: org, status: "OPEN" }, _sum: { amount: true } }),
    prisma.timesheetEntry.groupBy({ by: ["clientId"], where: { organizationId: org, workDate: { gte: monthStart }, clientId: { not: null } }, _sum: { approxMinutes: true } }),
  ]);
  const get = <T extends { clientId: string | null }>(rows: T[], id: string) => rows.find((r) => r.clientId === id);

  return (
    <>
      <PageHeader icon={<ChartColumn />} title="Client reports" description="Per-client team, work, maker/checker progress, pending items, fees and dues (13A / 13B). Figures are calculated from the underlying records." />
      {clients.length === 0 ? <EmptyState kind="clients" title="No active clients" /> : (
        <Table minWidth={860}>
          <thead><tr><Th>Client</Th><Th>Open tasks</Th><Th>Pending — our side</Th><Th>Pending — client side</Th><Th>Hours recorded this month</Th><Th>Outstanding dues</Th></tr></thead>
          <tbody>
            {clients.map((c) => {
              const ours = pending.find((p) => p.clientId === c.id && p.pendingWith === "TEAM_MEMBER")?._count ?? 0;
              const theirs = pending.find((p) => p.clientId === c.id && p.pendingWith === "CLIENT")?._count ?? 0;
              const due = Number(get(dues, c.id)?._sum.amount ?? 0);
              const mins = get(hours, c.id)?._sum.approxMinutes ?? 0;
              return (
                <tr key={c.id} className="hover:bg-subtle/50">
                  <Td><Link href={`/app/reports/clients/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.tradeName}</Link><div className="font-mono text-xs text-muted">{c.clientCode}</div></Td>
                  <Td>{get(openTasks, c.id)?._count ?? 0}</Td>
                  <Td>{ours}</Td>
                  <Td>{theirs}</Td>
                  <Td>{mins ? minutesToHhmm(mins) : "—"}</Td>
                  <Td className={due ? "font-medium text-warn" : ""}>{due ? inr(due) : "—"}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
