import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireClientContext } from "@/lib/session";
import { formatDate } from "@/lib/dates";
import { daysPending } from "@/lib/domain/derived";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Inbox } from "lucide-react";

export default async function ClientRequests() {
  const ctx = await requireClientContext();
  const items = await prisma.pendingItem.findMany({
    where: { clientId: ctx.client.id, pendingWith: "CLIENT", clientVisible: true },
    orderBy: [{ status: "asc" }, { requestedOn: "desc" }],
    take: 100,
    select: { id: true, requestDescription: true, requestedOn: true, dueBy: true, status: true, closedAt: true, _count: { select: { followUps: { where: { clientVisible: true } } } } },
  });
  return (
    <>
      <PageHeader icon={<Inbox />} title="Requests from our team" description="Information or documents we need from you. Open a request to reply or upload the document." />
      {items.length === 0 ? <EmptyState kind="done" title="No requests">When our team needs something from you, it will appear here.</EmptyState> : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.id}>
              <Link href={`/client/requests/${i.id}`} className="block rounded-lg border border-line bg-surface p-4 hover:border-brand-200">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{i.requestDescription}</p>
                  <StatusBadge status={i.status === "CLOSED" ? "COMPLETED" : "OPEN"} label={i.status === "CLOSED" ? "Done" : "Open"} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  Requested {formatDate(i.requestedOn)}{i.dueBy && ` · please provide by ${formatDate(i.dueBy)}`}
                  {i.status !== "CLOSED" && ` · open ${daysPending(i, undefined, ctx.organization.pendingDaysBasis)} days`} · {i._count.followUps} message{i._count.followUps === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
