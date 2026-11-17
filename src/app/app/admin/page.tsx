import Link from "next/link";
import { requireCapability } from "@/lib/session";
import { can } from "@/lib/permissions";
import { formatTime, todayDateOnly } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { isPeriod, opsSummary } from "@/lib/services/ops-summary";
import { Stat } from "@/components/ui";
import { CalendarCheck2 } from "lucide-react";
import { Greeting } from "../dashboard-sections";
import { AiAssistant } from "./ai-assistant";
import { ClassicDashboard } from "./classic-dashboard";
import { OpsDashboard } from "./ops-dashboard";

// The AI Reporting login gets the operations dashboard (client format, 17 Nov 2026) with period filters,
// and the earlier dashboard behind "360° Dashboard". Everyone else keeps the earlier dashboard here.
export default async function AdminDashboard({ searchParams }: PageProps<"/app/admin">) {
  const ctx = await requireCapability("org.manage");
  if (!can(ctx, "assistant.use")) return <ClassicDashboard ctx={ctx} />;
  const sp = await searchParams;
  const period = isPeriod(sp.period) ? sp.period : "today";
  const [data, myAttendance] = await Promise.all([
    opsSummary(ctx, period),
    ctx.employee ? prisma.attendanceRecord.findFirst({ where: { employeeId: ctx.employee.id, attendanceDate: todayDateOnly(ctx.organization.timezone) } }) : null,
  ]);
  return (
    <>
      <Greeting ctx={ctx} subtitle={`${ctx.role === "OWNER" ? "Firm owner" : "Administrator"} dashboard · ${ctx.organization.tradeName}`} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-60 flex-1 sm:max-w-sm"><Stat label="My attendance" value={myAttendance?.timeIn ? (myAttendance.timeOut ? "Done for today" : `In ${formatTime(myAttendance.timeIn, ctx.organization.timezone)}`) : "Not marked"} hint={myAttendance?.timeIn ? undefined : "Open to mark in"} href="/app/attendance" icon={<CalendarCheck2 />} tone={myAttendance?.timeIn ? "ok" : "warn"} /></div>
        <AiAssistant chat dashboard360 />
      </div>
      <OpsDashboard initial={data} ask />
      <p className="mt-3 text-xs text-muted">The earlier dashboard (clients, approvals, charts, deadlines, activity) is under <Link href="/app/admin/360" className="font-medium text-ink underline-offset-2 hover:underline">360° Dashboard</Link>.</p>
    </>
  );
}
