import { useState } from "react";
import { Link } from "react-router";
import { api, useApi } from "@shared/api";
import { Section, Badge, Btn } from "@shared/ui";

const TONE = { "Clear to pay": "good", "Review before paying": "warn", "Hold payment": "bad" };

/** AI summary report (DeepSeek) of the most recent batch. */
export default function AISummary() {
  const { data, error, loading, reload } = useApi("/summary");
  const [regen, setRegen] = useState(false);
  const regenerate = async () => {
    setRegen(true);
    try { await api(`/summary?refresh=1${data?.runId ? `&id=${data.runId}` : ""}`); } finally { setRegen(false); reload(); }
  };
  const s = data && !data.empty ? data : null;

  return (
    <Section i={4} className="mt-6 overflow-hidden" title="AI summary report"
      aside={s && (
        <div className="flex items-center gap-2">
          <Badge tone={TONE[s.verdict] || "neutral"} dot>{s.verdict}</Badge>
          <button onClick={regenerate} disabled={regen} className="rounded-lg px-2.5 py-1 text-[13px] text-muted hover:bg-ink/5 hover:text-ink disabled:opacity-50">{regen ? "Writing…" : "Regenerate"}</button>
        </div>
      )}>
      <div className="px-5 pb-5 pt-2">
        {(loading || regen) && !s && <p className="animate-pulse text-sm text-muted">Reading the latest batch and writing the summary…</p>}
        {error && <p className="text-sm text-rose">{error}</p>}
        {data?.empty && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <span>Process a batch of invoices to get an AI summary of what needs attention.</span>
            <Btn to="/new" icon="plus">Process invoices</Btn>
          </div>
        )}
        {s && (
          <div className={regen ? "opacity-60 transition-opacity" : ""}>
            <p className="text-[13px] text-muted">
              Latest batch · <Link to={`/runs/${s.runId}`} className="text-teal-ink hover:underline">{s.batchName}</Link>
            </p>
            <p className="mt-2 text-[16px] font-medium leading-snug">{s.headline}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {s.points.map((p) => (
                <div key={p.title} className="rounded-xl border border-ink/8 bg-paper-2/40 p-3.5">
                  <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-teal-ink">{p.title}</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-ink/85">{p.text}</dd>
                </div>
              ))}
            </dl>
            {s.action && <p className="mt-4 rounded-xl border border-ink/10 bg-ink px-4 py-3 text-sm text-paper"><span className="text-lime">Next step · </span>{s.action}</p>}
          </div>
        )}
      </div>
    </Section>
  );
}
