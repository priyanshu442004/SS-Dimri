import { useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@shared/api";
import { PageHeader, DropZone, ErrorNote, Btn, Icon } from "@shared/ui";
import Processing from "../components/Processing";

const ACCEPT = ".xlsx,.csv";
const S = `${import.meta.env.BASE_URL}samples/`;
export const SAMPLES = [
  ["01_Books_Vendor_Ledger.xlsx", "Books ledger"], ["02_Supplier_Statement.xlsx", "Supplier statement"],
  ["03_Vendor_Master.xlsx", "Vendor master"], ["04_Test_Scenarios.csv", "Test scenarios"],
];

export default function NewRun() {
  const navigate = useNavigate();
  const [files, setFiles] = useState({ books: [], statement: [], master: [], notes: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setFiles((f) => ({ ...f, [k]: v }));
  const missing = ["books", "statement", "master"].filter((k) => !files[k].length).length;

  const submit = async (e) => {
    e.preventDefault();
    if (missing) return;
    const f = new FormData();
    for (const [k, v] of Object.entries(files)) if (v[0]) f.append(k, v[0]);
    setError(""); setBusy(true);
    const t0 = Date.now();
    try {
      const { id } = await api("/process", { method: "POST", body: f });
      await new Promise((r) => setTimeout(r, Math.max(0, 1600 - (Date.now() - t0))));
      navigate(`/runs/${id}`, { state: { fresh: true } });
    } catch (err) {
      setError(err.message); setBusy(false);
    }
  };

  if (busy) return <Processing />;

  return (
    <form onSubmit={submit}>
      <PageHeader eyebrow="New reconciliation" title="Match your books to the supplier's statement.">
        Upload your vendor ledger, the supplier's statement of account and the vendor master. Every entry is matched by reference and amount,
        differences are explained with a next action, and the summary PDF is emailed to the finance team as soon as it's ready.
      </PageHeader>

      <AnimatePresence>{error && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0 }} className="mb-6"><ErrorNote>{error}</ErrorNote></motion.div>}</AnimatePresence>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
          <DropZone step="01" title="Books vendor ledger" hint="From your accounting software: date, reference, description, amount, side (Debit / Credit), vendor code." accept={ACCEPT} files={files.books} onFiles={set("books")} minH="min-h-[230px]" />
          <DropZone step="02" title="Supplier statement" hint="The vendor's statement of account for the same period: date, reference, description, amount, side." accept={ACCEPT} files={files.statement} onFiles={set("statement")} minH="min-h-[230px]" />
          <DropZone step="03" title="Vendor master" hint="Vendor code, vendor name, GSTIN and opening balance." accept={ACCEPT} files={files.master} onFiles={set("master")} minH="min-h-[230px]" />
          <DropZone step="04 · optional" title="Test scenarios / notes" hint="A CSV of expected issues or reviewer notes. Each one is shown next to what the reconciliation found." accept=".csv,.xlsx" files={files.notes} onFiles={set("notes")} dark={false} minH="min-h-[230px]" />
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted sm:col-span-2">
            <Icon name="file" className="size-4" /> No files to hand? Samples:
            {SAMPLES.map(([f, l], i) => <span key={f}><a className="text-teal-ink underline underline-offset-4" href={`${S}${f}`} download>{l}</a>{i < SAMPLES.length - 1 ? " ·" : ""}</span>)}
          </p>
        </div>

        <aside className="card p-5 sm:p-6 lg:col-span-4">
          <p className="label">What you'll get</p>
          <ul className="mt-4 space-y-3 text-sm">
            {[["Line-by-line matching", "Every reference with books vs supplier amount"], ["Differences explained", "Amount mismatches, books-only and statement-only items"],
              ["Actions", "A suggested next step for every open item"], ["PDF + Excel", "The PDF summary is emailed automatically"]].map(([t, d]) => (
              <li key={t} className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name="check" className="size-3.5" strokeWidth={2.2} /></span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ul>
          <p className="mt-5 rounded-xl bg-paper-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">The vendor master and notes are recognised from their headers wherever they're dropped. Keep the books ledger and supplier statement in their own boxes — they share a layout.</p>
          <Btn type="submit" disabled={Boolean(missing)} className="mt-6 h-12 w-full" icon="arrow">Reconcile</Btn>
          {missing > 0 && <p className="mt-3 text-center text-xs text-muted">Add the {missing === 1 ? "last required file" : `${missing} required files`} to continue.</p>}
        </aside>
      </div>
    </form>
  );
}
