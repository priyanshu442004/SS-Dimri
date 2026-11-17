"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Copy, Gauge, MessageSquareText, RefreshCw, RotateCcw, Sparkles, X } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { toast } from "@/components/toaster";
import { Markdown } from "@/components/markdown";
import { aiSummaryAction } from "./ai-actions";

const dialogCls =
  "m-auto rounded-2xl border border-line bg-surface p-0 text-ink shadow-[0_30px_80px_-20px_rgb(15_29_51/.55)] backdrop:bg-night/50 backdrop:backdrop-blur-[2px]";

function useModal(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open) ref.current?.close();
  }, [open]);
  return ref;
}

function Thinking({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d}ms` }} />)}
      </span>
      {label}
    </span>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied.", "success");
  } catch {
    toast("Could not copy.", "error");
  }
}

// ------------------------------------------------------------------ summary

type SummaryState = { report: string | null; error: string | null; pending: boolean; generate: () => void };

function useSummary(): SummaryState {
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function generate() {
    setError(null);
    start(async () => {
      const r = await aiSummaryAction();
      if (r.ok) setReport(r.text);
      else setError(r.message);
    });
  }
  return { report, error, pending, generate };
}

function SummaryDialog({ open, onClose, state }: { open: boolean; onClose: () => void; state: SummaryState }) {
  const ref = useModal(open);
  const { report, error, pending, generate } = state;

  if (!open) return null;
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="ai-summary-title" className={`${dialogCls} flex h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-3xl flex-col sm:h-[min(85dvh,900px)]`}>
      <header className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-marigold-soft text-ink"><Sparkles className="size-4.5" /></span>
        <h2 id="ai-summary-title" className="min-w-0 flex-1 font-semibold">AI summary report</h2>
        <button type="button" onClick={onClose} className={buttonClass("ghost", "sm", "px-2")} aria-label="Close"><X className="size-4" /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {pending ? (
          <div className="grid h-full place-items-center"><Thinking label="Generating the report… this can take a minute." /></div>
        ) : error ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-sm text-danger">{error}</p>
              <button type="button" onClick={generate} className={buttonClass("secondary", "sm", "mt-3")}><RotateCcw className="size-3.5" aria-hidden /> Try again</button>
            </div>
          </div>
        ) : report ? (
          <Markdown text={report} />
        ) : null}
      </div>
      <footer className="flex justify-end gap-2 border-t border-line px-5 py-3">
        {report && !pending && <button type="button" onClick={() => copyText(report)} className={buttonClass("secondary", "sm")}><Copy className="size-3.5" aria-hidden /> Copy</button>}
        <button type="button" onClick={generate} disabled={pending} className={buttonClass("primary", "sm")}><RefreshCw className="size-3.5" aria-hidden /> {report ? "Regenerate" : "Generate"}</button>
      </footer>
    </dialog>
  );
}

// ------------------------------------------------------------------ buttons

export function AiAssistant({ chat = false, dashboard360 = false }: { chat?: boolean; dashboard360?: boolean }) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const summary = useSummary();
  // The first click generates the report; reopening shows the last one until "Regenerate".
  function openSummary() {
    setSummaryOpen(true);
    if (summary.report === null && !summary.pending) summary.generate();
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {chat ? (
          <>
            <Link href="/app/reporting" className={buttonClass("primary", "md")}><Sparkles className="size-4" aria-hidden /> AI Reporting</Link>
            <Link href="/app/assistant" className={buttonClass("secondary", "md")}><MessageSquareText className="size-4" aria-hidden /> AI Assistant</Link>
            {dashboard360 && <Link href="/app/admin/360" className={buttonClass("secondary", "md")}><Gauge className="size-4" aria-hidden /> 360° Dashboard</Link>}
          </>
        ) : (
          <button type="button" onClick={openSummary} className={buttonClass("primary", "md")}><Sparkles className="size-4" aria-hidden /> AI Summary</button>
        )}
      </div>
      <SummaryDialog open={summaryOpen} onClose={() => setSummaryOpen(false)} state={summary} />
    </>
  );
}
