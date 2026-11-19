import { useMemo, useState } from "react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { useApi, fileUrl } from "@shared/api";
import { PageHeader, Loading, ErrorNote, Empty, Btn, Badge, Icon, EASE } from "@shared/ui";
import { inr, dateTime } from "@shared/format";

export default function History() {
  const { data, error, loading } = useApi("/runs");
  const [q, setQ] = useState("");
  const runs = useMemo(() => (data?.runs || []).filter((r) => !q || `${r.accountName} ${r.period?.label} ${r.inputs?.bank} ${r.inputs?.books}`.toLowerCase().includes(q.toLowerCase())), [data, q]);

  return (
    <>
      <PageHeader eyebrow="History" title="Reconciliations" actions={<Btn to="/new" icon="plus">New reconciliation</Btn>}>
        Every reconciliation run on this workspace, with its report, Excel workbook and email status.
      </PageHeader>
      {loading && <Loading />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && !data.runs.length && (
        <Empty icon="history" title="No reconciliations yet" action={<Btn to="/new" icon="plus">Start the first one</Btn>}>Upload a bank statement and a books ledger to create one.</Empty>
      )}
      {data?.runs.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/8 p-4">
            <span className="label">{runs.length} of {data.runs.length}</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search account, period or file…" className="h-9 w-full rounded-full border border-ink/12 bg-white px-4 text-sm outline-none focus:border-teal sm:w-72" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="text-left">{["Account & period", "Status", "Difference", "Matched", "Review items", "Email", "Created", ""].map((h) => <th key={h} className="label px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="num divide-y divide-ink/6">
                {runs.map((r, i) => (
                  <motion.tr key={r.id} className="hover:bg-paper-2/40">
                    <td className="px-4 py-3.5">
                      <Link to={`/runs/${r.id}`} className="font-medium hover:text-teal-ink">{r.accountName}</Link>
                      <p className="font-mono text-[11px] text-muted">{r.period?.label}</p>
                    </td>
                    <td className="px-4 py-3.5"><Badge tone={r.reconciled ? "good" : "warn"} dot>{r.reconciled ? "Reconciled" : "Open"}</Badge></td>
                    <td className="px-4 py-3.5 font-mono">{inr(r.difference, { sign: true })}</td>
                    <td className="px-4 py-3.5">{r.matchedPct}%</td>
                    <td className="px-4 py-3.5">{r.exceptions}</td>
                    <td className="px-4 py-3.5">{r.mail?.status === "sent" ? <span className="inline-flex items-center gap-1 text-teal-ink"><Icon name="check" className="size-4" /> Sent</span> : <span className="text-rose">{r.mail?.status || "Not sent"}</span>}</td>
                    <td className="px-4 py-3.5 text-muted">{dateTime(r.createdAt)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-1">
                        <a href={fileUrl(`/runs/${r.id}/pdf?download=1`)} className="rounded-lg px-2 py-1 font-mono text-[11px] text-muted hover:bg-ink/5 hover:text-ink">PDF</a>
                        <a href={fileUrl(`/runs/${r.id}/xlsx`)} className="rounded-lg px-2 py-1 font-mono text-[11px] text-muted hover:bg-ink/5 hover:text-ink">XLSX</a>
                        <Link to={`/runs/${r.id}`} className="rounded-lg px-2 py-1 text-muted hover:bg-ink/5 hover:text-ink"><Icon name="arrow" className="size-4" /></Link>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
