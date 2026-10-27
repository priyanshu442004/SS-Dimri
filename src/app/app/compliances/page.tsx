import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { Notice, PageHeader, TabNav, Table, Td, Th } from "@/components/ui";
import { BookOpen } from "lucide-react";

export default async function CompliancesPage({ searchParams }: PageProps<"/app/compliances">) {
  await requireCapability("app.use");
  const sp = await searchParams;
  const items = await prisma.complianceItem.findMany({ orderBy: { sortOrder: "asc" } });
  const departments = [...new Set(items.map((i) => i.department))];
  const dept = typeof sp.dept === "string" && departments.includes(sp.dept) ? sp.dept : departments[0];
  const rows = items.filter((i) => i.department === dept);
  return (
    <>
      <PageHeader icon={<BookOpen />} title="Compliance calendar" description="Department-wise compliances handled for clients, from the firm's master data pack." />
      <div className="mb-4"><Notice tone="warn">Due dates are as compiled in October 2026 and change by notification — verify each year before relying on them.</Notice></div>
      <TabNav current={dept ?? ""} tabs={departments.map((d) => ({ key: d, label: d, href: `/app/compliances?dept=${encodeURIComponent(d)}`, count: items.filter((i) => i.department === d).length }))} />
      <Table minWidth={1000}>
        <thead><tr><Th>Compliance</Th><Th>Form</Th><Th>Applicable to</Th><Th>Frequency</Th><Th>Due date</Th><Th>Late fee / penalty</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="font-medium">{r.name}{r.remarks && <div className="text-xs font-normal text-muted">{r.remarks}</div>}</Td>
              <Td className="text-xs">{r.form ?? "—"}</Td>
              <Td className="text-xs">{r.applicableTo ?? "—"}</Td>
              <Td className="text-xs">{r.frequency ?? "—"}</Td>
              <Td className="text-xs">{r.dueDateRule ?? "—"}</Td>
              <Td className="text-xs">{r.penalty ?? "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
