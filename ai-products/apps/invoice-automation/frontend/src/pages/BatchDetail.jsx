import { useState } from "react";
import { useParams } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { api, useApi, fileUrl } from "@shared/api";
import { Loading, ErrorNote, Btn, Empty, Stat, Section, Badge, MailStatus, Icon, rise, EASE } from "@shared/ui";
import { inr, shortDate, dateTime } from "@shared/format";

export default function BatchDetail() {
  const { id } = useParams();
  const { data, error, loading, reload } = useApi(`/runs/${id}`);
  const [resending, setResending] = useState(false);
  const [open, setOpen] = useState(null);
  const [filter, setFilter] = useState("all");

  if (loading && !data) return <Loading label="Loading batch…" />;
  if (error) return error.includes("not found")
    ? <Empty icon="history" title="Batch not found" action={<Btn to="/runs" icon="back">All batches</Btn>}>It may have been removed from this server.</Empty>
    : <ErrorNote>{error}</ErrorNote>;

  const { meta, batch: b } = data;
  const t = b.totals;
  const resend = async () => { setResending(true); try { await api(`/runs/${id}/email`, { method: "POST" }); await reload(); } finally { setResending(false); } };
  const rows = b.invoices.filter((x) => filter === "all" || (filter === "review" ? x.status !== "ok" : x.status === "ok"));

  return (
    <>
      <div className="mb-5"><Btn to="/runs" variant="ghost" icon="back" className="-ml-3">All batches</Btn></div>
      <motion.div {...rise()} className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone={b.status.ok ? "good" : "warn"} dot>{b.status.ok ? "All passed" : `${t.exceptions} need review`}</Badge>
            {b.period && <span className="label">{shortDate(b.period.from)} – {shortDate(b.period.to)}</span>}
          </div>
          <h1 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] font-medium leading-[1.05]">{b.batchName}</h1>
          <p className="mt-1 font-mono text-[11px] text-muted">Batch {meta.id} · {dateTime(meta.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MailStatus mail={meta.mail} onResend={resend} busy={resending} />
          <Btn to={`/chat/${id}`} variant="lime" icon="ai">Ask AI</Btn>
          <Btn href={fileUrl(`/runs/${id}/pdf`)} target="_blank" variant="line" icon="file">View PDF</Btn>
          <Btn href={fileUrl(`/runs/${id}/pdf?download=1`)} variant="line" icon="download">PDF</Btn>
          <Btn href={fileUrl(`/runs/${id}/csv`)} variant="line" icon="download">CSV</Btn>
          <Btn href={fileUrl(`/runs/${id}/xlsx`)} icon="download">Excel</Btn>
        </div>
      </motion.div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat i={1} label="Invoices" value={t.invoices} note={`${t.passed} passed · ${t.exceptions} to review`} bar={(t.passed / t.invoices) * 100} />
        <Stat i={2} label="Taxable value" value={inr(t.taxable, { dp: 0 })} note={`${t.suppliers} suppliers · excl. ${t.duplicates} duplicate${t.duplicates === 1 ? "" : "s"}`} />
        <Stat i={3} label="Calculated GST" value={inr(t.gst, { dp: 0 })} note={`CGST ${inr(t.cgst, { dp: 0 })} · SGST ${inr(t.sgst, { dp: 0 })}${t.igst ? ` · IGST ${inr(t.igst, { dp: 0 })}` : ""}`} />
        <Stat i={4} label="Printed vs expected" value={inr(t.variance, { sign: true })} note={`${inr(t.printed, { dp: 0 })} printed · ${inr(t.expected, { dp: 0 })} expected`} tone={Math.abs(t.variance) < 0.5 ? "good" : "warn"} />
      </div>

      <motion.p {...rise(5)} className="mt-6 rounded-2xl border border-ink/8 bg-white/60 px-5 py-4 text-[15px] leading-relaxed"><b>{b.status.lead}</b> {b.status.text}</motion.p>

      {b.issues.length > 0 && (
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {b.issues.map((x, i) => (
            <motion.button {...rise(6 + i)} key={i} onClick={() => setOpen(x.index)} className="card p-5 text-left transition-colors hover:border-ink/20">
              <div className="flex items-center justify-between gap-3">
                <Badge tone={x.kind === "duplicate" || x.kind === "total" ? "bad" : "warn"}>{{ duplicate: "Duplicate", total: "Total mismatch", gst: "GST", data: "Data", unreadable: "Unreadable" }[x.kind]}</Badge>
                <span className="font-mono text-[11px] text-muted">Invoice {x.index}</span>
              </div>
              <h3 className="mt-3 font-sans text-[15.5px] font-semibold tracking-normal">{x.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{x.text}</p>
              <p className="mt-2 text-sm"><b className="font-medium">Next step:</b> {x.next}</p>
            </motion.button>
          ))}
        </div>
      )}

      <Section i={8} className="mt-6 overflow-hidden" title="Invoice register" aside={
        <div className="flex gap-1 rounded-full bg-paper-2 p-1 text-[13px]">
          {[["all", `All ${b.invoices.length}`], ["review", `Review ${t.exceptions}`], ["ok", `Passed ${t.passed}`]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} className={`rounded-full px-3 py-1 ${filter === k ? "bg-white shadow-sm" : "text-muted hover:text-ink"}`}>{l}</button>
          ))}
        </div>
      }>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[980px] text-[13px]">
            <thead><tr className="border-y border-ink/8 bg-paper-2/50 text-left">
              {["#", "Invoice", "Date", "Supplier", "Taxable", "Rate", "CGST", "SGST", "IGST", "Total", "Check"].map((h, i) => <th key={h} className={`label px-3 py-2.5 font-medium ${i >= 4 && i <= 9 ? "text-right" : ""}`}>{h}</th>)}
            </tr></thead>
            <tbody className="num divide-y divide-ink/6">
              {rows.map((x) => (
                <tr key={x.index} onClick={() => setOpen(x.index)} className={`cursor-pointer hover:bg-paper-2/50 ${x.status !== "ok" ? "bg-rose-soft/40" : ""}`}>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted">{x.index}</td>
                  <td className="px-3 py-2.5 font-medium">{x.invoiceNumber || "—"}<span className="block font-mono text-[10.5px] font-normal text-muted">{b.files[x.index - 1]}</span></td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{shortDate(x.invoiceDate)}</td>
                  <td className="px-3 py-2.5">{x.supplierName || "—"}<span className="block font-mono text-[10.5px] text-muted">{x.supplierGstin}</span></td>
                  <td className="px-3 py-2.5 text-right font-mono">{inr(x.taxableValue)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{x.rate != null ? `${x.rate}%` : "—"}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{inr(x.calc?.cgst)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{inr(x.calc?.sgst)}</td>
                  <td className="px-3 py-2.5 text-right font-mono">{inr(x.calc?.igst || 0)}</td>
                  <td className={`px-3 py-2.5 text-right font-mono ${x.totalDiff && Math.abs(x.totalDiff) >= 0.5 ? "text-rose" : ""}`}>{inr(x.invoiceTotal)}</td>
                  <td className="px-3 py-2.5">{x.status === "ok" ? <span className="inline-flex items-center gap-1 text-teal-ink"><Icon name="check" className="size-4" />OK</span> : <Badge tone="bad">{x.status === "error" ? "Error" : "Review"}</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="GST by rate" i={9} className="overflow-hidden">
          <table className="mt-3 w-full text-[13px]">
            <thead><tr className="border-y border-ink/8 bg-paper-2/50 text-left">{["Rate", "Invoices", "Taxable", "GST"].map((h, i) => <th key={h} className={`label px-4 py-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody className="num divide-y divide-ink/6">
              {b.gstByRate.map((r) => <tr key={r.rate}><td className="px-4 py-2.5">{r.rate}</td><td className="px-4 py-2.5 text-right">{r.invoices}</td><td className="px-4 py-2.5 text-right font-mono">{inr(r.taxable)}</td><td className="px-4 py-2.5 text-right font-mono">{inr(r.gst)}</td></tr>)}
              <tr className="bg-paper-2/50 font-medium"><td className="px-4 py-2.5">Total</td><td className="px-4 py-2.5 text-right">{b.gstByRate.reduce((s, r) => s + r.invoices, 0)}</td><td className="px-4 py-2.5 text-right font-mono">{inr(t.taxable)}</td><td className="px-4 py-2.5 text-right font-mono">{inr(t.gst)}</td></tr>
            </tbody>
          </table>
        </Section>
        <Section title="Suppliers" i={10} className="overflow-hidden">
          <table className="mt-3 w-full text-[13px]">
            <thead><tr className="border-y border-ink/8 bg-paper-2/50 text-left">{["Supplier", "Invoices", "Total"].map((h, i) => <th key={h} className={`label px-4 py-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody className="num divide-y divide-ink/6">
              {b.suppliers.map((s) => <tr key={s.gstin || s.name}><td className="px-4 py-2.5">{s.name}{s.exceptions > 0 && <span className="ml-2"><Badge tone="warn">{s.exceptions} flagged</Badge></span>}</td><td className="px-4 py-2.5 text-right">{s.invoices}</td><td className="px-4 py-2.5 text-right font-mono">{inr(s.total)}</td></tr>)}
            </tbody>
          </table>
        </Section>
      </div>

      <AnimatePresence>{open && <InvoiceDrawer id={id} x={b.invoices[open - 1]} file={b.files[open - 1]} onClose={() => setOpen(null)} />}</AnimatePresence>
    </>
  );
}

/** Side panel: extracted fields, checks and the original PDF. */
function InvoiceDrawer({ id, x, file, onClose }) {
  const F = ({ k, v, mono }) => <div><dt className="text-[11.5px] text-muted">{k}</dt><dd className={`truncate ${mono ? "font-mono text-[13px]" : ""}`}>{v ?? "—"}</dd></div>;
  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.aside role="dialog" aria-label={`Invoice ${x.index}`} className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[980px] flex-col bg-paper shadow-2xl"
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.45, ease: EASE }}>
        <div className="flex items-center justify-between gap-3 border-b border-ink/8 px-5 py-4">
          <div className="min-w-0">
            <p className="label">Invoice {x.index} · {file}</p>
            <h2 className="truncate text-xl font-medium">{x.supplierName} · {x.invoiceNumber}</h2>
          </div>
          <button onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-ink/5" aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
          <div className="space-y-5 p-5 lg:overflow-y-auto">
            {x.exceptions?.length > 0
              ? <div className="space-y-2">{x.exceptions.map((e) => <p key={e} className="rounded-xl bg-rose-soft px-3.5 py-2.5 text-sm text-rose">{e}</p>)}</div>
              : <p className="flex items-center gap-2 rounded-xl bg-teal/10 px-3.5 py-2.5 text-sm text-teal-ink"><Icon name="check" className="size-4" /> Passed all checks</p>}
            <dl className="grid grid-cols-2 gap-x-5 gap-y-3 text-sm">
              <F k="Supplier GSTIN" v={x.supplierGstin} mono /><F k="Recipient GSTIN" v={x.recipientGstin} mono />
              <F k="Invoice date" v={shortDate(x.invoiceDate)} /><F k="Supply type" v={x.supply} />
              <F k="Bill to" v={x.billTo} /><F k="Read by" v={x.method === "rules" ? "Layout rules" : x.method === "rules+ai" ? "Rules + AI fallback" : x.method} />
              <div className="col-span-2"><F k="Supplier address" v={x.supplierAddress} /></div>
            </dl>
            <div>
              <p className="label mb-2">Line items</p>
              <table className="w-full text-[13px]"><thead><tr className="text-left text-muted"><th className="py-1 font-normal">Description</th><th className="py-1 text-right font-normal">Qty</th><th className="py-1 text-right font-normal">Taxable</th><th className="py-1 text-right font-normal">Rate</th></tr></thead>
                <tbody className="num">{(x.items || []).map((i, k) => <tr key={k} className="border-t border-ink/8"><td className="py-1.5">{i.description}<span className="block font-mono text-[10.5px] text-muted">HSN/SAC {i.hsn || "—"}</span></td><td className="py-1.5 text-right">{i.quantity ?? "—"}</td><td className="py-1.5 text-right font-mono">{inr(i.taxable)}</td><td className="py-1.5 text-right">{i.ratePercent != null ? `${i.ratePercent}%` : "—"}</td></tr>)}</tbody></table>
            </div>
            <div>
              <p className="label mb-2">Check</p>
              <table className="num w-full text-[13px]"><thead><tr className="text-left text-muted"><th className="py-1 font-normal" /><th className="py-1 text-right font-normal">Printed</th><th className="py-1 text-right font-normal">Calculated</th></tr></thead>
                <tbody className="font-mono">
                  {[["CGST", x.cgst, x.calc?.cgst], ["SGST", x.sgst, x.calc?.sgst], ["IGST", x.igst, x.calc?.igst], ["Total", x.invoiceTotal, x.expectedTotal]].map(([k, p, c]) => (
                    <tr key={k} className="border-t border-ink/8"><td className="py-1.5 font-sans">{k}</td><td className="py-1.5 text-right">{inr(p ?? 0)}</td><td className={`py-1.5 text-right ${Math.abs((p ?? 0) - (c ?? 0)) >= 0.5 ? "text-rose" : ""}`}>{inr(c ?? 0)}</td></tr>
                  ))}
                </tbody></table>
            </div>
          </div>
          <div className="min-h-[520px] border-t border-ink/8 bg-paper-2 lg:border-l lg:border-t-0">
            <iframe title={`Original ${file}`} src={fileUrl(`/runs/${id}/invoices/${x.index}`)} className="h-full min-h-[520px] w-full" />
          </div>
        </div>
      </motion.aside>
    </>
  );
}
