"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { clsx } from "clsx";
import { Sparkles } from "lucide-react";
import type { Kpi, OpsSummary } from "@/lib/services/ops-summary";

// The management report in the client's "Daily AI Summary Report" format (17 Nov 2026): a navy band,
// eight KPI tiles with change and a 7-point sparkline, then the summary, attendance, workload, urgent
// cases, client pending, late arrivals, offsite work, late fees and priorities. Used by the dashboard
// (with period filters), AI Reporting (with the AI-written summary) and the PDF print page.

export type ReportNarrative = { summary: { label: string; text: string }[]; priorities: string[]; ai: boolean };
type Mode = "dashboard" | "report" | "print";

const TONE: Record<Kpi["tone"], { text: string; border: string; stroke: string }> = {
  ink: { text: "text-ink", border: "border-l-ink", stroke: "stroke-ink" },
  ok: { text: "text-ok", border: "border-l-ok", stroke: "stroke-ok" },
  danger: { text: "text-danger", border: "border-l-danger", stroke: "stroke-danger" },
  warn: { text: "text-marigold", border: "border-l-marigold", stroke: "stroke-marigold" },
  info: { text: "text-info", border: "border-l-info", stroke: "stroke-info" },
  stamp: { text: "text-stamp", border: "border-l-stamp", stroke: "stroke-stamp" },
};

// ---------------------------------------------------------------- small pieces

/** Numbers in a label count from their old to their new values (e.g. "6 / 7", "₹18,400", "92%"). */
function useAnimatedText(text: string, animate: boolean) {
  const [shown, setShown] = useState(text);
  const from = useRef(text);
  useEffect(() => {
    const start = from.current;
    from.current = text;
    // No animation (print, reduced motion): the next frame shows the new text at once.
    const duration = !animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 650;
    const a = (start.match(/\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, "")));
    const parts = text.split(/(\d[\d,]*)/);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = duration ? Math.min(1, (t - t0) / duration) : 1;
      const e = 1 - (1 - k) ** 3;
      let i = 0;
      setShown(parts.map((p) => {
        if (!/^\d[\d,]*$/.test(p)) return p;
        const to = Number(p.replace(/,/g, ""));
        const fromV = a[i++] ?? 0;
        const v = Math.round(fromV + (to - fromV) * e);
        return p.includes(",") || to >= 1000 ? v.toLocaleString("en-IN") : String(v);
      }).join(""));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, animate]);
  return shown;
}

function Spark({ values, stroke, animate }: { values: number[]; stroke: string; animate: boolean }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 60 + 2).toFixed(1)},${(20 - ((v - min) / span) * 16).toFixed(1)}`).join(" ");
  const last = pts.split(" ").at(-1)!.split(",");
  return (
    <svg viewBox="0 0 64 24" className="h-7 w-16 shrink-0" aria-hidden>
      <polyline key={values.join(",")} points={pts} fill="none" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" className={clsx(stroke, animate && "ops-spark")} />
      <circle cx={last[0]} cy={last[1]} r="1.8" className={clsx(stroke.replace("stroke-", "fill-"))} />
    </svg>
  );
}

function deltaTone(k: Pick<Kpi, "delta" | "better">) {
  if (k.delta === null || k.delta === 0 || k.better === "none") return "text-muted";
  const good = k.better === "up" ? k.delta > 0 : k.delta < 0;
  return good ? "text-ok" : "text-danger";
}

function KpiTile({ k, animate, compare, i, busy }: { k: Kpi; animate: boolean; compare: string; i: number; busy: boolean }) {
  const tone = TONE[k.tone];
  const value = useAnimatedText(k.display, animate);
  return (
    <div className={clsx("ops-rise min-w-0 rounded-lg border border-line border-l-[3px] bg-surface px-3 py-2.5", tone.border)} style={{ "--d": `${i * 40}ms` } as CSSProperties}>
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-muted" title={k.label}>{k.label}</p>
      <div className="mt-0.5 flex items-end justify-between gap-1">
        <p className={clsx("truncate font-editorial text-[26px] leading-none tabular-nums", tone.text, busy && "opacity-50 transition-opacity")}>{value}</p>
        <Spark values={k.spark} stroke={tone.stroke} animate={animate} />
      </div>
      <p className={clsx("mt-1 truncate text-[11px] font-semibold", deltaTone(k))}>{k.deltaDisplay}{k.delta !== null && k.key !== "lateLeave" ? ` ${compare}` : ""}</p>
      <p className="truncate text-[10.5px] text-muted" title={k.hint}>{k.hint}</p>
    </div>
  );
}

function Section({ title, badge, children, className, i = 0, action }: { title: string; badge?: ReactNode; children: ReactNode; className?: string; i?: number; action?: ReactNode }) {
  return (
    <section className={clsx("ops-rise min-w-0 break-inside-avoid", className)} style={{ "--d": `${120 + i * 50}ms` } as CSSProperties}>
      <header className="mb-2 flex items-center gap-2 border-b-2 border-night pb-1">
        <h2 className="text-[15px] font-bold text-night dark:text-ink">{title}</h2>
        {badge}
        <span className="ml-auto">{action}</span>
      </header>
      {children}
    </section>
  );
}

const Badge = ({ children, tone = "ai" }: { children: ReactNode; tone?: "ai" | "est" }) => (
  <span className={clsx("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide", tone === "ai" ? "bg-marigold text-night" : "bg-marigold-soft text-warn")}>{children}</span>
);

function Grid({ head, rows, total, align, empty = "Nothing to show." }: { head: string[]; rows: ReactNode[][]; total?: ReactNode[]; align?: ("l" | "r" | "c")[]; empty?: string }) {
  const cls = (i: number) => (align?.[i] === "r" ? "text-right" : align?.[i] === "c" ? "text-center" : "text-left");
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-[12.5px]">
        <thead><tr className="bg-night text-paper">{head.map((h, i) => <th key={h} scope="col" className={clsx("px-2 py-1.5 font-semibold", cls(i))}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={head.length} className="px-2 py-3 text-center text-muted">{empty}</td></tr> : rows.map((r, n) => (
            <tr key={n} className="border-b border-line/70 odd:bg-surface even:bg-paper/60">{r.map((c, i) => <td key={i} className={clsx("px-2 py-1.5 align-top", cls(i))}>{c}</td>)}</tr>
          ))}
          {total && rows.length > 0 && <tr className="bg-subtle font-bold">{total.map((c, i) => <td key={i} className={clsx("px-2 py-1.5", cls(i))}>{c}</td>)}</tr>}
        </tbody>
      </table>
    </div>
  );
}

const D = ({ v, better = "down", money }: { v: number | null; better?: "up" | "down"; money?: boolean }) =>
  v === null || v === 0 ? <span className="text-muted">–</span> : (
    <span className={clsx("font-semibold", (better === "down" ? v < 0 : v > 0) ? "text-ok" : "text-danger")}>
      {v > 0 ? "▲" : "▼"} {money ? `₹${Math.abs(v).toLocaleString("en-IN")}` : Math.abs(v)}
    </span>
  );

const PRIORITY_TONE = { CRITICAL: "text-danger", HIGH: "text-marigold", MEDIUM: "text-muted" } as const;
const STATUS_TONE = { ok: "text-ok", warn: "text-marigold", danger: "text-danger", muted: "text-muted" } as const;
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

// ---------------------------------------------------------------- select any text → ask the AI assistant

/**
 * Select text in the report → a small "Ask AI Assistant" bubble right above it. It sits in the page
 * (it scrolls with the text) and goes away on a click elsewhere, Escape, or when the selection clears.
 */
function useSelectionAsk(container: RefObject<HTMLElement | null>, onAsk?: (text: string) => void) {
  const [sel, setSel] = useState<{ text: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!onAsk) return;
    const read = () => {
      const s = window.getSelection();
      const text = s?.toString().replace(/\s+/g, " ").trim() ?? "";
      if (!s || s.isCollapsed || text.length < 2 || !s.rangeCount || !container.current?.contains(s.anchorNode)) { setSel(null); return; }
      const r = s.getRangeAt(0).getBoundingClientRect();
      if (!r.width && !r.height) { setSel(null); return; }
      setSel({ text: text.slice(0, 2000), x: r.left + r.width / 2 + window.scrollX, y: r.top + window.scrollY - 40 });
    };
    const onUp = () => setTimeout(read, 0);
    const onChange = () => { if (window.getSelection()?.isCollapsed) setSel(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSel(null); };
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    document.addEventListener("selectionchange", onChange);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onChange);
    return () => {
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
      document.removeEventListener("selectionchange", onChange);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onChange);
    };
  }, [container, onAsk]);
  if (!sel || !onAsk || typeof document === "undefined") return null;
  return createPortal(
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => { onAsk(sel.text); setSel(null); window.getSelection()?.removeAllRanges(); }}
      className="ai-pop absolute z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-lg bg-night px-3 py-1.5 text-xs font-medium text-paper shadow-xl print:hidden"
      style={{ left: Math.max(90, Math.min(sel.x, document.documentElement.scrollWidth - 90)), top: Math.max(4, sel.y) }}
    >
      <Sparkles className="size-3.5" aria-hidden /> Ask AI Assistant
    </button>,
    document.body,
  );
}

// ---------------------------------------------------------------- the report

export function OpsReport({ data, narrative, mode, title, busy = false, onAsk, generatedLabel, toolbar }: {
  data: OpsSummary;
  narrative?: ReportNarrative | null;
  mode: Mode;
  title: string;
  busy?: boolean;
  onAsk?: (text: string) => void;
  /** e.g. "Generated 6:00 PM IST" (report) or "Updated 4:12 PM" (dashboard). */
  generatedLabel: string;
  /** Period filters / buttons, shown under the band. */
  toolbar?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bubble = useSelectionAsk(ref, mode === "print" ? undefined : onAsk);
  const animate = mode !== "print";
  const print = mode === "print";
  const cap = <T,>(rows: T[], n: number) => (print ? rows.slice(0, n) : rows);
  const ai = !!narrative?.ai;
  const summary = narrative?.summary ?? data.summary;
  const priorities = narrative?.priorities ?? data.priorities;
  const today = data.period === "today";
  const k = data.period; // re-key sections so a new period animates in

  return (
    <div ref={ref} className={clsx("relative", busy && "pointer-events-none")} aria-busy={busy}>
      {/* Band */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 rounded-t-xl bg-night px-5 py-3 text-paper">
        <div className="min-w-0">
          <h1 className="font-editorial text-[26px] leading-tight text-paper">{title}</h1>
          <p className="text-[13px] text-paper/80">Accounting &amp; Compliance Practice &nbsp;|&nbsp; Operations, Attendance &amp; Urgency &nbsp;|&nbsp; For Management</p>
        </div>
        <div className="text-right">
          <p className="text-[17px] font-bold text-paper">{data.singleDay ? data.dateLabel : data.rangeLabel}</p>
          <p className="text-[12.5px] text-paper/80">{generatedLabel} &nbsp;|&nbsp; {data.counts.clients} clients · {data.counts.members} team members · {data.counts.items} open items</p>
        </div>
      </div>
      {toolbar && <div className="border-x border-line bg-surface px-4 py-2.5 print:hidden">{toolbar}</div>}
      {/* Loading bar while another period is fetched */}
      <div className="relative h-0.5 overflow-hidden bg-transparent" aria-hidden>{busy && <span className="ops-loading-bar" />}</div>

      <div className={clsx("space-y-5 rounded-b-xl border border-t-0 border-line bg-paper/40 p-4 transition-opacity duration-300", busy && "opacity-60")}>
        {/* KPI tiles */}
        <div key={`k-${k}`} className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
          {data.kpis.map((kpi, i) => <KpiTile key={kpi.key} k={kpi} animate={animate} compare={data.compareLabel} i={i} busy={busy} />)}
        </div>

        {/* Summary + attendance by role */}
        <div key={`a-${k}`} className="grid gap-5 lg:grid-cols-[1.45fr_1fr]">
          <Section title={ai ? "AI executive summary" : "Executive summary"} badge={ai ? <Badge>AI-generated</Badge> : null} i={0}>
            <ul className="divide-y divide-line rounded-md border border-line bg-surface text-[13px]">
              {summary.map((s, i) => (
                <li key={s.label} className={clsx("px-3 py-1.5", i === 1 && "bg-danger-bg/60")}>
                  <strong className="text-ink">{s.label}:</strong> <span className="text-ink/90">{s.text}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title={`Attendance by role – ${data.singleDay ? (today ? "today" : "yesterday") : data.periodLabel.toLowerCase()}`} i={1}>
            <Grid
              head={["Role", "Staff", "On time", "Late", "Leave", "Offsite"]}
              align={["l", "l", "c", "c", "c", "c"]}
              rows={cap(data.attendanceByRole, 6).map((r) => [r.role, <span key="s" className="text-muted">{r.staff}</span>, r.onTime, r.late, r.leave, r.offsite])}
              total={["Total", data.attendanceTotal.staff,
                <span key="o">{data.attendanceTotal.onTime} <D v={data.attendanceTotal.dOnTime} better="up" /></span>,
                <span key="l">{data.attendanceTotal.late} <D v={data.attendanceTotal.dLate} /></span>,
                <span key="v">{data.attendanceTotal.leave} <D v={data.attendanceTotal.dLeave} /></span>,
                <span key="f">{data.attendanceTotal.offsite} <D v={data.attendanceTotal.dOffsite} better="up" /></span>]}
            />
          </Section>
        </div>

        {/* Workload + urgent cases */}
        <div key={`b-${k}`} className="grid gap-5 lg:grid-cols-2">
          <Section title={`Team workload – ${data.singleDay ? (today ? "today" : "yesterday") : data.periodLabel.toLowerCase()}`} i={2}>
            <Grid
              head={["Member", "Role", "Status", "Assigned", "Done", "Open", "Overdue", data.compareLabel.replace("vs ", "vs ")]}
              align={["l", "l", "l", "c", "c", "c", "c", "c"]}
              rows={cap(data.workload, 9).map((r) => [
                <strong key="m">{r.member}</strong>, <span key="r" className="text-muted">{r.role}</span>, <span key="s" className={STATUS_TONE[r.statusTone]}>{r.status}</span>,
                r.assigned, r.done, r.open, <span key="o" className={r.overdue ? "font-bold text-danger" : ""}>{r.overdue}</span>, <D key="d" v={r.delta} />,
              ])}
              total={["Total", "", "", data.workloadTotal.assigned, data.workloadTotal.done, data.workloadTotal.open, <span key="o" className="text-danger">{data.workloadTotal.overdue}</span>, <D key="d" v={data.workloadTotal.delta} />]}
              empty="No open work."
            />
          </Section>
          <Section title="Urgent & flagged cases" i={3}>
            <Grid
              head={["Priority", "Client", "Item", "Due", "Owner", "Issue / action"]}
              rows={cap(data.urgent, 6).map((u) => [
                <strong key="p" className={PRIORITY_TONE[u.priority]}>{u.priority}</strong>,
                <strong key="c">{u.client}</strong>,
                print ? u.item : <Link key="i" href={u.href} className="hover:underline">{u.item}</Link>,
                <span key="d" className={u.due.startsWith("Overdue") ? "text-danger" : ""}>{u.due}</span>, u.owner, u.issue,
              ])}
              empty="Nothing urgent."
            />
          </Section>
        </div>

        {/* Client pending · late arrivals · offsite */}
        <div key={`c-${k}`} className="grid gap-5 lg:grid-cols-3">
          <Section title="Pending from client side" i={4}>
            <Grid
              head={["Client", "Items", "Δ", "Age", "Documents awaited"]}
              align={["l", "c", "c", "c", "l"]}
              rows={cap(data.pendingClient, 5).map((r) => [<strong key="c">{r.client}</strong>, r.items, <D key="d" v={r.delta} />, `${r.age} d`, r.awaited])}
              total={["Total", data.pendingClientTotal.items, <D key="d" v={data.pendingClientTotal.delta} />, "", <span key="n" className="font-normal text-muted">{data.pendingClientTotal.note}</span>]}
              empty="Nothing is waiting on clients."
            />
          </Section>
          <Section title="Late arrivals & reasons" i={5}>
            <Grid
              head={data.singleDay ? ["Member / role", "In", "Late by", "Reason logged"] : ["Member / role", "Day · in", "Late by", "Reason logged"]}
              align={["l", "c", "c", "l"]}
              rows={cap(data.late, 5).map((r) => [
                <span key="m"><strong>{r.member}</strong><span className="block text-[11px] text-muted">{r.role}</span></span>,
                data.singleDay ? r.inTime : `${r.date} · ${r.inTime}`, `${r.lateBy} min`, r.reason,
              ])}
              empty="Nobody was late."
            />
            <p className="mt-1.5 rounded bg-subtle px-2 py-1 text-[12px]"><strong>By role:</strong> {data.lateByRole}</p>
          </Section>
          <Section title="Offsite visits" i={6}>
            <Grid
              head={["Member", "Client visited", "Purpose", data.singleDay ? "Time" : "Day · time"]}
              rows={cap(data.offsite, 5).map((r) => [<strong key="m">{r.member}</strong>, r.client, r.purpose, data.singleDay ? r.time : `${r.date} · ${r.time}`])}
              empty="No offsite work."
            />
            <p className="mt-1.5 rounded bg-subtle px-2 py-1 text-[12px] font-semibold">{data.offsiteTotal}</p>
          </Section>
        </div>

        {/* Late fees + priorities */}
        <div key={`d-${k}`} className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Section title="Overdue penalties & payments due" badge={<Badge tone="est">Estimate</Badge>} i={7}>
            <Grid
              head={["Item", "Client", "Late", "Penalty", data.compareLabel, "Borne by"]}
              align={["l", "l", "c", "r", "c", "l"]}
              rows={data.penalties.map((r) => [r.item, r.client, r.late, inr(r.penalty), <D key="d" v={r.delta} money />, <span key="b" className="font-semibold text-info">{r.borneBy}</span>])}
              total={["Total exposure", "", "", inr(data.penaltyTotal.penalty), <D key="d" v={data.penaltyTotal.delta} money />, <span key="n" className="font-normal text-muted">{data.penaltyTotal.note}</span>]}
              empty="No overdue GST / TDS / ITR / ROC filing: no late fee building up."
            />
            <p className="mt-1 text-[11px] text-muted">Statutory late fee on overdue filings: GST ₹50/day (max ₹10,000), GSTR-9 ₹200/day, TDS/TCS ₹200/day (234E), ITR ₹5,000 (234F), ROC ₹100/day.</p>
          </Section>
          <Section title={ai ? `AI-recommended priorities${today ? " for tomorrow" : ""}` : `Recommended priorities${today ? " for tomorrow" : ""}`} badge={ai ? <Badge>AI-generated</Badge> : null} i={8}>
            {priorities.length === 0 ? <p className="text-sm text-muted">Nothing pressing.</p> : (
              <ol className="divide-y divide-line rounded-md border border-line bg-surface text-[13px]">
                {priorities.map((p, i) => <li key={i} className={clsx("px-3 py-1.5", i === 0 && "bg-danger-bg/60")}><strong>{i + 1}.</strong> {p}</li>)}
              </ol>
            )}
          </Section>
        </div>

        <p className="flex flex-wrap justify-between gap-2 border-t border-line pt-2 text-[11px] text-muted">
          <span>Source: practice ERP data (tasks, Accounting Workflow Tracker, attendance, client visits) as of {new Date(data.generatedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}. ▲▼ = change {data.compareLabel}; sparklines = {data.singleDay ? "last 7 days" : "the period in 7 steps"}; green = improvement, red = worsening.</span>
        </p>
      </div>
      {bubble}
    </div>
  );
}
