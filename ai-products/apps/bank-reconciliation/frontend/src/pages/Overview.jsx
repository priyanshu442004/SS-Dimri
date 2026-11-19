import { Link } from "react-router";
import { motion } from "motion/react";
import { useApi } from "@shared/api";
import { Btn, Stat, Steps, Badge, Icon, rise } from "@shared/ui";
import { inr, ago } from "@shared/format";

export default function Overview() {
  const { data } = useApi("/runs");
  const runs = data?.runs || [];
  const open = runs.filter((r) => !r.reconciled).length;
  const items = runs.reduce((s, r) => s + (r.exceptions || 0), 0);
  const avgMatch = runs.length ? Math.round(runs.reduce((s, r) => s + (r.matchedPct || 0), 0) / runs.length) : null;

  return (
    <>
      {/* hero */}
      <motion.section {...rise()} className="relative overflow-hidden rounded-3xl bg-ink px-6 py-10 text-paper sm:px-10 sm:py-14">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="relative grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">Bank Reconciliation</p>
            <h1 className="mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] font-medium leading-[1.02]">Close the month with every rupee <span className="text-lime">explained</span>.</h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-mist">
              Upload a bank statement and your cash book. Transactions are matched automatically, exceptions are classified with a next step,
              and a review report goes to the finance team.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Btn to="/new" variant="lime" icon="plus" className="h-12 px-6">New reconciliation</Btn>
              <Btn to="/help" variant="ghost" className="h-12 px-5 !text-mist hover:!text-paper hover:!bg-white/5">How it works</Btn>
            </div>
          </div>
          <MatchVisual />
        </div>
      </motion.section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat i={1} label="Reconciliations" value={runs.length} note={runs[0] ? `Last ${ago(runs[0].createdAt)}` : "None yet"} />
        <Stat i={2} label="Still open" value={open} tone={open ? "warn" : "good"} note="Not fully reconciled" />
        <Stat i={3} label="Items for review" value={items} note="Across all runs" />
        <Stat i={4} label="Average match rate" value={avgMatch == null ? "No runs yet" : `${avgMatch}%`} bar={avgMatch ?? 0} note="Bank rows matched" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <motion.section {...rise(5)} className="card lg:col-span-7">
          <div className="flex items-baseline justify-between px-5 pt-5">
            <h2 className="text-lg font-medium">Recent reconciliations</h2>
            <Link to="/runs" className="text-sm text-teal-ink hover:underline">View all</Link>
          </div>
          <ul className="mt-3 divide-y divide-ink/6">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link to={`/runs/${r.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-paper-2/40">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.accountName}</span>
                    <span className="font-mono text-[11px] text-muted">{r.period?.label} · {ago(r.createdAt)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="num font-mono text-sm">{inr(r.difference, { sign: true })}</span>
                    <Badge tone={r.reconciled ? "good" : "warn"} dot>{r.reconciled ? "Done" : `${r.exceptions} items`}</Badge>
                  </span>
                </Link>
              </li>
            ))}
            {!runs.length && <li className="px-5 py-10 text-center text-sm text-muted">No reconciliations yet — <Link to="/new" className="text-teal-ink underline">start one</Link>.</li>}
          </ul>
        </motion.section>
        <motion.section {...rise(6)} className="card p-5 lg:col-span-5">
          <h2 className="text-lg font-medium">What gets caught</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {[["Timing items", "Outstanding cheques, deposits in transit, value-date shifts"], ["Missing entries", "Bank charges, interest and receipts not yet in books"],
              ["Grouped transactions", "Bulk collections, payroll batches, split payments with fees"], ["Errors", "Amount mismatches and duplicate book entries"]].map(([t, d]) => (
              <li key={t} className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name="check" className="size-3.5" strokeWidth={2.2} /></span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ul>
        </motion.section>
      </div>

      <div className="mt-6">
        <Steps items={[["Read", "Columns, date format and debit/credit convention are detected automatically."], ["Match", "Exact reference, amount + date, then one-to-many and many-to-one groups."],
          ["Explain", "Every unmatched item is classified; together they must equal the difference."], ["Report", "PDF and Excel are generated and emailed to the finance team."]]} />
      </div>
    </>
  );
}

/** Two ledgers whose rows link up — the product in one picture. */
function MatchVisual() {
  const rows = [[0, 0, true], [1, 2, true], [2, 1, true], [3, null, false]];
  return (
    <div className="relative hidden h-[220px] lg:col-span-5 lg:block" aria-hidden>
      <svg viewBox="0 0 360 220" className="h-full w-full">
        {[0, 1, 2, 3].map((i) => (<g key={i}><rect x="0" y={20 + i * 48} width="130" height="30" rx="8" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" />
          <rect x="230" y={20 + i * 48} width="130" height="30" rx="8" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" />
          <rect x="12" y={32 + i * 48} width={50 + i * 12} height="6" rx="3" fill="rgba(255,255,255,0.25)" /><rect x="242" y={32 + i * 48} width={60 - i * 6} height="6" rx="3" fill="rgba(255,255,255,0.25)" /></g>))}
        {rows.map(([a, b, ok], i) => b != null ? (
          <motion.path key={i} d={`M130 ${35 + a * 48} C180 ${35 + a * 48} 180 ${35 + b * 48} 230 ${35 + b * 48}`} fill="none" stroke="#4fb3ac" strokeWidth="1.6"
            initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5 + i * 0.25, duration: 0.8, ease: EASE }} />
        ) : (
          <motion.g key={i}>
            <path d={`M130 ${35 + a * 48} H170`} stroke="#b5d661" strokeDasharray="3 4" strokeWidth="1.6" />
            <text x="176" y={39 + a * 48} fill="#b5d661" fontSize="11" fontFamily="JetBrains Mono Variable, monospace">review</text>
          </motion.g>
        ))}
        <text x="0" y="12" fill="#9aa7bd" fontSize="10" fontFamily="JetBrains Mono Variable, monospace">BANK</text>
        <text x="230" y="12" fill="#9aa7bd" fontSize="10" fontFamily="JetBrains Mono Variable, monospace">BOOKS</text>
      </svg>
    </div>
  );
}
const EASE = [0.16, 1, 0.3, 1];
