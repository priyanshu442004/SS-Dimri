"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { RefreshCw } from "lucide-react";
import { BizPageOne, BizPageTwo } from "@/components/business-360";
import { OpsReport } from "@/components/ops-report";
import { toast } from "@/components/toaster";
import type { BizFilters, BizPeriod, DashboardBundle } from "@/lib/services/business360";

const PERIODS: [BizPeriod, string][] = [["today", "Today"], ["yesterday", "Yesterday"], ["7d", "7 Days"], ["month", "Month"], ["quarter", "Quarter"], ["year", "Year"], ["custom", "Custom range"]];
const selectCls = "h-9 w-full min-w-0 rounded-md border border-line bg-surface px-2 text-[13px] font-semibold text-ink";

function query(f: BizFilters) {
  const p = new URLSearchParams();
  if (f.period !== "today") p.set("period", f.period);
  if (f.period === "custom") { if (f.from) p.set("from", f.from); if (f.to) p.set("to", f.to); }
  for (const k of ["client", "staff", "activity", "service"] as const) if (f[k]) p.set(k, f[k]);
  return p.toString();
}

/** The Business 360° dashboard with its filters. Each filter set loads once and is kept for this visit. */
export function BusinessDashboard({ initial, today }: { initial: DashboardBundle; today: string }) {
  const router = useRouter();
  const [bundle, setBundle] = useState(initial);
  const [f, setF] = useState<BizFilters>(initial.biz.filters);
  const [busy, setBusy] = useState(false);
  const cache = useRef(new Map<string, Promise<DashboardBundle>>([[query(initial.biz.filters), Promise.resolve(initial)]]));
  const latest = useRef(query(initial.biz.filters));

  const load = useCallback((q: string, fresh = false) => {
    if (fresh) cache.current.delete(q);
    let hit = cache.current.get(q);
    if (!hit) {
      hit = fetch(`/api/dashboard/summary${q ? `?${q}` : ""}`, { cache: "no-store" }).then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok || !body || body.error) throw new Error(body?.error ?? `Could not load (error ${r.status}).`);
        return body as DashboardBundle;
      });
      hit.catch(() => cache.current.delete(q));
      cache.current.set(q, hit);
    }
    return hit;
  }, []);

  const apply = useCallback(async (next: BizFilters, fresh = false) => {
    if (next.period === "custom" && (!next.from || !next.to)) { setF(next); return; }
    const q = query(next);
    latest.current = q;
    setF(next);
    try { history.replaceState(null, "", q ? `${location.pathname}?${q}` : location.pathname); } catch { /* ignore */ }
    setBusy(true);
    try {
      const d = await load(q, fresh);
      if (latest.current === q) setBundle(d);
    } catch (e) {
      if (latest.current === q) toast(e instanceof Error ? e.message : "Could not load the figures.", "error");
    } finally {
      if (latest.current === q) setBusy(false);
    }
  }, [load]);

  // Keep the figures current while the page stays open (every 5 minutes, only when visible).
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible" && !busy) void apply(f, true); }, 5 * 60_000);
    return () => clearInterval(t);
  }, [apply, f, busy]);

  const b = bundle.biz;
  const set = (patch: Partial<BizFilters>) => void apply({ ...f, ...patch });
  const ask = (q: string) => router.push(`/app/assistant?q=${encodeURIComponent(q)}`);

  const filters = (
    <div className="rounded-xl border border-line bg-surface p-3 print:hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-20 text-[11.5px] font-bold uppercase tracking-wide text-night dark:text-ink">Period</span>
        <div role="tablist" aria-label="Period" className="flex flex-wrap gap-1.5">
          {PERIODS.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={f.period === k}
              onClick={() => (k === "custom" ? set({ period: "custom", from: f.from || b.asOfDate, to: f.to || b.asOfDate }) : f.period !== k && set({ period: k }))}
              onMouseEnter={() => k !== "custom" && void load(query({ ...f, period: k })).catch(() => undefined)}
              className={clsx("rounded-full border px-3.5 py-1 text-[13px] font-medium transition-colors", f.period === k ? "border-night bg-night text-paper" : "border-line bg-surface text-ink hover:border-ink/40")}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">From
          <input type="date" value={f.period === "custom" ? f.from : b.fromDate} max={today} disabled={f.period !== "custom"}
            onChange={(e) => e.target.value && set({ period: "custom", from: e.target.value, to: f.to && f.to >= e.target.value ? f.to : e.target.value })}
            className="h-8 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink disabled:bg-subtle disabled:text-muted" />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] text-muted">To
          <input type="date" value={f.period === "custom" ? f.to : b.asOfDate} max={today} min={f.from || undefined} disabled={f.period !== "custom"}
            onChange={(e) => e.target.value && set({ period: "custom", to: e.target.value, from: f.from && f.from <= e.target.value ? f.from : e.target.value })}
            className="h-8 rounded-md border border-line bg-surface px-2 text-[12.5px] text-ink disabled:bg-subtle disabled:text-muted" />
        </label>
        <span className="ml-auto flex items-center gap-2 text-[12px] text-muted">
          {busy ? "Loading…" : `${b.rangeLabel} · ${b.compare} (${b.prevRangeLabel})`}
          <button type="button" onClick={() => void apply(f, true)} disabled={busy} className="rounded-md p-1.5 hover:bg-subtle hover:text-ink disabled:opacity-50" aria-label="Refresh the figures" title="Refresh the figures">
            <RefreshCw className={clsx("size-4", busy && "animate-spin")} aria-hidden />
          </button>
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="w-20 text-[11.5px] font-bold uppercase tracking-wide text-night dark:text-ink">Filter</span>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <label className="flex min-w-0 items-center gap-2 text-[12px] text-muted"><span className="w-14 shrink-0">Client</span>
            <select value={f.client} onChange={(e) => set({ client: e.target.value })} className={selectCls}><option value="">All ({b.options.clients.length})</option>{b.options.clients.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          </label>
          <label className="flex min-w-0 items-center gap-2 text-[12px] text-muted"><span className="w-14 shrink-0">Staff</span>
            <select value={f.staff} onChange={(e) => set({ staff: e.target.value })} className={selectCls}><option value="">All ({b.options.staff.length})</option>{b.options.staff.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          </label>
          <label className="flex min-w-0 items-center gap-2 text-[12px] text-muted"><span className="w-14 shrink-0">Activity</span>
            <select value={f.activity} onChange={(e) => set({ activity: e.target.value })} className={selectCls}><option value="">All</option>{b.options.activities.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          </label>
          <label className="flex min-w-0 items-center gap-2 text-[12px] text-muted"><span className="w-14 shrink-0">Service</span>
            <select value={f.service} onChange={(e) => set({ service: e.target.value })} className={selectCls}><option value="">All</option>{b.options.services.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          </label>
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-muted">
        Comparison rule: Today→Yesterday · Yesterday→Day before · 7 Days→Prior 7 days · Month→Previous month · Quarter→Previous quarter · Year→Previous year · Custom→Preceding equal-length range. Filters narrow every figure, chart and table on this page.
        {(f.client || f.staff || f.activity || f.service) && <button type="button" onClick={() => set({ client: "", staff: "", activity: "", service: "" })} className="ml-2 font-semibold text-ink underline-offset-2 hover:underline">Clear filters</button>}
      </p>
    </div>
  );

  return (
    <div className="relative space-y-6">
      <div className="relative h-0.5 overflow-hidden" aria-hidden>{busy && <span className="ops-loading-bar" />}</div>
      <BizPageOne data={b} filters={filters} onAsk={ask} busy={busy} />
      <BizPageTwo data={b} busy={busy} />
      <OpsReport
        data={bundle.ops}
        mode="dashboard"
        bare
        title="Operations detail"
        busy={busy}
        generatedLabel=""
        onAsk={ask}
      />
    </div>
  );
}
