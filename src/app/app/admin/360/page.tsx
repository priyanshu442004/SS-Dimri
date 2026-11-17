import type { Metadata } from "next";
import { requireCapability } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { Gauge } from "lucide-react";
import { ClassicDashboard } from "../classic-dashboard";

export const metadata: Metadata = { title: "360° dashboard" };

/** The full firm dashboard: approvals, firm today, charts, deadlines and recent activity. */
export default async function Dashboard360() {
  const ctx = await requireCapability("org.manage");
  return (
    <>
      <PageHeader icon={<Gauge />} title="360° dashboard" back={{ href: "/app/admin", label: "Dashboard" }} description={`Everything at a glance · ${ctx.organization.tradeName}`} />
      <ClassicDashboard ctx={ctx} heading={false} />
    </>
  );
}
