import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { CLASSES, MATCH_TYPES } from "../lib";
import { inr, shortDate, dateTime } from "@shared/format";
import { fileUrl } from "@shared/api";
import { Stat as Kpi, MailStatus, Btn } from "@shared/ui";

const EASE = [0.16, 1, 0.3, 1];
const rise = (i = 0) => ({ initial: { y: 12 }, animate: { y: 0 }, transition: { delay: 0.05 * i, duration: 0.6, ease: EASE } });
const TONE = { rose: "bg-rose-soft text-rose", amber: "bg-amber-soft text-amber", teal: "bg-teal/12 text-teal-ink" };

export default function Results({ meta, result: r, onResend, resending }) {
  const s = r.summary;
  const pdf = fileUrl(`/runs/${meta.id}/pdf`);
  const xlsx = fileUrl(`/runs/${meta.id}/xlsx`);
  const matchedPct = Math.round((r.stats.matchedBank / r.stats.bankRows) * 100);

  return (
    <div className="space-y-6">
      {/* header */}
      <motion.div {...rise()} className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] ${r.status.reconciled ? "bg-teal/12 text-teal-ink" : "bg-amber-soft text-amber"}`}>
              <span className="size-1.5 rounded-full bg-current" />{r.status.reconciled ? "Reconciled" : "Not fully reconciled"}
            </span>
            <span className="label">{r.period.label}</span>
          </div>
          <h1 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] font-medium leading-[1.05]">{r.accountName}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MailStatus mail={meta.mail} onResend={onResend} busy={resending} />
          <Btn to={`/chat/${meta.id}`} variant="lime" icon="ai">Ask AI</Btn>
          <Btn href={pdf} target="_blank" variant="line" icon="file">View PDF</Btn>
          <Btn href={`${pdf}?download=1`} variant="line" icon="download">PDF</Btn>
          <Btn href={xlsx} icon="download">Excel</Btn>
        </div>
        <p className="w-full font-mono text-[11px] text-muted">Run {meta.id} · {dateTime(meta.createdAt)} · {meta.inputs?.bank} + {meta.inputs?.books}</p>
      </motion.div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi i={1} label="Difference" value={inr(s.difference, { sign: true })} note="Books − Bank" tone={Math.abs(s.difference) < 0.005 ? "good" : "warn"} />
        <Kpi i={2} label="Bank rows matched" value={`${matchedPct}%`} note={`${r.stats.matchedBank} of ${r.stats.bankRows} · ${r.stats.autoMatched} auto-matched`} bar={matchedPct} />
        <Kpi i={3} label="Items for review" value={r.stats.exceptions} note={`${r.unmatched.bank.length} bank-only · ${r.unmatched.books.length} book-only`} tone={r.stats.exceptions ? "warn" : "good"} />
        <Kpi i={4} label="Unexplained residual" value={inr(r.bridge.residual)} note={Math.abs(r.bridge.residual) < 0.005 ? "Difference fully explained" : "Needs investigation"} tone={Math.abs(r.bridge.residual) < 0.005 ? "good" : "bad"} />
      </div>

      <motion.p {...rise(5)} className="rounded-2xl border border-ink/8 bg-white/60 px-5 py-4 text-[15px] leading-relaxed">
        <b>{r.status.lead}</b> {r.status.text}
      </motion.p>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* left column */}
        <div className="space-y-6 lg:col-span-5">
          <motion.section {...rise(6)} className="card overflow-hidden">
            <h2 className="px-5 pt-5 text-lg font-medium">Reconciliation summary</h2>
            <table className="mt-3 w-full text-sm">
              <thead><tr className="border-y border-ink/8 bg-paper-2/60 text-left"><th className="label px-5 py-2.5 font-medium">Metric</th><th className="label px-3 py-2.5 text-right font-medium">Bank</th><th className="label px-5 py-2.5 text-right font-medium">Books</th></tr></thead>
              <tbody className="num divide-y divide-ink/6">
                {[["Total credits", s.bank.credits, s.books.credits], ["Total debits", s.bank.debits, s.books.debits],
                  ["Net movement", s.bank.net, s.books.net]].map(([l, a, b]) => (
                  <tr key={l}><td className="px-5 py-2.5 text-muted">{l}</td><td className="px-3 py-2.5 text-right">{inr(a)}</td><td className="px-5 py-2.5 text-right">{inr(b)}</td></tr>
                ))}
                <tr className="bg-paper-2/50 font-medium"><td className="px-5 py-3">Difference (Books − Bank)</td><td colSpan={2} className="px-5 py-3 text-right">{inr(s.difference, { sign: true })}</td></tr>
              </tbody>
            </table>
          </motion.section>

          <Bridge r={r} />
          <Detection r={r} />
        </div>

        {/* right column: exceptions */}
        <motion.section {...rise(7)} className="lg:col-span-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">Exceptions & review actions</h2>
            <span className="label">{r.exceptions.length} items</span>
          </div>
          <ul className="mt-3 space-y-2.5">
            {r.exceptions.length === 0 && <li className="card p-5 text-muted">No exceptions — every transaction is matched.</li>}
            {r.exceptions.map((e, i) => {
              const c = CLASSES[e.cls] || CLASSES.group;
              return (
                <motion.li key={i} initial={{ y: 8 }} animate={{ y: 0 }} transition={{ delay: 0.25 + i * 0.03, ease: EASE, duration: 0.5 }} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <span className={`inline-block rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${TONE[c.tone]}`}>{c.label}</span>
                      <h3 className="mt-2 font-sans text-[15.5px] font-semibold tracking-normal">{e.title}</h3>
                    </div>
                    {e.amount != null && <span className="num font-mono text-sm">{inr(e.amount, { sign: true })}</span>}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{e.text}</p>
                  <p className="mt-2 text-sm"><span className="font-medium">Next step:</span> {e.next}</p>
                  <p className="mt-2.5 flex flex-wrap gap-1.5">{e.rows.map((id) => <span key={id} className="rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{id}</span>)}</p>
                </motion.li>
              );
            })}
          </ul>
        </motion.section>
      </div>

      <Matches r={r} />
    </div>
  );
}

/** Each explaining item adds up to the difference (Books − Bank). */
function Bridge({ r }) {
  const max = Math.max(...r.bridge.items.map((b) => Math.abs(b.amount)), 1);
  return (
    <motion.section {...rise(7)} className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">Difference bridge</h2>
        <span className="label">Books − Bank</span>
      </div>
      <p className="mt-1 text-sm text-muted">Each unmatched or mismatched item and its effect on the difference.</p>
      <ul className="num mt-4 space-y-1.5 text-[13px]">
        {r.bridge.items.map((b, i) => (
          <li key={i} className="grid grid-cols-[1fr_88px_96px] items-center gap-3">
            <span className="truncate" title={b.label}>{b.label}</span>
            <span className="relative h-2 rounded-full bg-ink/6">
              <motion.span className={`absolute inset-y-0 rounded-full ${b.amount >= 0 ? "left-1/2 bg-teal" : "right-1/2 bg-rose/70"}`}
                initial={{ width: 0 }} animate={{ width: `${(Math.abs(b.amount) / max) * 50}%` }} transition={{ delay: 0.3 + i * 0.03, duration: 0.7, ease: EASE }} />
            </span>
            <span className="text-right font-mono">{inr(b.amount, { sign: true })}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-1 border-t border-ink/8 pt-3 text-sm">
        <Row l="Explained" v={inr(r.bridge.explained, { sign: true })} />
        <Row l="Difference" v={inr(r.summary.difference, { sign: true })} />
        <Row l="Unexplained residual" v={inr(r.bridge.residual)} strong ok={Math.abs(r.bridge.residual) < 0.005} />
      </div>
    </motion.section>
  );
}
const Row = ({ l, v, strong, ok }) => (
  <div className={`flex justify-between ${strong ? "font-medium" : "text-muted"}`}>
    <span>{l}</span><span className={`num font-mono ${ok === true ? "text-teal-ink" : ok === false ? "text-rose" : ""}`}>{v}{ok === true && " ✓"}</span>
  </div>
);

function Detection({ r }) {
  const d = r.detection;
  return (
    <motion.section {...rise(8)} className="card p-5 text-sm">
      <h2 className="text-lg font-medium">How the files were read</h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
        <dt className="text-muted">Bank columns</dt><dd className="truncate font-mono text-[12px]">{Object.values(d.bank.columns).join(" · ")}</dd>
        <dt className="text-muted">Books columns</dt><dd className="truncate font-mono text-[12px]">{Object.values(d.books.columns).join(" · ")}</dd>
        <dt className="text-muted">Date format</dt><dd>{d.bank.dateOrder === "mdy" ? "Month / Day / Year" : "Day / Month / Year"}</dd>
        <dt className="text-muted">Books convention</dt><dd>{d.books.convention === "bank" ? "Credit = receipt (bank style)" : "Debit = receipt (accounting style)"}</dd>
        <dt className="text-muted">Date tolerance</dt><dd>{r.settings.tolerance} days</dd>
      </dl>
    </motion.section>
  );
}

function Matches({ r }) {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const tabs = ["all", ...Object.keys(MATCH_TYPES).filter((t) => r.stats.counts[t])];
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return r.matches.filter((m) => (tab === "all" || m.type === tab) && (!needle ||
      [...m.bank, ...m.books].some((x) => `${x.id} ${x.ref} ${x.narration} ${x.party}`.toLowerCase().includes(needle))));
  }, [r.matches, tab, q]);

  return (
    <motion.section {...rise(9)} className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-lg font-medium">Matched transactions <span className="font-mono text-sm text-muted">{r.matches.length}</span></h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ID, reference, narration…" className="h-9 w-full rounded-full border border-ink/12 bg-white px-4 text-sm outline-none focus:border-teal sm:w-72" />
      </div>
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-ink/8 px-5">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`relative whitespace-nowrap px-3 pb-2.5 text-sm ${tab === t ? "text-ink" : "text-muted hover:text-ink"}`} title={MATCH_TYPES[t]?.hint}>
            {t === "all" ? "All" : MATCH_TYPES[t].label} <span className="font-mono text-xs text-muted">{t === "all" ? r.matches.length : r.stats.counts[t]}</span>
            {tab === t && <motion.span layoutId="tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-teal" />}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead><tr className="text-left">
            {["Type", "Bank", "Books", "Amount", "Δ amount", "Δ days", "Confidence"].map((h) => <th key={h} className="label px-4 py-3 font-medium">{h}</th>)}
          </tr></thead>
          <tbody className="num divide-y divide-ink/6">
            {rows.map((m, i) => (
              <tr key={i} className="align-top hover:bg-paper-2/40">
                <td className="px-4 py-3"><span className="whitespace-nowrap rounded-md bg-paper-2 px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider">{MATCH_TYPES[m.type]?.label}</span>{m.timing && <span className="ml-1 rounded-md bg-amber-soft px-1.5 py-0.5 font-mono text-[10px] text-amber">TIMING</span>}</td>
                <td className="px-4 py-3"><Side rows={m.bank} /></td>
                <td className="px-4 py-3"><Side rows={m.books} book /></td>
                <td className="px-4 py-3 text-right font-mono">{inr(m.bankAmount, { sign: true })}</td>
                <td className={`px-4 py-3 text-right font-mono ${Math.abs(m.amountDiff) >= 0.005 ? "text-rose" : "text-muted"}`}>{Math.abs(m.amountDiff) >= 0.005 ? inr(m.amountDiff, { sign: true }) : inr(0)}</td>
                <td className="px-4 py-3 text-right font-mono text-muted">{m.dateDiff || 0}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2"><span className="h-1.5 w-14 overflow-hidden rounded-full bg-ink/8"><span className={`block h-full rounded-full ${m.confidence >= 0.9 ? "bg-teal" : m.confidence >= 0.75 ? "bg-lime" : "bg-amber"}`} style={{ width: `${m.confidence * 100}%` }} /></span><span className="font-mono text-[11px] text-muted">{Math.round(m.confidence * 100)}%</span></div>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No matches for this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

function Side({ rows, book }) {
  return (
    <div className="space-y-1">
      {rows.map((x) => (
        <div key={x.id} className="max-w-[260px]">
          <span className="font-mono text-[11px] text-muted">{x.id} · {shortDate(x.date)}</span>
          <p className="truncate" title={book ? x.party || x.narration : x.narration}>{book ? x.party || x.narration : x.narration}</p>
        </div>
      ))}
    </div>
  );
}
