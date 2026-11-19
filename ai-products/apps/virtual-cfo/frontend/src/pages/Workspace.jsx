import { useState } from "react";
import { NavLink, useParams } from "react-router";
import { motion } from "motion/react";
import { api, useApi, fileUrl } from "@shared/api";
import { Loading, ErrorNote, Btn, Empty, Badge, MailStatus, Section, rise, EASE } from "@shared/ui";
import { dateTime } from "@shared/format";
import Chat from "../components/Chat";
import { SLOTS } from "./NewAnalysis";

const STATUS_TONE = { Good: "good", Watch: "warn", Mixed: "warn", Low: "bad" };
const TABS = [["report", "Health report"], ["statements", "Statements & ratios"], ["documents", "Documents"], ["chat", "Ask AI"]];

export default function Workspace() {
  const { id, tab = "report" } = useParams();
  const { data, error, loading, reload } = useApi(`/runs/${id}`);
  const [resending, setResending] = useState(false);

  if (loading && !data) return <Loading label="Opening analysis…" />;
  if (error) return error.includes("not found")
    ? <Empty icon="history" title="Analysis not found" action={<Btn to="/runs" icon="back">All companies</Btn>}>It may have been removed from this server.</Empty>
    : <ErrorNote>{error}</ErrorNote>;

  const { meta, analysis: a, chat } = data;
  const m = a.model;
  const resend = async () => { setResending(true); try { await api(`/runs/${id}/email`, { method: "POST" }); await reload(); } finally { setResending(false); } };

  return (
    <>
      <motion.div {...rise()} className="flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4">
          <ScoreRing score={m.score} />
          <div>
            <p className="label">{a.fy} vs {a.pfy} · {a.periodEnd}</p>
            <h1 className="mt-1.5 text-[clamp(1.6rem,3vw,2.3rem)] font-medium leading-[1.05]">{a.company}</h1>
            <p className="mt-1 text-sm text-muted"><b className="text-ink">{m.verdictLead}</b> · analysed {dateTime(meta.createdAt)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MailStatus mail={meta.mail} onResend={resend} busy={resending} />
          <Btn href={fileUrl(`/runs/${id}/pdf?download=1`)} variant="line" icon="download">PDF report</Btn>
          <Btn href={fileUrl(`/runs/${id}/xlsx`)} icon="download">Excel</Btn>
        </div>
      </motion.div>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-ink/8" aria-label="Analysis sections">
        {TABS.map(([k, l]) => (
          <NavLink key={k} to={`/runs/${id}${k === "report" ? "" : `/${k}`}`} end className={`relative whitespace-nowrap px-3.5 pb-3 pt-1 text-[14.5px] ${tab === k ? "text-ink" : "text-muted hover:text-ink"}`}>
            {l}{tab === k && <motion.span layoutId="ws-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-teal" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6">
        {tab === "chat" && (
          <div className="grid gap-5 xl:grid-cols-[1fr_300px]">
            <Chat id={id} initial={chat} company={a.company} />
            <aside className="hidden space-y-3 xl:block">
              {m.kpis.map((k) => (
                <div key={k.label} className="card px-4 py-3">
                  <p className="label">{k.label}</p>
                  <p className="num mt-1 font-display text-xl">{k.value}</p>
                  <p className={`text-[12.5px] ${k.subTone === "good" ? "text-teal-ink" : k.subTone === "bad" ? "text-rose" : "text-muted"}`}>{k.sub}</p>
                </div>
              ))}
            </aside>
          </div>
        )}
        {tab === "report" && <Report m={m} id={id} />}
        {tab === "statements" && <Statements a={a} />}
        {tab === "documents" && <Documents id={id} files={meta.files} />}
      </div>
    </>
  );
}

function ScoreRing({ score }) {
  const r = 30, c = 2 * Math.PI * r;
  return (
    <div className="relative grid size-[76px] shrink-0 place-items-center rounded-2xl bg-ink">
      <svg viewBox="0 0 76 76" className="absolute inset-0 -rotate-90">
        <circle cx="38" cy="38" r={r} fill="none" stroke="#5d79ca" strokeOpacity=".35" strokeWidth="5" />
        <motion.circle cx="38" cy="38" r={r} fill="none" stroke="#b5d661" strokeWidth="5" strokeLinecap="round" strokeDasharray={c}
          initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 100) }} transition={{ duration: 1.2, ease: EASE }} />
      </svg>
      <span className="relative text-center leading-none text-paper"><span className="font-display text-xl">{score}</span><span className="block font-mono text-[9px] text-mist">/100</span></span>
    </div>
  );
}

function Report({ m, id }) {
  return (
    <div className="space-y-6">
      <motion.p {...rise()} className="rounded-2xl border-l-4 border-amber bg-amber-soft/60 px-5 py-4 text-[15px] leading-relaxed"><b>{m.verdictLead}</b> {m.verdictText}</motion.p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {m.kpis.map((k, i) => (
          <motion.div {...rise(i)} key={k.label} className={`card border-t-2 p-5 ${k.bar === "bad" ? "border-t-rose" : "border-t-teal-ink"}`}>
            <p className="label">{k.label}</p><p className="num mt-2 font-display text-[1.7rem] leading-none">{k.value}</p>
            <p className={`mt-2 text-[13px] ${k.subTone === "good" ? "text-teal-ink" : k.subTone === "bad" ? "text-rose" : "text-muted"}`}>{k.sub}</p>
          </motion.div>
        ))}
      </div>
      <Section title="Six-dimension scorecard" className="overflow-hidden" i={3}>
        <div className="overflow-x-auto"><table className="mt-3 w-full min-w-[720px] text-[13.5px]">
          <thead><tr className="border-y border-ink/8 bg-paper-2/50 text-left">{["Dimension", "Status", "Key metrics", "Takeaway"].map((h) => <th key={h} className="label px-4 py-2.5 font-medium">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-ink/6">{m.scorecard.map((r) => (
            <tr key={r.dimension}><td className="px-4 py-3 font-medium">{r.dimension}</td><td className="px-4 py-3"><Badge tone={STATUS_TONE[r.status]} dot>{r.status}</Badge></td><td className="num px-4 py-3">{r.metrics}</td><td className="px-4 py-3 text-muted">{r.takeaway}</td></tr>
          ))}</tbody>
        </table></div>
      </Section>
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="What's working" i={4}><ul className="space-y-2 p-5 text-sm">{m.working.map((w) => <li key={w} className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal" />{w}</li>)}</ul></Section>
        <Section title="Key risks" i={5}><ul className="space-y-2 p-5 text-sm">{m.risks.map((r) => <li key={r.lead}><b className="font-medium">{r.lead}</b> {r.text}</li>)}</ul></Section>
        <Section title="Recommended actions" i={6}><ol className="space-y-2 p-5 text-sm">{m.actions.map((r, i) => <li key={r.lead} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-ink font-mono text-[11px] text-paper">{i + 1}</span><span><b className="font-medium">{r.lead}</b> {r.text}</span></li>)}</ol></Section>
      </div>
      <Section title="Report PDF" i={7} aside={<Btn href={fileUrl(`/runs/${id}/pdf?download=1`)} variant="line" icon="download">Download</Btn>}>
        <iframe title="Financial Health Summary" src={fileUrl(`/runs/${id}/pdf`)} className="mt-4 h-[80vh] w-full border-t border-ink/8" />
      </Section>
    </div>
  );
}

const LABEL = (k) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
const fmt = (v) => (v == null ? "—" : Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const UNIT = { thousands: "₹ '000", lakhs: "₹ lakh", crores: "₹ crore", millions: "₹ million", rupees: "₹" };

function Statements({ a }) {
  const st = a.statements;
  return (
    <div className="space-y-6">
      <Section title="Ratios" className="overflow-hidden" aside={<span className="label">Ratio note first · computed otherwise</span>}>
        <table className="mt-3 w-full text-[13.5px]"><thead><tr className="border-y border-ink/8 bg-paper-2/50 text-left">{["Ratio", a.fy, a.pfy, "Variance", "Source"].map((h, i) => <th key={h} className={`label px-4 py-2.5 font-medium ${i && i < 4 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody className="num divide-y divide-ink/6">{Object.entries(a.ratios).map(([k, r]) => (
            <tr key={k}><td className="px-4 py-2.5">{LABEL(k)}</td><td className="px-4 py-2.5 text-right font-mono">{fmt(r.c)}</td><td className="px-4 py-2.5 text-right font-mono">{fmt(r.p)}</td>
              <td className={`px-4 py-2.5 text-right font-mono ${r.variance > 0 ? "text-teal-ink" : r.variance < 0 ? "text-rose" : ""}`}>{r.variance == null ? "—" : `${r.variance > 0 ? "+" : ""}${r.variance.toFixed(2)}%`}</td>
              <td className="px-4 py-2.5"><Badge tone={r.source === "ratio note" ? "good" : "neutral"}>{r.source}</Badge></td></tr>
          ))}</tbody></table>
      </Section>
      <div className="grid gap-6 lg:grid-cols-3">
        {[["Balance Sheet", st.balanceSheet], ["Profit & Loss", st.profitLoss], ["Cash Flow", st.cashFlow]].map(([t, s]) => (
          <Section key={t} title={t} className="overflow-hidden" aside={<span className="label">{UNIT[st.unit]}</span>}>
            <table className="mt-3 w-full text-[13px]"><thead><tr className="border-y border-ink/8 bg-paper-2/50 text-left"><th className="label px-4 py-2 font-medium">Line item</th><th className="label px-3 py-2 text-right font-medium">{a.fy}</th><th className="label px-4 py-2 text-right font-medium">{a.pfy}</th></tr></thead>
              <tbody className="num divide-y divide-ink/6">{Object.keys({ ...s.c, ...s.p }).filter((k) => s.c[k] != null || s.p[k] != null).map((k) => (
                <tr key={k}><td className="px-4 py-2">{LABEL(k)}</td><td className="px-3 py-2 text-right font-mono">{fmt(s.c[k] ?? 0)}</td><td className="px-4 py-2 text-right font-mono text-muted">{fmt(s.p[k] ?? 0)}</td></tr>
              ))}</tbody></table>
          </Section>
        ))}
      </div>
      {a.notes?.length > 0 && <Section title="Data checks"><ul className="space-y-1.5 p-5 text-sm text-muted">{a.notes.map((n) => <li key={n}>• {n}</li>)}</ul></Section>}
    </div>
  );
}

function Documents({ id, files }) {
  const [slot, setSlot] = useState("balanceSheet");
  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <ul className="space-y-1.5">{SLOTS.map((s, i) => (
        <li key={s.key}><button onClick={() => setSlot(s.key)} className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${slot === s.key ? "border-ink bg-ink text-paper" : "border-ink/10 bg-white/60 hover:border-ink/30"}`}>
          <span className={`font-mono text-[11px] ${slot === s.key ? "text-mist" : "text-muted"}`}>0{i + 1}</span>
          <span className="block font-medium">{s.title}</span><span className={`block truncate font-mono text-[11px] ${slot === s.key ? "text-mist" : "text-muted"}`}>{files?.[s.key]}</span>
        </button></li>
      ))}</ul>
      <iframe key={slot} title={slot} src={fileUrl(`/runs/${id}/docs/${slot}`)} className="h-[78vh] w-full rounded-2xl border border-ink/8 bg-white" />
    </div>
  );
}
