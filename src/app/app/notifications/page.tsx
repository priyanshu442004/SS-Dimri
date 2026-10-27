import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { actionContext, requireCapability } from "@/lib/session";
import { formatDateTime } from "@/lib/dates";
import { ActionButton } from "@/components/action-button";
import { EmptyState, PageHeader } from "@/components/ui";
import { Bell } from "lucide-react";

async function markAllRead() {
  "use server";
  const ctx = await actionContext();
  await prisma.notification.updateMany({ where: { userId: ctx.user.id, organizationId: ctx.organization.id, readAt: null }, data: { readAt: new Date() } });
  revalidatePath("/app", "layout");
}

export default async function NotificationsPage() {
  const ctx = await requireCapability("app.use"); // locked (awaiting approval) accounts cannot read notifications
  const items = await prisma.notification.findMany({
    where: { userId: ctx.user.id, organizationId: ctx.organization.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const unread = items.some((n) => !n.readAt);
  return (
    <>
      <PageHeader icon={<Bell />} title="Notifications" actions={unread && <ActionButton action={markAllRead}>Mark all as read</ActionButton>} />
      {items.length === 0 ? <EmptyState kind="inbox" title="No notifications yet" /> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((n) => (
            <li key={n.id} className={`flex gap-3 px-4 py-3 ${n.readAt ? "" : "bg-brand-50/50"}`}>
              <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-700"}`} />
              <div className="min-w-0 flex-1">
                {n.link ? <a href={`/api/notifications/${n.id}`} className="font-medium text-ink hover:underline">{n.title}</a> : <p className="font-medium">{n.title}</p>}
                {n.body && <p className="text-sm text-muted">{n.body}</p>}
                <p className="text-xs text-muted">{formatDateTime(n.createdAt)}{!n.readAt && <span className="sr-only"> (unread)</span>}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
