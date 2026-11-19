import { Link } from "react-router";
import { motion } from "motion/react";
import { useApi } from "@shared/api";
import { Btn, Stat, Steps, Badge, Icon, rise, EASE } from "@shared/ui";
import { inr, inrShort, ago } from "@shared/format";
import AISummary from "../components/AISummary";

export default function Overview() {
  const { data } = useApi("/runs");
  const runs = data?.runs || [];
  const invoices = runs.reduce((s, r) => s + r.totals.invoices, 0);
  const flagged = runs.reduce((s, r) => s + r.totals.exceptions, 0);
  const value = runs.reduce((s, r) => s + r.totals.expected, 0);

  return (
    <>
      <motion.section {...rise()} className="relative overflow-hidden rounded-3xl bg-ink px-6 py-10 text-paper sm:px-10 sm:py-14">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="relative grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">Invoice Automation</p>
            <h1 className="mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] font-medium leading-[1.02]">Supplier invoices in. A <span className="text-lime">checked</span> register out.</h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-mist">
              Drop a folder of invoice PDFs. Supplier, GSTIN, items and totals are extracted, GST is recalculated,
              duplicates and inflated totals are flagged — before anything is paid.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Btn to="/new" variant="lime" icon="plus" className="h-12 px-6">Process invoices</Btn>
              <Btn to="/help" variant="ghost" className="h-12 px-5 !text-mist hover:!bg-white/5 hover:!text-paper">What gets checked</Btn>
            </div>
          </div>
          <InvoiceVisual />
        </div>
      </motion.section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat i={1} label="Batches" value={runs.length} note={runs[0] ? `Last ${ago(runs[0].createdAt)}` : "None yet"} />
        <Stat i={2} label="Invoices processed" value={invoices} note="All batches" />
        <Stat i={3} label="Flagged for review" value={flagged} tone={flagged ? "warn" : "good"} note="Duplicates, mismatches, missing data" />
        <Stat i={4} label="Value checked" value={inrShort(value)} note="Taxable + calculated GST" />
      </div>

      <AISummary />

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <motion.section {...rise(5)} className="card lg:col-span-7">
          <div className="flex items-baseline justify-between px-5 pt-5"><h2 className="text-lg font-medium">Recent batches</h2><Link to="/runs" className="text-sm text-teal-ink hover:underline">View all</Link></div>
          <ul className="mt-3 divide-y divide-ink/6">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id}><Link to={`/runs/${r.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-paper-2/40">
                <span className="min-w-0"><span className="block truncate font-medium">{r.batchName}</span><span className="font-mono text-[11px] text-muted">{r.totals.invoices} invoices · {ago(r.createdAt)}</span></span>
                <span className="flex shrink-0 items-center gap-3"><span className="num font-mono text-sm">{inr(r.totals.expected, { dp: 0 })}</span><Badge tone={r.ok ? "good" : "warn"} dot>{r.ok ? "Passed" : `${r.totals.exceptions} flagged`}</Badge></span>
              </Link></li>
            ))}
            {!runs.length && <li className="px-5 py-10 text-center text-sm text-muted">No batches yet — <Link to="/new" className="text-teal-ink underline">process some invoices</Link>.</li>}
          </ul>
        </motion.section>
        <motion.section {...rise(6)} className="card p-5 lg:col-span-5">
          <h2 className="text-lg font-medium">Checks on every invoice</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {[["Duplicates", "Same supplier and invoice number seen earlier in the batch"], ["Total arithmetic", "Printed total vs taxable value + calculated GST"],
              ["GST", "Rate × taxable value; CGST/SGST vs IGST by state code"], ["Completeness", "GSTIN format, invoice number, date, totals present"]].map(([a, d]) => (
              <li key={a} className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name="check" className="size-3.5" strokeWidth={2.2} /></span><span><b className="font-medium">{a}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ul>
        </motion.section>
      </div>
      <div className="mt-6"><Steps items={[["Upload", "Any number of invoice PDFs in one go."], ["Extract", "Layout rules read each field; AI fills gaps on unfamiliar formats."], ["Validate", "GST recalculated; duplicates and mismatches flagged."], ["Report", "PDF report + Excel/CSV register, emailed automatically."]]} /></div>
    </>
  );
}

function InvoiceVisual() {
  return (
    <div className="relative hidden h-[230px] lg:col-span-5 lg:block" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.div key={i} initial={{ y: 20, rotate: -4 + i * 4 }} animate={{ y: 0 }} transition={{ delay: 0.3 + i * 0.15, duration: 0.7, ease: EASE }}
          className="absolute w-[190px] rounded-xl bg-paper p-4 text-ink shadow-2xl" style={{ left: 20 + i * 70, top: 10 + i * 18 }}>
          <p className="font-display text-[11px] font-semibold">TAX INVOICE</p>
          {[80, 55, 70, 40].map((w, k) => <div key={k} className={`mt-2 h-1.5 rounded-full ${k === 1 && i === 2 ? "bg-rose/60" : k === 2 ? "bg-teal/60" : "bg-ink/12"}`} style={{ width: `${w}%` }} />)}
          <div className="mt-3 flex justify-between font-mono text-[9px]"><span>Total</span><span>{["₹1,320", "₹10,030", "₹6,400"][i]}</span></div>
          {i === 2 && <span className="absolute -right-3 -top-3 rounded-full bg-rose px-2 py-0.5 font-mono text-[9px] text-white">+₹500</span>}
        </motion.div>
      ))}
    </div>
  );
}
