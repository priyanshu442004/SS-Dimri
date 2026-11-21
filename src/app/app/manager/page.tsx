import { teamAnalytics } from "@/lib/services/analytics";
import { lineIds, seesFirm } from "@/lib/hierarchy";
import { TeamCharts } from "../chart-sections";
import { redirect } from "next/navigation";
import { UserCheck } from "lucide-react";
import { Stat } from "@/components/ui";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { leadOverview } from "@/lib/services/dashboard";
import { DayReportsReceived, Deadlines, Greeting, LeadStats, MyDay, ReviewQueue, StatutoryDue, TeamToday, Workload } from "../dashboard-sections";
import { teamToday } from "@/lib/services/team-today";
import { myOverview } from "@/lib/services/dashboard";

export default async function ManagerDashboard() {
  const ctx = await requireCapability("tasks.review");
  if (ctx.role === "SENIOR") redirect("/app/senior");
  // Hierarchy (tracker S.No. 96, 97): a manager sees their own line; the firm only with the firm-wide right.
  const firm = seesFirm(ctx, "tasks.view_all");
  const line = firm ? undefined : (await lineIds(ctx)).filter((id) => id !== ctx.employee?.id);
  const [data, charts, onboarding, today, mine] = await Promise.all([
    leadOverview(ctx, firm ? "org" : "team"),
    teamAnalytics(ctx, line),
    prisma.employee.count({ where: { organizationId: ctx.organization.id, approvalStatus: { in: ["PENDING", "UNDER_REVIEW"] }, onboardingSubmittedAt: { not: null } } }),
    teamToday(ctx),
    myOverview(ctx),
  ]);
  return (
    <>
      <Greeting ctx={ctx} subtitle="Manager dashboard — review queue, team workload, blockers and deadlines." />
      {today && <TeamToday data={today} />}
      <LeadStats data={data} />
      {can(ctx, "employees.approve") && onboarding > 0 && (
        <div className="mb-6 max-w-xs"><Stat label="Onboarding to approve" value={onboarding} href="/app/employees?status=review" icon={<UserCheck />} tone="warn" /></div>
      )}
      <TeamCharts a={charts} scope={firm ? "whole firm" : "your team"} />
      <div className="grid gap-6 lg:grid-cols-3">
        <ReviewQueue data={data} />
        <Deadlines data={data} />
        <StatutoryDue />
        <div className="lg:col-span-2"><Workload data={data} title={firm ? "Team workload" : `My team (${data.teamSize})`} /></div>
        <DayReportsReceived data={data} />
      </div>
      {ctx.employee && <><h2 className="mb-3 mt-8 font-editorial text-2xl">My day</h2><MyDay ctx={ctx} data={mine} /></>}
    </>
  );
}
