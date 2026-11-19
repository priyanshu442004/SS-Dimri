import { Link } from "react-router";
import { motion } from "motion/react";
import { useApi } from "@shared/api";
import { PageHeader, Btn, Stat, Section, Badge, Steps, Empty, Loading, ErrorNote, Icon, rise } from "@shared/ui";
import { ago } from "@shared/format";
import { money, riskTone, statusTone } from "../lib";

export default function Overview() {
  const { data: cases, error, loading } = useApi("/cases");
  const { data: health } = useApi("/health");
  const done = cases?.filter((c) => c.result && Object.keys(c.result).length) || [];
  const high = cases?.filter((c) => c.risk_level === "High").length || 0;
  const exceptions = done.reduce((s, c) => s + (c.result?.metrics?.exceptions || 0), 0);
  const latest = done[0];

  return (
    <>
      <PageHeader eyebrow="GST Reconciliation" title="Annual GST returns, reconciled."
        actions={<><Btn to="/chat" variant="line" icon="ai">Ask AI</Btn><Btn to="/new" variant="lime" icon="plus">New case</Btn></>}>
        Upload the annual source package — registers, GSTR-1, GSTR-2B, GSTR-3B and ledgers. Books are matched against the portal, exceptions are explained, and GSTR-9 / 9C workings are generated for senior review.
      </PageHeader>

      {loading && <Loading />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {cases && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat i={0} label="Cases" value={cases.length} note={`${done.length} analysed`} />
            <Stat i={1} label="Open exceptions" value={exceptions} tone={exceptions ? "warn" : "good"} note="Across analysed cases" />
            <Stat i={2} label="High-risk cases" value={high} tone={high ? "bad" : "good"} note="Two or more red exceptions" />
            <Stat i={3} label="AI engine" value={health?.ai_configured ? "Ready" : "Local"} tone={health?.ai_configured ? "good" : "warn"} note={health ? `${health.provider} · ${health.model}` : "…"} />
          </div>

          {latest && (
            <motion.section {...rise(2)} className="relative overflow-hidden rounded-2xl bg-ink p-6 text-paper sm:p-7">
              <div className="grid-bg absolute inset-0 opacity-60" aria-hidden />
              <div className="relative flex flex-wrap items-start justify-between gap-6">
                <div className="min-w-0">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">Latest case · FY {latest.financial_year}</p>
                  <h2 className="mt-2 text-2xl font-medium">{latest.legal_name}</h2>
                  <p className="mt-1 font-mono text-[13px] text-mist">{latest.gstin} · updated {ago(latest.updated_at)}</p>
                </div>
                <div className="flex gap-2">
                  <Btn to={`/cases/${latest.id}`} variant="lime" icon="arrow">Open case</Btn>
                  <Btn to={`/chat/${latest.id}`} variant="line" icon="ai" className="!border-white/20 !bg-transparent !text-paper hover:!border-white/50">Ask AI</Btn>
                </div>
              </div>
              <div className="relative mt-6 grid gap-3 sm:grid-cols-4">
                {[["Turnover", money(latest.result.metrics?.annual_turnover)], ["Inward invoices", latest.result.metrics?.inward_records], ["Exceptions", latest.result.metrics?.exceptions], ["Risk", latest.risk_level]].map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-white/[0.05] p-3.5">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-mist">{k}</p>
                    <p className="mt-1.5 font-display text-xl">{v ?? "—"}</p>
                  </div>
                ))}
              </div>
            </motion.section>
          )}

          <Section title="Recent cases" i={3} aside={<Link to="/cases" className="text-sm text-muted hover:text-ink">View all →</Link>}>
            {!cases.length ? (
              <div className="p-5"><Empty icon="gst" title="No cases yet" action={<Btn to="/new" variant="lime" icon="plus">Create the first case</Btn>}>One case per GSTIN and financial year.</Empty></div>
            ) : (
              <ul className="mt-3 divide-y divide-ink/8">
                {cases.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link to={`/cases/${c.id}`} className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5 transition-colors hover:bg-paper-2/60">
                      <span className="grid size-9 place-items-center rounded-xl bg-paper-2 text-muted"><Icon name="gst" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{c.legal_name}</span>
                        <span className="block font-mono text-[12px] text-muted">{c.gstin} · FY {c.financial_year} · {c.file_count} files</span>
                      </span>
                      <Badge tone={riskTone(c.risk_level)}>{c.risk_level}</Badge>
                      <Badge tone={statusTone(c.status)} dot>{c.status}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Steps items={[
            ["Create a case", "One GSTIN and financial year per case."],
            ["Upload the package", "Outward & inward registers, GSTR-2B, GSTR-1/3B summaries, RCM working, ledgers."],
            ["Run the analysis", "AI maps each layout; Python matches books vs portal and calculates every figure."],
            ["Review & ask", "Clear exceptions, enter audited figures for 9C, download workings — and chat with the case."],
          ]} />
        </div>
      )}
    </>
  );
}
