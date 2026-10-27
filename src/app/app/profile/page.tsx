import Link from "next/link";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { requireContext } from "@/lib/session";
import { formatDateTime } from "@/lib/dates";
import { Card, DetailList, PageHeader, StatusBadge } from "@/components/ui";
import { ChangePasswordForm } from "@/components/change-password-form";
import { DisplayNameForm } from "@/components/display-name-form";
import { CircleUser } from "lucide-react";

/** My profile (Page 58): own login details. Role and status are shown, never self-editable. */
export default async function MyProfilePage() {
  const ctx = await requireContext();
  const [membership, lastSession] = await Promise.all([
    prisma.organizationMembership.findUniqueOrThrow({ where: { id: ctx.membershipId }, select: { status: true, createdAt: true } }),
    prisma.session.findFirst({ where: { userId: ctx.user.id }, orderBy: { createdAt: "desc" }, skip: 1, select: { createdAt: true } }),
  ]);
  return (
    <>
      <PageHeader icon={<CircleUser />} title="My profile" description="Your sign-in details. Contact an administrator to change your role, email or username." />
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <Card title="Account">
          <DetailList
            items={[
              ["Email", ctx.user.email],
              ["Username", ctx.user.username],
              ["Role", ROLE_LABELS[ctx.role]],
              ["Status", <StatusBadge key="s" status={membership.status} />],
              ["Organization", ctx.organization.tradeName],
              ["Member since", formatDateTime(membership.createdAt)],
              ["Previous sign-in", lastSession ? formatDateTime(lastSession.createdAt) : null],
            ]}
          />
          {ctx.employee && (
            <p className="mt-4 text-sm">
              <Link href="/app/onboarding" className="text-brand-700 hover:underline">View or update my employee record →</Link>
            </p>
          )}
        </Card>
        <div className="space-y-6">
          <Card title="Display name"><DisplayNameForm name={ctx.user.name} /></Card>
          <Card title="Change password"><ChangePasswordForm /></Card>
        </div>
      </div>
    </>
  );
}
