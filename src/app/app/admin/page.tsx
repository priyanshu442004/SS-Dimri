import { requireCapability } from "@/lib/session";
import { can } from "@/lib/permissions";
import { isoDateInTz } from "@/lib/dates";
import { dashboardBundle, parseBizFilters } from "@/lib/services/business360";
import { Greeting } from "../dashboard-sections";
import { AiAssistant } from "./ai-assistant";
import { BusinessDashboard } from "./business-dashboard";
import { ClassicDashboard } from "./classic-dashboard";

// The AI Reporting login gets the Business 360° dashboard (client format, 20 Nov 2026): financials,
// clients and team; operations, tasks and compliance; then the operations detail — with period and
// dimension filters. Everyone else keeps the firm dashboard.
export default async function AdminDashboard({ searchParams }: PageProps<"/app/admin">) {
  const ctx = await requireCapability("org.manage");
  if (!can(ctx, "assistant.use")) return <ClassicDashboard ctx={ctx} />;
  const f = parseBizFilters(await searchParams);
  const data = await dashboardBundle(ctx, f);
  return (
    <>
      <Greeting ctx={ctx} subtitle={`${ctx.role === "OWNER" ? "Firm owner" : "Administrator"} dashboard · ${ctx.organization.tradeName}`} />
      <div className="mb-5 flex flex-wrap items-center justify-end gap-3">
        <AiAssistant chat />
      </div>
      <BusinessDashboard initial={data} today={isoDateInTz(new Date(), ctx.organization.timezone)} />
    </>
  );
}
