import { myAnalytics } from "@/lib/services/analytics";
import { MyCharts } from "../chart-sections";
import { requireCapability } from "@/lib/session";
import { myOverview } from "@/lib/services/dashboard";
import { Greeting, MyDay, TeamToday } from "../dashboard-sections";
import { teamToday } from "@/lib/services/team-today";

export default async function Workspace() {
  const ctx = await requireCapability("dashboard.use");
  // A Team Lead may hold the Team member role: they still see their team's day.
  const [data, charts, team] = await Promise.all([myOverview(ctx), myAnalytics(ctx), teamToday(ctx)]);
  return (
    <>
      <Greeting ctx={ctx} subtitle="Your tasks, attendance, timesheet and day report." />
      <MyDay ctx={ctx} data={data} withDue />
      {team && <div className="mt-8"><TeamToday data={team} /></div>}
      {charts && <div className="mt-6"><MyCharts a={charts} /></div>}
    </>
  );
}
