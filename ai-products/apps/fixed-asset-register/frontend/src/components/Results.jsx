import { Fragment, useMemo, useState } from "react";
import { motion } from "motion/react";
import { inr, shortDate, dateTime } from "@shared/format";
import { fileUrl } from "@shared/api";
import { Stat as Kpi, MailStatus, Btn, Icon, EASE, rise } from "@shared/ui";

const KIND = {
  policy: ["Policy", "bg-amber-soft text-amber"],
  data: ["Data", "bg-rose-soft text-rose"],
  info: ["Review", "bg-paper-2 text-muted"],
};
const INPUT_LABELS = { register: "Existing asset register", additions: "Current year additions", disposals: "Disposals", policy: "Depreciation policy" };
const label = (k) => INPUT_LABELS[k] || (k.startsWith("invoice") ? `Capital invoice ${k.slice(7)}` : k);
const rupees = (n, o = {}) => inr(n, { dp: 2, ...o });
const r0 = (n) => inr(n, { dp: 0 });

export default function Results({ meta, result: r, onResend, resending }) {
  const st = r.stats;
  const pdf = fileUrl(`/runs/${meta.id}/pdf`);
  const xlsx = fileUrl(`/runs/${meta.id}/xlsx`);
  const q = `Q${r.period.quarter}`;

  return (
    <div className="space-y-6">
      <motion.div {...rise()} className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] ${st.held ? "bg-amber-soft text-amber" : "bg-teal/12 text-teal-ink"}`}>
              <span className="size-1.5 rounded-full bg-current" />{st.held ? `${st.held} held` : "All computed"} · draft
            </span>
            <span className="label">{shortDate(r.period.start)} – {shortDate(r.period.end)}</span>
          </div>
          <h1 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] font-medium leading-[1.05]">Fixed assets · {r.period.label}</h1>
          <p className="mt-1 text-muted">{r.title} · {r.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MailStatus mail={meta.mail} onResend={onResend} busy={resending} />
          <Btn to={`/chat/${meta.id}`} variant="lime" icon="ai">Ask AI</Btn>
          <Btn href={pdf} target="_blank" variant="line" icon="file">View PDF</Btn>
          <Btn href={`${pdf}?download=1`} variant="line" icon="download">PDF</Btn>
          <Btn href={xlsx} icon="download">Excel</Btn>
        </div>
        <p className="w-full break-words font-mono text-[11px] text-muted">Run {meta.id} · {dateTime(meta.createdAt)} · {Object.values(meta.inputs || {}).join(" + ")}</p>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi i={1} label="Asset records" value={st.existing + st.additions} note={`${st.existing} existing · ${st.additions} addition${st.additions === 1 ? "" : "s"} (${r0(r.totals.additions)})`} />
        <Kpi i={2} label={`${q} depreciation`} value={r0(r.totals.dep)} note={`${st.computed} asset${st.computed === 1 ? "" : "s"} computed · illustrative`} tone="good" />
        <Kpi i={3} label="Held calculations" value={st.held} note={st.held ? `${r0(r.totals.heldCost)} of cost waiting on inputs` : "Nothing held"} tone={st.held ? "warn" : "good"} />
        <Kpi i={4} label="Invoices read" value={`${st.extracted} of ${st.invoices}`} note={r.docText} tone={st.invoices && st.extracted < st.invoices ? "bad" : undefined} />
      </div>

      <motion.div {...rise(5)} className="rounded-2xl border border-ink/8 bg-white/60 px-5 py-4 text-[15px] leading-relaxed">
        <p><b>Held calculations:</b> {r.heldText}</p>
        <p className="mt-1"><b>Next action:</b> {r.nextAction}</p>
        <p className="mt-1 text-muted"><b className="text-ink">Approval:</b> {r.approval}</p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-5">
          <Extract r={r} />
          <Policy r={r} />
        </div>
        <motion.section {...rise(7)} className="min-w-0 lg:col-span-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">Exceptions</h2>
            <span className="label">{r.exceptions.length} to resolve</span>
          </div>
          <ul className="mt-3 space-y-2.5">
            {r.exceptions.map((x, i) => (
              <motion.li key={i} initial={{ y: 8 }} animate={{ y: 0 }} transition={{ delay: 0.25 + i * 0.03, ease: EASE, duration: 0.5 }} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-block rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${KIND[x.kind]?.[1]}`}>{KIND[x.kind]?.[0]}</span>
                  <span className="font-mono text-[13px] font-semibold">{x.asset}</span>
                </div>
                <p className="mt-2 text-[15px] leading-snug">{x.issue}</p>
                <p className="mt-1.5 flex gap-1.5 text-sm leading-relaxed text-muted"><Icon name="arrow" className="mt-0.5 size-3.5 shrink-0" />{x.action}</p>
              </motion.li>
            ))}
          </ul>
        </motion.section>
      </div>

      <Rollforward r={r} />
      <Sources meta={meta} r={r} />
    </div>
  );
}

/** Additions with the invoice read from the PDF side by side. */
function Extract({ r }) {
  return (
    <motion.section {...rise(6)} className="card overflow-hidden">
      <div className="flex items-baseline justify-between px-5 pt-5">
        <h2 className="text-lg font-medium">Additions extract</h2>
        <span className="label">{r.extract.length} invoice{r.extract.length === 1 ? "" : "s"}</span>
      </div>
      <ul className="mt-3 divide-y divide-ink/6 border-t border-ink/8 text-[13px]">
        {r.extract.map((x) => (
          <li key={`${x.invoiceNo}-${x.assetId}`} className="px-5 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <span className="min-w-0"><span className="font-mono">{x.invoiceNo || "—"}</span> <span className="text-muted">→ {x.assetId} · {x.description}</span></span>
              <span className="num font-mono">{rupees(x.cost)}</span>
            </div>
            {x.invoice ? (
              <p className="num mt-1.5 rounded-lg bg-paper-2/70 px-2.5 py-1.5 font-mono text-[11.5px] text-muted">
                PDF: taxable {rupees(x.invoice.taxable)} + GST {rupees(x.invoice.gst)} = <span className={Math.abs((x.invoice.total ?? 0) - x.cost) > 0.5 ? "text-rose" : "text-teal-ink"}>{rupees(x.invoice.total)}</span>
                {x.invoice.supplier ? ` · ${x.invoice.supplier}` : ""}
              </p>
            ) : null}
            <p className={`mt-1 text-[12px] ${x.invoice ? "text-teal-ink" : "text-muted"}`}>{x.status}</p>
          </li>
        ))}
        {!r.extract.length && <li className="px-5 py-6 text-center text-muted">No additions file uploaded.</li>}
      </ul>
    </motion.section>
  );
}

function Policy({ r }) {
  return (
    <motion.section {...rise(7)} className="card min-w-0 overflow-hidden">
      <h2 className="px-5 pt-5 text-lg font-medium">Depreciation policy</h2>
      <p className="mt-1 px-5 text-sm text-muted">As supplied, by asset class.</p>
      <table className="num mt-3 w-full text-[13px]">
        <thead><tr className="text-left">{["Class", "Method", "Life", "Residual"].map((h, i) => <th key={h} className={`label px-5 py-1.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-ink/6 border-t border-ink/8">
          {r.policy.map((p) => (
            <tr key={p.cls} className="align-top">
              <td className="px-5 py-2">{p.cls}{p.notes && <span className="block text-[11.5px] text-muted">{p.notes}</span>}</td>
              <td className="px-5 py-2 text-right font-mono">{p.method || "—"}</td>
              <td className="px-5 py-2 text-right font-mono">{p.life ? `${p.life}y` : p.rate ? `${p.rate}%` : "—"}</td>
              <td className="px-5 py-2 text-right font-mono">{p.residualPct != null ? `${p.residualPct}%` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!r.policy.some((p) => p.convention) && <p className="border-t border-ink/8 px-5 py-3 text-[12.5px] text-muted">No partial-period convention configured — additions after the quarter's first month are held. Add a Partial_Period_Convention column (full month / next month / daily) to compute them.</p>}
    </motion.section>
  );
}

function Rollforward({ r }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return r.rows.filter((x) => !n || `${x.id} ${x.description} ${x.cls} ${x.status} ${x.note}`.toLowerCase().includes(n));
  }, [r.rows, q]);
  const qcol = `Q${r.period.quarter} depreciation`;

  return (
    <motion.section {...rise(9)} className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-lg font-medium">Asset rollforward <span className="font-mono text-sm text-muted">{r.rows.length}</span></h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search asset, class, status…" className="h-9 w-full rounded-full border border-ink/12 bg-white px-4 text-sm outline-none focus:border-teal sm:w-72" />
      </div>
      <p className="mt-1 px-5 text-sm text-muted">Select a computed row to see how its charge was worked out.</p>
      <div className="mt-3 overflow-x-auto border-t border-ink/8">
        <table className="w-full min-w-[1040px] text-[13px]">
          <thead><tr className="text-left">{["Asset", "Class", "Cost", "Method", "Life", "Residual", "From", "Status", qcol, "Note"].map((h, i) => <th key={h} className={`label px-3 py-3 font-medium ${[2, 4, 5, 8].includes(i) ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody className="num divide-y divide-ink/6">
            {rows.map((x) => (
              <Fragment key={x.id}>
                <tr onClick={() => x.calc && setOpen(open === x.id ? null : x.id)} className={`align-top ${x.calc ? "cursor-pointer hover:bg-paper-2/40" : ""} ${open === x.id ? "bg-paper-2/40" : ""} ${x.excluded ? "opacity-60" : ""}`}>
                  <td className="px-3 py-3"><span className="font-mono">{x.id}</span><span className="block whitespace-nowrap text-[12px] text-muted">{x.description}</span></td>
                  <td className="px-3 py-3">{x.cls}</td>
                  <td className="px-3 py-3 text-right font-mono">{rupees(x.cost)}</td>
                  <td className="px-3 py-3 text-right font-mono">{x.method || "—"}</td>
                  <td className="px-3 py-3 text-right font-mono">{x.life ?? "—"}</td>
                  <td className="px-3 py-3 text-right font-mono">{x.residualPct != null ? `${x.residualPct}%` : "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 font-mono text-[12px]">{x.start || "—"}</td>
                  <td className="px-3 py-3"><span className={`whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${x.status === "Addition" ? "bg-teal/12 text-teal-ink" : x.status.startsWith("Disposed") ? "bg-rose-soft text-rose" : "bg-paper-2 text-muted"}`}>{x.status}</span></td>
                  <td className="px-3 py-3 text-right font-mono">{x.dep != null ? <span className="text-teal-ink">{rupees(x.dep)}</span> : x.held ? <span className="text-amber">held</span> : "—"}</td>
                  <td className="min-w-[220px] max-w-[300px] px-3 py-3 text-[12px] text-muted">{x.note}</td>
                </tr>
                {open === x.id && x.calc && (
                  <tr className="bg-paper-2/30">
                    <td colSpan={10} className="px-5 py-3 text-[13px] text-muted">
                      {x.calc.monthly != null
                        ? <>Depreciable {rupees(x.cost * (1 - (x.residualPct || 0) / 100))} ({rupees(x.cost)} less {x.residualPct || 0}% residual) ÷ ({x.life} years × 12) = <b className="font-mono font-medium text-ink">{rupees(x.calc.monthly)}</b> a month × {x.calc.months ?? 3} month{(x.calc.months ?? 3) === 1 ? "" : "s"}{x.calc.accBefore ? ` · accumulated before the quarter ${rupees(x.calc.accBefore)}` : ""}{x.calc.fully ? " · fully depreciated" : ""}</>
                        : <>WDV at {(x.calc.rate * 100).toFixed(2)}% a year on the opening written-down value.</>}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!rows.length && <tr><td colSpan={10} className="px-4 py-8 text-center text-muted">No assets for this search.</td></tr>}
          </tbody>
          <tfoot className="num border-t-2 border-ink/10 font-medium">
            <tr><td className="px-3 py-3" colSpan={2}>Total</td><td className="px-3 py-3 text-right font-mono">{rupees(r.totals.cost)}</td><td colSpan={5} /><td className="px-3 py-3 text-right font-mono">{rupees(r.totals.dep)}</td><td /></tr>
          </tfoot>
        </table>
      </div>
    </motion.section>
  );
}

function Sources({ meta, r }) {
  return (
    <motion.section {...rise(10)} className="card min-w-0 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">Source files</h2>
        <Btn to={`/chat/${meta.id}`} variant="ghost" icon="ai" className="-mr-2">Chat with these files</Btn>
      </div>
      <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(meta.inputs || {}).map(([k, name]) => {
          const d = r.detection[k];
          const inv = k.startsWith("invoice") ? r.invoices.find((i) => i.file === name) : null;
          return (
            <li key={k} className="min-w-0 rounded-xl border border-ink/8 bg-white/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="label">{label(k)}</p>
                  <p className="mt-1 truncate font-mono text-[13px]" title={name}>{name}</p>
                  <p className="text-[12px] text-muted">{d ? `${d.rows} row${d.rows === 1 ? "" : "s"}` : inv ? (inv.readable ? `${inv.invoiceNo || "no invoice number"} · read by ${inv.method}` : inv.error) : ""}</p>
                </div>
                <a href={fileUrl(`/runs/${meta.id}/inputs/${k}`)} className="grid size-9 shrink-0 place-items-center rounded-full border border-ink/12 text-muted hover:border-ink/40 hover:text-ink" aria-label={`Download ${name}`}><Icon name="download" className="size-4" /></a>
              </div>
              {d?.columns && Object.keys(d.columns).length > 0 && (
                <p className="mt-2.5 flex flex-wrap gap-1">{Object.values(d.columns).map((c) => <span key={c} className="break-all rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{c}</span>)}</p>
              )}
              {inv?.readable && (
                <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12px]">
                  {[["Supplier", inv.supplier], ["Date", inv.invoiceDate], ["Description", inv.description], ["Total", inv.total != null ? rupees(inv.total) : null]].filter(([, v]) => v).map(([k2, v]) => <Fragment key={k2}><dt className="text-muted">{k2}</dt><dd className="min-w-0 truncate">{v}</dd></Fragment>)}
                </dl>
              )}
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
