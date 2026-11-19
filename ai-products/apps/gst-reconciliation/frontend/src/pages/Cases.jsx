import { Link } from "react-router";
import { motion } from "motion/react";
import { useApi } from "@shared/api";
import { PageHeader, Btn, Badge, Empty, Loading, ErrorNote, Icon, EASE } from "@shared/ui";
import { dateTime } from "@shared/format";
import { money, riskTone, statusTone } from "../lib";

export default function Cases() {
  const { data, error, loading } = useApi("/cases");
  return (
    <>
      <PageHeader eyebrow="Cases" title="All cases" actions={<Btn to="/new" variant="lime" icon="plus">New case</Btn>}>
        One workspace per GSTIN and financial year, with its documents, reconciliation, return workings and chat.
      </PageHeader>
      {loading && <Loading />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && !data.length && <Empty icon="gst" title="No cases yet" action={<Btn to="/new" variant="lime" icon="plus">New case</Btn>}>Create a case and upload the annual source package.</Empty>}
      {data?.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((c, i) => {
            const m = c.result?.metrics;
            return (
              <motion.article key={c.id} initial={{ y: 12 }} animate={{ y: 0 }} transition={{ delay: i * 0.04, duration: 0.5, ease: EASE }} className="card flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-ink text-lime"><Icon name="gst" /></span>
                  <div className="flex flex-wrap justify-end gap-1.5"><Badge tone={riskTone(c.risk_level)}>{c.risk_level}</Badge><Badge tone={statusTone(c.status)} dot>{c.status}</Badge></div>
                </div>
                <Link to={`/cases/${c.id}`} className="mt-4 block truncate font-display text-xl hover:text-teal-ink">{c.legal_name}</Link>
                <p className="mt-0.5 font-mono text-[12.5px] text-muted">{c.gstin} · FY {c.financial_year}</p>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  {[["Files", c.file_count], ["Turnover", m ? money(m.annual_turnover) : "—"], ["Exceptions", m?.exceptions ?? "—"]].map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-paper-2/60 px-3 py-2"><dt className="label">{k}</dt><dd className="num mt-1 truncate">{v}</dd></div>
                  ))}
                </dl>
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                  <Btn to={`/cases/${c.id}`}>Open</Btn>
                  <Btn to={`/chat/${c.id}`} variant="line" icon="ai">Ask AI</Btn>
                  <span className="ml-auto text-[12px] text-muted">{dateTime(c.updated_at)}</span>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </>
  );
}
