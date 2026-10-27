import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDate, formatDateTime, isoDateInTz, minutesToHhmm, toIsoDate } from "@/lib/dates";
import { daysPending } from "@/lib/domain/derived";
import { loadTimesheetEntryForCtx } from "@/lib/services/worklog";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { Badge, Card, DetailList, humanize, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { correctEntryAction, createPendingAction, reviewEntryAction } from "../../worklog-actions";
import { EntryCorrectionForm, EntryReviewForm, PendingForm } from "../../worklog-forms";

type Change = { field: string; from: unknown; to: unknown };

/** Timesheet entry detail: record, links, review, corrections and full history (Pages 44–45). */
export default async function TimesheetEntryPage({ params }: PageProps<"/app/timesheet/[id]">) {
  const ctx = await requireCapability("timesheet.fill_own");
  const { id } = await params;
  const scoped = await loadTimesheetEntryForCtx(ctx, id);
  if (!scoped) notFound();

  const e = await prisma.timesheetEntry.findUniqueOrThrow({
    where: { id: scoped.id },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
      client: { select: { id: true, tradeName: true } },
      task: { select: { id: true, title: true, status: true } },
      teamAllocation: { select: { id: true } },
      reviewedBy: { select: { name: true } },
      pendingItems: {
        orderBy: { requestedOn: "asc" },
        select: { id: true, requestDescription: true, pendingWith: true, status: true, requestedOn: true, closedAt: true, dueBy: true },
      },
    },
  });
  const history = await prisma.auditLog.findMany({
    where: { organizationId: ctx.organization.id, entityType: "timesheet_entry", entityId: e.id },
    orderBy: { createdAt: "desc" },
    include: { actor: { select: { name: true } } },
  });

  const own = e.employeeId === ctx.employee?.id;
  const reviewer = can(ctx.role, "timesheet.review") && !own && e.status === "SUBMITTED";
  const canCorrect = (own && e.status !== "REVIEWED") || can(ctx.role, "org.manage");
  const [clients, workTypes, employees] = canCorrect || own
    ? await Promise.all([
        activeClientOptions(ctx.organization.id),
        prisma.workType.findMany({ where: { organizationId: ctx.organization.id, OR: [{ isActive: true }, ...(e.workTypeId ? [{ id: e.workTypeId }] : [])] }, orderBy: { sortOrder: "asc" } }),
        employeeOptions(ctx.organization.id),
      ])
    : [[], [], []];
  const d = (x: Date | null) => (x ? toIsoDate(x) : "");
  const s = (x: unknown) => (x === null || x === undefined ? "" : String(x));

  return (
    <>
      <PageHeader
        title={`${e.clientNameText ?? "Internal work"} — ${formatDate(e.workDate)}`}
        back={{ href: own ? `/app/timesheet?date=${toIsoDate(e.workDate)}` : "/app/timesheet?tab=collective", label: "Timesheet" }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {e.employee.firstName} {e.employee.lastName} · entry #{e.serialNumber} <StatusBadge status={e.status} />
          </span>
        }
      />
      {e.status === "RETURNED" && own && (
        <div className="mb-4"><Notice tone="warn">Returned for correction: {e.reviewNote ?? "see the review remark"}. Correct the entry below — saving resubmits it.</Notice></div>
      )}
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title="Recorded work">
            <DetailList
              items={[
                ["Client", e.client ? <Link key="c" href={`/app/clients/${e.client.id}`} className="text-brand-700 hover:underline">{e.client.tradeName}</Link> : e.clientNameText],
                ["Related task", e.task ? <Link key="t" href={`/app/tasks/${e.task.id}`} className="text-brand-700 hover:underline">{e.task.title}</Link> : null],
                ["Allocation", e.teamAllocation ? <Link key="a" href={`/app/allocations/${e.teamAllocation.id}`} className="text-brand-700 hover:underline">View allocation</Link> : null],
                ["Place of work", e.placeOfWork],
                ["Type of work", e.typeOfWork],
                ["Bank name", e.bankName],
                ["Period", e.periodFrom ? `${formatDate(e.periodFrom)} – ${formatDate(e.periodTo)}` : null],
                ["Transactions / entries", e.transactionCount?.toString()],
                ["Approximate time", e.approxMinutes ? minutesToHhmm(e.approxMinutes) : null],
                ["Status of work", e.workStatus ? humanize(e.workStatus) : null],
                ["Details of work done", e.workDetails],
                ["WhatsApp message", e.whatsappMessage],
              ]}
            />
          </Card>

          <Card title={`Communication & pending items for this work (${e.pendingItems.length})`}>
            {e.pendingItems.length === 0 ? <p className="mb-4 text-sm text-muted">No follow-ups linked to this entry.</p> : (
              <ul className="mb-4 divide-y divide-line text-sm">
                {e.pendingItems.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>{p.requestDescription}</span>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      <Badge tone={p.pendingWith === "CLIENT" ? "warn" : "info"}>{p.pendingWith === "CLIENT" ? "With client" : "With team"}</Badge>
                      <StatusBadge status={p.status} />
                      {daysPending(p, undefined, ctx.organization.pendingDaysBasis)} days
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {(own || can(ctx.role, "pending.view_all")) && (
              <details className="rounded-md border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium text-brand-700">Add a follow-up linked to this entry</summary>
                <div className="mt-3">
                  <PendingForm
                    action={createPendingAction}
                    clients={clients}
                    employees={employees}
                    category="COMMUNICATION"
                    today={isoDateInTz(new Date(), ctx.organization.timezone)}
                    defaultClient={e.clientId ?? undefined}
                    taskId={e.taskId ?? undefined}
                    timesheetEntryId={e.id}
                  />
                </div>
              </details>
            )}
          </Card>

          {canCorrect && (
            <Card title="Correct this entry">
              <EntryCorrectionForm
                action={correctEntryAction.bind(null, e.id)}
                clients={clients}
                workTypes={workTypes.map((w) => ({ value: w.id, label: w.name }))}
                needsReason={!own}
                d={{
                  workDate: d(e.workDate), clientId: s(e.clientId), clientNameText: e.clientId ? "" : s(e.clientNameText), placeOfWork: s(e.placeOfWork),
                  workTypeId: s(e.workTypeId), bankName: s(e.bankName), periodFrom: d(e.periodFrom), periodTo: d(e.periodTo),
                  transactionCount: s(e.transactionCount), hours: e.approxMinutes ? String(Math.floor(e.approxMinutes / 60)) : "",
                  minutes: e.approxMinutes ? String(e.approxMinutes % 60) : "", workStatus: s(e.workStatus), workDetails: s(e.workDetails),
                  whatsappMessage: s(e.whatsappMessage),
                }}
              />
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title="Review">
            <DetailList
              items={[
                ["Status", <StatusBadge key="s" status={e.status} />],
                ["Reviewed by", e.reviewedBy ? `${e.reviewedBy.name} · ${formatDateTime(e.reviewedAt)}` : null],
                ["Review remark", e.reviewNote],
              ]}
            />
            {!own && e.status === "RETURNED" && <div className="mt-4"><Notice tone="warn">Returned to the employee for correction.</Notice></div>}
            {!own && e.status === "REVIEWED" && <div className="mt-4"><Notice tone="ok">Marked as reviewed.</Notice></div>}
            {reviewer && <div className="mt-4 border-t border-line pt-4"><EntryReviewForm action={reviewEntryAction.bind(null, e.id)} /></div>}
          </Card>
          <Card title="History">
            <ol className="space-y-3 text-sm">
              {history.map((h) => {
                const meta = (h.metadata ?? {}) as { note?: string | null; reason?: string | null; changes?: Change[] };
                return (
                  <li key={h.id} className="border-l-2 border-line pl-3">
                    <p className="font-medium">{h.action.replace("timesheet.", "").replace(/_/g, " ")}</p>
                    <p className="text-xs text-muted">{h.actor?.name ?? "System"} · {formatDateTime(h.createdAt)}</p>
                    {(meta.note || meta.reason) && <p className="text-xs">{meta.note ?? meta.reason}</p>}
                    {meta.changes?.map((c) => (
                      <p key={c.field} className="text-xs text-muted">{c.field}: {String(c.from ?? "—")} → {String(c.to ?? "—")}</p>
                    ))}
                  </li>
                );
              })}
              <li className="border-l-2 border-line pl-3">
                <p className="font-medium">created</p>
                <p className="text-xs text-muted">{e.employee.firstName} · {formatDateTime(e.createdAt)}</p>
              </li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
