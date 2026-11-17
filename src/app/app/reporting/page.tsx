import type { Metadata } from "next";
import { requireCapability } from "@/lib/session";
import { latestReport } from "@/lib/services/ai-report";
import { ReportView } from "./report-view";

export const metadata: Metadata = { title: "AI reporting" };

// The Daily AI Summary Report. The latest stored report opens instantly (made every evening at 18:00
// IST and mailed, or on Refresh); nothing is generated just by opening the page.
export default async function ReportingPage() {
  const ctx = await requireCapability("assistant.use");
  return <ReportView initial={await latestReport(ctx.organization.id)} />;
}
