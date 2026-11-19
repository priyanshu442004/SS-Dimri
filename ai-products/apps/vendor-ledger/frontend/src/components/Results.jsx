import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { inr, shortDate, dateTime } from "@shared/format";
import { fileUrl } from "@shared/api";
import { Stat as Kpi, MailStatus, Btn, Icon, EASE, rise } from "@shared/ui";

const STATUS = {
  Matched: "bg-teal/12 text-teal-ink",
  "Amount mismatch": "bg-amber-soft text-amber",
  "Side mismatch": "bg-amber-soft text-amber",
  "Books only": "bg-rose-soft text-rose",
  "Statement only": "bg-rose-soft text-rose",
};
const INPUT_LABELS = { books: "Books vendor ledger", statement: "Supplier statement", master: "Vendor master", notes: "Test scenarios / notes" };
const rupees = (n, o = {}) => inr(n, { dp: 0, ...o });
const ok = (n) => Math.abs(n) < 0.005;

export default function Results({ meta, result: r, onResend, resending }) {
  const st = r.stats;
  const pdf = fileUrl(`/runs/${meta.id}/pdf`);
  const xlsx = fileUrl(`/runs/${meta.id}/xlsx`);
  const total = r.rows.length;
  const pct = total ? Math.round((st.matched / total) * 100) : 0;

  return (
    <div className="space-y-6">
      <motion.div {...rise()} className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] ${st.exceptions ? "bg-amber-soft text-amber" : "bg-teal/12 text-teal-ink"}`}>
              <span className="size-1.5 rounded-full bg-current" />{st.exceptions ? `${st.exceptions} open item${st.exceptions === 1 ? "" : "s"}` : "Agreed"} · draft
            </span>
            <span className="label">{r.period.label}</span>
          </div>
          <h1 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] font-medium leading-[1.05]">{r.vendor.name}</h1>
          <p className="mt-1 text-muted">{r.title} · {r.subtitle}</p>
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi i={1} label="Matched" value={`${st.matched} of ${total}`} note={`${st.booksLines} books · ${st.statementLines} statement lines`} bar={pct} />
        <Kpi i={2} label="Open items" value={st.exceptions} note={`${st.mismatches} mismatch · ${st.booksOnly} books-only · ${st.statementOnly} statement-only`} tone={st.exceptions ? "warn" : "good"} />
        <Kpi i={3} label="Identified differences" value={rupees(st.absDiff)} note="Absolute value, all open items" tone={st.absDiff ? "warn" : "good"} />
        <Kpi i={4} label="Balance difference" value={rupees(r.balance.difference, { sign: true })} note={ok(r.balance.residual) ? "Books − statement · fully explained" : `Unexplained ${rupees(r.balance.residual)}`} tone={ok(r.balance.residual) ? (ok(r.balance.difference) ? "good" : "warn") : "bad"} />
      </div>

      <motion.div {...rise(5)} className="rounded-2xl border border-ink/8 bg-white/60 px-5 py-4 text-[15px] leading-relaxed">
        <p><b>Next action:</b> {r.nextAction}</p>
        <p className="mt-1 text-muted"><b className="text-ink">Approval:</b> {r.approval}</p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-5">
          <Summary r={r} />
          <Balance r={r} />
        </div>
        <motion.section {...rise(7)} className="min-w-0 lg:col-span-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">Actions</h2>
            <span className="label">{r.actions.length} pending</span>
          </div>
          <ul className="mt-3 space-y-2.5">
            {r.actions.length === 0 && <li className="card p-5 text-muted">No open items — the books agree with the supplier statement.</li>}
            {r.actions.map((a, i) => (
              <motion.li key={`${a.ref}-${i}`} initial={{ y: 8 }} animate={{ y: 0 }} transition={{ delay: 0.25 + i * 0.03, ease: EASE, duration: 0.5 }} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <span className={`inline-block rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS[a.issue]}`}>{a.issue}</span>
                    <h3 className="mt-2 font-mono text-[15px] font-semibold tracking-normal">{a.ref}</h3>
                  </div>
                  <span className="num font-mono text-sm">{rupees(a.amount)}</span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{a.action}</p>
                <p className="mt-2 text-[12px]"><span className="rounded-full bg-paper-2 px-2.5 py-0.5 font-mono uppercase tracking-wider text-muted">{a.status}</span></p>
              </motion.li>
            ))}
          </ul>
          {r.reviewNotes?.length > 0 && <Notes r={r} />}
        </motion.section>
      </div>

      <Recon r={r} />
      <Sources meta={meta} r={r} />
    </div>
  );
}

function Summary({ r }) {
  return (
    <motion.section {...rise(6)} className="card overflow-hidden">
      <h2 className="px-5 pt-5 text-lg font-medium">Summary</h2>
      <table className="mt-3 w-full text-sm">
        <tbody className="num divide-y divide-ink/6 border-t border-ink/8">
          {r.summary.map(([k, v]) => (
            <tr key={k}><td className="px-5 py-2.5 text-muted">{k}</td><td className="px-5 py-2.5 text-right font-mono">{typeof v === "number" ? (/INR|value/i.test(k) ? rupees(v) : v) : <span className="font-sans text-amber">{v}</span>}</td></tr>
          ))}
        </tbody>
      </table>
    </motion.section>
  );
}

/** Closing balances on both sides and how the open items explain the difference. */
function Balance({ r }) {
  const b = r.balance;
  const items = r.rows.filter((x) => x.status !== "Matched");
  const max = Math.max(...items.map((x) => Math.abs(x.effect)), 1);
  return (
    <motion.section {...rise(7)} className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">Balance check</h2>
        <span className="label">Books − statement</span>
      </div>
      <p className="mt-1 text-sm text-muted">Opening {rupees(b.opening)} from the vendor master, applied to both sides.</p>
      <table className="num mt-3 w-full text-[13px]">
        <thead><tr className="text-left"><th className="label py-1.5 font-medium" /><th className="label py-1.5 text-right font-medium">Books</th><th className="label py-1.5 text-right font-medium">Statement</th></tr></thead>
        <tbody className="divide-y divide-ink/6">
          {[["Debits", b.books.debits, b.statement.debits], ["Credits", b.books.credits, b.statement.credits], ["Closing balance", b.books.closing, b.statement.closing]].map(([l, x, y]) => (
            <tr key={l} className={l === "Closing balance" ? "font-medium" : ""}><td className="py-2 text-muted">{l}</td><td className="py-2 text-right font-mono">{rupees(x)}</td><td className="py-2 text-right font-mono">{rupees(y)}</td></tr>
          ))}
        </tbody>
      </table>
      <ul className="num mt-4 space-y-1.5 text-[13px]">
        {items.map((x, i) => (
          <li key={`${x.ref}-${i}`} className="grid grid-cols-[1fr_80px_86px] items-center gap-3">
            <span className="truncate font-mono text-[12px]" title={x.explanation}>{x.ref} <span className="font-sans text-muted">· {x.status.toLowerCase()}</span></span>
            <span className="relative h-2 rounded-full bg-ink/6">
              <motion.span className={`absolute inset-y-0 rounded-full ${x.effect >= 0 ? "left-1/2 bg-teal" : "right-1/2 bg-rose/70"}`}
                initial={{ width: 0 }} animate={{ width: `${(Math.abs(x.effect) / max) * 50}%` }} transition={{ delay: 0.3 + i * 0.05, duration: 0.7, ease: EASE }} />
            </span>
            <span className="text-right font-mono">{rupees(x.effect, { sign: true })}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 space-y-1 border-t border-ink/8 pt-3 text-sm">
        <Row l="Explained by open items" v={rupees(b.explained, { sign: true })} />
        <Row l="Closing difference" v={rupees(b.difference, { sign: true })} />
        <Row l="Unexplained" v={rupees(b.residual)} strong good={ok(b.residual)} />
      </div>
    </motion.section>
  );
}
const Row = ({ l, v, strong, good }) => (
  <div className={`flex justify-between ${strong ? "font-medium" : "text-muted"}`}>
    <span>{l}</span><span className={`num font-mono ${good === true ? "text-teal-ink" : good === false ? "text-rose" : ""}`}>{v}{good === true && " ✓"}</span>
  </div>
);

function Notes({ r }) {
  return (
    <div className="card mt-6 p-5">
      <h2 className="text-lg font-medium">Test scenarios vs result</h2>
      <p className="mt-1 text-sm text-muted">Each expected issue from the uploaded notes, next to what the reconciliation found.</p>
      <ul className="mt-4 space-y-3 text-sm">
        {r.reviewNotes.map((n, i) => (
          <li key={i} className="grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-3">
            <span className="h-fit w-fit rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[11px]">{n.id}</span>
            <span>
              <span className="text-muted">{n.text}</span>
              {n.found.length
                ? n.found.map((f) => <span key={f.ref} className="mt-1 flex items-start gap-1.5 text-[13px] text-teal-ink"><Icon name="check" className="mt-0.5 size-3.5 shrink-0" />{f.status} — {f.explanation}</span>)
                : <span className="mt-1 block font-mono text-[11px] text-amber">no matching reference in the files</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Recon({ r }) {
  const [tab, setTab] = useState("all");
  const [q, setQ] = useState("");
  const counts = r.rows.reduce((a, x) => ({ ...a, [x.status]: (a[x.status] || 0) + 1 }), {});
  const tabs = ["all", ...Object.keys(STATUS).filter((k) => counts[k])];
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return r.rows.filter((x) => (tab === "all" || x.status === tab)
      && (!n || `${x.ref} ${x.status} ${x.explanation} ${x.booksLine?.description || ""} ${x.statementLine?.description || ""}`.toLowerCase().includes(n)));
  }, [r.rows, tab, q]);

  return (
    <motion.section {...rise(9)} className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-lg font-medium">Reconciliation <span className="font-mono text-sm text-muted">{r.rows.length}</span></h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, description…" className="h-9 w-full rounded-full border border-ink/12 bg-white px-4 text-sm outline-none focus:border-teal sm:w-72" />
      </div>
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-ink/8 px-5">
        {tabs.map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`relative whitespace-nowrap px-3 pb-2.5 text-sm ${tab === k ? "text-ink" : "text-muted hover:text-ink"}`}>
            {k === "all" ? "All" : k} <span className="font-mono text-xs text-muted">{k === "all" ? r.rows.length : counts[k]}</span>
            {tab === k && <motion.span layoutId="recontab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-teal" />}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-[13px]">
          <thead><tr className="text-left">
            {["Reference", "Status", "Books", "Supplier statement", "Difference", "Explanation"].map((h, i) => <th key={h} className={`label px-4 py-3 font-medium ${i === 4 ? "text-right" : ""}`}>{h}</th>)}
          </tr></thead>
          <tbody className="num divide-y divide-ink/6">
            {rows.map((x, i) => (
              <tr key={`${x.ref}-${i}`} className="align-top hover:bg-paper-2/40">
                <td className="px-4 py-3 font-mono">{x.ref}<span className="block font-sans text-[11px] capitalize text-muted">{x.doc}</span></td>
                <td className="px-4 py-3"><span className={`whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${STATUS[x.status]}`}>{x.status}</span></td>
                <td className="px-4 py-3"><Side l={x.booksLine} /></td>
                <td className="px-4 py-3"><Side l={x.statementLine} /></td>
                <td className={`px-4 py-3 text-right font-mono ${ok(x.difference) ? "text-muted" : "text-rose"}`}>{rupees(x.difference)}</td>
                <td className="px-4 py-3">{x.explanation}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">No entries for this filter.</td></tr>}
          </tbody>
        </table>
      </div>
    </motion.section>
  );
}

function Side({ l }) {
  if (!l) return <span className="text-muted">—</span>;
  return (
    <div className="min-w-[150px]">
      <span className="font-mono">{rupees(l.amount)}</span> <span className="text-[11px] text-muted">{l.side || ""}</span>
      <span className="block text-[11.5px] text-muted">{shortDate(l.date)} · {l.description || "—"}</span>
    </div>
  );
}

function Sources({ meta, r }) {
  return (
    <motion.section {...rise(10)} className="card p-5">
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
      {r.vendor.otherVendors?.length > 0 && <p className="mt-3 text-sm text-amber">The books ledger also contains entries for vendor code(s) {r.vendor.otherVendors.join(", ")}. They were left out — this reconciliation covers {r.vendor.code} only.</p>}
    </motion.section>
  );
}
