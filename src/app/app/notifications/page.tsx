import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { actionContext, requireCapability } from "@/lib/session";
import { formatDateTime } from "@/lib/dates";
import { notificationTab, type NotificationTab } from "@/lib/domain/notification-kind";
import { ActionButton } from "@/components/action-button";
import { EmptyState, PageHeader, TabNav } from "@/components/ui";
import { Bell } from "lucide-react";

const LIMIT = 300;

async function markRead(tab: NotificationTab | "all") {
  "use server";
  const ctx = await actionContext();
  const unread = await prisma.notification.findMany({ where: { userId: ctx.user.id, organizationId: ctx.organization.id, readAt: null }, select: { id: true, type: true, title: true } });
  const ids = unread.filter((n) => tab === "all" || notificationTab(n) === tab).map((n) => n.id);
  if (ids.length) await prisma.notification.updateMany({ where: { id: { in: ids } }, data: { readAt: new Date() } });
  revalidatePath("/app", "layout");
}

/**
 * Notifications, in two tabs (tracker S.No. 108): "Notifications" (assigned, approved, decided, reminders …)
 * and "Observations & error reports" (client observations, missed plans / EOD reports, automatic absent marks,
 * missed mark-outs, overdue work, memos, corrections asked for).
 */
export default async function NotificationsPage({ searchParams }: PageProps<"/app/notifications">) {
  const ctx = await requireCapability("app.use"); // locked (awaiting approval) accounts cannot read notifications
  const sp = await searchParams;
  const tab: NotificationTab = sp.tab === "observations" ? "observations" : "notifications";
  const all = await prisma.notification.findMany({
    where: { userId: ctx.user.id, organizationId: ctx.organization.id },
    orderBy: { createdAt: "desc" },
    take: LIMIT,
  });
  const unreadIn = (t: NotificationTab) => all.filter((n) => !n.readAt && notificationTab(n) === t).length;
  const items = all.filter((n) => notificationTab(n) === tab).slice(0, 150);
  const unread = items.some((n) => !n.readAt);
  return (
    <>
      <PageHeader icon={<Bell />} title="Notifications" actions={unread && <ActionButton action={markRead.bind(null, tab)}>Mark these as read</ActionButton>} />
      <TabNav
        current={tab}
        tabs={[
          { key: "notifications", label: "Notifications", href: "/app/notifications", ...(unreadIn("notifications") ? { count: unreadIn("notifications") } : {}) },
          { key: "observations", label: "Observations & error reports", href: "/app/notifications?tab=observations", ...(unreadIn("observations") ? { count: unreadIn("observations") } : {}) },
        ]}
      />
      {tab === "observations" && <p className="mb-3 text-sm text-muted">Things that went wrong or need correcting: client observations, a missed morning plan or EOD report, an automatic absent mark, a missed mark-out, overdue work, memos and corrections asked for.</p>}
      {items.length === 0 ? <EmptyState kind="inbox" title={tab === "observations" ? "No observations or error reports" : "No notifications yet"} /> : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
          {items.map((n) => (
            <li key={n.id} className={`flex gap-3 px-4 py-3 ${n.readAt ? "" : tab === "observations" ? "bg-warn-bg/60" : "bg-brand-50/50"}`}>
              <span aria-hidden className={`mt-1.5 size-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : tab === "observations" ? "bg-warn" : "bg-brand-700"}`} />
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
