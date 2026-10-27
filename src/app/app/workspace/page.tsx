import { myAnalytics } from "@/lib/services/analytics";
import { MyCharts } from "../chart-sections";
import { requireCapability } from "@/lib/session";
import { myOverview } from "@/lib/services/dashboard";
import { Greeting, MyDay } from "../dashboard-sections";

export default async function Workspace() {
  const ctx = await requireCapability("app.use");
  const [data, charts] = await Promise.all([myOverview(ctx), myAnalytics(ctx)]);
  return (
    <>
      <Greeting ctx={ctx} subtitle="Your tasks, attendance, timesheet and day report." />
      <MyDay ctx={ctx} data={data} withDue />
      {charts && <div className="mt-6"><MyCharts a={charts} /></div>}
    </>
  );
}
