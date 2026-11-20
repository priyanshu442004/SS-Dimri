import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { checkPrintToken, reportById } from "@/lib/services/ai-report";
import { OpsReport } from "@/components/ops-report";
import { WeeklyReport } from "@/components/weekly-report";

export const metadata: Metadata = { title: "Summary report", robots: { index: false } };

// Opened only by the server's own headless browser to print the PDF (a signed link valid 5 minutes).
export default async function PrintReport({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ id }, { t }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id) || !checkPrintToken(id, t)) notFound();
  const row = await prisma.aiReport.findUnique({ where: { id }, select: { organizationId: true } });
  const report = row ? await reportById(row.organizationId, id) : null;
  if (!report) notFound();
  const at = new Date(report.completedAt);
  const time = at.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const stamp = at.toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).replace(/,/g, "");
  return (
    <main className="mx-auto w-[1400px] bg-paper p-4 text-ink">
      {report.kind === "WEEKLY"
        ? <WeeklyReport data={report.data} narrative={report.narrative} generatedLabel={`Generated ${stamp} IST`} print />
        : <OpsReport data={report.data} narrative={report.narrative} mode="print" title="Daily Summary Report" generatedLabel={`Generated ${time} IST`} />}
    </main>
  );
}
