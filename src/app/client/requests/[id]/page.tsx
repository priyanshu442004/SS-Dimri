import { notFound } from "next/navigation";
import { requireClientContext } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/dates";
import { portalRequest } from "@/lib/services/portal";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { respondAction } from "../../actions";
import { ReplyForm } from "../../forms";

export default async function ClientRequestDetail({ params }: PageProps<"/client/requests/[id]">) {
  const ctx = await requireClientContext();
  const { id } = await params;
  const r = await portalRequest(ctx, id);
  if (!r) notFound();
  return (
    <>
      <PageHeader
        title={r.requestDescription}
        back={{ href: "/client/requests", label: "Requests" }}
        description={<span className="flex items-center gap-2">Requested {formatDate(r.requestedOn)}{r.dueBy && ` · please provide by ${formatDate(r.dueBy)}`} <StatusBadge status={r.status === "CLOSED" ? "COMPLETED" : "OPEN"} label={r.status === "CLOSED" ? "Done" : "Open"} /></span>}
      />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card title="Conversation">
          {r.followUps.length === 0 ? <p className="text-sm text-muted">No messages yet.</p> : (
            <ol className="space-y-3">
              {r.followUps.map((f) => (
                <li key={f.id} className="rounded-md border border-line p-3 text-sm">
                  <p className="text-xs text-muted">{f.actor?.name ?? ctx.organization.tradeName} · {formatDateTime(f.createdAt)}</p>
                  <p className="mt-1 whitespace-pre-wrap">{f.note}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
        {r.status !== "CLOSED" && (
          <Card title="Reply or upload the document">
            <ReplyForm action={respondAction.bind(null, r.id)} />
          </Card>
        )}
      </div>
    </>
  );
}
