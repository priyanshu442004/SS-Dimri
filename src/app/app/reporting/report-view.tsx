"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, MessageSquareText, Printer, RefreshCw, Sparkles } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { toast } from "@/components/toaster";
import type { Block, StreamEvent } from "@/lib/ai/blocks";
import { KpiBlocks, VisualBlocks } from "../assistant/assistant-blocks";
import { REPORT_PROMPT, REPORT_TITLE } from "./report-prompt";

type Report = { content: string; blocks: Block[]; createdAt: string };

export function ReportView({ firm, initial }: { firm: string; initial: { content: string; blocks: unknown[]; createdAt: string; conversationId: string } | null }) {
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(initial ? { content: initial.content, blocks: initial.blocks as Block[], createdAt: initial.createdAt } : null);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const started = useRef(false);

  const generate = useCallback(async () => {
    setBusy(true);
    setSteps([]);
    const next: Report = { content: "", blocks: [], createdAt: new Date().toISOString() };
    setReport({ ...next });
    try {
      const res = await fetch("/api/assistant/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: REPORT_PROMPT, title: REPORT_TITLE }) });
      if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `The report could not be generated (error ${res.status}).`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as StreamEvent;
          if (e.type === "text") next.content += e.text;
          else if (e.type === "text_set") next.content = e.text;
          else if (e.type === "block") next.blocks = [...next.blocks, e.block];
          else if (e.type === "tool" && e.state === "running") { const label = e.label; setSteps((s) => [...s, label]); }
          else if (e.type === "error") throw new Error(e.message);
          setReport({ ...next });
        }
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "The report could not be generated.", "error");
    } finally {
      setBusy(false);
    }
  }, []);

  // First visit: build the report straight away.
  useEffect(() => {
    if (!initial && !started.current) { started.current = true; void generate(); }
  }, [initial, generate]);

  const askAbout = useCallback((text: string) => {
    const q = text.trim().slice(0, 2000);
    if (q) router.push(`/app/assistant?q=${encodeURIComponent(q)}`);
  }, [router]);

  // Select any text in the report → "Ask AI Assistant" opens the chat with that part quoted.
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onUp = () => {
      const s = window.getSelection();
      const t = s?.toString().trim() ?? "";
      if (!s || !t || !s.rangeCount || !bodyRef.current?.contains(s.anchorNode)) { setSel(null); return; }
      const r = s.getRangeAt(0).getBoundingClientRect();
      setSel({ text: t, x: r.left + r.width / 2, y: Math.max(8, r.top - 44) });
    };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    return () => { document.removeEventListener("mouseup", onUp); document.removeEventListener("touchend", onUp); };
  }, []);

  const kpis = report?.blocks.filter((b) => b.type === "kpis") ?? [];
  const visuals = report?.blocks.filter((b) => b.type !== "kpis") ?? [];
  const when = report ? new Date(report.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <p className="flex items-center gap-2 text-sm text-muted"><FileText className="size-4" aria-hidden /> AI Reporting</p>
          <h1 className="font-editorial text-3xl text-ink">{REPORT_TITLE}</h1>
          <p className="mt-1 text-sm text-muted">{firm} · financials, clients, delivery and people{report && !busy ? ` · generated ${when}` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => window.print()} disabled={busy || !report} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm hover:bg-subtle disabled:opacity-50"><Printer className="size-4" aria-hidden /> Print / PDF</button>
          <button type="button" onClick={() => router.push("/app/assistant")} className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm hover:bg-subtle"><MessageSquareText className="size-4" aria-hidden /> AI Assistant</button>
          <button type="button" onClick={() => void generate()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2 text-sm font-medium text-paper hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />} {busy ? "Generating…" : "Generate new report"}
          </button>
        </div>
      </div>

      {busy && (
        <div className="ai-in mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted print:hidden">
          <Sparkles className="size-4 text-stamp" aria-hidden /> Building the report from the live Google Sheet and the ERP. This takes about a minute.
          {steps.slice(-3).map((s, i) => <span key={i} className="rounded-full bg-subtle px-2.5 py-0.5 text-xs">{s}</span>)}
        </div>
      )}

      <div ref={bodyRef} className="space-y-6">
        {kpis.length > 0 && <KpiBlocks blocks={kpis} animate={busy} onAsk={askAbout} />}
        {report?.content && (
          <section className="ai-in rounded-2xl border border-line bg-surface p-5 sm:p-7">
            <div className="max-w-none text-[15px] leading-relaxed text-ink"><Markdown text={report.content} /></div>
          </section>
        )}
        {visuals.length > 0 && <VisualBlocks blocks={visuals} onAsk={askAbout} />}
        {!busy && !report?.content && !report?.blocks.length && (
          <p className="rounded-2xl border border-line bg-surface p-8 text-center text-sm text-muted">No report yet. Click “Generate new report”.</p>
        )}
      </div>

      {sel && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { askAbout(sel.text); setSel(null); }}
          className="ai-pop fixed z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-xl bg-night px-3 py-1.5 text-xs text-paper shadow-xl print:hidden" style={{ left: sel.x, top: sel.y }}>
          <Sparkles className="size-3.5" aria-hidden /> Ask AI Assistant
        </button>
      )}
    </div>
  );
}
