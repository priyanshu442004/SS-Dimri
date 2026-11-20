import type { Metadata } from "next";
import { requireCapability } from "@/lib/session";
import { latestReport } from "@/lib/services/ai-report";
import { ReportView } from "./report-view";

export const metadata: Metadata = { title: "AI reporting" };

// Daily and weekly reports. The latest stored report of each kind opens instantly (daily: made every
// evening at 18:00 IST; weekly: every Monday at 09:00 IST for Monday to Sunday — both mailed); nothing is
// generated just by opening the page. A new report made while the page is open appears by itself.
export default async function ReportingPage({ searchParams }: PageProps<"/app/reporting">) {
  const ctx = await requireCapability("assistant.use");
  const sp = await searchParams;
  const kind = sp.kind === "weekly" ? "WEEKLY" : "DAILY";
  const [daily, weekly] = await Promise.all([latestReport(ctx.organization.id, "DAILY"), latestReport(ctx.organization.id, "WEEKLY")]);
  return <ReportView key={`${daily?.id ?? "none"}|${weekly?.id ?? "none"}`} daily={daily} weekly={weekly} initialKind={kind} />;
}
