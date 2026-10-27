import { prisma } from "@/lib/db";
import { requireClientContext } from "@/lib/session";
import { formatDateTime } from "@/lib/dates";
import { EmptyState, PageHeader } from "@/components/ui";
import { Bell } from "lucide-react";

export default async function ClientNotifications() {
  const ctx = await requireClientContext();
  const items = await prisma.notification.findMany({ where: { userId: ctx.user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  // Viewing the list marks them read.
  await prisma.notification.updateMany({ where: { userId: ctx.user.id, readAt: null }, data: { readAt: new Date() } });
  return (
    <>
      <PageHeader icon={<Bell />} title="Notifications" />
      {items.length === 0 ? <EmptyState kind="inbox" title="No notifications" /> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((n) => (
            <li key={n.id} className="px-4 py-3 text-sm">
              {n.link ? <a href={`/api/notifications/${n.id}`} className="font-medium hover:underline">{n.title}</a> : <p className="font-medium">{n.title}</p>}
              {n.body && <p className="text-muted">{n.body}</p>}
              <p className="text-xs text-muted">{formatDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
