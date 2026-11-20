"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { clsx } from "clsx";
import { AlertTriangle, ArrowUpRight, Inbox, MessageSquareText } from "lucide-react";
import type { BizData, BizKpi } from "@/lib/services/business360";

// The Business 360° dashboard in the client's format (20 Nov 2026): page 1 — financials, clients and
// team; page 2 — operations, tasks and compliance. Shared by the dashboard and the weekly report.

const TONE_BORDER: Record<BizKpi["tone"], string> = {
  ink: "border-l-night", ok: "border-l-ok", danger: "border-l-danger", warn: "border-l-marigold", info: "border-l-info", violet: "border-l-[#6250d6]",
};
const HEALTH_DOT = { ok: "bg-ok", warn: "bg-marigold", danger: "bg-danger", muted: "bg-muted/50" } as const;

export const money = (n: number) => `${n < 0 ? "-" : ""}₹${Math.abs(Math.round(n)).toLocaleString("en-IN")}`;
const hm = (min: number) => `${Math.floor(min / 60)}h ${Math.round(min % 60)}m`;

function deltaTone(k: Pick<BizKpi, "delta" | "better">) {
  if (k.delta === null || Math.abs(k.delta) < 1e-9 || k.better === "none") return "text-muted";
  return (k.better === "up" ? k.delta > 0 : k.delta < 0) ? "text-ok" : "text-danger";
}
const arrow = (k: Pick<BizKpi, "delta">) => (k.delta === null || Math.abs(k.delta) < 1e-9 ? "●" : k.delta > 0 ? "▲" : "▼");

export function KpiCard({ k, prevShort, i = 0, compact = false }: { k: BizKpi; prevShort: string; i?: number; compact?: boolean }) {
  const body = (
    <>
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-muted" title={k.label}>{k.label}</p>
      <p className={clsx("mt-1 truncate font-editorial leading-none text-night dark:text-ink", compact ? "text-[24px]" : "text-[28px]", k.empty && "text-[20px] text-muted")}>{k.display}</p>
      <p className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px]">
        <span className={clsx("truncate font-semibold", deltaTone(k))}>{arrow(k)} {k.deltaDisplay}</span>
        <span className="shrink-0 text-muted">{prevShort} {k.prevDisplay}</span>
      </p>
      {k.hint && <p className="mt-0.5 truncate text-[11px] text-muted" title={k.hint}>{k.hint}</p>}
    </>
  );
  const cls = clsx("ops-rise block min-w-0 rounded-lg border border-line border-l-4 bg-surface px-3 py-2.5 shadow-[0_1px_2px_rgb(15_29_51/.05)]", TONE_BORDER[k.tone], k.href && "transition-colors hover:bg-subtle/60");
  const style = { "--d": `${i * 25}ms` } as CSSProperties;
  return k.href ? <Link href={k.href} className={cls} style={style}>{body}</Link> : <div className={cls} style={style}>{body}</div>;
}

export function Card({ title, sub, children, className, action }: { title: ReactNode; sub?: ReactNode; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={clsx("ops-rise flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgb(15_29_51/.05)] break-inside-avoid", className)}>
      <header className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-night dark:text-ink">{title}</h3>
          {sub && <p className="text-[11.5px] text-muted">{sub}</p>}
        </div>
        {action}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

export function Empty({ note }: { note?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-4 py-6 text-center" role="status">
      <span aria-hidden className="grid size-9 place-items-center rounded-full bg-subtle text-muted"><Inbox className="size-4.5" /></span>
      <p className="text-[13px] font-semibold text-ink">No Data Available</p>
      {note && <p className="max-w-72 text-[12px] text-muted">{note}</p>}
    </div>
  );
}

function Table({ head, rows, total, align }: { head: string[]; rows: ReactNode[][]; total?: ReactNode[]; align: ("l" | "r" | "c")[] }) {
  const cls = (i: number) => (align[i] === "r" ? "text-right" : align[i] === "c" ? "text-center" : "text-left");
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead><tr className="bg-night text-paper">{head.map((h, i) => <th key={h} scope="col" className={clsx("px-1.5 py-1.5 text-[11px] font-semibold first:rounded-l last:rounded-r", cls(i))}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, n) => <tr key={n} className="border-b border-line/70">{r.map((c, i) => <td key={i} className={clsx("px-1.5 py-1.5 tabular-nums", i > 1 && "whitespace-nowrap", cls(i))}>{c}</td>)}</tr>)}
          {total && <tr className="bg-brand-50 font-bold">{total.map((c, i) => <td key={i} className={clsx("whitespace-nowrap px-1.5 py-1.5 tabular-nums", cls(i))}>{c}</td>)}</tr>}
        </tbody>
      </table>
    </div>
  );
}

const signed = (n: number | null) => (n === null ? <span className="text-muted">—</span> : <span className={n < 0 ? "text-danger" : ""}>{money(n)}</span>);
const pctCell = (n: number | null) => (n === null ? <span className="text-muted">—</span> : <span className={n < 0 ? "text-danger" : ""}>{n}%</span>);

// ---------------------------------------------------------------- charts

/** Grouped columns: revenue and profit per client, in ₹ thousand. */
export function RevenueProfitChart({ rows }: { rows: { code: string; client: string; revenue: number; profit: number | null }[] }) {
  if (!rows.length) return <Empty note="No fee earned in this period. Agreed fees are entered on each client's Services tab." />;
  const data = rows.slice(0, 8);
  const max = Math.max(1, ...data.map((r) => Math.max(r.revenue, r.profit ?? 0))) / 1000;
  const step = max > 200 ? 100 : max > 50 ? 25 : max > 10 ? 5 : max > 2 ? 1 : 0.5;
  const top = Math.ceil(max / step) * step;
  const W = 340, H = 170, L = 34, B = 20;
  const bw = (W - L) / data.length;
  const y = (v: number) => H - B - (Math.max(0, v) / 1000 / top) * (H - B - 8);
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-muted"><span>₹ thousand</span>
        <span className="flex gap-3"><span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm bg-night" />Revenue</span><span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm bg-[#2a9d8f]" />Profit</span></span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Revenue and profit by client">
        {ticks.map((t) => <g key={t}><line x1={L} x2={W} y1={y(t * 1000)} y2={y(t * 1000)} className="stroke-line" strokeWidth="0.6" /><text x={L - 4} y={y(t * 1000) + 3} textAnchor="end" className="fill-muted text-[8px]">{t}</text></g>)}
        {data.map((r, i) => {
          const x = L + i * bw + bw * 0.18;
          const w = bw * 0.3;
          return (
            <g key={r.code + i}>
              <title>{`${r.client}: revenue ${money(r.revenue)}${r.profit !== null ? `, profit ${money(r.profit)}` : ""}`}</title>
              <rect x={x} y={y(r.revenue)} width={w} height={H - B - y(r.revenue)} className="fill-night" rx="1" />
              {r.profit !== null && <rect x={x + w + 1} y={y(r.profit)} width={w} height={H - B - y(r.profit)} fill="#2a9d8f" rx="1" />}
              <text x={L + i * bw + bw / 2} y={H - 6} textAnchor="middle" className="fill-muted text-[8.5px]">{r.code}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

const ATT_COLORS = { onTime: "#2a9d8f", late: "#e9a23b", leave: "#6c5ba7", absent: "#d1543f" } as const;

export function AttendanceColumns({ members }: { members: BizData["attendance"]["members"] }) {
  if (!members.length) return <Empty note="No attendance recorded in this period." />;
  const max = Math.max(1, ...members.map((m) => m.onTime + m.late + m.leave + m.absent));
  return (
    <div>
      <div className="mb-2 flex flex-wrap justify-end gap-3 text-[11px] text-muted">
        {(["onTime", "late", "leave", "absent"] as const).map((k) => <span key={k} className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: ATT_COLORS[k] }} />{k === "onTime" ? "On time" : k[0].toUpperCase() + k.slice(1)}</span>)}
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex h-40 items-end gap-1.5" style={{ minWidth: members.length * 34 }}>
          {members.map((m) => {
            const total = m.onTime + m.late + m.leave + m.absent;
            return (
              <div key={m.member} className="flex h-full min-w-[28px] flex-1 flex-col items-center justify-end" title={`${m.member}: ${m.onTime} on time, ${m.late} late, ${m.leave} leave, ${m.absent} absent`}>
                <div className="flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-t" style={{ height: `${(total / max) * 100}%` }}>
                  {(["onTime", "late", "leave", "absent"] as const).map((k) => m[k] > 0 && <div key={k} style={{ height: `${(m[k] / total) * 100}%`, background: ATT_COLORS[k] }} />)}
                </div>
                <span className="mt-1 w-full truncate text-center text-[10px] text-muted" title={m.member}>{m.member}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function PunctualityColumns({ weeks }: { weeks: BizData["punctuality"]["weeks"] }) {
  if (!weeks.some((w) => w.late + w.leave > 0 || w.onTimePct !== null)) return <Empty note="No attendance recorded in these weeks." />;
  const max = Math.max(1, ...weeks.map((w) => w.late + w.leave));
  return (
    <div>
      <div className="mb-2 flex justify-end gap-3 text-[11px] text-muted">
        <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: ATT_COLORS.late }} />Late</span>
        <span className="flex items-center gap-1"><i className="inline-block size-2.5 rounded-sm" style={{ background: ATT_COLORS.leave }} />Leave</span>
      </div>
      <div className="flex h-40 items-end justify-around gap-3">
        {weeks.map((w) => {
          const t = w.late + w.leave;
          return (
            <div key={w.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end" title={`${w.label}: ${w.late} late, ${w.leave} leave, on time ${w.onTimePct ?? "—"}%`}>
              <span className="mb-1 text-[11px] font-bold text-ink">{w.onTimePct === null ? "—" : `${w.onTimePct}%`}</span>
              <div className="flex w-full max-w-12 flex-col-reverse overflow-hidden rounded-t" style={{ height: `${Math.max(2, (t / max) * 85)}%` }}>
                {w.late > 0 && <div style={{ height: `${(w.late / Math.max(1, t)) * 100}%`, background: ATT_COLORS.late }} />}
                {w.leave > 0 && <div style={{ height: `${(w.leave / Math.max(1, t)) * 100}%`, background: ATT_COLORS.leave }} />}
                {t === 0 && <div className="h-full bg-line" />}
              </div>
              <span className="mt-1 text-center text-[10.5px] leading-tight text-muted">{w.label.split(" · ")[0]}<br />{w.label.split(" · ")[1]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Bars({ rows, color, value }: { rows: { label: string; value: number }[]; color: string; value: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5 text-[12.5px]">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-2">
          <span className="truncate" title={r.label}>{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-subtle"><span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} /></span>
          <span className="min-w-12 text-right font-semibold tabular-nums">{value(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: "#d1543f", ASSIGNED: "#0f1d33", IN_PROGRESS: "#3a6fd8", ON_HOLD: "#e9a23b", AWAITING_CLIENT: "#e9a23b", AWAITING_TEAM_MEMBER: "#e9a23b", PENDING_REVIEW: "#6c5ba7", CHANGES_REQUESTED: "#d1543f", COMPLETED: "#2a9d8f",
};

export function TaskStatusBars({ rows }: { rows: BizData["tasksByStatus"] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2 text-[12.5px]">
      {rows.map((r) => (
        <li key={r.status} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-2">
          <span className="truncate">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-subtle"><span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: STATUS_COLOR[r.status] ?? "#5d6470" }} /></span>
          <span className="text-right font-semibold tabular-nums">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function Statutory({ rows }: { rows: BizData["statutory"] }) {
  return (
    <ul className="space-y-2">
      {rows.map((d) => (
        <li key={d.title + d.day + d.month} className="flex items-center gap-3">
          <span className="grid w-11 shrink-0 place-items-center rounded-md border border-line py-1 text-center leading-none"><span className="text-[9.5px] font-bold text-danger">{d.month}</span><span className="text-[17px] font-bold text-night dark:text-ink">{d.day}</span></span>
          <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{d.title}</span><span className="block truncate text-[11px] text-muted">{d.form} · {d.department}</span></span>
          <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", d.daysLeft === 0 ? "bg-danger-bg text-danger" : d.daysLeft <= 5 ? "bg-marigold-soft text-warn" : "bg-subtle text-ink")}>{d.daysLeft === 0 ? "Today" : `${d.daysLeft} d`}</span>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- the two pages

function PageBand({ title, data, page }: { title: string; data: BizData; page: string }) {
  const at = new Date(data.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-t-xl bg-night px-5 py-3.5 text-paper">
      <h2 className="font-editorial text-[24px] leading-tight text-paper sm:text-[27px]">{title}</h2>
      <div className="text-right text-[12.5px] text-paper/85">
        <p className="font-semibold tracking-wide text-paper">{data.firm}</p>
        <p>Report date: {data.reportDate} &nbsp;|&nbsp; Updated {at} IST</p>
        <p>{page}</p>
      </div>
    </div>
  );
}

export function BizPageOne({ data, filters, onAsk, busy }: { data: BizData; filters?: ReactNode; onAsk?: (q: string) => void; busy?: boolean }) {
  return (
    <article className={clsx("transition-opacity duration-300", busy && "opacity-60")} aria-busy={busy}>
      <PageBand title="Business 360° Dashboard — Financials, Clients & Team" data={data} page="Page 1 of 2" />
      <div className="space-y-4 rounded-b-xl border border-t-0 border-line bg-paper/40 p-3 sm:p-4">
        {filters}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
          {data.kpis.map((k, i) => <KpiCard key={k.key} k={k} prevShort={data.prevShort} i={i} />)}
        </div>
        <div>
          <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-night dark:text-ink">360° Health check</h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {data.health.map((h) => (
              <div key={h.label} className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
                <span aria-hidden className={clsx("size-3 shrink-0 rounded-full", HEALTH_DOT[h.tone])} />
                <span className="min-w-0"><span className="block text-[13px] font-bold">{h.label}</span><span className="block truncate text-[11.5px] text-muted" title={h.text}>{h.text}</span></span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-[1.15fr_1.25fr_1fr]">
          <Card title="Client scorecard" sub={`${data.rangeLabel} · revenue earned and profit after the cost of hours`}>
            {data.clientScore.length === 0 ? <Empty note={`No fee earned in this period. ${data.finance.feesRecorded} of ${data.finance.engagements} active services carry an agreed fee (Clients → Services).`} /> : (
              <Table head={["Client", "Nature", "Revenue", "Profit", "Margin"]} align={["l", "l", "r", "r", "r"]}
                rows={data.clientScore.map((r) => [<span key="c" className="font-medium">{r.client}</span>, r.nature, money(r.revenue), signed(r.profit), pctCell(r.margin)])}
                total={["Total", "", money(data.clientTotal.revenue), signed(data.clientTotal.profit), pctCell(data.clientTotal.margin)]} />
            )}
          </Card>
          <Card title="Team scorecard" sub="Revenue shared by hours on each client, less salary for the period">
            {data.teamScore.length === 0 ? <Empty note="No time, attendance or salary recorded for the team in this period." /> : (
              <Table head={["Member", "Role", "Net profit", "Margin", "Late", "Leave"]} align={["l", "l", "r", "r", "c", "c"]}
                rows={data.teamScore.map((r) => [<span key="m" className="font-medium">{r.member}</span>, <span key="r" className="text-muted">{r.role}</span>, signed(r.profit), pctCell(r.margin), r.late, r.leave])}
                total={["Total", "", signed(data.teamTotal.profit), pctCell(data.teamTotal.margin), data.teamTotal.late, data.teamTotal.leave]} />
            )}
          </Card>
          <Card title="Revenue vs profit by client" sub={data.rangeLabel} className="lg:col-span-2 2xl:col-span-1">
            <RevenueProfitChart rows={data.clientScore} />
          </Card>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr_1fr]">
          <Card title="Attendance by team member" sub={data.attendance.label}><AttendanceColumns members={data.attendance.members} /></Card>
          <Card title="Weekly punctuality trend" sub={data.punctuality.label}><PunctualityColumns weeks={data.punctuality.weeks} /></Card>
          <Card title="People insights" className="bg-subtle/40">
            <ul className="list-disc space-y-1.5 pl-4 text-[12.5px] leading-snug">{data.insights.map((t) => <li key={t}>{t}</li>)}</ul>
          </Card>
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
          <section className="rounded-xl border border-stamp/20 bg-stamp-soft/40 p-4">
            <h3 className="mb-2 text-[15px] font-bold text-stamp">Key risks &amp; recommended actions</h3>
            {data.risks.length === 0 ? <p className="text-[13px] text-muted">No risk stands out in this period.</p> : (
              <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-snug">{data.risks.map((r) => <li key={r.label}><strong>{r.label}:</strong> {r.text}</li>)}</ul>
            )}
          </section>
          <section className="rounded-xl border border-ok/20 bg-ok-bg/60 p-4">
            <h3 className="mb-2 flex items-center gap-1.5 text-[15px] font-bold text-ledger"><MessageSquareText className="size-4" aria-hidden /> Ask the assistant — suggested questions</h3>
            <ul className="space-y-1 text-[12.5px]">
              {data.questions.map((q) => (
                <li key={q}>{onAsk ? <button type="button" onClick={() => onAsk(q)} className="group flex w-full items-start gap-1 text-left hover:text-ledger"><span aria-hidden>•</span><span className="group-hover:underline">{q}</span><ArrowUpRight className="mt-0.5 size-3.5 shrink-0 opacity-0 group-hover:opacity-100" aria-hidden /></button> : <span>• {q}</span>}</li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </article>
  );
}

export function BizPageTwo({ data, busy }: { data: BizData; busy?: boolean }) {
  return (
    <article className={clsx("transition-opacity duration-300", busy && "opacity-60")} aria-busy={busy}>
      <PageBand title="Business 360° Dashboard — Operations, Tasks & Compliance" data={data} page="Page 2 of 2" />
      <div className="space-y-4 rounded-b-xl border border-t-0 border-line bg-paper/40 p-3 sm:p-4">
        <p className="rounded-lg border border-line bg-surface px-3 py-2 text-[12.5px]"><strong className="mr-2 text-[11.5px] uppercase tracking-wide">Filters applied</strong>{data.filterText}</p>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
          {data.opsKpis.map((k, i) => <KpiCard key={k.key} k={k} prevShort={data.prevShort} i={i} compact />)}
        </div>
        {data.alerts.length > 0 && (
          <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-danger/30 bg-danger-bg px-3 py-2 text-[12.5px] font-semibold text-danger">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            {data.alerts.map((a, i) => <span key={a}>{i > 0 && <span className="mr-3 text-danger/50">·</span>}{a}</span>)}
          </p>
        )}
        <div>
          <h3 className="mb-1.5 text-[12px] font-bold uppercase tracking-wide text-night dark:text-ink">Today · needs action <span className="font-normal normal-case text-muted">(compared with yesterday)</span></h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 2xl:grid-cols-8">
            {data.actionKpis.map((k, i) => <KpiCard key={k.key} k={k} prevShort="Yest." i={i} compact />)}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Tasks by status" sub={`${data.rangeLabel}: ${data.tasksCreated} created, ${data.tasksCompleted} completed`}>
            <TaskStatusBars rows={data.tasksByStatus} />
          </Card>
          <Card title="Hours by client" sub={`${data.rangeLabel}, top 8 · ${hm(data.hoursTotal)} total`}>
            {data.hoursByClient.length === 0 ? <Empty note="No client time logged in this period." /> : <Bars rows={data.hoursByClient.map((h) => ({ label: h.client, value: h.minutes }))} color="#2a9d8f" value={hm} />}
          </Card>
          <Card title="Open tasks per team member" sub="Workload at the end of the period">
            {data.openPerMember.length === 0 ? <Empty note="No open task is assigned to anyone." /> : <Bars rows={data.openPerMember.map((m) => ({ label: m.member, value: m.open }))} color="#6c5ba7" value={String} />}
          </Card>
        </div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
          <Card title="Deadlines — next 7 days">
            {data.deadlines.length === 0 ? <Empty note="No task due in the next 7 days." /> : (
              <ul className="space-y-1.5 text-[12.5px]">
                {data.deadlines.map((d) => (
                  <li key={d.href} className="flex items-start justify-between gap-2">
                    <Link href={d.href} className="min-w-0 hover:underline"><span className="block truncate font-semibold">{d.title}</span><span className="block truncate text-[11px] text-muted">{d.client}</span></Link>
                    <span className={clsx("shrink-0 text-[11.5px]", d.overdue ? "font-bold text-danger" : "text-ink")}>{d.due}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={`Awaiting review (${data.reviewTotal})`}>
            {data.review.length === 0 ? <Empty note="Nothing is waiting for review." /> : (
              <ul className="space-y-2 text-[12.5px]">
                {data.review.map((r) => (
                  <li key={r.href} className="flex items-start gap-2">
                    <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-night text-[11px] font-bold text-paper">{r.by[0]}</span>
                    <Link href={r.href} className="min-w-0 hover:underline"><span className="block truncate font-semibold">{r.title}</span><span className="block truncate text-[11px] text-muted">{r.client} · {r.by}</span>{r.due && <span className="block text-[11px] font-semibold text-warn">due {r.due}</span>}</Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-auto pt-3 text-[11px] text-muted">{data.reviewTotal} task{data.reviewTotal === 1 ? "" : "s"} in the review queue in total. <Link href="/app/tasks?scope=review&state=all" className="font-medium text-ink underline-offset-2 hover:underline">Open the queue</Link></p>
          </Card>
          <Card title="Statutory due dates"><Statutory rows={data.statutory} /><p className="mt-auto pt-3 text-[11px] text-muted">Standard dates; government extensions are not applied.</p></Card>
          <Card title="Recent activity">
            {data.recent.length === 0 ? <Empty note="No activity in this period." /> : (
              <ol className="relative space-y-2 border-l border-line pl-4 text-[12.5px]">
                {data.recent.map((a, i) => (
                  <li key={i} className="relative">
                    <span aria-hidden className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-surface bg-ink/40" />
                    <span className="font-semibold first-letter:uppercase">{a.action}</span>
                    <span className="block text-[11px] text-muted">{a.actor} · {a.at}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </article>
  );
}
