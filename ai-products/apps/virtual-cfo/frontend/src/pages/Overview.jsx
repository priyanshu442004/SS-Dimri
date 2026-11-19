import { Link } from "react-router";
import { motion } from "motion/react";
import { useApi } from "@shared/api";
import { Btn, Stat, Steps, Badge, Icon, rise, EASE } from "@shared/ui";
import { ago } from "@shared/format";
import { riskTone } from "./History";

export default function Overview() {
  const { data } = useApi("/runs");
  const runs = data?.runs || [];
  const avg = runs.length ? Math.round(runs.reduce((s, r) => s + r.score, 0) / runs.length) : null;
  const atRisk = runs.filter((r) => r.score < 50).length;

  return (
    <>
      <motion.section {...rise()} className="relative overflow-hidden rounded-3xl bg-ink px-6 py-10 text-paper sm:px-10 sm:py-14">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="relative grid gap-10 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">Financial Statement Analysis · CFO Intelligence</p>
            <h1 className="mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] font-medium leading-[1.02]">A CFO who has read <span className="text-lime">every line</span> of your statements.</h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-mist">
              Upload the Balance Sheet, P&L, Cash Flow and Ratio Analysis. Get a scored financial health report in your inbox, then ask follow-up
              questions — answered from your own numbers.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Btn to="/new" variant="lime" icon="plus" className="h-12 px-6">New analysis</Btn>
              <Btn to="/help" variant="ghost" className="h-12 px-5 !text-mist hover:!bg-white/5 hover:!text-paper">What it needs</Btn>
            </div>
          </div>
          <ChatVisual />
        </div>
      </motion.section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat i={1} label="Companies analysed" value={runs.length} note={runs[0] ? `Last ${ago(runs[0].createdAt)}` : "None yet"} />
        <Stat i={2} label="Average health score" value={avg ?? "No runs yet"} bar={avg ?? 0} note="Out of 100" />
        <Stat i={3} label="High risk" value={atRisk} tone={atRisk ? "bad" : "good"} note="Score below 50" />
        <Stat i={4} label="Reports emailed" value={runs.filter((r) => r.mail?.status === "sent").length} note="To the finance team" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <motion.section {...rise(5)} className="card lg:col-span-7">
          <div className="flex items-baseline justify-between px-5 pt-5"><h2 className="text-lg font-medium">Recent analyses</h2><Link to="/runs" className="text-sm text-teal-ink hover:underline">View all</Link></div>
          <ul className="mt-3 divide-y divide-ink/6">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id}><Link to={`/runs/${r.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-paper-2/40">
                <span className="min-w-0"><span className="block truncate font-medium">{r.company}</span><span className="font-mono text-[11px] text-muted">{r.fy} vs {r.pfy} · {ago(r.createdAt)}</span></span>
                <span className="flex shrink-0 items-center gap-3"><span className="num font-display text-xl">{r.score}</span><Badge tone={riskTone(r.score)}>{r.risk}</Badge></span>
              </Link></li>
            ))}
            {!runs.length && <li className="px-5 py-10 text-center text-sm text-muted">No analyses yet — <Link to="/new" className="text-teal-ink underline">upload statements</Link>.</li>}
          </ul>
        </motion.section>
        <motion.section {...rise(6)} className="card p-5 lg:col-span-5">
          <h2 className="text-lg font-medium">Six dimensions, one score</h2>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {["Liquidity", "Profitability", "Leverage & solvency", "Operational efficiency", "Cash flow health", "Growth & capital"].map((d) => (
              <li key={d} className="flex items-center gap-2 rounded-xl bg-paper-2/60 px-3 py-2.5"><Icon name="check" className="size-4 text-teal-ink" />{d}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">Each is rated Good, Watch, Mixed or Low from the statements and the ratio note; together they give the health score.</p>
        </motion.section>
      </div>
      <div className="mt-6"><Steps items={[["Upload", "Four PDFs: Balance Sheet, P&L, Cash Flow, Ratio Analysis."], ["Analyse", "Line items extracted by DeepSeek; every ratio and score computed by code."], ["Report", "Two-page Financial Health Summary, emailed to the finance team."], ["Ask", "Chat with your CFO — answers cite the statement they come from."]]} /></div>
    </>
  );
}

function ChatVisual() {
  return (
    <div className="relative hidden space-y-3 lg:col-span-5 lg:block" aria-hidden>
      <motion.p initial={{ y: 10 }} animate={{ y: 0 }} transition={{ delay: 0.4, ease: EASE }} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-paper px-4 py-2.5 text-sm text-ink">Why did profit grow while revenue was flat?</motion.p>
      <motion.div initial={{ y: 10 }} animate={{ y: 0 }} transition={{ delay: 0.9, ease: EASE }} className="max-w-[92%] rounded-2xl rounded-bl-md border border-white/10 bg-white/5 px-4 py-3 text-sm text-paper">
        <p>Mainly <b className="text-lime">lower material costs</b> — 42.6% of revenue vs 54.4% (P&L).</p>
        <ul className="mt-2 space-y-1 text-mist"><li>• Net profit +137.6% on +0.02% revenue</li><li>• Partly offset by finance cost +36.5%</li></ul>
      </motion.div>
    </div>
  );
}
