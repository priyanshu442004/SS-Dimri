import { Link } from "react-router";
import { motion } from "motion/react";
import { useApi } from "@shared/api";
import { Btn, Stat, Steps, Badge, Icon, rise, EASE } from "@shared/ui";
import { inr, ago } from "@shared/format";

export default function Overview() {
  const { data } = useApi("/runs");
  const runs = data?.runs || [];
  const last = runs[0];
  const held = runs.reduce((s, r) => s + (r.stats?.held || 0), 0);

  return (
    <>
      <motion.section {...rise()} className="relative overflow-hidden rounded-3xl bg-ink px-6 py-10 text-paper sm:px-10 sm:py-14">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="relative grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="min-w-0 lg:col-span-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">Fixed Asset Register & Depreciation</p>
            <h1 className="mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] font-medium leading-[1.02]">Every asset rolled forward, <span className="text-lime">nothing guessed</span>.</h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-mist">
              Upload the register, the year's additions and disposals, the depreciation policy and the capital invoices. Invoices are read and agreed,
              book depreciation is computed from the class policy, and anything that needs a decision is held with the reason — then the summary is emailed.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Btn to="/new" variant="lime" icon="plus" className="h-12 px-6">New asset run</Btn>
              <Btn to="/help" variant="ghost" className="h-12 px-5 !text-mist hover:!text-paper hover:!bg-white/5">How it works</Btn>
            </div>
          </div>
          <AssetVisual />
        </div>
      </motion.section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat i={1} label="Asset runs" value={runs.length} note={last ? `Last ${ago(last.createdAt)}` : "None yet"} />
        <Stat i={2} label="Assets (latest)" value={last ? (last.stats?.existing || 0) + (last.stats?.additions || 0) : "—"} note={last ? last.period?.label : "No runs yet"} />
        <Stat i={3} label="Depreciation (latest)" value={last ? inr(last.stats?.dep, { dp: 0 }) : "—"} note={last ? `${last.stats?.computed} computed · illustrative` : "No runs yet"} />
        <Stat i={4} label="Held calculations" value={held} tone={held ? "warn" : "good"} note="Across all runs" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <motion.section {...rise(5)} className="card min-w-0 lg:col-span-7">
          <div className="flex items-baseline justify-between px-5 pt-5">
            <h2 className="text-lg font-medium">Recent asset runs</h2>
            <Link to="/runs" className="text-sm text-teal-ink hover:underline">View all</Link>
          </div>
          <ul className="mt-3 divide-y divide-ink/6">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link to={`/runs/${r.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-paper-2/40">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">Fixed assets · {r.period?.label}</span>
                    <span className="font-mono text-[11px] text-muted">{(r.stats?.existing || 0) + (r.stats?.additions || 0)} assets · {ago(r.createdAt)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="num hidden font-mono text-sm sm:inline">{inr(r.stats?.dep, { dp: 0 })}</span>
                    <Badge tone={r.stats?.held ? "warn" : "good"} dot>{r.stats?.held ? `${r.stats.held} held` : "Computed"}</Badge>
                  </span>
                </Link>
              </li>
            ))}
            {!runs.length && <li className="px-5 py-10 text-center text-sm text-muted">No asset runs yet — <Link to="/new" className="text-teal-ink underline">start one</Link>.</li>}
          </ul>
        </motion.section>
        <motion.section {...rise(6)} className="card min-w-0 p-5 lg:col-span-5">
          <h2 className="text-lg font-medium">What gets caught</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {[["Method conflicts", "Register WDV against a class policy of SLM — for the asset and for new additions in that class"], ["Disposals", "Assets sold in the period without opening accumulated depreciation or sale accounting"],
              ["Partial periods", "Additions part-way through the quarter with no convention configured"], ["Invoice mismatches", "Capital invoices that don't agree with the additions ledger"]].map(([t, d]) => (
              <li key={t} className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name="check" className="size-3.5" strokeWidth={2.2} /></span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ul>
        </motion.section>
      </div>

      <div className="mt-6">
        <Steps items={[["Read", "Register, additions, disposals and policy from their headers; invoices from the PDF text."], ["Check", "Methods against the class policy, disposals, conventions and invoice totals."],
          ["Compute", "The quarter's book depreciation for every asset that can be computed safely."], ["Report", "PDF summary and Excel schedule; the PDF is emailed straight away."]]} />
      </div>
    </>
  );
}

/** A register rolling forward: opening assets, additions in, a disposal out. */
function AssetVisual() {
  const rows = [["FA-001", "7,125", "ok"], ["FA-002", "3,563", "ok"], ["FA-003", "held", "held"], ["FA-004", "disposed", "out"], ["FA-005", "+ addition", "in"]];
  return (
    <div className="relative hidden h-[230px] lg:col-span-5 lg:block" aria-hidden>
      <svg viewBox="0 0 360 230" className="h-full w-full">
        <text x="0" y="12" fill="#9aa7bd" fontSize="10" fontFamily="JetBrains Mono Variable, monospace">REGISTER · Q1 FY 2026-27</text>
        {rows.map(([id, v, st], i) => {
          const y = 24 + i * 40;
          const col = st === "ok" ? "#4fb3ac" : "#b5d661";
          return (
            <motion.g key={id} initial={{ opacity: 0, x: st === "in" ? 30 : 0 }} animate={{ opacity: st === "out" ? 0.45 : 1, x: 0 }} transition={{ delay: 0.4 + i * 0.18, duration: 0.6, ease: EASE }}>
              <rect x="0" y={y} width="250" height="28" rx="7" fill="rgba(255,255,255,0.06)" stroke={st === "in" ? "#b5d661" : "rgba(255,255,255,0.12)"} strokeDasharray={st === "in" ? "4 3" : undefined} />
              <text x="12" y={y + 18} fill="#f3f5f1" fontSize="11" fontFamily="JetBrains Mono Variable, monospace" textDecoration={st === "out" ? "line-through" : undefined}>{id}</text>
              <text x="238" y={y + 18} fill={col} fontSize="11" textAnchor="end" fontFamily="JetBrains Mono Variable, monospace">{v}</text>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}
