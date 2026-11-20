"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { CalendarDays, CalendarRange, Download, FileText, MessageSquareText, RefreshCw } from "lucide-react";
import { OpsReport } from "@/components/ops-report";
import { WeeklyReport } from "@/components/weekly-report";
import { buttonClass } from "@/components/ui";
import { toast } from "@/components/toaster";
import type { ReportKind, StoredReport } from "@/lib/services/ai-report";
import { refreshReportAction } from "./actions";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const SCHEDULE: Record<ReportKind, string> = {
  DAILY: "a new daily report is made every day at 6:00 PM and mailed",
  WEEKLY: "the weekly report (Monday to Sunday) is made every Monday at 9:00 AM and mailed",
};

/** Daily and weekly reports, shown at once. Only Refresh (or the scheduled runs) makes a new one. */
export function ReportView({ daily, weekly, initialKind }: { daily: StoredReport | null; weekly: StoredReport | null; initialKind: ReportKind }) {
  const router = useRouter();
  const [kind, setKind] = useState<ReportKind>(initialKind);
  const [reports, setReports] = useState<Record<ReportKind, StoredReport | null>>({ DAILY: daily, WEEKLY: weekly });
  const [pending, start] = useTransition();
  const shown = useRef(reports);
  useEffect(() => { shown.current = reports; }, [reports]);
  const report = reports[kind];

  const choose = (k: ReportKind) => {
    setKind(k);
    try { history.replaceState(null, "", k === "WEEKLY" ? `${location.pathname}?kind=weekly` : location.pathname); } catch { /* ignore */ }
  };

  const refresh = () => start(async () => {
    const r = await refreshReportAction(kind);
    if (r.ok) { setReports((x) => ({ ...x, [kind]: r.report })); toast("Report refreshed with the latest figures.", "success"); }
    else toast(r.message, "error");
  });

  // A report made elsewhere (the 6 PM / Monday run, or Refresh in another tab) appears here by itself.
  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      for (const k of ["DAILY", "WEEKLY"] as const) {
        const res = await fetch(`/api/ai-report/latest?kind=${k}`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null) as { id: string | null } | null;
        if (!stop && res?.id && res.id !== shown.current[k]?.id) {
          toast(`A new ${k === "DAILY" ? "daily" : "weekly"} report is ready.`, "success");
          router.refresh();
          return;
        }
      }
    };
    const t = setInterval(() => void check(), 60_000);
    document.addEventListener("visibilitychange", check);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", check); };
  }, [router]);

  const tabs = (
    <div role="tablist" aria-label="Report" className="inline-flex gap-1 rounded-lg bg-subtle p-1">
      {([["DAILY", "Daily report", CalendarDays], ["WEEKLY", "Weekly report", CalendarRange]] as const).map(([k, label, Icon]) => (
        <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => kind !== k && choose(k)}
          className={clsx("flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors", kind === k ? "bg-night text-paper shadow-sm" : "text-muted hover:bg-surface hover:text-ink")}>
          <Icon className="size-4" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );

  if (!report) {
    return (
      <div className="space-y-4">
        {tabs}
        <div className="ai-in mx-auto max-w-xl rounded-2xl border border-line bg-surface p-8 text-center">
          <FileText className="mx-auto mb-3 size-6 text-stamp" aria-hidden />
          <h1 className="font-editorial text-2xl">{kind === "DAILY" ? "Daily Summary Report" : "Weekly Business Report"}</h1>
          <p className="mt-2 text-sm text-muted">
            {kind === "DAILY" ? "The daily report is made every evening at 6:00 PM IST and mailed. Make the first one now: it takes about half a minute." : "The weekly report covers Monday to Sunday and is made every Monday at 9:00 AM IST for the week just ended, then mailed. You can make this week's report so far now: it takes about a minute."}
          </p>
          <button type="button" onClick={refresh} disabled={pending} className={clsx(buttonClass("primary", "md"), "mt-5")}>
            <RefreshCw className={clsx("size-4", pending && "animate-spin")} aria-hidden /> {pending ? "Making the report…" : kind === "DAILY" ? "Make the report now" : "Make this week's report so far"}
          </button>
        </div>
      </div>
    );
  }

  const weekNote = report.kind === "WEEKLY" ? (report.data.complete ? `Week ${report.data.weekText}` : `This week so far (${report.data.weekText})`) : "";
  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <p className="mr-auto flex min-w-0 items-center gap-1.5 text-xs text-muted">
        <FileText className="size-3.5 shrink-0" aria-hidden />
        {pending ? <span className="ai-shimmer font-medium">Reading the latest figures and writing the summary…</span>
          : <span className="truncate">{weekNote ? `${weekNote} · ` : ""}{report.trigger === "SCHEDULED" ? (report.kind === "DAILY" ? "Evening report" : "Monday report") : "Refreshed"} {when(report.completedAt)} IST{report.mailStatus === "SENT" && report.mailTo ? ` · mailed to ${report.mailTo}` : ""} · {SCHEDULE[report.kind]}</span>}
      </p>
      <button type="button" onClick={() => router.push("/app/assistant")} className={buttonClass("secondary", "sm")}><MessageSquareText className="size-4" aria-hidden /> AI Assistant</button>
      <a href={`/api/ai-report/${report.id}/pdf`} className={clsx(buttonClass("secondary", "sm"), pending && "pointer-events-none opacity-50")}><Download className="size-4" aria-hidden /> PDF</a>
      <button type="button" onClick={refresh} disabled={pending} className={buttonClass("primary", "sm")} title={report.kind === "WEEKLY" ? "Make this week's report so far from the latest figures" : "Make today's report from the latest figures"}>
        <RefreshCw className={clsx("size-4", pending && "animate-spin")} aria-hidden /> {pending ? "Refreshing…" : "Refresh"}
      </button>
    </div>
  );
  const ask = (q: string) => router.push(`/app/assistant?q=${encodeURIComponent(q)}`);

  return (
    <div className="space-y-4">
      {tabs}
      <div className={clsx(pending && "pointer-events-none opacity-70 transition-opacity")}>
        {report.kind === "WEEKLY" ? (
          <WeeklyReport key={report.id} data={report.data} narrative={report.narrative} toolbar={toolbar} generatedLabel={`Generated ${when(report.completedAt)} IST`} onAsk={ask} />
        ) : (
          <OpsReport
            key={report.id}
            data={report.data}
            narrative={report.narrative}
            mode="report"
            title="Daily Summary Report"
            busy={pending}
            toolbar={toolbar}
            generatedLabel={`Generated ${time(report.completedAt)} IST`}
            onAsk={ask}
          />
        )}
      </div>
    </div>
  );
}
