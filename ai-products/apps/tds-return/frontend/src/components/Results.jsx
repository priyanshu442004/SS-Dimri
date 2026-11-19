import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { inr, shortDate, dateTime } from "@shared/format";
import { fileUrl } from "@shared/api";
import { Stat as Kpi, MailStatus, Btn, Icon, EASE, rise } from "@shared/ui";

const FLAGS = {
  pan: { label: "PAN", tone: "bg-rose-soft text-rose" },
  data: { label: "Data", tone: "bg-rose-soft text-rose" },
  rate: { label: "Rate", tone: "bg-amber-soft text-amber" },
  aggregate: { label: "Aggregate", tone: "bg-teal/12 text-teal-ink" },
  check: { label: "Check", tone: "bg-paper-2 text-muted" },
  ok: { label: "Recorded", tone: "bg-paper-2 text-muted" },
};
const EX_TONE = { pan: "rose", data: "rose", master: "rose", late: "amber", rate: "amber", challan: "amber", aggregate: "teal", schema: "neutral" };
const TONE = { rose: "bg-rose-soft text-rose", amber: "bg-amber-soft text-amber", teal: "bg-teal/12 text-teal-ink", neutral: "bg-paper-2 text-muted" };
const INPUT_LABELS = { payments: "Payment ledger", vendors: "Vendor master", challans: "Challan register", notes: "Review notes" };
const rupees = (n) => inr(n, { dp: 0 });

export default function Results({ meta, result: r, onResend, resending }) {
  const t = r.totals;
  const pdf = fileUrl(`/runs/${meta.id}/pdf`);
  const xlsx = fileUrl(`/runs/${meta.id}/xlsx`);
  const gap = Math.abs(t.difference) >= 0.01;
  const covered = t.tds ? Math.min(100, Math.round((t.challans / t.tds) * 100)) : 100;

  return (
    <div className="space-y-6">
      {/* header */}
      <motion.div {...rise()} className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-amber">
              <span className="size-1.5 rounded-full bg-current" />Draft · human validation required
            </span>
            <span className="label">{r.period.label}</span>
          </div>
          <h1 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] font-medium leading-[1.05]">{r.title}</h1>
          <p className="mt-1 text-muted">{r.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MailStatus mail={meta.mail} onResend={onResend} busy={resending} />
          <Btn to={`/chat/${meta.id}`} variant="lime" icon="ai">Ask AI</Btn>
          <Btn href={pdf} target="_blank" variant="line" icon="file">View PDF</Btn>
          <Btn href={`${pdf}?download=1`} variant="line" icon="download">PDF</Btn>
          <Btn href={xlsx} icon="download">Excel</Btn>
        </div>
        <p className="w-full font-mono text-[11px] text-muted">Run {meta.id} · {dateTime(meta.createdAt)} · {Object.values(meta.inputs || {}).join(" + ")}</p>
      </motion.div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi i={1} label="Gross payments" value={rupees(t.gross)} note={`${t.payments} payments · ${r.stats.deductees} deductees`} />
        <Kpi i={2} label="TDS booked" value={rupees(t.tds)} note={`Net paid ${rupees(t.net)}`} />
        <Kpi i={3} label="Challans provided" value={rupees(t.challans)} note={`${t.challanCount} challan${t.challanCount === 1 ? "" : "s"} · ${covered}% of TDS`} bar={covered} />
        <Kpi i={4} label="Aggregate difference" value={rupees(t.difference)} note={gap ? (t.difference > 0 ? "TDS booked exceeds challans" : "Challans exceed TDS booked") : "Challans equal TDS booked"} tone={gap ? "bad" : "good"} />
      </div>

      <motion.div {...rise(5)} className="rounded-2xl border border-ink/8 bg-white/60 px-5 py-4 text-[15px] leading-relaxed">
        <p><b>Key exceptions:</b> {r.keyExceptions}</p>
        <p className="mt-1 text-muted"><b className="text-ink">Approval:</b> {r.approval}</p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-5">
          <Control r={r} />
          <Months r={r} />
          <Sections r={r} />
        </div>
        <motion.section {...rise(7)} className="min-w-0 lg:col-span-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">Exceptions & recommended actions</h2>
            <span className="label">{r.exceptions.length} open</span>
          </div>
          <ul className="mt-3 space-y-2.5">
            {r.exceptions.map((e, i) => (
              <motion.li key={e.id} initial={{ y: 8 }} animate={{ y: 0 }} transition={{ delay: 0.25 + i * 0.03, ease: EASE, duration: 0.5 }} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <span className={`inline-block rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${TONE[EX_TONE[e.key] || "neutral"]}`}>{e.id}</span>
                    <h3 className="mt-2 font-sans text-[15.5px] font-semibold tracking-normal">{e.issue}</h3>
                  </div>
                  <span className="rounded-full bg-paper-2 px-2.5 py-0.5 font-mono text-[10.5px] uppercase tracking-wider text-muted">{e.status}</span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{e.action}</p>
                <p className="mt-2.5 flex flex-wrap gap-1.5">{e.related.split(/;\s*|\s\+\s/).map((x) => <span key={x} className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{x}</span>)}</p>
              </motion.li>
            ))}
          </ul>
          {r.reviewNotes?.length > 0 && <Notes r={r} />}
        </motion.section>
      </div>

      <Register r={r} />

      <div className="grid gap-6 lg:grid-cols-12">
        <Challans r={r} />
        <Deductees r={r} />
      </div>

      <Sources meta={meta} r={r} />
    </div>
  );
}

function Control({ r }) {
  return (
    <motion.section {...rise(6)} className="card overflow-hidden">
      <h2 className="px-5 pt-5 text-lg font-medium">Control summary</h2>
      <table className="mt-3 w-full text-sm">
        <tbody className="num divide-y divide-ink/6 border-t border-ink/8">
          {r.control.map(([k, v]) => (
            <tr key={k}><td className="px-5 py-2.5 text-muted">{k}</td><td className="px-5 py-2.5 text-right font-mono">{typeof v === "number" ? rupees(v) : <span className="font-sans text-amber">{v}</span>}</td></tr>
          ))}
        </tbody>
      </table>
    </motion.section>
  );
}

/** TDS booked per month vs the challans that settle it. */
function Months({ r }) {
  const max = Math.max(...r.months.map((m) => Math.max(m.tds, m.challanAmount)), 1);
  return (
    <motion.section {...rise(7)} className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">Challan allocation by month</h2>
        <span className="label">TDS vs challan</span>
      </div>
      <p className="mt-1 text-sm text-muted">A challan paid by the 7th settles the previous month's deductions.</p>
      <ul className="mt-4 space-y-3.5 text-[13px]">
        {r.months.map((m, i) => (
          <li key={m.month}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{m.label}</span>
              <span className={`num font-mono ${Math.abs(m.difference) >= 0.01 ? "text-rose" : "text-teal-ink"}`}>{Math.abs(m.difference) >= 0.01 ? `${m.difference > 0 ? "short" : "excess"} ${rupees(Math.abs(m.difference))}` : "✓ settled"}</span>
            </div>
            {[["TDS", m.tds, "bg-ink/70", m.payments.join(", ")], ["Challan", m.challanAmount, Math.abs(m.difference) >= 0.01 ? "bg-lime" : "bg-teal", m.challans.join(", ") || "none"]].map(([l, v, c, ids]) => (
              <div key={l} className="mt-1.5 grid grid-cols-[52px_1fr_80px] items-center gap-2" title={ids}>
                <span className="font-mono text-[10.5px] uppercase text-muted">{l}</span>
                <span className="h-2 rounded-full bg-ink/6"><motion.span className={`block h-full rounded-full ${c}`} initial={{ width: 0 }} animate={{ width: `${(v / max) * 100}%` }} transition={{ delay: 0.3 + i * 0.08, duration: 0.8, ease: EASE }} /></span>
                <span className="num text-right font-mono">{rupees(v)}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

function Sections({ r }) {
  return (
    <motion.section {...rise(8)} className="card overflow-hidden">
      <h2 className="px-5 pt-5 text-lg font-medium">Section-wise summary</h2>
      <div className="overflow-x-auto">
        <table className="mt-3 w-full text-[13px]">
          <thead><tr className="border-y border-ink/8 bg-paper-2/60 text-left">{["Section", "Payments", "Gross", "TDS"].map((h, i) => <th key={h} className={`label px-4 py-2.5 font-medium ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody className="num divide-y divide-ink/6">
            {r.sections.map((s) => (
              <tr key={s.section}>
                <td className="px-4 py-2.5"><span className="font-mono">{s.section}</span><span className="block text-[11.5px] text-muted">{s.nature}</span></td>
                <td className="px-4 py-2.5 text-right">{s.count}</td>
                <td className="px-4 py-2.5 text-right font-mono">{rupees(s.gross)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{rupees(s.tds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

function Notes({ r }) {
  return (
    <div className="card mt-6 p-5">
      <h2 className="text-lg font-medium">Review notes coverage</h2>
      <p className="mt-1 text-sm text-muted">Each note from the uploaded review notes, and the exception that addresses it.</p>
      <ul className="mt-4 space-y-2.5 text-sm">
        {r.reviewNotes.map((n, i) => (
          <li key={i} className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
            <span className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[11px]">{n.id}</span>
            <span className="text-muted">{n.text}</span>
            {n.covered.length
              ? <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-[11px] text-teal-ink"><Icon name="check" className="size-3.5" />{n.covered.join(", ")}</span>
              : <span className="whitespace-nowrap font-mono text-[11px] text-amber">not matched</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Register({ r }) {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const counts = r.payments.reduce((a, p) => ({ ...a, [p.flag]: (a[p.flag] || 0) + 1 }), {});
  const tabs = ["all", "flagged", ...["pan", "data", "rate", "aggregate"].filter((k) => counts[k])];
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return r.payments.filter((p) => (tab === "all" || (tab === "flagged" ? p.flag !== "ok" : p.flag === tab))
      && (!n || `${p.id} ${p.deductee} ${p.pan} ${p.section} ${p.nature} ${p.note}`.toLowerCase().includes(n)));
  }, [r.payments, tab, q]);

  return (
    <motion.section {...rise(9)} className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-lg font-medium">Deduction register <span className="font-mono text-sm text-muted">{r.payments.length}</span></h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search payment, deductee, PAN, note…" className="h-9 w-full rounded-full border border-ink/12 bg-white px-4 text-sm outline-none focus:border-teal sm:w-72" />
      </div>
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-ink/8 px-5">
        {tabs.map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`relative whitespace-nowrap px-3 pb-2.5 text-sm ${tab === k ? "text-ink" : "text-muted hover:text-ink"}`}>
            {k === "all" ? "All" : k === "flagged" ? "Needs review" : FLAGS[k].label} <span className="font-mono text-xs text-muted">{k === "all" ? r.payments.length : k === "flagged" ? r.stats.flagged : counts[k]}</span>
            {tab === k && <motion.span layoutId="regtab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-teal" />}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] text-[13px]">
          <thead><tr className="text-left">
            {["Payment", "Deductee", "PAN", "Section", "Gross", "TDS", "Rate", "Net paid", "System review note"].map((h, i) => <th key={h} className={`label px-4 py-3 font-medium ${i >= 4 && i <= 7 ? "text-right" : ""}`}>{h}</th>)}
          </tr></thead>
          <tbody className="num divide-y divide-ink/6">
            {rows.map((p) => (
              <tr key={`${p.id}-${p.row}`} className="align-top hover:bg-paper-2/40">
                <td className="px-4 py-3"><span className="font-mono">{p.id}</span><span className="block font-mono text-[11px] text-muted">{shortDate(p.date)}</span></td>
                <td className="px-4 py-3"><span className="block max-w-[200px] truncate" title={p.deductee}>{p.deductee}</span><span className="text-[11.5px] text-muted">{p.vendorType || "—"}{p.nature ? ` · ${p.nature}` : ""}</span></td>
                <td className="px-4 py-3 font-mono text-[12px]">{p.pan || <span className="text-rose">missing</span>}{p.panFromMaster && <span className="block text-[10.5px] text-muted">from master</span>}</td>
                <td className="px-4 py-3 font-mono">{p.section}</td>
                <td className="px-4 py-3 text-right font-mono">{rupees(p.gross)}</td>
                <td className="px-4 py-3 text-right font-mono">{rupees(p.tds)}</td>
                <td className="px-4 py-3 text-right font-mono">
                  <span className={p.rateOk && !p.group.inconsistent ? "" : "text-amber"}>{p.rate}%</span>
                  {p.expectedRate != null && <span className="block text-[10.5px] text-muted">rule {p.expectedRate}%</span>}
                </td>
                <td className="px-4 py-3 text-right font-mono">{rupees(p.net)}</td>
                <td className="px-4 py-3">
                  <span className={`mr-1.5 inline-block rounded-md px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${FLAGS[p.flag].tone}`}>{FLAGS[p.flag].label}</span>
                  <span className="text-[13px]">{p.note}</span>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">No payments for this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

function Challans({ r }) {
  return (
    <motion.section {...rise(10)} className="card min-w-0 overflow-hidden lg:col-span-5">
      <h2 className="px-5 pt-5 text-lg font-medium">Challan summary</h2>
      <div className="overflow-x-auto">
        <table className="mt-3 w-full min-w-[420px] text-[13px]">
          <thead><tr className="border-y border-ink/8 bg-paper-2/60 text-left">{["Challan", "Date", "BSR · Serial", "Amount"].map((h, i) => <th key={h} className={`label px-4 py-2.5 font-medium ${i === 3 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody className="num divide-y divide-ink/6">
            {r.challans.map((c) => (
              <tr key={`${c.id}-${c.row}`}>
                <td className="px-4 py-2.5 font-mono">{c.id}<span className="block text-[10.5px] text-muted">{c.q} · FY {c.fy}</span></td>
                <td className="px-4 py-2.5">{shortDate(c.date)}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-muted">{c.bsr || "—"} · {c.serial || "—"}</td>
                <td className="px-4 py-2.5 text-right font-mono">{rupees(c.amount)}</td>
              </tr>
            ))}
            <tr className="bg-paper-2/50 font-medium"><td colSpan={3} className="px-4 py-2.5">Total</td><td className="px-4 py-2.5 text-right font-mono">{rupees(r.totals.challans)}</td></tr>
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

function Deductees({ r }) {
  return (
    <motion.section {...rise(11)} className="card min-w-0 overflow-hidden lg:col-span-7">
      <h2 className="px-5 pt-5 text-lg font-medium">Deductee-wise working</h2>
      <p className="px-5 text-sm text-muted">Payments grouped by deductee, section and quarter — the basis for threshold checks and the return.</p>
      <div className="overflow-x-auto">
        <table className="mt-3 w-full min-w-[560px] text-[13px]">
          <thead><tr className="border-y border-ink/8 bg-paper-2/60 text-left">{["Deductee", "Section", "Payments", "Gross", "TDS", "Rates"].map((h, i) => <th key={h} className={`label px-4 py-2.5 font-medium ${i >= 3 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody className="num divide-y divide-ink/6">
            {r.deductees.map((d, i) => (
              <tr key={i}>
                <td className="px-4 py-2.5"><span className="block max-w-[200px] truncate">{d.deductee}</span><span className="font-mono text-[10.5px] text-muted">{d.pan || "no PAN"}</span></td>
                <td className="px-4 py-2.5 font-mono">{d.section}</td>
                <td className="px-4 py-2.5 font-mono text-[12px]">{d.payments.join(" + ")}</td>
                <td className="px-4 py-2.5 text-right font-mono">{rupees(d.gross)}</td>
                <td className="px-4 py-2.5 text-right font-mono">{rupees(d.tds)}</td>
                <td className={`px-4 py-2.5 text-right font-mono ${d.rates.length > 1 ? "text-amber" : "text-muted"}`}>{d.rates.join("% / ")}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

function Sources({ meta, r }) {
  return (
    <motion.section {...rise(12)} className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">Source files & how they were read</h2>
        <Btn to={`/chat/${meta.id}`} variant="ghost" icon="ai" className="-mr-2">Chat with these files</Btn>
      </div>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {Object.entries(meta.inputs || {}).map(([k, name]) => {
          const d = r.detection[k];
          return (
            <li key={k} className="rounded-xl border border-ink/8 bg-white/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="label">{INPUT_LABELS[k]}</p>
                  <p className="mt-1 truncate font-mono text-[13px]" title={name}>{name}</p>
                  <p className="text-[12px] text-muted">{d?.rows ?? 0} row{d?.rows === 1 ? "" : "s"}</p>
                </div>
                <a href={fileUrl(`/runs/${meta.id}/inputs/${k}`)} className="grid size-9 shrink-0 place-items-center rounded-full border border-ink/12 text-muted hover:border-ink/40 hover:text-ink" aria-label={`Download ${name}`}><Icon name="download" className="size-4" /></a>
              </div>
              {d?.columns && Object.keys(d.columns).length > 0 && (
                <p className="mt-2.5 flex flex-wrap gap-1">{Object.values(d.columns).map((c) => <span key={c} className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{c}</span>)}</p>
              )}
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
