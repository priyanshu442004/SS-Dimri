import { prisma } from "@/lib/db";
import { NO_EMPLOYEE } from "@/lib/ids";
import { teamAnalytics } from "@/lib/services/analytics";
import { TeamCharts } from "../chart-sections";
import { requireCapability } from "@/lib/session";
import { leadOverview, myOverview } from "@/lib/services/dashboard";
import { DayReportsReceived, Deadlines, Greeting, LeadStats, MyDay, ReviewQueue, StatutoryDue, Workload } from "../dashboard-sections";

export default async function SeniorDashboard() {
  const ctx = await requireCapability("tasks.review");
  const reportees = await prisma.employeeReportingRelationship.findMany({ where: { managerId: ctx.employee?.id ?? NO_EMPLOYEE }, select: { employeeId: true } });
  const [team, mine, charts] = await Promise.all([leadOverview(ctx, "team"), myOverview(ctx), teamAnalytics(ctx, reportees.map((r) => r.employeeId))]);
  return (
    <>
      <Greeting ctx={ctx} subtitle="Senior dashboard — your team's work, reviews and your own day." />
      <LeadStats data={team} />
      <TeamCharts a={charts} scope="my team" />
      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <ReviewQueue data={team} />
        <Deadlines data={team} />
        <StatutoryDue />
        <div className="lg:col-span-2"><Workload data={team} title={`My team (${team.teamSize})`} /></div>
        <DayReportsReceived data={team} />
      </div>
      <h2 className="mb-3 font-editorial text-2xl">My day</h2>
      <MyDay ctx={ctx} data={mine} />
    </>
  );
}
