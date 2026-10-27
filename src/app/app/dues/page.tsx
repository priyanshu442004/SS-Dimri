import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { dateOnly, formatDate, isoDateInTz } from "@/lib/dates";
import { Card, EmptyState, humanize, Notice, PageHeader, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { BarList, ChartCard, Donut } from "@/components/charts";
import { fmt } from "@/lib/chart-format";
import { Wallet } from "lucide-react";

const inr = (n: number) => `₹ ${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

/**
 * Fees & dues overview (Page 57). Reads the agreed fees and manually recorded
 * dues only — no tax, invoice or payment logic is invented here.
 */
export default async function DuesOverview() {
  const ctx = await requireCapability("dues.manage");
  const org = ctx.organization.id;
  const today = dateOnly(isoDateInTz(new Date(), ctx.organization.timezone));
  const [open, fees] = await Promise.all([
    prisma.clientDue.findMany({
      where: { organizationId: org, status: "OPEN" },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }],
      include: {
        client: { select: { id: true, tradeName: true } },
        clientService: { select: { service: { select: { name: true } } } },
        followUps: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } },
      },
    }),
    prisma.clientService.findMany({
      where: { client: { organizationId: org }, status: "ACTIVE", agreedFee: { not: null } },
      select: { agreedFee: true, engagementNature: true, client: { select: { id: true, tradeName: true } }, service: { select: { name: true } } },
    }),
  ]);

  const total = open.reduce((s, d) => s + Number(d.amount), 0);
  const overdue = open.filter((d) => d.dueDate && d.dueDate < today);
  const byClient = new Map<string, { id: string; name: string; outstanding: number; overdue: number; count: number; fees: number }>();
  const entry = (c: { id: string; tradeName: string }) => {
    if (!byClient.has(c.id)) byClient.set(c.id, { id: c.id, name: c.tradeName, outstanding: 0, overdue: 0, count: 0, fees: 0 });
    return byClient.get(c.id)!;
  };
  for (const d of open) {
    const e = entry(d.client);
    e.outstanding += Number(d.amount);
    e.count++;
    if (d.dueDate && d.dueDate < today) e.overdue += Number(d.amount);
  }
  for (const f of fees) entry(f.client).fees += Number(f.agreedFee);
  const rows = [...byClient.values()].sort((a, b) => b.outstanding - a.outstanding || a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader icon={<Wallet />} title="Fees & dues" description="Agreed fees on active services and dues recorded against clients." />
      <div className="mb-4"><Notice tone="info">Amounts are as recorded by the team. Tax, invoicing and payment collection are not part of this system until the firm confirms that process.</Notice></div>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Outstanding dues" value={inr(total)} />
        <Stat label="Open dues" value={open.length} />
        <Stat label="Overdue" value={inr(overdue.reduce((s, d) => s + Number(d.amount), 0))} hint={`${overdue.length} item(s) past due date`} />
        <Stat label="Agreed fees (active services)" value={inr(fees.reduce((s, f) => s + Number(f.agreedFee), 0))} />
      </div>

      <div className="space-y-6">
        {rows.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <ChartCard title="Outstanding dues by client" subtitle="Open dues; overdue part shown separately in the table below" table={{ head: ["Client", "Outstanding", "Overdue"], rows: rows.map((r) => [r.name, fmt(r.outstanding, "inr"), fmt(r.overdue, "inr")]) }}>
              <BarList data={rows.filter((r) => r.outstanding > 0).slice(0, 10).map((r) => ({ label: r.name, value: r.outstanding, href: `/app/reports/clients/${r.id}?tab=dues` }))} format="inr" color="var(--color-series-2)" empty="No outstanding dues." />
            </ChartCard>
            <ChartCard title="Open dues: on time vs overdue" table={{ head: ["", "Amount"], rows: [["Not yet due", fmt(total - overdue.reduce((s, d) => s + Number(d.amount), 0), "inr")], ["Overdue", fmt(overdue.reduce((s, d) => s + Number(d.amount), 0), "inr")]] }}>
              <Donut slices={[{ label: "Not yet due", value: total - overdue.reduce((s, d) => s + Number(d.amount), 0) }, { label: "Overdue", value: overdue.reduce((s, d) => s + Number(d.amount), 0) }]} format="inr" centerLabel="Outstanding" />
            </ChartCard>
          </div>
        )}
        <Card title="By client" padded={false}>
          {rows.length === 0 ? <div className="p-4"><EmptyState kind="chart" title="No fees or dues recorded yet" /></div> : (
            <Table minWidth={720}>
              <thead><tr><Th>Client</Th><Th>Agreed fees (active)</Th><Th>Open dues</Th><Th>Outstanding</Th><Th>Of which overdue</Th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <Td><Link href={`/app/reports/clients/${r.id}?tab=dues`} className="font-medium text-brand-700 hover:underline">{r.name}</Link></Td>
                    <Td>{r.fees ? inr(r.fees) : "—"}</Td>
                    <Td>{r.count || "—"}</Td>
                    <Td>{r.outstanding ? inr(r.outstanding) : "—"}</Td>
                    <Td className={r.overdue ? "font-medium text-danger" : ""}>{r.overdue ? inr(r.overdue) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Open dues" padded={false}>
          {open.length === 0 ? <p className="p-4 text-sm text-muted">No open dues.</p> : (
            <Table minWidth={820}>
              <thead><tr><Th>Client</Th><Th>Description</Th><Th>Service</Th><Th>Amount</Th><Th>Due date</Th><Th>Last follow-up</Th></tr></thead>
              <tbody>
                {open.map((d) => (
                  <tr key={d.id}>
                    <Td><Link href={`/app/reports/clients/${d.client.id}?tab=dues`} className="text-brand-700 hover:underline">{d.client.tradeName}</Link></Td>
                    <Td>{d.description}{d.referenceNumber && <div className="text-xs text-muted">Ref {d.referenceNumber}</div>}</Td>
                    <Td>{d.clientService?.service.name ?? "—"}</Td>
                    <Td>{inr(Number(d.amount))}</Td>
                    <Td>{d.dueDate ? <>{formatDate(d.dueDate)}{d.dueDate < today && <div className="mt-1"><StatusBadge status="OVERDUE" /></div>}</> : "—"}</Td>
                    <Td className="text-xs">{d.followUps[0] ? formatDate(d.followUps[0].createdAt) : "None"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Agreed fees by service" padded={false}>
          {fees.length === 0 ? <p className="p-4 text-sm text-muted">No agreed fees recorded on active services.</p> : (
            <Table minWidth={600}>
              <thead><tr><Th>Client</Th><Th>Service</Th><Th>Engagement</Th><Th>Agreed fee</Th></tr></thead>
              <tbody>
                {fees.map((f, i) => (
                  <tr key={i}>
                    <Td>{f.client.tradeName}</Td>
                    <Td>{f.service.name}</Td>
                    <Td>{f.engagementNature ? humanize(f.engagementNature) : "Not specified"}</Td>
                    <Td>{inr(Number(f.agreedFee))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}
