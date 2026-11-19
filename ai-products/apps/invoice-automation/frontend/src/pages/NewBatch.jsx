import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { motion, AnimatePresence } from "motion/react";
import { api } from "@shared/api";
import { PageHeader, DropZone, ErrorNote, Btn, Icon, EASE } from "@shared/ui";
import { kb } from "@shared/format";

export default function NewBatch() {
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!files.length) return;
    const f = new FormData();
    files.forEach((x) => f.append("invoices", x));
    f.append("batchName", name);
    setError(""); setBusy(true);
    try {
      const { id } = await api("/batches", { method: "POST", body: f });
      navigate(`/runs/${id}`);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  if (busy) return <Processing count={files.length} />;

  return (
    <form onSubmit={submit}>
      <PageHeader eyebrow="Process invoices" title="Turn invoice PDFs into a checked register.">
        Drop any number of supplier invoices. Each one is read, GST is recalculated, duplicates and total mismatches are flagged, and the
        report is emailed to the finance team.
      </PageHeader>
      {error && <div className="mb-6"><ErrorNote>{error}</ErrorNote></div>}

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <DropZone multiple title="Invoice PDFs" hint="Text-based PDFs, up to 100 per batch, 10 MB each." accept=".pdf" files={files} onFiles={setFiles} dark={false} minH="min-h-[220px]" />
          <AnimatePresence>
            {files.length > 0 && (
              <motion.ul initial={{ y: 8 }} animate={{ y: 0 }} className="card mt-3 max-h-[340px] divide-y divide-ink/6 overflow-y-auto">
                {files.map((f, i) => (
                  <li key={f.name + f.size} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <Icon name="file" className="size-4 shrink-0 text-muted" />
                      <span className="truncate">{f.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-[11px] text-muted">{kb(f.size)}</span>
                      <button type="button" onClick={() => setFiles(files.filter((_, k) => k !== i))} className="grid size-7 place-items-center rounded-lg text-muted hover:bg-ink/5 hover:text-rose" aria-label={`Remove ${f.name}`}><Icon name="x" className="size-3.5" /></button>
                    </span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
        <aside className="card p-5 sm:p-6 lg:col-span-4">
          <p className="label">Batch</p>
          <label className="mt-5 block">
            <span className="text-[13px] font-medium">Batch name</span>
            <span className="block text-[11.5px] text-muted">Shown on the report, e.g. “April 2026 purchases”</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="April 2026 purchases"
              className="mt-1.5 h-11 w-full rounded-xl border border-ink/12 bg-white px-3.5 text-[15px] outline-none focus:border-teal" />
          </label>
          <dl className="mt-5 space-y-2 rounded-xl bg-paper-2/70 p-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Invoices</dt><dd className="num font-medium">{files.length}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Total size</dt><dd className="num">{kb(files.reduce((s, f) => s + f.size, 0))}</dd></div>
          </dl>
          <Btn type="submit" disabled={!files.length} className="mt-6 h-12 w-full" icon="arrow">Process {files.length || ""} invoice{files.length === 1 ? "" : "s"}</Btn>
          <p className="mt-3 text-center text-xs text-muted">
            No PDFs to hand? <a href={`${import.meta.env.BASE_URL}help#samples`} className="text-teal-ink underline">Get sample invoices</a>
          </p>
        </aside>
      </div>
    </form>
  );
}

const STEPS = ["Reading invoice PDFs", "Extracting supplier, GSTIN, items and totals", "Recalculating GST and checking duplicates", "Building PDF report & Excel register", "Emailing the finance team"];
function Processing({ count }) {
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((v) => Math.min(v + 1, STEPS.length - 1)), Math.max(500, count * 120)); return () => clearInterval(id); }, [count]);
  return (
    <div className="mx-auto max-w-md py-16">
      <p className="label">Processing {count} invoice{count === 1 ? "" : "s"}</p>
      <h1 className="mt-3 text-3xl font-medium">Reading and checking your invoices…</h1>
      <ol className="mt-8 space-y-2">
        {STEPS.map((s, k) => (
          <motion.li key={s} initial={{ x: -8 }} animate={{ x: 0 }} transition={{ delay: k * 0.08, ease: EASE }}
            className={`relative flex items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 text-[15px] ${k < i ? "border-ink/8 bg-white/60 text-muted" : k === i ? "border-teal/40 bg-white" : "border-ink/6 text-muted/60"}`}>
            {k === i && <span className="shimmer absolute inset-0" aria-hidden />}
            <span className={`relative grid size-5 place-items-center rounded-full ${k < i ? "bg-teal-ink text-white" : k === i ? "border-2 border-teal" : "border border-ink/20"}`}>
              {k < i && <Icon name="check" className="size-3" strokeWidth={2.4} />}
            </span>
            <span className="relative">{s}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
