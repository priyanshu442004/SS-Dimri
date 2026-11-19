import { Link } from "react-router";
import { useApi, fileUrl } from "@shared/api";
import { PageHeader, Loading, ErrorNote, Empty, Btn, Badge, Icon } from "@shared/ui";
import { dateTime } from "@shared/format";

export const riskTone = (s) => (s >= 75 ? "good" : s >= 50 ? "warn" : "bad");

export default function History() {
  const { data, error, loading } = useApi("/runs");
  return (
    <>
      <PageHeader eyebrow="Companies" title="Analyses" actions={<Btn to="/new" icon="plus">New analysis</Btn>}>
        Every company and year analysed, with its health score, report and chat.
      </PageHeader>
      {loading && <Loading />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {data && !data.runs.length && <Empty icon="cfo" title="No analyses yet" action={<Btn to="/new" icon="plus">Analyse a company</Btn>}>Upload the four financial statements to start.</Empty>}
      {data?.runs.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {data.runs.map((r) => (
            <div key={r.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="label">{r.fy} vs {r.pfy}</p>
                  <Link to={`/runs/${r.id}`} className="mt-1.5 block truncate font-display text-xl hover:text-teal-ink">{r.company}</Link>
                  <p className="mt-1 text-[13px] text-muted">{dateTime(r.createdAt)}</p>
                </div>
                <div className="text-right"><p className="num font-display text-3xl leading-none">{r.score}</p><Badge tone={riskTone(r.score)}>{r.risk}</Badge></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">{Object.entries(r.status || {}).map(([k, v]) => <Badge key={k} tone={{ Good: "good", Watch: "warn", Mixed: "warn", Low: "bad" }[v]}>{k} · {v}</Badge>)}</div>
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink/8 pt-4">
                <Btn to={`/runs/${r.id}`}>Report</Btn>
                <Btn to={`/runs/${r.id}/chat`} icon="ai" variant="line">Ask AI</Btn>
                <a href={fileUrl(`/runs/${r.id}/pdf?download=1`)} className="rounded-lg px-2 py-1 font-mono text-[11px] text-muted hover:bg-ink/5 hover:text-ink">PDF</a>
                <a href={fileUrl(`/runs/${r.id}/xlsx`)} className="rounded-lg px-2 py-1 font-mono text-[11px] text-muted hover:bg-ink/5 hover:text-ink">XLSX</a>
                <span className="ml-auto text-[13px]">{r.mail?.status === "sent" ? <span className="inline-flex items-center gap-1 text-teal-ink"><Icon name="check" className="size-4" /> Emailed</span> : <span className="text-rose">{r.mail?.status}</span>}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
