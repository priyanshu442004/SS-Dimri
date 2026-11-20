"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/session";
import { generateReport, isReportKind, type ReportKind, type StoredReport } from "@/lib/services/ai-report";

/** "Refresh": a new report from the figures as they are now (daily: today; weekly: this week so far). */
export async function refreshReportAction(kind: ReportKind = "DAILY"): Promise<{ ok: true; report: StoredReport } | { ok: false; message: string }> {
  try {
    if (!isReportKind(kind)) return { ok: false, message: "Unknown report." };
    const ctx = await actionContext("assistant.use");
    const report = await generateReport(ctx, { trigger: "MANUAL", kind });
    revalidatePath("/app/reporting");
    return { ok: true, report };
  } catch (e) {
    console.error("Report refresh failed", e instanceof Error ? e.message : e);
    return { ok: false, message: "The report could not be refreshed. Please try again." };
  }
}
