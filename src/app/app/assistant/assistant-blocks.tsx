"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { clsx } from "clsx";
import { Download, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { BarList, ChartCard, Donut, SERIES, StackedColumns, TrendLine } from "@/components/charts";
import { fmt, type Format } from "@/lib/chart-format";
import type { Block, BlockFormat, ChartBlock, KpiBlock, TableBlock } from "@/lib/ai/blocks";

// Renders the assistant's KPI cards, charts and tables. Charts reuse the product's own SVG
// chart set so they look like every other dashboard in the ERP.

type Ask = ((text: string) => void) | undefined;

/** Small "Ask AI" button for a card, chart or table. */
function AskButton({ onAsk, text, label }: { onAsk: Ask; text: string; label: string }) {
  if (!onAsk) return null;
  return (
    <button type="button" onClick={() => onAsk(text)} title={label} aria-label={label}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted opacity-0 transition-opacity hover:bg-subtle hover:text-ink focus:opacity-100 group-hover/blk:opacity-100 [@media(hover:none)]:opacity-100">
      <Sparkles className="size-3.5 text-stamp" aria-hidden /><span className="hidden sm:inline">Ask AI</span>
    </button>
  );
}

const chartFormat = (f?: BlockFormat): Format => (f === "inr" || f === "percent" || f === "minutes" ? f : "count");

export function formatValue(v: number | string, f?: BlockFormat): string {
  if (typeof v === "string") return v;
  if (f === "decimal") return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (f === "percent") return `${Number.isInteger(v) ? v : v.toFixed(1)}%`;
  if (f === "inr") return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  return fmt(v, chartFormat(f));
}

function useCountUp(target: number, run: boolean) {
  const [v, setV] = useState(0);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raf = requestAnimationFrame(() => setFinished(true));
      return () => cancelAnimationFrame(raf);
    }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 700);
      setV(target * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setFinished(true);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run]);
  return !run || finished ? target : v;
}

const TONES = {
  neutral: "border-line",
  good: "border-ok/30 bg-ok-bg/40",
  bad: "border-danger/30 bg-danger-bg/40",
  warn: "border-warn/30 bg-warn-bg/40",
} as const;
const TONE_TEXT = { neutral: "text-ink", good: "text-ok", bad: "text-danger", warn: "text-warn" } as const;

function Kpi({ item, index, animate, onAsk }: { item: KpiBlock["items"][number]; index: number; animate: boolean; onAsk: Ask }) {
  const numeric = typeof item.value === "number";
  const n = useCountUp(numeric ? (item.value as number) : 0, animate && numeric);
  const shown = numeric ? formatValue(Number.isInteger(item.value) ? Math.round(n) : n, item.format) : String(item.value);
  const tone = item.tone ?? "neutral";
  const up = item.change?.trim().startsWith("+");
  const down = item.change?.trim().startsWith("-") || item.change?.trim().startsWith("−");
  return (
    <div className={clsx("ai-in group/blk relative min-w-0 rounded-xl border bg-surface px-4 py-3", TONES[tone])} style={{ "--d": `${index * 60}ms` } as CSSProperties}>
      <div className="flex items-start justify-between gap-1">
        <p className="truncate text-xs font-medium text-muted" title={item.label}>{item.label}</p>
        <span className="-mr-2 -mt-1"><AskButton onAsk={onAsk} label={`Ask AI about ${item.label}`} text={`KPI "${item.label}": ${numeric ? formatValue(item.value as number, item.format) : String(item.value)}${item.hint ? ` (${item.hint})` : ""}`} /></span>
      </div>
      <p className={clsx("mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight", TONE_TEXT[tone])} title={numeric ? formatValue(item.value as number, item.format) : undefined}>{shown}</p>
      {(item.hint || item.change) && (
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
          {item.change && (
            <span className={clsx("inline-flex items-center gap-0.5 font-medium", up && "text-ok", down && "text-danger")}>
              {up ? <TrendingUp className="size-3" aria-hidden /> : down ? <TrendingDown className="size-3" aria-hidden /> : null}
              {item.change}
            </span>
          )}
          {item.hint && <span className="truncate">{item.hint}</span>}
        </p>
      )}
    </div>
  );
}

export function KpiGrid({ block, animate, onAsk }: { block: KpiBlock; animate: boolean; onAsk?: Ask }) {
  const cols = block.items.length === 1 ? "grid-cols-1 sm:max-w-xs" : block.items.length === 2 ? "grid-cols-2" : block.items.length === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-2 sm:grid-cols-3";
  return <div className={clsx("grid gap-2.5", cols)}>{block.items.map((it, i) => <Kpi key={`${it.label}-${i}`} item={it} index={i} animate={animate} onAsk={onAsk} />)}</div>;
}

// ---------------------------------------------------------------- charts

const W = 640;
const H = 240;
const PAD = { l: 44, r: 12, t: 14, b: 40 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p / (v / p > 5 ? 2 : 1)) * p * (v / p > 5 ? 2 : 1);
}

/** Vertical columns, up to 6 series side by side. */
function GroupedColumns({ block }: { block: ChartBlock }) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const f = chartFormat(block.format);
  const all = block.series.flatMap((s) => s.values as number[]);
  const max = niceMax(Math.max(0, ...all));
  const min = Math.min(0, ...all);
  const range = max - min || 1;
  const slot = (W - PAD.l - PAD.r) / block.labels.length;
  const groupW = Math.min(slot * 0.72, 18 * block.series.length + 8);
  const barW = groupW / block.series.length;
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - min) / range);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => min + range * t);
  const labelEvery = Math.ceil(block.labels.length / 12);
  return (
    <div className="relative">
      {block.series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-3 text-xs">
          {block.series.map((s, i) => <li key={s.name} className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: SERIES[i] }} />{s.name}</li>)}
        </ul>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-labelledby={`${id}-d`} onMouseLeave={() => setHover(null)}>
        <desc id={`${id}-d`}>{block.title}</desc>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-line" strokeDasharray={t === 0 ? undefined : "3 3"} />
            <text x={PAD.l - 6} y={y(t) + 3} textAnchor="end" className="fill-muted text-[10px]">{fmt(Math.round(t * 100) / 100, f)}</text>
          </g>
        ))}
        {block.labels.map((label, i) => {
          const x0 = PAD.l + i * slot + (slot - groupW) / 2;
          return (
            <g key={`${label}-${i}`} onMouseEnter={() => setHover(i)} className={clsx("transition-opacity", hover !== null && hover !== i && "opacity-50")}>
              <rect x={PAD.l + i * slot} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
              {block.series.map((s, si) => {
                const v = s.values[i] as number;
                const top = y(Math.max(0, v));
                const h = Math.max(v === 0 ? 0 : 1.5, Math.abs(y(v) - y(0)));
                return <rect key={si} className="chart-col" style={{ "--i": i } as CSSProperties} x={x0 + si * barW + 1} y={v >= 0 ? top : y(0)} width={Math.max(2, barW - 2)} height={h} rx={Math.min(3, barW / 3)} fill={SERIES[si]} />;
              })}
              {i % labelEvery === 0 && (
                <text x={PAD.l + i * slot + slot / 2} y={H - PAD.b + 14} textAnchor="middle" className="fill-muted text-[10px]">{label.length > 12 ? `${label.slice(0, 11)}…` : label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip pointer-events-none absolute top-6 z-10 min-w-36 rounded-lg border border-white/10 bg-night px-3 py-2 text-xs text-paper shadow-lg" style={{ left: `${Math.min(70, Math.max(0, ((PAD.l + hover * slot) / W) * 100 - 6))}%` }}>
          <p className="mb-1 text-paper/60">{block.labels[hover]}</p>
          {block.series.map((s, si) => (
            <p key={s.name} className="flex items-center gap-2"><span aria-hidden className="size-2 rounded-sm" style={{ background: SERIES[si] }} /><strong className="tabular-nums">{fmt(s.values[hover] as number, f)}</strong><span className="text-paper/60">{s.name}</span></p>
          ))}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars around a zero line: losses go left in red, gains right (profit / loss, change). */
function DivergingBars({ data, format }: { data: { label: string; value: number }[]; format: Format }) {
  const [hover, setHover] = useState<number | null>(null);
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const hasNeg = data.some((d) => d.value < 0);
  const hasPos = data.some((d) => d.value > 0);
  const negShare = hasNeg && hasPos ? 0.5 : hasNeg ? 1 : 0; // part of the track left of zero
  return (
    <ul className="space-y-1" onMouseLeave={() => setHover(null)}>
      {data.map((d, i) => {
        const w = (Math.abs(d.value) / maxAbs) * 100;
        const neg = d.value < 0;
        return (
          <li key={`${d.label}-${i}`} onMouseEnter={() => setHover(i)} title={`${d.label}: ${fmt(d.value, format)}`}
            className={clsx("grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-md px-1.5 py-1 text-xs transition-[opacity,background-color] duration-200 sm:grid-cols-[minmax(0,12rem)_1fr_auto]", hover === i && "bg-paper", hover !== null && hover !== i && "opacity-60")}>
            <span className="truncate text-ink">{d.label}</span>
            <span className="relative flex h-2.5" aria-hidden>
              <span className="flex h-full justify-end" style={{ width: `${negShare * 100}%` }}>
                {neg && <span className="chart-hbar block h-full rounded-l-full [transform-origin:right]" style={{ width: `${w}%`, background: "var(--color-danger)", "--i": i } as CSSProperties} />}
              </span>
              {hasNeg && hasPos && <span className="h-4 w-px -translate-y-[3px] bg-ink/30" />}
              <span className="flex h-full" style={{ width: `${(1 - negShare) * 100}%` }}>
                {!neg && d.value > 0 && <span className="chart-hbar block h-full rounded-r-full" style={{ width: `${w}%`, background: SERIES[0], "--i": i } as CSSProperties} />}
              </span>
            </span>
            <span className={clsx("w-20 text-right tabular-nums", neg ? "text-danger" : "text-ink", hover === i && "font-semibold")}>{fmt(d.value, format)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function ChartBlockView({ block, onAsk }: { block: ChartBlock; onAsk?: Ask }) {
  const f = chartFormat(block.format);
  const values = (si: number) => block.series[si].values as number[];
  const table = {
    head: [block.labels.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l)) ? "Date" : "Item", ...block.series.map((s) => s.name)],
    rows: block.labels.map((l, i) => [l, ...block.series.map((s) => fmt(s.values[i] as number, f))]),
  };
  const anyNegative = block.series.some((s) => (s.values as number[]).some((v) => v < 0));
  let body;
  switch (anyNegative && (block.chart === "line" || block.chart === "area" || block.chart === "stacked" || block.chart === "pie" || block.chart === "donut") ? "column" : block.chart) {
    case "bar":
      body = block.series.length > 1
        ? <GroupedColumns block={block} />
        : anyNegative
          ? <DivergingBars data={block.labels.map((label, i) => ({ label, value: values(0)[i] }))} format={f} />
          : <BarList data={block.labels.map((label, i) => ({ label, value: values(0)[i] }))} format={f} />;
      break;
    case "pie":
    case "donut": {
      const pairs = block.labels.map((label, i) => ({ label, value: Math.max(0, values(0)[i]) })).sort((a, b) => b.value - a.value);
      const slices = pairs.length > 8 ? [...pairs.slice(0, 7), { label: "Other", value: pairs.slice(7).reduce((s, p) => s + p.value, 0) }] : pairs;
      body = <Donut slices={slices} format={f} centerLabel={block.series[0].name} />;
      break;
    }
    case "line":
    case "area":
      body = <TrendLine points={block.labels.map((date, i) => ({ date, values: block.series.map((s) => s.values[i] as number) }))} series={block.series.map((s) => s.name)} format={f} />;
      break;
    case "stacked":
      body = <StackedColumns days={block.labels.map((date, i) => ({ date, values: block.series.map((s) => s.values[i] as number) }))} series={block.series.map((s) => s.name)} format={f} />;
      break;
    default:
      body = <GroupedColumns block={block} />;
  }
  const summary = `Chart "${block.title}": ${block.labels.map((l, i) => `${l} ${block.series.map((s) => fmt(s.values[i] as number, f)).join(" / ")}`).join(", ")}`.slice(0, 1200);
  return (
    <div className="ai-in group/blk">
      <ChartCard title={block.title} subtitle={block.subtitle} table={table} action={<AskButton onAsk={onAsk} text={summary} label={`Ask AI about the chart ${block.title}`} />}>{body}</ChartCard>
    </div>
  );
}

// ---------------------------------------------------------------- table

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function TableBlockView({ block, onAsk }: { block: TableBlock; onAsk?: Ask }) {
  const ref = useRef<HTMLDivElement>(null);
  function download() {
    const csv = [block.columns, ...block.rows].map((r) => r.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(block.title ?? "table").replace(/[^\w-]+/g, "-").toLowerCase()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="ai-in group/blk min-w-0 overflow-hidden rounded-xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h3 className="truncate text-sm font-semibold">{block.title ?? `${block.rows.length} rows`}</h3>
        <span className="flex items-center gap-1">
        <AskButton onAsk={onAsk} label={`Ask AI about the table ${block.title ?? ""}`} text={`Table "${block.title ?? ""}" (${block.columns.join(", ")}): ${block.rows.slice(0, 12).map((r) => r.join(" | ")).join("; ")}`.slice(0, 1500)} />
        <button type="button" onClick={download} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-subtle hover:text-ink">
          <Download className="size-3.5" aria-hidden /> CSV
        </button>
        </span>
      </header>
      <div ref={ref} className="max-h-96 overflow-auto">
        <table className="w-full min-w-max text-left text-sm">
          <thead>
            <tr>{block.columns.map((c) => <th key={c} className="sticky top-0 bg-paper px-3 py-2 text-xs font-semibold text-muted">{c}</th>)}</tr>
          </thead>
          <tbody>
            {block.rows.map((r, i) => (
              <tr key={i} className="border-t border-line transition-colors even:bg-canvas/60 hover:bg-subtle">
                {block.columns.map((_, j) => {
                  const v = r[j];
                  return <td key={j} className={clsx("px-3 py-2 align-top", typeof v === "number" && "text-right tabular-nums")}>{v === null || v === undefined || v === "" ? <span className="text-muted">—</span> : typeof v === "number" ? v.toLocaleString("en-IN") : v}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** KPI cards (shown above the answer text). */
export function KpiBlocks({ blocks, animate, onAsk }: { blocks: Block[]; animate: boolean; onAsk?: Ask }) {
  const kpis = blocks.filter((b): b is KpiBlock => b.type === "kpis");
  if (!kpis.length) return null;
  return <div className="space-y-2.5">{kpis.map((b, i) => <KpiGrid key={i} block={b} animate={animate} onAsk={onAsk} />)}</div>;
}

/** Charts and tables (shown below the answer text). */
export function VisualBlocks({ blocks, onAsk }: { blocks: Block[]; onAsk?: Ask }) {
  const charts = blocks.filter((b): b is ChartBlock => b.type === "chart");
  const tables = blocks.filter((b): b is TableBlock => b.type === "table");
  if (!charts.length && !tables.length) return null;
  return (
    <div className="space-y-3">
      {charts.length > 0 && <div className={clsx("grid gap-3", charts.length > 1 && "2xl:grid-cols-2")}>{charts.map((b, i) => <ChartBlockView key={i} block={b} onAsk={onAsk} />)}</div>}
      {tables.map((b, i) => <TableBlockView key={i} block={b} onAsk={onAsk} />)}
    </div>
  );
}
