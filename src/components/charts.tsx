"use client";

import Link from "next/link";
import { useId, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { clsx } from "clsx";
import { Table2 } from "lucide-react";
import { fmt, type Format } from "@/lib/chart-format";
import { EmptyArt } from "@/components/empty-art";

// Dependency-free SVG charts. Colors come from the validated categorical order
// (--color-series-1…8, assigned in fixed order, never cycled). Text always uses
// ink/muted tokens; every chart has hover and keyboard details, visible values
// and a table view. Marks animate in once, anchored to their baseline.

export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--color-series-${i + 1})`);

/** "2026-10-26" → "26 Oct"; any other label (e.g. "0–7 days") is shown as is. */
const shortDate = (label: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(label) ? new Date(`${label}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }) : label;

/** Arrow keys move the highlighted position; Home/End jump; Escape clears. */
function stepKeys(e: KeyboardEvent, count: number, hover: number | null, set: (i: number | null) => void) {
  const cur = hover ?? -1;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") set(Math.min(count - 1, cur + 1));
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") set(Math.max(0, cur < 0 ? count - 1 : cur - 1));
  else if (e.key === "Home") set(0);
  else if (e.key === "End") set(count - 1);
  else if (e.key === "Escape") set(null);
  else return;
  e.preventDefault();
}

/** Card with title, optional subtitle and a "show as table" view. */
export function ChartCard({ title, subtitle, table, children, action }: {
  title: string;
  subtitle?: string;
  table: { head: string[]; rows: (string | number)[][] };
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(15_29_51/.04)] transition-shadow duration-300 hover:shadow-[0_14px_34px_-26px_rgb(15_29_51/.45)]">
      <header className="flex items-start justify-between gap-2 px-4 pb-1 pt-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className="px-4 pb-4 pt-3">{children}</div>
      <details className="group border-t border-line px-4 py-2 text-xs">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md py-0.5 text-muted transition-colors hover:text-ink [&::-webkit-details-marker]:hidden">
          <Table2 className="size-3.5" aria-hidden /> <span className="group-open:hidden">Show as table</span><span className="hidden group-open:inline">Hide table</span>
        </summary>
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left">
            <thead><tr>{table.head.map((h) => <th key={h} className="sticky top-0 bg-surface py-1 pr-3 font-medium text-muted">{h}</th>)}</tr></thead>
            <tbody>{table.rows.map((r, i) => <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="py-1 pr-3 tabular-nums">{c}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Empty({ children = "No data for this period yet." }: { children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <EmptyArt kind="chart" className="h-14 w-16 opacity-80" />
      <p className="mt-2 text-sm text-muted">{children}</p>
    </div>
  );
}

/** Tooltip: values lead, series names follow, keyed with a short stroke of the series color. */
function Tip({ title, rows, left, top = 0 }: { title: string; rows: { name: string; value: string; color: string }[]; left: string; top?: number }) {
  return (
    <div className="chart-tip pointer-events-none absolute z-10 min-w-36 rounded-lg border border-white/10 bg-night px-3 py-2 text-xs text-paper shadow-lg" style={{ left, top }}>
      <p className="mb-1 text-paper/60">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />
          <strong className="tabular-nums">{r.value}</strong>
          <span className="text-paper/60">{r.name}</span>
        </p>
      ))}
    </div>
  );
}

/** Horizontal bars: categories with long names (clients, people, statuses). One series. */
export function BarList({ data, format = "count", color = SERIES[0], empty }: {
  data: { label: string; value: number; href?: string }[];
  format?: Format;
  color?: string;
  empty?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));
  if (!data.length || max === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="space-y-1" onMouseLeave={() => setHover(null)}>
      {data.map((d, i) => {
        const label = d.href ? <Link href={d.href} className="hover:underline">{d.label}</Link> : d.label;
        const dim = hover !== null && hover !== i;
        return (
          <li
            key={d.label}
            onMouseEnter={() => setHover(i)}
            className={clsx("grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-md px-1.5 py-1 text-xs transition-[opacity,background-color] duration-200 sm:grid-cols-[minmax(0,12rem)_1fr_auto]", hover === i && "bg-paper", dim && "opacity-60")}
            title={`${d.label}: ${fmt(d.value, format)}`}
          >
            <span className="truncate text-ink">{label}</span>
            <span className="h-2.5 rounded-full bg-subtle" aria-hidden>
              <span className="chart-hbar block h-2.5 rounded-full" style={{ width: `${Math.max(d.value > 0 ? 2 : 0, (d.value / max) * 100)}%`, background: color, "--i": i } as CSSProperties} />
            </span>
            <span className={clsx("w-16 text-right tabular-nums text-ink", hover === i && "font-semibold")}>{fmt(d.value, format)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Donut for parts of a whole (≤ 6 slices). Legend with values is always shown. */
export function Donut({ slices, format = "count", centerLabel }: {
  slices: { label: string; value: number; href?: string }[];
  format?: Format;
  centerLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total === 0) return <Empty />;
  const r = 42;
  const c = 2 * Math.PI * r;
  const gap = slices.filter((s) => s.value > 0).length > 1 ? 1.6 : 0; // surface gap between segments
  const lengths = slices.map((s) => (s.value / total) * c);
  const offsets = lengths.map((_, i) => lengths.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg viewBox="0 0 100 100" className="size-36 shrink-0 -rotate-90" role="img" aria-label={slices.map((s) => `${s.label} ${fmt(s.value, format)}`).join(", ")}>
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="13" className="stroke-subtle" />
        {slices.map((s, i) => {
          const len = lengths[i];
          return s.value > 0 && (
            <circle
              key={s.label}
              cx="50" cy="50" r={r} fill="none" strokeWidth={hover === i ? 17 : 13}
              stroke={SERIES[i % SERIES.length]}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
              strokeDashoffset={-offsets[i]}
              opacity={hover === null || hover === i ? 1 : 0.45}
              className="chart-arc cursor-pointer transition-[stroke-width,opacity] duration-200"
              style={{ "--i": i } as CSSProperties}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <title>{`${s.label}: ${fmt(s.value, format)} (${Math.round((s.value / total) * 100)}%)`}</title>
            </circle>
          );
        })}
        <g className="rotate-90" style={{ transformOrigin: "50px 50px" }}>
          <text x="50" y="50" textAnchor="middle" className="fill-ink font-editorial text-[19px]">{fmt(hover === null ? total : slices[hover].value, format)}</text>
          <text x="50" y="62" textAnchor="middle" className="fill-muted text-[7px]">{hover === null ? centerLabel ?? "Total" : slices[hover].label}</text>
        </g>
      </svg>
      <ul className="min-w-0 flex-1 space-y-0.5 text-xs">
        {slices.map((s, i) => (
          <li key={s.label}>
            <span
              tabIndex={0}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className={clsx("flex items-center gap-2 rounded-md px-1.5 py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink/30", hover === i && "bg-paper")}
            >
              <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} />
              <span className="min-w-0 flex-1 truncate text-ink">{s.href ? <Link href={s.href} className="hover:underline">{s.label}</Link> : s.label}</span>
              <span className="tabular-nums text-ink">{fmt(s.value, format)}</span>
              <span className="w-9 text-right tabular-nums text-muted">{Math.round((s.value / total) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const W = 600;
const H = 200;
const PAD = { l: 44, r: 12, t: 12, b: 24 };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

function Axis({ max, format }: { max: number; format: Format }) {
  const ticks = [0, 0.5, 1].map((f) => f * max);
  return (
    <g>
      {ticks.map((t) => {
        const y = PAD.t + (H - PAD.t - PAD.b) * (1 - t / max);
        return (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} className={t === 0 ? "stroke-ink/20" : "stroke-line"} strokeWidth="1" strokeDasharray={t === 0 ? undefined : "2 4"} />
            <text x={PAD.l - 6} y={y + 3} textAnchor="end" className="fill-muted text-[10px]">{fmt(t, format)}</text>
          </g>
        );
      })}
    </g>
  );
}

/** Line over time (one or two series, one y-axis). Crosshair + tooltip on hover and keyboard. */
export function TrendLine({ points, series, format = "count" }: {
  points: { date: string; values: number[] }[];
  series: string[];
  format?: Format;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  if (!points.length || points.every((p) => p.values.every((v) => v === 0))) return <Empty />;
  const max = niceMax(Math.max(...points.flatMap((p) => p.values)));
  const step = (W - PAD.l - PAD.r) / Math.max(1, points.length - 1);
  const x = (i: number) => PAD.l + i * step;
  const y = (v: number) => PAD.t + (H - PAD.t - PAD.b) * (1 - v / max);
  const labelEvery = Math.ceil(points.length / 6);
  const gid = `${id.replace(/:/g, "")}-g`;
  return (
    <div className="relative">
      {series.length > 1 && (
        <ul className="mb-2 flex flex-wrap gap-3 text-xs">
          {series.map((s, i) => <li key={s} className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: SERIES[i] }} />{s}</li>)}
        </ul>
      )}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        role="img"
        aria-labelledby={`${id}-d`}
        tabIndex={0}
        onKeyDown={(e) => stepKeys(e, points.length, hover, setHover)}
        onBlur={() => setHover(null)}
        onMouseLeave={() => setHover(null)}
      >
        <desc id={`${id}-d`}>{series.join(", ")} by day, {points.length} days. Use the arrow keys to read each day.</desc>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={SERIES[0]} stopOpacity=".16" />
            <stop offset="1" stopColor={SERIES[0]} stopOpacity="0" />
          </linearGradient>
        </defs>
        <Axis max={max} format={format} />
        {points.map((p, i) => i % labelEvery === 0 && (
          <text key={p.date} x={x(i)} y={H - 6} textAnchor="middle" className="fill-muted text-[10px]">{shortDate(p.date)}</text>
        ))}
        {series.length === 1 && (
          <polygon className="chart-area" fill={`url(#${gid})`}
            points={`${x(0)},${H - PAD.b} ${points.map((p, i) => `${x(i)},${y(p.values[0])}`).join(" ")} ${x(points.length - 1)},${H - PAD.b}`} />
        )}
        {series.map((_, si) => (
          <polyline key={si} className="chart-line" pathLength={1} fill="none" stroke={SERIES[si]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
            points={points.map((p, i) => `${x(i)},${y(p.values[si])}`).join(" ")} />
        ))}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="stroke-ink/40" strokeWidth="1" strokeDasharray="3 3" />
            {series.map((_, si) => <circle key={si} cx={x(hover)} cy={y(points[hover].values[si])} r="4.5" fill={SERIES[si]} className="stroke-surface" strokeWidth="2" />)}
          </g>
        )}
        {points.map((p, i) => (
          <rect key={p.date} x={x(i) - step / 2} y={PAD.t} width={Math.max(step, 8)} height={H - PAD.t - PAD.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && (
        <Tip
          title={shortDate(points[hover].date)}
          left={`${Math.min(72, Math.max(0, (x(hover) / W) * 100 - 8))}%`}
          rows={series.map((s, si) => ({ name: s, value: fmt(points[hover].values[si], format), color: SERIES[si] }))}
        />
      )}
    </div>
  );
}

/** Stacked columns per day (e.g. attendance). Legend + tooltip on hover and keyboard. */
export function StackedColumns({ days, series, format = "count" }: {
  days: { date: string; values: number[] }[];
  series: string[];
  format?: Format;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  if (!days.length || days.every((d) => d.values.every((v) => v === 0))) return <Empty />;
  const max = niceMax(Math.max(...days.map((d) => d.values.reduce((s, v) => s + v, 0))));
  const slot = (W - PAD.l - PAD.r) / days.length;
  const bw = Math.min(28, slot * 0.7);
  const scale = (v: number) => ((H - PAD.t - PAD.b) * v) / max;
  const labelEvery = Math.ceil(days.length / 7);
  return (
    <div className="relative">
      <ul className="mb-2 flex flex-wrap gap-3 text-xs">
        {series.map((s, i) => <li key={s} className="flex items-center gap-1.5"><span aria-hidden className="size-2.5 rounded-sm" style={{ background: SERIES[i] }} />{s}</li>)}
      </ul>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ink/30"
        role="img"
        aria-labelledby={`${id}-d`}
        tabIndex={0}
        onKeyDown={(e) => stepKeys(e, days.length, hover, setHover)}
        onBlur={() => setHover(null)}
        onMouseLeave={() => setHover(null)}
      >
        <desc id={`${id}-d`}>{series.join(", ")} per day. Use the arrow keys to read each column.</desc>
        <Axis max={max} format={format} />
        {days.map((d, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          let base = H - PAD.b;
          const top = d.values.reduce((t, v, si) => (v > 0 ? si : t), -1);
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} opacity={hover === null || hover === i ? 1 : 0.45} className="transition-opacity duration-200">
              <rect x={cx - slot / 2} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill={hover === i ? "var(--color-paper)" : "transparent"} />
              <g className="chart-col" style={{ "--i": i } as CSSProperties}>
                {d.values.map((v, si) => {
                  if (v <= 0) return null;
                  const h = scale(v);
                  base -= h;
                  // Only the top segment gets rounded ends; a 2px surface gap separates segments.
                  return <rect key={si} x={cx - bw / 2} y={base} width={bw} height={Math.max(0, h - 2)} rx={si === top ? 4 : 1} fill={SERIES[si]} />;
                })}
              </g>
              {i % labelEvery === 0 && <text x={cx} y={H - 6} textAnchor="middle" className="fill-muted text-[10px]">{shortDate(d.date)}</text>}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <Tip
          title={shortDate(days[hover].date)}
          left={`${Math.min(70, Math.max(0, ((PAD.l + slot * hover) / W) * 100 - 6))}%`}
          top={24}
          rows={series.map((s, si) => ({ name: s, value: fmt(days[hover].values[si], format), color: SERIES[si] }))}
        />
      )}
    </div>
  );
}
