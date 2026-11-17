"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { RefreshCw } from "lucide-react";
import { OpsReport } from "@/components/ops-report";
import { toast } from "@/components/toaster";
import type { OpsSummary, PeriodKey } from "@/lib/services/ops-summary";

const PERIODS: [PeriodKey, string][] = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "Last 7 days"], ["month", "This month"], ["last_month", "Last month"], ["year", "This year"]];
const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** The operations dashboard: the report format with a period filter. Periods load once and are kept. */
export function OpsDashboard({ initial, ask }: { initial: OpsSummary; ask: boolean }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [period, setPeriod] = useState<PeriodKey>(initial.period);
  const [busy, setBusy] = useState(false);
  const cache = useRef(new Map<PeriodKey, Promise<OpsSummary>>([[initial.period, Promise.resolve(initial)]]));
  const latest = useRef(initial.period);

  const load = useCallback((p: PeriodKey, fresh = false) => {
    if (fresh) cache.current.delete(p);
    let hit = cache.current.get(p);
    if (!hit) {
      hit = fetch(`/api/dashboard/summary?period=${p}`, { cache: "no-store" }).then(async (r) => {
        const body = await r.json().catch(() => null);
        if (!r.ok || !body || body.error) throw new Error(body?.error ?? `Could not load (error ${r.status}).`);
        return body as OpsSummary;
      });
      hit.catch(() => cache.current.delete(p));
      cache.current.set(p, hit);
    }
    return hit;
  }, []);

  const choose = useCallback(async (p: PeriodKey, fresh = false) => {
    latest.current = p;
    setPeriod(p);
    try { history.replaceState(null, "", p === "today" ? location.pathname : `${location.pathname}?period=${p}`); } catch { /* ignore */ }
    setBusy(true);
    try {
      const d = await load(p, fresh);
      if (latest.current === p) setData(d);
    } catch (e) {
      if (latest.current === p) toast(e instanceof Error ? e.message : "Could not load the figures.", "error");
    } finally {
      if (latest.current === p) setBusy(false);
    }
  }, [load]);

  // A period in the address (reload / shared link) opens on that period.
  useEffect(() => {
    const p = new URLSearchParams(location.search).get("period") as PeriodKey | null;
    if (!p || p === initial.period || !PERIODS.some(([k]) => k === p)) return;
    const t = setTimeout(() => void choose(p), 0);
    return () => clearTimeout(t);
  }, [choose, initial.period]);

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Period" className="flex flex-wrap gap-1 rounded-lg bg-subtle p-1">
        {PERIODS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={period === k}
            onClick={() => period !== k && void choose(k)}
            onMouseEnter={() => void load(k).catch(() => undefined)} onFocus={() => void load(k).catch(() => undefined)}
            className={clsx("rounded-md px-3 py-1.5 text-[13px] font-medium transition-all duration-200", period === k ? "bg-night text-paper shadow-sm" : "text-muted hover:bg-surface hover:text-ink")}>
            {label}
          </button>
        ))}
      </div>
      <span className="ml-auto flex items-center gap-2 text-xs text-muted">
        {busy ? "Loading…" : `${data.rangeLabel} · ${data.compareLabel}`}
        <button type="button" onClick={() => void choose(period, true)} disabled={busy} className="rounded-md p-1.5 hover:bg-subtle hover:text-ink disabled:opacity-50" aria-label="Refresh the figures" title="Refresh the figures">
          <RefreshCw className={clsx("size-4", busy && "animate-spin")} aria-hidden />
        </button>
      </span>
    </div>
  );

  return (
    <OpsReport
      data={data}
      mode="dashboard"
      title="Operations dashboard"
      busy={busy}
      toolbar={toolbar}
      generatedLabel={`Updated ${time(data.generatedAt)} IST`}
      onAsk={ask ? (q) => router.push(`/app/assistant?q=${encodeURIComponent(q)}`) : undefined}
    />
  );
}
