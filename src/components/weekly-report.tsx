"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { clsx } from "clsx";
import type { BizKpi } from "@/lib/services/business360";
import type { Narrative, WeeklyData } from "@/lib/services/ai-report";
import { Bars, Card, Empty, KpiCard, RevenueProfitChart, Statutory, TaskStatusBars, money } from "./business-360";

// The Weekly Business Report in the client's format (20 Nov 2026): Monday to Sunday against the week
// before — eight headline figures, tasks, hours, revenue and profit by client, late-fee exposure, urgent
// cases, what waits on clients, attendance, statutory dates, the week's summary and next week's priorities.

const hm = (min: number) => `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;
const PRIORITY_TONE = { CRITICAL: "text-danger", HIGH: "text-marigold", MEDIUM: "text-info" } as const;

function MiniTable({ head, rows, total, align }: { head: string[]; rows: ReactNode[][]; total?: ReactNode[]; align: ("l" | "r" | "c")[] }) {
  const cls = (i: number) => (align[i] === "r" ? "text-right" : align[i] === "c" ? "text-center" : "text-left");
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead><tr className="bg-night text-paper">{head.map((h, i) => <th key={h} scope="col" className={clsx("px-2 py-1.5 text-[11px] font-semibold", cls(i))}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, n) => <tr key={n} className="border-b border-line/70">{r.map((c, i) => <td key={i} className={clsx("px-2 py-1.5 align-top", cls(i))}>{c}</td>)}</tr>)}
          {total && <tr className="bg-brand-50 font-bold">{total.map((c, i) => <td key={i} className={clsx("px-2 py-1.5", cls(i))}>{c}</td>)}</tr>}
        </tbody>
      </table>
    </div>
  );
}

export function WeeklyReport({ data, narrative, toolbar, generatedLabel, onAsk, print = false }: {
  data: WeeklyData;
  narrative: Narrative;
  toolbar?: ReactNode;
  generatedLabel: string;
  onAsk?: (q: string) => void;
  print?: boolean;
}) {
  const b = data.biz;
  const o = data.ops;
  const find = (key: string) => [...b.kpis, ...b.opsKpis].find((k) => k.key === key);
  const pen = o.kpis.find((k) => k.key === "penalty");
  const penalty: BizKpi | undefined = pen && {
    key: "penalty", label: "Penalty exposure", display: money(pen.value), prevDisplay: pen.delta === null ? "—" : money(pen.value - pen.delta),
    deltaDisplay: pen.delta === null ? "no earlier data" : pen.delta === 0 ? "no change" : `${pen.delta > 0 ? "+" : "-"}${money(Math.abs(pen.delta))}`,
    delta: pen.delta, better: "down", hint: pen.hint, tone: "danger",
  };
  const kpis = [
    find("revenue"), find("profit"), find("clients"), find("open"), find("overdue"),
    (() => { const t = find("time"); return t && { ...t, label: "Hours logged (week)" }; })(),
    find("ontime"), penalty,
  ].filter((k): k is BizKpi => !!k);
  const absent = b.attendance.members.reduce((s, m) => s + m.absent, 0);
  const present = find("present");
  const plans = b.actionKpis.find((k) => k.key === "plans");
  const eod = b.actionKpis.find((k) => k.key === "eod");
  const attRows: [string, ReactNode][] = [
    ["Present a day (avg)", present?.display ?? "—"],
    ["On-time rate", find("ontime")?.display ?? "—"],
    ["Late arrivals", <span key="l" className={o.attendanceTotal.late ? "text-marigold" : ""}>{o.attendanceTotal.late}</span>],
    ["Leave days", o.attendanceTotal.leave],
    ["Absent days", <span key="a" className={absent ? "text-danger" : ""}>{absent}</span>],
    ["Days at client sites", o.attendanceTotal.offsite],
    ...(data.complete ? [] : [["Morning plans missing today", <span key="p" className={Number(plans?.display) ? "text-danger" : ""}>{plans?.display ?? "0"}</span>] as [string, ReactNode], ["EOD not filed (to escalate)", <span key="e" className={Number(eod?.display) ? "text-danger" : ""}>{eod?.display ?? "0"}</span>] as [string, ReactNode]]),
  ];
  const generated = new Date(b.generatedAt).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).replace(/,/g, "");

  return (
    <div className={clsx("relative", print && "ops-static")}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-t-xl bg-night px-5 py-3.5 text-paper">
        <h1 className="font-editorial text-[27px] leading-tight text-paper">Weekly Business Report</h1>
        <div className="text-right text-[12.5px] text-paper/85">
          <p className="font-semibold tracking-wide text-paper">{b.firm}</p>
          <p>Week: {data.weekText}{data.complete ? "" : " (so far)"} &nbsp;|&nbsp; {generatedLabel || `Generated ${generated} IST`}</p>
          <p>For business owner / management</p>
        </div>
      </div>
      {toolbar && <div className="border-x border-line bg-surface px-4 py-2.5 print:hidden">{toolbar}</div>}
      <div className="space-y-4 rounded-b-xl border border-t-0 border-line bg-paper/40 p-3 sm:p-4">
        <p className="rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px]"><strong className="mr-2 text-[11.5px] uppercase tracking-wide">Filters</strong>
          Period: {data.complete ? "Week" : "This week so far"} ({b.rangeLabel}) · Compared with: previous week ({b.prevRangeLabel}) · Client: All · Staff: All · Activity: All · Service: All
        </p>
        <div className={clsx("grid gap-2", print ? "grid-cols-8" : "grid-cols-2 md:grid-cols-4 2xl:grid-cols-8")}>
          {kpis.map((k, i) => <KpiCard key={k.key} k={k} prevShort="Prev wk" i={i} compact />)}
        </div>
        <div className={clsx("grid gap-4", print ? "grid-cols-4" : "md:grid-cols-2 2xl:grid-cols-4")}>
          <Card title="Tasks by status" sub={`This week: ${b.tasksCreated} created, ${b.tasksCompleted} completed${b.tasksCreated ? ` (${Math.round((b.tasksCompleted / b.tasksCreated) * 100)}%)` : ""}`}>
            <TaskStatusBars rows={b.tasksByStatus} />
          </Card>
          <Card title="Hours by client" sub={`This week, top 8 · ${hm(b.hoursTotal)} total`}>
            {b.hoursByClient.length === 0 ? <Empty note="No client time logged this week." /> : <Bars rows={b.hoursByClient.map((h) => ({ label: h.client, value: h.minutes }))} color="#2a9d8f" value={hm} />}
          </Card>
          <Card title="Revenue vs profit by client" sub="This week · fees earned and profit after the cost of hours">
            <RevenueProfitChart rows={b.clientScore} />
          </Card>
          <Card title="Penalty & cost exposure" sub="Estimated statutory late fees on overdue filings">
            {o.penalties.length === 0 ? <Empty note="No overdue GST / TDS / ITR / ROC filing: no late fee is building up." /> : (
              <>
                <MiniTable head={["Item", "Penalty", "Borne by"]} align={["l", "r", "l"]}
                  rows={o.penalties.map((p) => [<span key="i">{p.item} · <span className="text-muted">{p.client}</span></span>, money(p.penalty), p.borneBy])}
                  total={["Total exposure", money(o.penaltyTotal.penalty), ""]} />
                <p className="mt-2 text-[11px] text-danger">Late fees rise daily until each filing is made.</p>
              </>
            )}
          </Card>
        </div>
        <div className={clsx("grid gap-4", print ? "grid-cols-4" : "md:grid-cols-2 2xl:grid-cols-4")}>
          <Card title="Urgent & flagged cases" sub={`Status as of ${o.dateLabel}`}>
            {o.urgent.length === 0 ? <Empty note="Nothing urgent or flagged." /> : (
              <MiniTable head={["Priority", "Client", "Item", "Due", "Owner"]} align={["l", "l", "l", "l", "l"]}
                rows={o.urgent.slice(0, 6).map((u) => [<strong key="p" className={PRIORITY_TONE[u.priority]}>{u.priority}</strong>, u.client, print ? u.item : <Link key="i" href={u.href} className="hover:underline">{u.item}</Link>, <span key="d" className={u.due.startsWith("Overdue") ? "font-semibold text-danger" : ""}>{u.due}</span>, u.owner])} />
            )}
          </Card>
          <Card title="Pending from client" sub={o.pendingClientTotal.items ? `${o.pendingClientTotal.items} item${o.pendingClientTotal.items === 1 ? "" : "s"} wait on client documents` : "What waits on client documents"}>
            {o.pendingClient.length === 0 ? <Empty note="Nothing is waiting on clients." /> : (
              <MiniTable head={["Client", "Items", "Age"]} align={["l", "c", "r"]}
                rows={o.pendingClient.map((p) => [p.client, p.items, `${p.age} d`])}
                total={["Total", o.pendingClientTotal.items, ""]} />
            )}
          </Card>
          <Card title="Attendance & people" sub={`This week (${b.rangeLabel})`}>
            <dl className="divide-y divide-line text-[12.5px]">
              {attRows.map(([k, v]) => <div key={k} className="flex justify-between gap-3 py-1.5"><dt>{k}</dt><dd className="font-bold tabular-nums">{v}</dd></div>)}
            </dl>
            {b.insights[0] && <p className="mt-2 text-[11px] text-muted">{b.insights[0]}</p>}
          </Card>
          <Card title="Statutory due dates" sub="Standard dates; extensions not applied"><Statutory rows={b.statutory} /></Card>
        </div>
        <div className={clsx("grid gap-4", print ? "grid-cols-[1.6fr_1fr]" : "lg:grid-cols-[1.6fr_1fr]")}>
          <section className="rounded-xl border border-info/20 bg-info-bg/60 p-4">
            <h3 className="mb-2 text-[15px] font-bold text-night dark:text-ink">Weekly executive summary</h3>
            <ul className="list-disc space-y-1.5 pl-4 text-[12.5px] leading-snug">{narrative.summary.map((s) => <li key={s.label}><strong>{s.label}:</strong> {s.text}</li>)}</ul>
          </section>
          <section className="rounded-xl border border-ok/20 bg-ok-bg/60 p-4">
            <h3 className="mb-2 text-[15px] font-bold text-ledger">Priorities for next week</h3>
            {narrative.priorities.length === 0 ? <p className="text-[13px] text-muted">Nothing pressing for next week.</p> : (
              <ol className="space-y-1.5 text-[12.5px] leading-snug">{narrative.priorities.map((p, i) => <li key={i} className="flex gap-2"><strong className="shrink-0 tabular-nums text-ledger">{i + 1}.</strong><span>{p}</span></li>)}</ol>
            )}
          </section>
        </div>
        {onAsk && !print && (
          <p className="text-[11.5px] text-muted">Questions about this week? <button type="button" onClick={() => onAsk(`Explain the weekly report for ${data.weekText}: what changed vs the previous week?`)} className="font-semibold text-ink underline-offset-2 hover:underline">Ask the assistant</button></p>
        )}
        <p className="border-t border-line pt-2 text-[11px] text-muted">Source: the firm&apos;s ERP records (tasks, Accounting Workflow Tracker, timesheets, attendance, engagements and fees, dues, salaries) for {b.rangeLabel}, compared with {b.prevRangeLabel}. ▲▼ green = favourable, red = unfavourable.</p>
      </div>
    </div>
  );
}
