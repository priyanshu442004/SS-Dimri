import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useApi, fileUrl } from "@shared/api";
import { PageHeader, Loading, ErrorNote, Empty, Btn, Badge, Icon } from "@shared/ui";
import { inr, dateTime } from "@shared/format";

export default function History() {
  const { data, error, loading } = useApi("/runs");
  const [q, setQ] = useState("");
  const runs = useMemo(() => (data?.runs || []).filter((r) => !q || `${r.period?.label} ${Object.values(r.inputs || {}).join(" ")}`.toLowerCase().includes(q.toLowerCase())), [data, q]);

  return (
    <>
      <PageHeader eyebrow="History" title="TDS runs" actions={<Btn to="/new" icon="plus">New TDS run</Btn>}>
        Every TDS run on this workspace, with its PDF summary, Excel workbook and email status.
      </PageHeader>
      {loading && <Loading />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && !data.runs.length && (
        <Empty icon="history" title="No TDS runs yet" action={<Btn to="/new" icon="plus">Start the first one</Btn>}>Upload a payment ledger, vendor master and challan register to create one.</Empty>
      )}
      {data?.runs.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/8 p-4">
            <span className="label">{runs.length} of {data.runs.length}</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search period or file…" className="h-9 w-full rounded-full border border-ink/12 bg-white px-4 text-sm outline-none focus:border-teal sm:w-72" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-sm">
              <thead><tr className="text-left">{["Period", "Payments", "TDS booked", "Challans", "Difference", "Exceptions", "Email", "Created", ""].map((h) => <th key={h} className="label px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody className="num divide-y divide-ink/6">
                {runs.map((r) => (
                  <tr key={r.id} className="hover:bg-paper-2/40">
                    <td className="px-4 py-3.5">
                      <Link to={`/runs/${r.id}`} className="font-medium hover:text-teal-ink">{r.period?.label}</Link>
                      <p className="max-w-[220px] truncate font-mono text-[11px] text-muted">{r.inputs?.payments}</p>
                    </td>
                    <td className="px-4 py-3.5">{r.totals?.payments}</td>
                    <td className="px-4 py-3.5 font-mono">{inr(r.totals?.tds, { dp: 0 })}</td>
                    <td className="px-4 py-3.5 font-mono">{inr(r.totals?.challans, { dp: 0 })}</td>
                    <td className="px-4 py-3.5 font-mono">{Math.abs(r.totals?.difference) < 0.01 ? <span className="text-teal-ink">₹0</span> : inr(r.totals?.difference, { dp: 0 })}</td>
                    <td className="px-4 py-3.5"><Badge tone="warn" dot>{r.exceptions}</Badge></td>
                    <td className="px-4 py-3.5">{r.mail?.status === "sent" ? <span className="inline-flex items-center gap-1 text-teal-ink"><Icon name="check" className="size-4" /> Sent</span> : <span className="text-rose">{r.mail?.status || "Not sent"}</span>}</td>
                    <td className="px-4 py-3.5 text-muted">{dateTime(r.createdAt)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-1">
                        <a href={fileUrl(`/runs/${r.id}/pdf?download=1`)} className="rounded-lg px-2 py-1 font-mono text-[11px] text-muted hover:bg-ink/5 hover:text-ink">PDF</a>
                        <a href={fileUrl(`/runs/${r.id}/xlsx`)} className="rounded-lg px-2 py-1 font-mono text-[11px] text-muted hover:bg-ink/5 hover:text-ink">XLSX</a>
                        <Link to={`/runs/${r.id}`} className="rounded-lg px-2 py-1 text-muted hover:bg-ink/5 hover:text-ink"><Icon name="arrow" className="size-4" /></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
