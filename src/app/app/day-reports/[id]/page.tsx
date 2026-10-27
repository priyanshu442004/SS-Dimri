import Link from "next/link";
import { notFound } from "next/navigation";
import { NO_EMPLOYEE } from "@/lib/ids";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDate, formatDateTime, minutesToHhmm } from "@/lib/dates";
import { Card, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { acknowledgeDayReportAction } from "../../worklog-actions";
import { DayReportReviewForm } from "../form";

/** Day report detail, related work records, manager review and history (Page 51). */
export default async function DayReportDetail({ params }: PageProps<"/app/day-reports/[id]">) {
  const ctx = await requireCapability("dayreport.submit");
  const { id } = await params;
  const me = ctx.employee?.id ?? NO_EMPLOYEE;
  const r = await prisma.dayReport.findFirst({
    where: {
      id,
      organizationId: ctx.organization.id,
      ...(can(ctx.role, "dayreport.view_all") ? {} : { OR: [{ reportingEmployeeId: me }, { recipients: { some: { recipientEmployeeId: me } } }] }),
    },
    include: {
      reportingEmployee: { select: { id: true, firstName: true, lastName: true, membership: { select: { userId: true } } } },
      recipients: { include: { recipient: { select: { id: true, firstName: true, lastName: true } } } },
    },
  });
  if (!r) notFound();
  const mine = r.recipients.find((x) => x.recipientEmployeeId === me);
  if (mine && !mine.readAt) await prisma.dayReportRecipient.update({ where: { id: mine.id }, data: { readAt: new Date() } });

  // Related work records of the reporting person for that day (references, not copies).
  const dayStart = new Date(`${r.reportDate.toISOString().slice(0, 10)}T00:00:00+05:30`);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const reporterUserId = r.reportingEmployee.membership?.userId;
  const [entries, activities, history] = await Promise.all([
    prisma.timesheetEntry.findMany({
      where: { employeeId: r.reportingEmployeeId, workDate: r.reportDate },
      orderBy: { serialNumber: "asc" },
      select: { id: true, serialNumber: true, clientNameText: true, typeOfWork: true, approxMinutes: true },
    }),
    reporterUserId
      ? prisma.taskActivity.findMany({
          where: { actorUserId: reporterUserId, createdAt: { gte: dayStart, lt: dayEnd }, task: { organizationId: ctx.organization.id } },
          distinct: ["taskId"],
          select: { task: { select: { id: true, title: true, status: true } } },
        })
      : Promise.resolve([]),
    prisma.auditLog.findMany({
      where: { organizationId: ctx.organization.id, entityType: "day_report", entityId: r.id },
      orderBy: { createdAt: "asc" },
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const sections: [string, string | null][] = [
    ["Morning work plan", r.workPlan], ["Work completed", r.completedWork], ["New work assigned", r.newAssignments],
    ["Pending work", r.pendingWork], ["Blockers", r.blockers], ["Notes", r.summary],
  ];
  return (
    <>
      <PageHeader
        title={`Day report — ${formatDate(r.reportDate)}`}
        back={{ href: "/app/day-reports", label: "Day reports" }}
        description={<span className="flex items-center gap-2">{r.reportingEmployee.firstName} {r.reportingEmployee.lastName} <StatusBadge status={r.status} />{r.submittedAt && <span>· submitted {formatDateTime(r.submittedAt)}</span>}</span>}
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <div className="space-y-5">
              {sections.filter(([, v]) => v).map(([k, v]) => (
                <section key={k}>
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</h2>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{v}</p>
                </section>
              ))}
            </div>
          </Card>
          <Card title="Related work records">
            {entries.length === 0 && activities.length === 0 ? <p className="text-sm text-muted">No timesheet entries or task updates on this day.</p> : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Timesheet</h3>
                  <ul className="space-y-1 text-sm">
                    {entries.map((e) => (
                      <li key={e.id}><Link href={`/app/timesheet/${e.id}`} className="text-brand-700 hover:underline">#{e.serialNumber} {e.clientNameText ?? "Internal"}</Link> <span className="text-xs text-muted">{e.typeOfWork}{e.approxMinutes ? ` · ${minutesToHhmm(e.approxMinutes)}` : ""}</span></li>
                    ))}
                    {entries.length === 0 && <li className="text-muted">None</li>}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Tasks updated</h3>
                  <ul className="space-y-1 text-sm">
                    {activities.map((a) => <li key={a.task.id}><Link href={`/app/tasks/${a.task.id}`} className="text-brand-700 hover:underline">{a.task.title}</Link> <StatusBadge status={a.task.status} /></li>)}
                    {activities.length === 0 && <li className="text-muted">None</li>}
                  </ul>
                </div>
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          {mine && !mine.acknowledgedAt && (
            <Card title="Review this report">
              <DayReportReviewForm action={acknowledgeDayReportAction.bind(null, r.id)} />
            </Card>
          )}
          {mine?.acknowledgedAt && <Notice tone="ok">Review recorded on {formatDateTime(mine.acknowledgedAt)}.</Notice>}
          <Card title="Sent to">
            <ul className="space-y-3 text-sm">
              {r.recipients.map((x) => (
                <li key={x.id}>
                  <span className="font-medium">{x.recipient.firstName} {x.recipient.lastName}</span>
                  <div className="text-xs text-muted">
                    {x.sentAt ? `Sent ${formatDateTime(x.sentAt)}` : "Not sent"} · {x.acknowledgedAt ? `reviewed ${formatDateTime(x.acknowledgedAt)}` : x.readAt ? "read" : "unread"}
                  </div>
                  {x.reviewRemark && <p className="mt-1 rounded bg-subtle px-2 py-1 text-xs">“{x.reviewRemark}”</p>}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="History">
            <ol className="space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="border-l-2 border-line pl-3">
                  {h.action.replace("day_report.", "").replace(/_/g, " ")}
                  <span className="block text-xs text-muted">{h.actor?.name ?? "System"} · {formatDateTime(h.createdAt)}</span>
                </li>
              ))}
              {history.length === 0 && <li className="text-muted">No history recorded.</li>}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
