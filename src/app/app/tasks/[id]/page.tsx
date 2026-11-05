import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { dateTimeLocalInTz, formatDateTime } from "@/lib/dates";
import { isTaskOverdue } from "@/lib/domain/derived";
import { TASK_ACTION_LABELS } from "@/lib/domain/task-workflow";
import { loadTaskForCtx, taskActionsFor } from "@/lib/services/tasks";
import { taskEmployeeOptions } from "@/lib/services/lookups";
import { Badge, Card, DetailList, humanize, PageHeader, StatusBadge } from "@/components/ui";
import { addReminderAction, addRemarkAction, cancelReminderAction, setAssigneesAction, setClientSharingAction, taskTransitionAction } from "../actions";
import { ActionButton } from "@/components/action-button";
import { DeleteButton } from "@/components/delete-dialog";
import { VoicePlayer } from "@/components/voice-note";
import { canDelete } from "@/lib/services/deletions";
import { FileText, Image as ImageIcon, Mic } from "lucide-react";
import { AssignForm, ReminderForm, RemarkForm, SharingForm, TransitionForm } from "./forms";

export default async function TaskDetailPage({ params }: PageProps<"/app/tasks/[id]">) {
  const ctx = await requireCapability("tasks.use");
  const { id } = await params;
  const scoped = await loadTaskForCtx(ctx, id);
  if (!scoped) notFound();

  const t = await prisma.task.findUniqueOrThrow({
    where: { id: scoped.id },
    include: {
      client: { select: { id: true, tradeName: true, contacts: { where: { isPrimary: true }, take: 1 } } },
      clientService: { include: { service: true } },
      maker: { select: { id: true, firstName: true, lastName: true } },
      checker: { select: { id: true, firstName: true, lastName: true } },
      writingFrom: { select: { firstName: true, lastName: true } },
      createdBy: { select: { name: true } },
      assignments: { where: { removedAt: null }, include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
      attachments: { include: { file: { select: { id: true, originalFileName: true, uploadedBy: { select: { name: true } } } } }, orderBy: { createdAt: "asc" } },
      reminders: { orderBy: { remindAt: "asc" } },
      activities: { orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true, memberships: { select: { role: true }, take: 1 } } } }, take: 100 },
      reviews: { orderBy: { createdAt: "desc" }, include: { reviewer: { select: { firstName: true, lastName: true } } } },
    },
  });
  const actions = await taskActionsFor(ctx, scoped);
  // Team members can re-assign only tasks they created; leads any task.
  const canAssign = can(ctx, "tasks.review") || (can(ctx, "tasks.create") && t.createdById === ctx.user.id);
  const voiceNotes = t.attachments.filter((a) => a.kind === "AUDIO");
  const files = t.attachments.filter((a) => a.kind !== "AUDIO");
  const employees = canAssign ? await taskEmployeeOptions(ctx.organization.id) : [];
  const nameOf = new Map(employees.map((e) => [e.value, e.label.split(" — ")[0]]));
  const person = (p: { firstName: string; lastName: string | null } | null) => (p ? `${p.firstName} ${p.lastName ?? ""}`.trim() : "—");

  return (
    <>
      <PageHeader
        title={t.title}
        back={{ href: "/app/tasks", label: "Tasks" }}
        actions={canDelete(ctx, "task") && <DeleteButton entity="task" id={t.id} redirectTo="/app/tasks" />}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={t.status} />
            {t.isAsap && <Badge tone="danger">ASAP</Badge>}
            <StatusBadge status={t.priority} label={`${humanize(t.priority)} priority`} />
            {isTaskOverdue(t) && <StatusBadge status="OVERDUE" />}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card title="Details">
            {t.description && <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed">{t.description}</p>}
            <DetailList
              items={[
                ["Client", t.client ? <Link href={`/app/clients/${t.client.id}`} className="text-brand-700 hover:underline">{t.client.tradeName}</Link> : "Internal"],
                ["Service", t.clientService?.service.name],
                ["Client contact", t.client?.contacts[0] ? `${t.client.contacts[0].name} ${t.client.contacts[0].mobile ?? ""}` : null],
                ["Timeline", `${formatDateTime(t.startAt)} → ${formatDateTime(t.dueAt)}`],
                ["Assigned to", t.assignments.map((a) => person(a.employee)).join(", ") || "Unassigned"],
                ["Maker", `${person(t.maker)} · ${humanize(t.makerStatus)}`],
                ["Checker", `${person(t.checker)} · ${humanize(t.checkerStatus)}`],
                ["Writing for (client side)", t.writingForRemark],
                ["Writing from (team side)", [t.writingFrom ? person(t.writingFrom) : null, t.writingFromRemark].filter(Boolean).join(" — ")],
                ["Created", `${formatDateTime(t.createdAt)} by ${t.createdBy?.name ?? "—"}`],
              ]}
            />
          </Card>

          <Card title="Remarks & attachments">
            <RemarkForm action={addRemarkAction.bind(null, t.id)} canShare={t.clientVisible && !!t.clientId} />
            {voiceNotes.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted"><Mic className="size-3.5" aria-hidden /> Voice notes ({voiceNotes.length})</h3>
                <ul className="space-y-2">
                  {voiceNotes.map((a, i) => (
                    <li key={a.id} className="rounded-lg border border-line bg-paper/60 p-2">
                      <VoicePlayer fileId={a.file.id} seconds={a.durationSeconds} label={`Voice note ${i + 1}`} />
                      <p className="mt-1 px-1 text-xs text-muted">{a.file.uploadedBy?.name ?? "—"} · {formatDateTime(a.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {files.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2">
                {files.map((a) => (
                  <li key={a.id}>
                    <a href={`/api/files/${a.file.id}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-xs transition-colors hover:bg-subtle">
                      {a.kind === "IMAGE" ? <ImageIcon className="size-3.5" aria-hidden /> : <FileText className="size-3.5" aria-hidden />} {a.caption ?? a.file.originalFileName}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="History">
            <ol className="space-y-3 text-sm">
              {t.activities.map((a) => (
                <li key={a.id} className="border-l-2 border-line pl-3">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {formatDateTime(a.createdAt)} · {a.actor?.name ?? "System"}
                    {a.actor?.memberships[0]?.role === "CLIENT" && <Badge tone="warn">Client</Badge>}
                    {a.clientVisible && a.actor?.memberships[0]?.role !== "CLIENT" && <Badge tone="info">Visible to client</Badge>}
                  </p>
                  <p>
                    {a.type === "COMMENT" && <span className="whitespace-pre-wrap">{a.note}</span>}
                    {a.type === "STATUS_CHANGED" && <>Status: {humanize(a.fromValue ?? "")} → <strong>{humanize(a.toValue ?? "")}</strong>{a.note && <span className="text-muted"> — {a.note}</span>}</>}
                    {a.type === "CREATED" && <>Task created</>}
                    {a.type === "UPDATED" && <>{a.note}</>}
                    {a.type === "ASSIGNED" && <>Assigned {nameOf.get(a.toValue ?? "") ?? "a team member"}</>}
                    {a.type === "UNASSIGNED" && <>Unassigned {nameOf.get(a.fromValue ?? "") ?? "a team member"}</>}
                    {a.type === "ATTACHMENT_ADDED" && <>Attached {a.toValue}</>}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Update status">
            {actions.length === 0 ? (
              <p className="text-sm text-muted">No status changes available to you right now.</p>
            ) : (
              <TransitionForm action={taskTransitionAction.bind(null, t.id)} actions={actions.map((a) => ({ action: a, label: TASK_ACTION_LABELS[a] }))} />
            )}
          </Card>
          {t.reviews.length > 0 && (
            <Card title="Checker reviews">
              <ul className="space-y-2 text-sm">
                {t.reviews.map((r) => (
                  <li key={r.id}>
                    <StatusBadge status={r.decision === "APPROVED" ? "APPROVED" : "CHANGES_REQUESTED"} /> <span className="text-muted">{person(r.reviewer)} · {formatDateTime(r.createdAt)}</span>
                    {r.comment && <p className="mt-0.5">{r.comment}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {t.clientId && can(ctx, "tasks.review") && (
            <Card title="Client portal">
              <p className="mb-2 text-sm text-muted">{t.clientVisible ? "Shared with the client." : "Not shared — internal only."} Observation: {humanize(t.clientObservationStatus)}</p>
              <SharingForm action={setClientSharingAction.bind(null, t.id)} shared={t.clientVisible} />
            </Card>
          )}
          {canAssign && (
            <Card title="Assignment">
              <AssignForm
                action={setAssigneesAction.bind(null, t.id)}
                employees={employees}
                assigned={t.assignments.map((a) => a.employeeId)}
                maker={t.makerEmployeeId ?? ""}
                checker={t.checkerEmployeeId ?? ""}
              />
            </Card>
          )}
          <Card title="Reminders">
            <ul className="mb-3 space-y-1 text-sm">
              {t.reminders.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    {formatDateTime(r.remindAt)}{r.note && <span className="text-muted"> · {r.note}</span>}
                    <span className="block text-xs text-muted">{r.recipientEmployeeId ? (r.recipientEmployeeId === ctx.employee?.id ? "Only you" : "One person") : "Everyone on this task"}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <StatusBadge status={r.status === "SENT" ? "COMPLETED" : r.status === "CANCELLED" ? "CANCELLED" : "PLANNED"} label={humanize(r.status)} />
                    {r.status === "SCHEDULED" && <ActionButton variant="ghost" confirm="Remove this reminder?" action={cancelReminderAction.bind(null, t.id, r.id)}>Remove</ActionButton>}
                  </span>
                </li>
              ))}
              {t.reminders.length === 0 && <li className="text-muted">No reminders.</li>}
            </ul>
            <ReminderForm action={addReminderAction.bind(null, t.id)} now={dateTimeLocalInTz(new Date(), ctx.organization.timezone)} />
          </Card>
        </div>
      </div>
    </>
  );
}
