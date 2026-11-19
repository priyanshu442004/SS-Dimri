import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { api } from "@shared/api";
import { PageHeader, DropZone, ErrorNote, Btn, Icon, EASE } from "@shared/ui";

export const SLOTS = [
  { key: "balanceSheet", title: "Balance Sheet", hint: "Statement of assets, liabilities and equity — current and previous year." },
  { key: "profitLoss", title: "Profit & Loss", hint: "Statement of profit and loss for the same years." },
  { key: "cashFlow", title: "Cash Flow", hint: "Cash flow statement (indirect method)." },
  { key: "ratios", title: "Ratio Analysis", hint: "Analytical ratios note from the financial statements." },
];

export default function NewAnalysis() {
  const navigate = useNavigate();
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = SLOTS.filter((s) => files[s.key]?.length).length;

  const submit = async () => {
    const f = new FormData();
    SLOTS.forEach((s) => f.append(s.key, files[s.key][0]));
    setError(""); setBusy(true);
    try {
      const { id } = await api("/analyses", { method: "POST", body: f });
      navigate(`/runs/${id}`);
    } catch (e) { setError(e.message); setBusy(false); }
  };

  if (busy) return <Processing />;

  return (
    <>
      <PageHeader eyebrow="New analysis" title="Give your CFO the four statements.">
        Upload the Balance Sheet, Profit & Loss, Cash Flow and Ratio Analysis PDFs in order. Once all four are in, the financial health
        report is generated and emailed, and the CFO chat opens on your numbers.
      </PageHeader>
      {error && <div className="mb-6"><ErrorNote>{error}</ErrorNote></div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SLOTS.map((s, i) => (
          <DropZone key={s.key} step={`0${i + 1}`} title={s.title} hint={s.hint} accept=".pdf" files={files[s.key] || []}
            onFiles={(fl) => setFiles((x) => ({ ...x, [s.key]: fl }))} minH="min-h-[250px]" />
        ))}
      </div>

      <div className="mt-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-ink/8 bg-white/60 p-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <div className="flex gap-1.5">{SLOTS.map((s) => <span key={s.key} className={`h-1.5 w-8 rounded-full transition-colors ${files[s.key]?.length ? "bg-teal" : "bg-ink/10"}`} />)}</div>
          <p className="text-sm text-muted"><b className="font-medium text-ink">{count} of 4</b> documents ready</p>
        </div>
        <Btn onClick={submit} disabled={count < 4} icon="chat" className="h-12 px-6">Upload 4 documents to chat</Btn>
      </div>
      <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <Icon name="file" className="size-4" /> Want to try it first?
        {[["balance_sheet", "Balance Sheet"], ["profit_and_loss", "P&L"], ["cash_flow", "Cash Flow"], ["ratio_analysis", "Ratios"]].map(([f, l]) => (
          <a key={f} href={`${import.meta.env.BASE_URL}samples/${f}.pdf`} download className="text-teal-ink underline underline-offset-4">{l}</a>
        ))}
        <span>(sample company statements)</span>
      </p>
    </>
  );
}

const STEPS = ["Reading the four PDFs", "Extracting line items with DeepSeek", "Checking totals and computing ratios", "Scoring six health dimensions", "Generating the report & emailing it"];
function Processing() {
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((v) => Math.min(v + 1, STEPS.length - 1)), 2600); return () => clearInterval(id); }, []);
  return (
    <div className="mx-auto max-w-md py-16">
      <p className="label">Analysing</p>
      <h1 className="mt-3 text-3xl font-medium">Your CFO is reading the statements…</h1>
      <p className="mt-2 text-sm text-muted">This usually takes 15–30 seconds.</p>
      <ol className="mt-8 space-y-2">
        {STEPS.map((s, k) => (
          <motion.li key={s} initial={{ x: -8 }} animate={{ x: 0 }} transition={{ delay: k * 0.08, ease: EASE }}
            className={`relative flex items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 text-[15px] ${k < i ? "border-ink/8 bg-white/60 text-muted" : k === i ? "border-teal/40 bg-white" : "border-ink/6 text-muted/60"}`}>
            {k === i && <span className="shimmer absolute inset-0" aria-hidden />}
            <span className={`relative grid size-5 place-items-center rounded-full ${k < i ? "bg-teal-ink text-white" : k === i ? "border-2 border-teal" : "border border-ink/20"}`}>{k < i && <Icon name="check" className="size-3" strokeWidth={2.4} />}</span>
            <span className="relative">{s}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
