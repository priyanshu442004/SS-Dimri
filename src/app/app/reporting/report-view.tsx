"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Download, FileText, MessageSquareText, RefreshCw, Sparkles } from "lucide-react";
import { OpsReport } from "@/components/ops-report";
import { buttonClass } from "@/components/ui";
import { toast } from "@/components/toaster";
import type { StoredReport } from "@/lib/services/ai-report";
import { refreshReportAction } from "./actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** The stored report, shown at once. Only Refresh (or the 6 PM run) makes a new one. */
export function ReportView({ initial }: { initial: StoredReport | null }) {
  const router = useRouter();
  const [report, setReport] = useState(initial);
  const [pending, start] = useTransition();

  const refresh = () => start(async () => {
    const r = await refreshReportAction();
    if (r.ok) { setReport(r.report); toast("Report refreshed with the latest figures.", "success"); }
    else toast(r.message, "error");
  });

  if (!report) {
    return (
      <div className="ai-in mx-auto max-w-xl rounded-2xl border border-line bg-surface p-8 text-center">
        <Sparkles className="mx-auto mb-3 size-6 text-stamp" aria-hidden />
        <h1 className="font-editorial text-2xl">Daily AI Summary Report</h1>
        <p className="mt-2 text-sm text-muted">The report is made every evening at 6:00 PM IST. Make the first one now: it takes about half a minute.</p>
        <button type="button" onClick={refresh} disabled={pending} className={clsx(buttonClass("primary", "md"), "mt-5")}>
          <RefreshCw className={clsx("size-4", pending && "animate-spin")} aria-hidden /> {pending ? "Making the report…" : "Make the report now"}
        </button>
      </div>
    );
  }

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <p className="mr-auto flex min-w-0 items-center gap-1.5 text-xs text-muted">
        <FileText className="size-3.5 shrink-0" aria-hidden />
        {pending ? <span className="ai-shimmer font-medium">Reading the latest figures and writing the summary…</span>
          : <span className="truncate">{report.trigger === "SCHEDULED" ? "Evening report" : "Refreshed"} {when(report.completedAt)} IST{report.mailStatus === "SENT" && report.mailTo ? ` · mailed to ${report.mailTo}` : ""} · a new report is made every day at 6:00 PM</span>}
      </p>
      <button type="button" onClick={() => router.push("/app/assistant")} className={buttonClass("secondary", "sm")}><MessageSquareText className="size-4" aria-hidden /> AI Assistant</button>
      <a href={`/api/ai-report/${report.id}/pdf`} className={clsx(buttonClass("secondary", "sm"), pending && "pointer-events-none opacity-50")}><Download className="size-4" aria-hidden /> PDF</a>
      <button type="button" onClick={refresh} disabled={pending} className={buttonClass("primary", "sm")}>
        <RefreshCw className={clsx("size-4", pending && "animate-spin")} aria-hidden /> {pending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );

  return (
    <OpsReport
      key={report.id}
      data={report.data}
      narrative={report.narrative}
      mode="report"
      title="Daily AI Summary Report"
      busy={pending}
      toolbar={toolbar}
      generatedLabel={`Generated ${time(report.completedAt)} IST`}
      onAsk={(q) => router.push(`/app/assistant?q=${encodeURIComponent(q)}`)}
    />
  );
}
