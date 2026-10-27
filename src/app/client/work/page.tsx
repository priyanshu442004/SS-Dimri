import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireClientContext } from "@/lib/session";
import { formatDate } from "@/lib/dates";
import { EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { Briefcase } from "lucide-react";

const SECTIONS = [
  { title: "Awaiting your review or confirmation", where: { clientObservationStatus: "PENDING_CLIENT_REVIEW" as const } },
  { title: "Waiting for information from you", where: { status: "AWAITING_CLIENT" as const } },
  { title: "Being worked on by our team", where: { status: { notIn: ["AWAITING_CLIENT", "COMPLETED", "CANCELLED"] as ("AWAITING_CLIENT" | "COMPLETED" | "CANCELLED")[] }, clientObservationStatus: { not: "PENDING_CLIENT_REVIEW" as const } } },
  { title: "Completed", where: { status: "COMPLETED" as const, clientObservationStatus: { not: "PENDING_CLIENT_REVIEW" as const } } },
];

export default async function ClientWork() {
  const ctx = await requireClientContext();
  const lists = await Promise.all(
    SECTIONS.map((s) =>
      prisma.task.findMany({
        where: { clientId: ctx.client.id, clientVisible: true, ...s.where },
        orderBy: { dueAt: { sort: "asc", nulls: "last" } },
        take: 50,
        select: { id: true, title: true, dueAt: true, completedAt: true, status: true },
      }),
    ),
  );
  const total = lists.reduce((n, l) => n + l.length, 0);
  return (
    <>
      <PageHeader icon={<Briefcase />} title="Work" description="Work items our team has shared with you. Internal working notes are not shown here." />
      {total === 0 ? <EmptyState kind="tasks" title="No shared work yet" /> : (
        <div className="space-y-6">
          {SECTIONS.map((s, i) => lists[i].length > 0 && (
            <section key={s.title}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{s.title}</h2>
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {lists[i].map((t) => (
                  <li key={t.id}>
                    <Link href={`/client/work/${t.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-subtle/50">
                      <span className="font-medium">{t.title}</span>
                      <span className="text-xs text-muted">{t.status === "COMPLETED" ? `Completed ${formatDate(t.completedAt)}` : t.dueAt ? `Due ${formatDate(t.dueAt)}` : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-6 text-xs text-muted"><StatusBadge status="OPEN" label="Tip" /> You can add remarks on any work item; they go directly to the team working on it.</p>
    </>
  );
}
