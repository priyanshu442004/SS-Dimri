import { requireCapability } from "@/lib/session";
import { can } from "@/lib/permissions";
import { formatTime, isoDateInTz, todayDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { dashboardBundle, parseBizFilters } from "@/lib/services/business360";
import { Stat } from "@/components/ui";
import { CalendarCheck2 } from "lucide-react";
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
  const [data, myAttendance] = await Promise.all([
    dashboardBundle(ctx, f),
    ctx.employee ? prisma.attendanceRecord.findFirst({ where: { employeeId: ctx.employee.id, attendanceDate: todayDateOnly(ctx.organization.timezone) } }) : null,
  ]);
  return (
    <>
      <Greeting ctx={ctx} subtitle={`${ctx.role === "OWNER" ? "Firm owner" : "Administrator"} dashboard · ${ctx.organization.tradeName}`} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-60 flex-1 sm:max-w-sm"><Stat label="My attendance" value={myAttendance?.timeIn ? (myAttendance.timeOut ? "Done for today" : `In ${formatTime(myAttendance.timeIn, ctx.organization.timezone)}`) : "Not marked"} hint={myAttendance?.timeIn ? undefined : "Open to mark in"} href="/app/attendance" icon={<CalendarCheck2 />} tone={myAttendance?.timeIn ? "ok" : "warn"} /></div>
        <AiAssistant chat />
      </div>
      <BusinessDashboard initial={data} today={isoDateInTz(new Date(), ctx.organization.timezone)} />
    </>
  );
}
