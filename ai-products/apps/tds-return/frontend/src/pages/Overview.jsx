import { Link } from "react-router";
import { motion } from "motion/react";
import { useApi } from "@shared/api";
import { Btn, Stat, Steps, Badge, Icon, rise, EASE } from "@shared/ui";
import { inr, ago } from "@shared/format";

export default function Overview() {
  const { data } = useApi("/runs");
  const runs = data?.runs || [];
  const open = runs.filter((r) => Math.abs(r.totals?.difference || 0) >= 0.01).length;
  const items = runs.reduce((s, r) => s + (r.exceptions || 0), 0);
  const tds = runs[0]?.totals?.tds;

  return (
    <>
      <motion.section {...rise()} className="relative overflow-hidden rounded-3xl bg-ink px-6 py-10 text-paper sm:px-10 sm:py-14">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="relative grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">TDS Return Preparation & Reconciliation</p>
            <h1 className="mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] font-medium leading-[1.02]">Every deduction checked, every challan <span className="text-lime">accounted for</span>.</h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-mist">
              Upload the payment ledger, vendor master and challan register. PAN, section and rate are checked for each payment, challans are
              reconciled with TDS booked, and a review-ready summary goes to the finance team.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Btn to="/new" variant="lime" icon="plus" className="h-12 px-6">New TDS run</Btn>
              <Btn to="/help" variant="ghost" className="h-12 px-5 !text-mist hover:!text-paper hover:!bg-white/5">How it works</Btn>
            </div>
          </div>
          <ChallanVisual />
        </div>
      </motion.section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat i={1} label="TDS runs" value={runs.length} note={runs[0] ? `Last ${ago(runs[0].createdAt)}` : "None yet"} />
        <Stat i={2} label="Challan gaps" value={open} tone={open ? "warn" : "good"} note="Runs where challans ≠ TDS booked" />
        <Stat i={3} label="Exceptions" value={items} note="Across all runs" />
        <Stat i={4} label="Latest TDS booked" value={tds == null ? "—" : inr(tds, { dp: 0 })} note={runs[0]?.period?.label || "No runs yet"} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <motion.section {...rise(5)} className="card lg:col-span-7">
          <div className="flex items-baseline justify-between px-5 pt-5">
            <h2 className="text-lg font-medium">Recent runs</h2>
            <Link to="/runs" className="text-sm text-teal-ink hover:underline">View all</Link>
          </div>
          <ul className="mt-3 divide-y divide-ink/6">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link to={`/runs/${r.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-paper-2/40">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.period?.label}</span>
                    <span className="font-mono text-[11px] text-muted">{r.totals?.payments} payments · {ago(r.createdAt)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="num font-mono text-sm">{inr(r.totals?.difference, { dp: 0 })}</span>
                    <Badge tone="warn" dot>{r.exceptions} items</Badge>
                  </span>
                </Link>
              </li>
            ))}
            {!runs.length && <li className="px-5 py-10 text-center text-sm text-muted">No runs yet — <Link to="/new" className="text-teal-ink underline">start one</Link>.</li>}
          </ul>
        </motion.section>
        <motion.section {...rise(6)} className="card p-5 lg:col-span-5">
          <h2 className="text-lg font-medium">What gets caught</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {[["PAN gaps", "Missing or invalid PAN, zero deduction on a no-PAN payee"], ["Rate consistency", "Different rates for the same deductee, rates off the configured rule"],
              ["Challan shortfall", "TDS booked vs challans by quarter and month"], ["Aggregation", "Repeat payments to one deductee under one section"]].map(([t, d]) => (
              <li key={t} className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name="check" className="size-3.5" strokeWidth={2.2} /></span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ul>
        </motion.section>
      </div>

      <div className="mt-6">
        <Steps items={[["Read", "Ledger, vendor master and challans are recognised from their column headers."], ["Check", "PAN, section and effective rate for every payment; repeat deductees grouped."],
          ["Reconcile", "Challans are matched to TDS booked by quarter and by month."], ["Report", "PDF summary and Excel workbook; the PDF is emailed straight away."]]} />
      </div>
    </>
  );
}

/** Monthly TDS bars filling up against the challans that settle them. */
function ChallanVisual() {
  const bars = [[66, 66], [105, 75], [136, 128]];
  return (
    <div className="relative hidden h-[220px] lg:col-span-5 lg:block" aria-hidden>
      <svg viewBox="0 0 360 220" className="h-full w-full">
        {bars.map(([tds, ch], i) => {
          const x = 30 + i * 110;
          return (
            <g key={i}>
              <rect x={x} y={190 - tds} width="34" height={tds} rx="5" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.16)" />
              <motion.rect x={x + 40} width="34" rx="5" fill={ch < tds ? "#b5d661" : "#4fb3ac"}
                initial={{ height: 0, y: 190 }} animate={{ height: ch, y: 190 - ch }} transition={{ delay: 0.5 + i * 0.25, duration: 0.9, ease: EASE }} />
              {ch < tds && <motion.text x={x + 40} y={182 - tds} fill="#b5d661" fontSize="10" fontFamily="JetBrains Mono Variable, monospace" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.4 + i * 0.2 }}>short</motion.text>}
              <text x={x} y="208" fill="#9aa7bd" fontSize="10" fontFamily="JetBrains Mono Variable, monospace">{["APR", "MAY", "JUN"][i]}</text>
            </g>
          );
        })}
        <text x="0" y="12" fill="#9aa7bd" fontSize="10" fontFamily="JetBrains Mono Variable, monospace">TDS BOOKED  ▮ CHALLANS</text>
      </svg>
    </div>
  );
}
