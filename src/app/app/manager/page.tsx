import { teamAnalytics } from "@/lib/services/analytics";
import { TeamCharts } from "../chart-sections";
import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/session";
import { leadOverview } from "@/lib/services/dashboard";
import { DayReportsReceived, Deadlines, Greeting, LeadStats, ReviewQueue, StatutoryDue, Workload } from "../dashboard-sections";

export default async function ManagerDashboard() {
  const ctx = await requireCapability("tasks.review");
  if (ctx.role === "SENIOR") redirect("/app/senior");
  const [data, charts] = await Promise.all([leadOverview(ctx, "org"), teamAnalytics(ctx)]);
  return (
    <>
      <Greeting ctx={ctx} subtitle="Manager dashboard — review queue, team workload, blockers and deadlines." />
      <LeadStats data={data} />
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
