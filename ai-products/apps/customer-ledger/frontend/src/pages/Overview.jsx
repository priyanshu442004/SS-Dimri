import { Link } from "react-router";
import { motion } from "motion/react";
import { useApi } from "@shared/api";
import { Btn, Stat, Steps, Badge, Icon, rise, EASE } from "@shared/ui";
import { inr, ago } from "@shared/format";

export default function Overview() {
  const { data } = useApi("/runs");
  const runs = data?.runs || [];
  const open = runs.filter((r) => (r.stats?.exceptions || 0) > 0).length;
  const items = runs.reduce((s, r) => s + (r.stats?.exceptions || 0), 0);
  const lines = runs.reduce((s, r) => s + (r.stats?.matched || 0) + (r.stats?.exceptions || 0), 0);
  const matched = runs.reduce((s, r) => s + (r.stats?.matched || 0), 0);
  const rate = lines ? Math.round((matched / lines) * 100) : null;

  return (
    <>
      <motion.section {...rise()} className="relative overflow-hidden rounded-3xl bg-ink px-6 py-10 text-paper sm:px-10 sm:py-14">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="relative grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">Customer Ledger Reconciliation</p>
            <h1 className="mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] font-medium leading-[1.02]">Agree every customer balance, <span className="text-lime">line by line</span>.</h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-mist">
              Upload your customer ledger and the customer's statement. Invoices, receipts and credit notes are matched, every difference is
              explained with a next action, invoices are lined up for ageing, and a summary goes to the finance team.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Btn to="/new" variant="lime" icon="plus" className="h-12 px-6">New reconciliation</Btn>
              <Btn to="/help" variant="ghost" className="h-12 px-5 !text-mist hover:!text-paper hover:!bg-white/5">How it works</Btn>
            </div>
          </div>
          <LedgerVisual />
        </div>
      </motion.section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat i={1} label="Reconciliations" value={runs.length} note={runs[0] ? `Last ${ago(runs[0].createdAt)}` : "None yet"} />
        <Stat i={2} label="With open items" value={open} tone={open ? "warn" : "good"} note="Need review" />
        <Stat i={3} label="Open items" value={items} note="Across all runs" />
        <Stat i={4} label="Lines matched" value={rate == null ? "No runs yet" : `${rate}%`} bar={rate ?? 0} note="References agreed" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <motion.section {...rise(5)} className="card min-w-0 lg:col-span-7">
          <div className="flex items-baseline justify-between px-5 pt-5">
            <h2 className="text-lg font-medium">Recent reconciliations</h2>
            <Link to="/runs" className="text-sm text-teal-ink hover:underline">View all</Link>
          </div>
          <ul className="mt-3 divide-y divide-ink/6">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link to={`/runs/${r.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-paper-2/40">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{r.customer?.name}</span>
                    <span className="font-mono text-[11px] text-muted">{r.period?.label} · {ago(r.createdAt)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="num font-mono text-sm">{inr(r.difference, { dp: 0, sign: true })}</span>
                    <Badge tone={r.stats?.exceptions ? "warn" : "good"} dot>{r.stats?.exceptions ? `${r.stats.exceptions} items` : "Agreed"}</Badge>
                  </span>
                </Link>
              </li>
            ))}
            {!runs.length && <li className="px-5 py-10 text-center text-sm text-muted">No reconciliations yet — <Link to="/new" className="text-teal-ink underline">start one</Link>.</li>}
          </ul>
        </motion.section>
        <motion.section {...rise(6)} className="card min-w-0 p-5 lg:col-span-5">
          <h2 className="text-lg font-medium">What gets caught</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {[["Amount mismatches", "Same invoice or credit note at a different value"], ["Missing in your books", "Invoices or credit notes only the customer shows"],
              ["Missing at the customer", "Invoices the customer hasn't accounted for"], ["Wording & reference drift", "Same entry described or numbered differently"]].map(([t, d]) => (
              <li key={t} className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name="check" className="size-3.5" strokeWidth={2.2} /></span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ul>
        </motion.section>
      </div>

      <div className="mt-6">
        <Steps items={[["Read", "Ledger, statement and customer master are recognised from their column headers."], ["Match", "Same reference first, then same amount and side within 7 days."],
          ["Explain", "Every difference is classified, with a suggested action and its effect on the balance."], ["Report", "PDF summary and Excel workbook with ageing input; the PDF is emailed straight away."]]} />
      </div>
    </>
  );
}

/** Company books entries linking to the customer's; one mismatch, one missing on each side. */
function LedgerVisual() {
  const rows = [["SI-201", "ok"], ["RC-801", "ok"], ["CN-21", "diff"], ["SI-203", "books"], ["SI-204", "stmt"]];
  return (
    <div className="relative hidden h-[230px] lg:col-span-5 lg:block" aria-hidden>
      <svg viewBox="0 0 360 230" className="h-full w-full">
        <text x="0" y="12" fill="#9aa7bd" fontSize="10" fontFamily="JetBrains Mono Variable, monospace">BOOKS</text>
        <text x="230" y="12" fill="#9aa7bd" fontSize="10" fontFamily="JetBrains Mono Variable, monospace">CUSTOMER</text>
        {rows.map(([ref, st], i) => {
          const y = 22 + i * 42;
          return (
            <g key={ref}>
              {st !== "stmt" && <><rect x="0" y={y} width="130" height="28" rx="7" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" /><text x="12" y={y + 18} fill="#f3f5f1" fontSize="11" fontFamily="JetBrains Mono Variable, monospace">{ref}</text></>}
              {st !== "books" && <><rect x="230" y={y} width="130" height="28" rx="7" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" /><text x="242" y={y + 18} fill="#f3f5f1" fontSize="11" fontFamily="JetBrains Mono Variable, monospace">{ref}</text></>}
              {(st === "ok" || st === "diff") && <motion.path d={`M130 ${y + 14} H230`} stroke={st === "ok" ? "#4fb3ac" : "#b5d661"} strokeWidth="1.6" strokeDasharray={st === "diff" ? "3 4" : undefined} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.5 + i * 0.2, duration: 0.7, ease: EASE }} />}
              {st === "diff" && <text x="158" y={y + 9} fill="#b5d661" fontSize="10" fontFamily="JetBrains Mono Variable, monospace">₹500</text>}
              {st === "books" && <text x="142" y={y + 18} fill="#b5d661" fontSize="10" fontFamily="JetBrains Mono Variable, monospace">not at customer</text>}
              {st === "stmt" && <text x="122" y={y + 18} fill="#b5d661" fontSize="10" fontFamily="JetBrains Mono Variable, monospace">not in books</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
