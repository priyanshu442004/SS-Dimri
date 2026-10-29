import { notFound } from "next/navigation";
import { requireClientContext } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/dates";
import { portalTask } from "@/lib/services/portal";
import { Card, Notice, PageHeader } from "@/components/ui";
import { clientRemarkAction, observationAction } from "../../actions";
import { ObservationForm, RemarkForm } from "../../forms";

const LABEL: Record<string, string> = {
  PENDING: "Not started", ASSIGNED: "Scheduled", IN_PROGRESS: "In progress", ON_HOLD: "On hold", PENDING_REVIEW: "Internal quality review",
  CHANGES_REQUESTED: "In progress", AWAITING_CLIENT: "Waiting for information from you", AWAITING_TEAM_MEMBER: "In progress",
  COMPLETED: "Completed", CANCELLED: "Cancelled",
};

export default async function ClientWorkDetail({ params }: PageProps<"/client/work/[id]">) {
  const ctx = await requireClientContext();
  const { id } = await params;
  const t = await portalTask(ctx, id);
  if (!t) notFound();
  return (
    <>
      <PageHeader
        title={t.title}
        back={{ href: "/client/work", label: "Work" }}
        description={`${LABEL[t.status]}${t.dueAt ? ` · due ${formatDate(t.dueAt)}` : ""}${t.completedAt ? ` · completed ${formatDate(t.completedAt)}` : ""}`}
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card title="Updates and remarks">
          {t.activities.length === 0 ? <p className="text-sm text-muted">No updates shared yet.</p> : (
            <ol className="space-y-3">
              {t.activities.map((a) => (
                <li key={a.id} className="rounded-md border border-line p-3 text-sm">
                  <p className="text-xs text-muted">{a.actor?.name ?? ctx.organization.tradeName} · {formatDateTime(a.createdAt)}</p>
                  <p className="mt-1 whitespace-pre-wrap">{a.note}</p>
                </li>
              ))}
            </ol>
          )}
          <div className="mt-4 border-t border-line pt-4"><RemarkForm action={clientRemarkAction.bind(null, t.id)} /></div>
        </Card>
        <div className="space-y-6">
          {t.clientObservationStatus === "PENDING_CLIENT_REVIEW" && (
            <Card title="Your review">
              <p className="mb-3 text-sm text-muted">Please review this work and accept it, or send your observations to the team.</p>
              <ObservationForm action={observationAction.bind(null, t.id)} />
            </Card>
          )}
          {t.clientObservationStatus === "ACCEPTED" && <Notice tone="ok">You accepted this work.</Notice>}
          {t.clientObservationStatus === "OBSERVATIONS_RAISED" && <Notice tone="warn">Your observations were sent{t.clientObservationNote ? `: ${t.clientObservationNote}` : ""}.</Notice>}
        </div>
      </div>
    </>
  );
}
