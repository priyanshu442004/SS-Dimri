import { NO_EMPLOYEE } from "@/lib/ids";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { dateOnly, formatDate, formatDateTime, isoDateInTz } from "@/lib/dates";
import { dayReportSuggestion } from "@/lib/services/worklog";
import { employeeOptions } from "@/lib/services/lookups";
import { Card, EmptyState, PageHeader, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { saveDayReportAction } from "../worklog-actions";
import { DayReportForm } from "./form";
import { FileText } from "lucide-react";

export default async function DayReportsPage({ searchParams }: PageProps<"/app/day-reports">) {
  const ctx = await requireCapability("dayreport.submit");
  const sp = await searchParams;
  const all = can(ctx.role, "dayreport.view_all");
  const tab = sp.tab === "received" ? "received" : sp.tab === "all" && all ? "all" : "mine";
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const me = ctx.employee?.id ?? NO_EMPLOYEE;

  const where =
    tab === "mine" ? { reportingEmployeeId: me } : tab === "received" ? { recipients: { some: { recipientEmployeeId: me } } } : { organizationId: ctx.organization.id };
  const reports = await prisma.dayReport.findMany({
    where: { organizationId: ctx.organization.id, ...where },
    orderBy: [{ reportDate: "desc" }, { createdAt: "desc" }],
    take: 60,
    include: {
      reportingEmployee: { select: { firstName: true, lastName: true } },
      recipients: { include: { recipient: { select: { firstName: true } } } },
    },
  });

  let form: React.ReactNode = null;
  if (tab === "mine" && ctx.employee) {
    const [existing, managers, employees, suggestion] = await Promise.all([
      prisma.dayReport.findFirst({ where: { reportingEmployeeId: me, reportDate: dateOnly(date) }, include: { recipients: true } }),
      prisma.employeeReportingRelationship.findMany({ where: { employeeId: me }, select: { managerId: true } }),
      employeeOptions(ctx.organization.id),
      dayReportSuggestion(ctx, date),
    ]);
    form =
      existing && existing.status !== "DRAFT" ? (
        <p className="text-sm">
          The report for {formatDate(existing.reportDate)} was sent. <Link href={`/app/day-reports/${existing.id}`} className="text-brand-700 hover:underline">View it</Link>
        </p>
      ) : (
        <DayReportForm
          action={saveDayReportAction}
          date={date}
          employees={employees.filter((e) => e.value !== me)}
          recipients={existing ? existing.recipients.map((r) => r.recipientEmployeeId) : managers.map((m) => m.managerId)}
          d={{
            workPlan: existing?.workPlan ?? "",
            completedWork: existing?.completedWork ?? suggestion.completedWork,
            newAssignments: existing?.newAssignments ?? suggestion.newAssignments,
            pendingWork: existing?.pendingWork ?? suggestion.pendingWork,
            blockers: existing?.blockers ?? "",
            summary: existing?.summary ?? "",
          }}
        />
      );
  }

  return (
    <>
      <PageHeader icon={<FileText />} title="Day reports" description="Morning work plan and end-of-day report to your manager, as required by the Leave & Timing Policy." />
      <TabNav
        current={tab}
        tabs={[
          { key: "mine", label: "My reports", href: "/app/day-reports" },
          { key: "received", label: "Received", href: "/app/day-reports?tab=received" },
          ...(all ? [{ key: "all", label: "All reports", href: "/app/day-reports?tab=all" }] : []),
        ]}
      />
      <div className={tab === "mine" && ctx.employee ? "grid gap-6 xl:grid-cols-[3fr_2fr]" : ""}>
        {form && <Card title={`Report for ${formatDate(dateOnly(date))}`}>{form}</Card>}
        <div>
          {reports.length === 0 ? <EmptyState kind="documents" title="No day reports yet" /> : (
            <Table minWidth={520}>
              <thead><tr><Th>Date</Th>{tab !== "mine" && <Th>From</Th>}<Th>Sent to</Th><Th>Status</Th></tr></thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="hover:bg-subtle/50">
                    <Td><Link href={`/app/day-reports/${r.id}`} className="font-medium text-brand-700 hover:underline">{formatDate(r.reportDate)}</Link>{r.submittedAt && <div className="text-xs text-muted">{formatDateTime(r.submittedAt)}</div>}</Td>
                    {tab !== "mine" && <Td>{r.reportingEmployee.firstName} {r.reportingEmployee.lastName}</Td>}
                    <Td className="text-xs">{r.recipients.map((x) => x.recipient.firstName).join(", ") || "—"}</Td>
                    <Td><StatusBadge status={r.status} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>
    </>
  );
}
