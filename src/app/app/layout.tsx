import Link from "next/link";
import { prisma } from "@/lib/db";
import { can, ROLE_LABELS } from "@/lib/permissions";
import { NO_EMPLOYEE } from "@/lib/ids";
import { OPEN_STATUSES } from "@/lib/domain/task-workflow";
import { isAwaitingApproval, requireContext } from "@/lib/session";
import { deliverDueReminders } from "@/lib/services/tasks";
import { formatDateTime } from "@/lib/dates";
import { AccessWatcher } from "@/components/access-watcher";
import { signOutAction } from "./account-actions";
import { navFor } from "./nav";
import { AppShell } from "./shell";

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const ctx = await requireContext();
  // Turn due task reminders into notifications (no scheduler needed).
  await deliverDueReminders(ctx.organization.id).catch(() => undefined);
  const unread = await prisma.notification.count({ where: { userId: ctx.user.id, organizationId: ctx.organization.id, readAt: null } });
  const awaiting = isAwaitingApproval(ctx);
  const badges = awaiting ? {} : await navBadges(ctx);

  return (
    <AppShell
      nav={navFor(ctx.role, awaiting, !!ctx.employee)}
      badges={badges}
      orgName={ctx.organization.tradeName}
      userName={ctx.employee ? `${ctx.employee.firstName} ${ctx.employee.lastName ?? ""}`.trim() : ctx.user.name}
      roleLabel={ROLE_LABELS[ctx.role]}
      unread={unread}
      signOut={signOutAction}
    >
      <AccessWatcher initial={ctx.access.state} />
      {ctx.access.state === "grace" && ctx.access.graceEndsAt && (
        <p role="status" className="mb-4 rounded-md border border-warn/30 bg-warn-bg px-3 py-2 text-sm text-warn">
          Your account is awaiting administrator approval. You have full access until <strong>{formatDateTime(ctx.access.graceEndsAt)}</strong>; after that you will be signed out until it is approved.
          {ctx.employee && <> <Link href="/app/onboarding" className="font-medium underline">Complete or check your onboarding details</Link>.</>}
        </p>
      )}
      {children}
    </AppShell>
  );
}

/** Actionable counts shown next to navigation items (all scoped to the user's role). */
async function navBadges(ctx: Awaited<ReturnType<typeof requireContext>>): Promise<Record<string, number>> {
  const org = ctx.organization.id;
  const me = ctx.employee?.id ?? NO_EMPLOYEE;
  const [clients, onboarding, reviews, overdue, pending] = await Promise.all([
    can(ctx.role, "clients.approve") ? prisma.client.count({ where: { organizationId: org, status: "PENDING_APPROVAL" } }) : 0,
    can(ctx.role, "employees.manage")
      ? prisma.employee.count({ where: { organizationId: org, approvalStatus: { in: ["PENDING", "UNDER_REVIEW"] }, onboardingSubmittedAt: { not: null } } })
      : 0,
    can(ctx.role, "tasks.review") ? prisma.task.count({ where: { organizationId: org, status: "PENDING_REVIEW", checkerEmployeeId: me } }) : 0,
    prisma.task.count({ where: { organizationId: org, status: { in: OPEN_STATUSES }, dueAt: { lt: new Date() }, assignments: { some: { employeeId: me, removedAt: null } } } }),
    prisma.pendingItem.count({ where: { organizationId: org, status: { not: "CLOSED" }, pendingWithEmployeeId: me } }),
  ]);
  return { "/app/clients": clients, "/app/employees": onboarding, "/app/tasks": reviews + overdue, "/app/pending": pending };
}
