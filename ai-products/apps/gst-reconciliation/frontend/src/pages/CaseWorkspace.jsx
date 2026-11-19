import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router";
import { motion } from "motion/react";
import { useApi } from "@shared/api";
import { Btn, Stat, Section, Badge, Empty, Loading, ErrorNote, Icon, EASE } from "@shared/ui";
import { DocChat } from "@shared/Chat";
import { kb, shortDate } from "@shared/format";
import { gst, money, reportUrl, riskTone, statusTone, label, ROLE } from "../lib";

const TABS = [["documents", "Documents"], ["reconciliation", "Reconciliation"], ["gstr9", "GSTR-9"], ["gstr9c", "GSTR-9C"], ["exceptions", "Exceptions"], ["reports", "Reports"], ["chat", "Ask AI"]];

export default function CaseWorkspace() {
  const { id, tab = "documents" } = useParams();
  const { data, error, loading, reload } = useApi(`/cases/${id}`);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(null);
  const navigate = useNavigate();

  if (loading && !data) return <Loading label="Loading case…" />;
  if (error) return <Empty icon="gst" title="Case not found" action={<Btn to="/cases" icon="back">All cases</Btn>}>{error}</Empty>;
  const c = data, r = c.result && Object.keys(c.result).length ? c.result : null, m = r?.metrics;

  const run = async () => {
    setBusy("run"); setNote(null);
    try { await gst(`/cases/${id}/run`, { method: "POST" }); await reload(); setNote({ ok: true, text: "Analysis complete — reconciliation, workings and reports are up to date." }); if (tab === "documents") navigate(`/cases/${id}/reconciliation`); }
    catch (e) { setNote({ ok: false, text: e.message }); await reload(); }
    finally { setBusy(""); }
  };

  return (
    <>
      <div className="mb-5"><Btn to="/cases" variant="ghost" icon="back" className="-ml-3">All cases</Btn></div>
      <motion.header initial={{ y: 12 }} animate={{ y: 0 }} transition={{ duration: 0.6, ease: EASE }} className="mb-6 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone(c.status)} dot>{c.status}</Badge>{r && <Badge tone={riskTone(c.risk_level)}>{c.risk_level} risk</Badge>}<span className="label">FY {c.financial_year}</span></div>
          <h1 className="mt-3 text-[clamp(1.7rem,3.2vw,2.5rem)] font-medium leading-[1.05]">{c.legal_name}</h1>
          <p className="mt-1 font-mono text-[13px] text-muted">{c.gstin}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn to={`/cases/${id}/chat`} variant="lime" icon="ai">Ask AI</Btn>
          <Btn onClick={run} disabled={!!busy || !c.files?.length} icon="arrow">{busy === "run" ? "Running analysis…" : r ? "Re-run analysis" : "Run analysis"}</Btn>
        </div>
      </motion.header>

      {busy === "run" && <div className="mb-5 h-1 overflow-hidden rounded-full bg-ink/8"><div className="shimmer h-full w-full" /></div>}
      {note && <div role="status" className={`mb-5 rounded-xl px-4 py-3 text-sm ${note.ok ? "bg-teal/12 text-teal-ink" : "bg-rose-soft text-rose"}`}>{note.text}</div>}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat i={0} label="Documents" value={c.files?.length || 0} note="Uploaded source package" />
        <Stat i={1} label="Annual turnover" value={money(m?.annual_turnover)} note="Taxable outward supplies" />
        <Stat i={2} label="Exceptions" value={m?.exceptions ?? "—"} tone={m ? (m.exceptions ? "warn" : "good") : undefined} note="Pending decisions" />
        <Stat i={3} label="Risk" value={r ? c.risk_level : "Not assessed"} tone={r ? riskTone(c.risk_level) : undefined} note="Deterministic thresholds" />
      </div>

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-ink/8" aria-label="Case sections">
        {TABS.map(([k, l]) => (
          <NavLink key={k} to={`/cases/${id}/${k}`} className={`relative whitespace-nowrap px-3.5 pb-3 pt-1 text-[14.5px] ${tab === k ? "text-ink" : "text-muted hover:text-ink"}`}>
            {l}{tab === k && <motion.span layoutId="case-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-teal" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          </NavLink>
        ))}
      </nav>

      {tab === "documents" && <Documents c={c} reload={reload} />}
      {tab === "reconciliation" && (r ? <Reconciliation r={r} /> : <NotRun />)}
      {tab === "gstr9" && (r ? <Gstr9 g={r.gstr9} /> : <NotRun />)}
      {tab === "gstr9c" && <Gstr9c c={c} r={r} reload={reload} />}
      {tab === "exceptions" && (r ? <Exceptions items={r.exceptions} /> : <NotRun />)}
      {tab === "reports" && (r ? <Reports id={id} names={r.reports || []} /> : <NotRun />)}
      {tab === "chat" && (c.files?.length
        ? <DocChat id={id} scope={`${c.legal_name} · FY ${c.financial_year}`} icon="gst" placeholder="Ask about ITC, GSTR-2B differences, GSTR-9 tables, a supplier…" />
        : <Empty icon="ai" title="Upload documents first">The assistant answers from this case's documents and results.</Empty>)}
    </>
  );
}

const NotRun = () => <Empty icon="gst" title="Analysis has not run yet">Upload the source package on the Documents tab, then choose <b>Run analysis</b>.</Empty>;

// ------------------------------------------------------------------ documents
function Documents({ c, reload }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const upload = async (list) => {
    if (!list.length) return;
    setBusy(true); setErr("");
    try { const fd = new FormData(); [...list].forEach((f) => fd.append("files", f)); await gst(`/cases/${c.id}/files`, { method: "POST", body: fd }); await reload(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (fid) => { await gst(`/cases/${c.id}/files/${fid}`, { method: "DELETE" }).catch((e) => setErr(e.message)); reload(); };

  return (
    <Section title="Source package" aside={<Btn onClick={() => input.current?.click()} icon="upload" disabled={busy}>{busy ? "Uploading…" : "Add files"}</Btn>}>
      <input ref={input} type="file" multiple accept=".xlsx,.xlsm,.csv,.pdf" hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      {err && <div className="px-5 pt-4"><ErrorNote>{err}</ErrorNote></div>}
      {!c.files?.length ? (
        <div className="p-5"><Empty icon="upload" title="No documents yet" action={<Btn onClick={() => input.current?.click()} variant="lime" icon="upload">Select files</Btn>}>Excel, CSV and text-based PDF files. Unknown layouts are mapped by AI.</Empty></div>
      ) : (
        <ul className="mt-3 divide-y divide-ink/8">
          {c.files.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
              <span className={`grid size-9 place-items-center rounded-xl ${f.original_name.toLowerCase().endsWith(".pdf") ? "bg-rose-soft text-rose" : "bg-teal/12 text-teal-ink"}`}><Icon name="file" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium">{f.original_name}</span>
                <span className="block text-[12.5px] text-muted">{ROLE[f.role] || label(f.role)} · {kb(f.size)}</span>
              </span>
              <span className="hidden w-28 sm:block" title="AI mapping confidence">
                <span className="block h-1.5 overflow-hidden rounded-full bg-ink/8"><span className="block h-full rounded-full bg-teal" style={{ width: `${Math.round((f.confidence || 0) * 100)}%` }} /></span>
                <span className="mt-1 block text-right font-mono text-[10.5px] text-muted">{Math.round((f.confidence || 0) * 100)}% mapped</span>
              </span>
              <Badge tone={statusTone(f.status)}>{f.status}</Badge>
              <button onClick={() => remove(f.id)} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-rose-soft hover:text-rose" aria-label={`Remove ${f.original_name}`}><Icon name="x" className="size-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// ------------------------------------------------------------------ reconciliation
function Bar({ label: l, value = 0, max = 1, tone }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="text-muted">{l}</span><span className="num font-medium">{value}</span></div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink/8">
        <motion.div className={`h-full rounded-full ${tone}`} initial={{ width: 0 }} animate={{ width: `${Math.max(2, Math.min(100, (value / max) * 100))}%` }} transition={{ duration: 0.9, ease: EASE }} />
      </div>
    </div>
  );
}

function LineTable({ rows, diff }) {
  if (!rows?.length) return <p className="px-5 pb-5 text-sm text-muted">None.</p>;
  return (
    <div className="overflow-x-auto px-5 pb-5">
      <table className="w-full min-w-[640px] text-[13.5px]">
        <thead><tr className="border-b border-ink/10 text-left text-muted">
          <th className="py-2 pr-3 font-medium">Supplier</th><th className="py-2 pr-3 font-medium">Invoice</th><th className="py-2 pr-3 font-medium">Date</th>
          <th className="py-2 pr-3 text-right font-medium">Taxable</th>{diff ? <><th className="py-2 pr-3 text-right font-medium">Books tax</th><th className="py-2 pr-3 text-right font-medium">2B tax</th><th className="py-2 text-right font-medium">Difference</th></> : <th className="py-2 text-right font-medium">Tax (ITC)</th>}
        </tr></thead>
        <tbody>
          {rows.map((x, i) => (
            <tr key={i} className="border-b border-ink/6 last:border-0">
              <td className="py-2 pr-3"><span className="block">{x.party}</span><span className="font-mono text-[11.5px] text-muted">{x.gstin}</span></td>
              <td className="py-2 pr-3 font-mono text-[12.5px]">{x.invoice_number}</td>
              <td className="py-2 pr-3 whitespace-nowrap">{shortDate(x.invoice_date)}</td>
              <td className="num py-2 pr-3 text-right">{money(x.taxable_value)}</td>
              {diff ? <><td className="num py-2 pr-3 text-right">{money(x.books_tax)}</td><td className="num py-2 pr-3 text-right">{money(x.gstr2b_tax)}</td><td className="num py-2 text-right font-medium text-amber">{money(x.difference)}</td></>
                : <td className="num py-2 text-right font-medium">{money(x.tax)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Reconciliation({ r }) {
  const rec = r.reconciliation || {}, inw = rec.inward || {}, out = rec.outward?.totals || {}, d = inw.details || {};
  const max = Math.max(inw.book_records || 1, inw.portal_records || 1);
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Outward · books vs GSTR-1 / 3B" i={0} aside={<span className="label">{rec.outward?.records || 0} records</span>}>
          <dl className="space-y-2.5 p-5 text-sm">
            {[["Taxable value", out.taxable_value], ["IGST", out.igst], ["CGST", out.cgst], ["SGST", out.sgst], ["Invoice value", out.invoice_value]].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-ink/6 pb-2 last:border-0"><dt className="text-muted">{k}</dt><dd className="num font-medium">{money(v)}</dd></div>
            ))}
          </dl>
        </Section>
        <Section title="Inward ITC · books vs GSTR-2B" i={1} aside={<span className="label">{inw.matched || 0} exact matches</span>}>
          <div className="space-y-3.5 p-5">
            <Bar label="Matched" value={inw.matched} max={max} tone="bg-teal" />
            <Bar label={`In books, not in 2B · ${money(inw.books_only_itc)}`} value={inw.books_only} max={max} tone="bg-rose" />
            <Bar label={`In 2B, not in books · ${money(inw.portal_only_itc)}`} value={inw.portal_only} max={max} tone="bg-amber" />
            <Bar label={`Tax mismatch · ${money(inw.mismatch_itc)}`} value={inw.amount_mismatches} max={max} tone="bg-amber" />
          </div>
        </Section>
      </div>
      <Section title="Invoices in books but missing from GSTR-2B" i={2} aside={<Badge tone={d.books_only?.length ? "bad" : "good"}>{d.books_only?.length || 0}</Badge>}><div className="mt-3"><LineTable rows={d.books_only} /></div></Section>
      <Section title="Invoices in GSTR-2B but not in books" i={3} aside={<Badge tone={d.portal_only?.length ? "warn" : "good"}>{d.portal_only?.length || 0}</Badge>}><div className="mt-3"><LineTable rows={d.portal_only} /></div></Section>
      <Section title="Matched invoices with tax differences" i={4} aside={<Badge tone={d.mismatches?.length ? "warn" : "good"}>{d.mismatches?.length || 0}</Badge>}><div className="mt-3"><LineTable rows={d.mismatches} diff /></div></Section>
      <Section title="Source controls" i={5}>
        <ul className="mt-3 divide-y divide-ink/8">
          {(r.validation || []).map((v, i) => (
            <li key={i} className="flex items-start gap-3 px-5 py-3 text-sm">
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${v.level === "passed" ? "bg-teal/12 text-teal-ink" : v.level === "error" ? "bg-rose-soft text-rose" : "bg-amber-soft text-amber"}`}><Icon name={v.level === "passed" ? "check" : "x"} className="size-3.5" /></span>
              <span><span className="font-medium">{v.file}</span><span className="block text-muted">{v.message}</span></span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ GSTR-9
function Gstr9({ g }) {
  if (!g?.available) return <Empty icon="gst" title="GSTR-9 working not available">Upload the registers (or the portal GSTR-9 workbook) and re-run the analysis.</Empty>;
  return (
    <div className="space-y-5">
      {Object.entries(g.tables || {}).map(([sheet, rows], i) => (
        <Section key={sheet} title={`Table ${sheet}`} i={Math.min(i, 6)}>
          <div className="overflow-x-auto p-5 pt-3">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead><tr className="border-b border-ink/10 text-left text-muted"><th className="w-10 py-2 font-medium">Pt</th><th className="py-2 font-medium">Description</th><th className="py-2 text-right font-medium" colSpan={5}>Amounts (₹)</th></tr></thead>
              <tbody>
                {rows.map((row, k) => (
                  <tr key={k} className="border-b border-ink/6 align-top last:border-0">
                    <td className="py-2 font-mono text-muted">{row.code}</td>
                    <td className="py-2 pr-4">{row.label}{row.source && /DATA NEEDED/.test(row.source) && <span className="ml-2"><Badge tone="warn">Data needed</Badge></span>}</td>
                    {(row.values || []).map((v, j) => <td key={j} className="num whitespace-nowrap py-2 pl-3 text-right">{v == null ? "—" : money(v)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ GSTR-9C
const NUM_FIELDS = [["audited_turnover", "Audited turnover"], ["book_itc", "ITC as per audited books"], ["trade_discount_adjustment", "Trade discount adjustment"], ["opening_unbilled_revenue", "Opening unbilled revenue"], ["closing_unbilled_revenue", "Closing unbilled revenue"], ["opening_unadjusted_advances", "Opening unadjusted advances"], ["closing_unadjusted_advances", "Closing unadjusted advances"], ["exempt_nil_non_gst_turnover", "Exempt / nil / non-GST turnover"], ["zero_rated_without_tax", "Zero-rated without tax"], ["recipient_rcm_turnover", "Recipient-paid RCM turnover"], ["prior_year_itc_claimed", "Earlier-year ITC claimed"], ["current_year_itc_claimed_later", "Current-year ITC claimed later"], ["other_turnover_adjustment", "Other turnover adjustment"]];
const TEXT_FIELDS = [["trade_name", "Trade name"], ["arn", "GSTR-9 ARN"], ["filing_date", "GSTR-9 filing date"], ["gstr9c_arn", "GSTR-9C ARN"], ["gstr9c_arn_date", "GSTR-9C ARN date"], ["signatory_name", "Authorised signatory"], ["signatory_designation", "Designation / status"], ["audited_under_act", "Audited under Act"]];

function Gstr9c({ c, r, reload }) {
  const [f, setF] = useState(() => ({ audited_under_act: "Companies Act", ...Object.fromEntries([...NUM_FIELDS, ...TEXT_FIELDS].map(([k]) => [k, ""])), ...Object.fromEntries(Object.entries(c.financial_inputs || {}).map(([k, v]) => [k, v ?? ""])) }));
  const [state, setState] = useState("");
  useEffect(() => { setState(""); }, [c.id]);
  const save = async (e) => {
    e.preventDefault(); setState("saving");
    const text = new Set(TEXT_FIELDS.map(([k]) => k));
    const body = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, text.has(k) ? String(v) : v === "" || v == null ? (k === "audited_turnover" || k === "book_itc" ? null : 0) : Number(v)]));
    try { await gst(`/cases/${c.id}/financial-inputs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); await reload(); setState("saved"); }
    catch (err) { setState(err.message); }
  };
  const g = r?.gstr9c;
  const input = "mt-1 h-10 w-full rounded-lg border border-ink/12 bg-white px-3 text-[14px] outline-none focus:border-teal";
  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <Section title="Audited figures & form details" i={0}>
        <form onSubmit={save} className="p-5">
          <p className="rounded-xl bg-amber-soft px-4 py-3 text-[13.5px] text-amber">These values need audited evidence and human approval — AI never fills them. Save, then re-run the analysis to refresh GSTR-9C.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {NUM_FIELDS.map(([k, l]) => <label key={k} className="text-[13px] text-muted">{l}<input type="number" step="0.01" className={`${input} num text-ink`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder="0.00" /></label>)}
          </div>
          <div className="mt-4 grid gap-3 border-t border-ink/8 pt-4 sm:grid-cols-2">
            {TEXT_FIELDS.map(([k, l]) => <label key={k} className="text-[13px] text-muted">{l}<input className={`${input} text-ink`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <Btn type="submit" icon="check" disabled={state === "saving"}>{state === "saving" ? "Saving…" : "Save inputs"}</Btn>
            {state === "saved" && <span className="text-sm text-teal-ink">Saved. Re-run the analysis to update GSTR-9C.</span>}
            {state && !["saving", "saved"].includes(state) && <span className="text-sm text-rose">{state}</span>}
          </div>
        </form>
      </Section>
      <Section title="GSTR-9C position" i={1} aside={g && <Badge tone={g.status === "DATA NEEDED" ? "warn" : "good"}>{g.status}</Badge>}>
        {!g || g.status === "DATA NEEDED" ? (
          <div className="p-5"><Empty icon="gst" title="Audited inputs required">{g?.message || "Run the analysis, then enter audited turnover and book ITC."}</Empty></div>
        ) : (
          <div className="space-y-4 p-5">
            {[["Table 5 · Turnover", g.table_5], ["Table 7 · Taxable turnover", g.table_7], ["Table 12 · ITC", g.table_12]].map(([t, vals]) => (
              <div key={t} className="rounded-xl border border-ink/8 bg-white p-4">
                <p className="label">{t}</p>
                <dl className="mt-2 space-y-1.5 text-sm">{Object.entries(vals || {}).map(([k, v]) => <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{label(k)}</dt><dd className={`num ${/unreconciled/.test(k) && Math.abs(v) > 1 ? "font-medium text-amber" : ""}`}>{money(v)}</dd></div>)}</dl>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

// ------------------------------------------------------------------ exceptions
function Exceptions({ items }) {
  if (!items?.length) return <Empty icon="check" title="No open exceptions">All current controls passed.</Empty>;
  return (
    <div className="space-y-3">
      {items.map((x, i) => (
        <motion.article key={x.id} initial={{ y: 10 }} animate={{ y: 0 }} transition={{ delay: i * 0.05, duration: 0.5, ease: EASE }} className="card flex flex-wrap gap-4 p-5">
          <span className={`mt-1 size-2.5 shrink-0 rounded-full ${x.severity === "red" ? "bg-rose" : x.severity === "amber" ? "bg-amber" : "bg-teal"}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2"><h3 className="text-[17px] font-medium">{x.title}</h3><Badge tone={x.severity === "red" ? "bad" : "warn"}>{x.count} item{x.count === 1 ? "" : "s"}</Badge></div>
            <p className="mt-1.5 text-[14.5px] leading-relaxed">{x.explanation?.summary || x.recommended_action}</p>
            <p className="mt-2 text-[13.5px] text-muted"><b className="font-medium text-ink">Action:</b> {x.explanation?.action || x.recommended_action}</p>
            {(x.explanation?.evidence_needed || x.evidence_needed) && <p className="mt-1 text-[13.5px] text-muted"><b className="font-medium text-ink">Evidence:</b> {x.explanation?.evidence_needed || x.evidence_needed}</p>}
          </div>
          <p className="num font-display text-xl">{money(x.amount)}</p>
        </motion.article>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ reports
function Reports({ id, names }) {
  if (!names.length) return <Empty icon="download" title="No reports yet">Run the analysis to generate the working papers.</Empty>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {names.map((n) => {
        const kind = n.split(".").pop();
        return (
          <a key={n} href={reportUrl(id, n)} className="card group flex items-center gap-4 p-4 transition-colors hover:border-teal/50">
            <span className={`grid size-11 place-items-center rounded-xl font-mono text-[11px] uppercase ${kind === "pdf" ? "bg-rose-soft text-rose" : kind === "xlsx" ? "bg-teal/12 text-teal-ink" : "bg-paper-2 text-muted"}`}>{kind}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{n.replaceAll("_", " ").replace(/\.\w+$/, "")}</span><span className="block text-[12.5px] text-muted">{kind === "json" ? "Field-level structured data" : "Draft working paper for senior review"}</span></span>
            <Icon name="download" className="size-5 text-muted group-hover:text-ink" />
          </a>
        );
      })}
    </div>
  );
}
