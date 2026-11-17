"use server";

import { revalidatePath } from "next/cache";
import { actionContext } from "@/lib/session";
import { generateReport, type StoredReport } from "@/lib/services/ai-report";

/** "Refresh": a new report from the figures as they are now (the evening run still happens at 18:00). */
export async function refreshReportAction(): Promise<{ ok: true; report: StoredReport } | { ok: false; message: string }> {
  try {
    const ctx = await actionContext("assistant.use");
    const report = await generateReport(ctx, { trigger: "MANUAL" });
    revalidatePath("/app/reporting");
    return { ok: true, report };
  } catch (e) {
    console.error("AI report refresh failed", e instanceof Error ? e.message : e);
    return { ok: false, message: "The report could not be refreshed. Please try again." };
  }
}
