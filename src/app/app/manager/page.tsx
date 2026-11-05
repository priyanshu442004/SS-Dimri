import { teamAnalytics } from "@/lib/services/analytics";
import { TeamCharts } from "../chart-sections";
import { redirect } from "next/navigation";
import { UserCheck } from "lucide-react";
import { Stat } from "@/components/ui";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { leadOverview } from "@/lib/services/dashboard";
import { DayReportsReceived, Deadlines, Greeting, LeadStats, ReviewQueue, StatutoryDue, Workload } from "../dashboard-sections";

export default async function ManagerDashboard() {
  const ctx = await requireCapability("tasks.review");
  if (ctx.role === "SENIOR") redirect("/app/senior");
  const [data, charts, onboarding] = await Promise.all([
    leadOverview(ctx, "org"),
    teamAnalytics(ctx),
    prisma.employee.count({ where: { organizationId: ctx.organization.id, approvalStatus: { in: ["PENDING", "UNDER_REVIEW"] }, onboardingSubmittedAt: { not: null } } }),
  ]);
  return (
    <>
      <Greeting ctx={ctx} subtitle="Manager dashboard — review queue, team workload, blockers and deadlines." />
      <LeadStats data={data} />
      {can(ctx, "employees.approve") && onboarding > 0 && (
        <div className="mb-6 max-w-xs"><Stat label="Onboarding to approve" value={onboarding} href="/app/employees?status=review" icon={<UserCheck />} tone="warn" /></div>
      )}
      <TeamCharts a={charts} scope="whole firm" />
      <div className="grid gap-6 lg:grid-cols-3">
        <ReviewQueue data={data} />
        <Deadlines data={data} />
        <StatutoryDue />
        <div className="lg:col-span-2"><Workload data={data} title="Team workload" /></div>
        <DayReportsReceived data={data} />
      </div>
    </>
  );
}
