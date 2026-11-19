import { useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@shared/api";
import { PageHeader, DropZone, ErrorNote, Btn, Icon } from "@shared/ui";
import Processing from "../components/Processing";

const ACCEPT = ".csv,.xlsx";

export default function NewRun() {
  const navigate = useNavigate();
  const [bank, setBank] = useState([]);
  const [books, setBooks] = useState([]);
  const [accountName, setAccountName] = useState("");
  const [tolerance, setTolerance] = useState(3);
  const [signMode, setSignMode] = useState("auto");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ready = bank.length && books.length;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    const f = new FormData();
    f.append("bank", bank[0]);
    f.append("books", books[0]);
    f.append("accountName", accountName);
    f.append("tolerance", String(tolerance));
    f.append("signMode", signMode);
    setError(""); setBusy(true);
    const t0 = Date.now();
    try {
      const { id } = await api("/reconcile", { method: "POST", body: f });
      await new Promise((r) => setTimeout(r, Math.max(0, 1600 - (Date.now() - t0)))); // let the steps read
      navigate(`/runs/${id}`, { state: { fresh: true } });
    } catch (err) {
      setError(err.message); setBusy(false);
    }
  };

  if (busy) return <Processing />;

  return (
    <form onSubmit={submit}>
      <PageHeader eyebrow="New reconciliation" title="Match your bank statement to your books.">
        Upload both files for the same period. Every transaction is matched — exact, by amount and date, or as a group — and whatever
        doesn't match is explained. The review report is emailed to the finance team automatically.
      </PageHeader>

      <AnimatePresence>{error && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0 }} className="mb-6"><ErrorNote>{error}</ErrorNote></motion.div>}</AnimatePresence>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
          <DropZone step="01" title="Bank statement" hint="Export from net-banking: date, reference, narration, debit, credit. CSV or Excel." accept={ACCEPT} files={bank} onFiles={setBank} minH="min-h-[280px]" />
          <DropZone step="02" title="Books ledger" hint="Cash / bank book from your accounting software for the same period." accept={ACCEPT} files={books} onFiles={setBooks} minH="min-h-[280px]" />
          <p className="flex items-center gap-2 text-[13px] text-muted sm:col-span-2">
            <Icon name="file" className="size-4" /> No files to hand?
            <a className="text-teal-ink underline underline-offset-4" href={`${import.meta.env.BASE_URL}samples/sample_bank_statement.csv`} download>Sample statement</a> ·
            <a className="text-teal-ink underline underline-offset-4" href={`${import.meta.env.BASE_URL}samples/sample_books_ledger.csv`} download>Sample ledger</a>
          </p>
        </div>

        <aside className="card p-5 sm:p-6 lg:col-span-4">
          <p className="label">Settings</p>
          <div className="mt-5 space-y-5">
            <Field label="Account name" hint="Shown on the report">
              <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. HDFC Current A/c 0042"
                className="h-11 w-full rounded-xl border border-ink/12 bg-white px-3.5 text-[15px] outline-none transition-colors focus:border-teal" />
            </Field>
            <Field label={`Date tolerance · ${tolerance} day${tolerance === 1 ? "" : "s"}`} hint="How far apart bank and book dates may be">
              <input type="range" min="0" max="7" value={tolerance} onChange={(e) => setTolerance(+e.target.value)} className="w-full accent-[#1d7a73]" />
            </Field>
            <Field label="Books sign convention">
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-paper-2 p-1 text-[13px]">
                {[["auto", "Auto-detect"], ["bank", "Cr = receipt"], ["accounting", "Dr = receipt"]].map(([v, l]) => (
                  <button type="button" key={v} onClick={() => setSignMode(v)} className={`relative h-8 rounded-lg transition-colors ${signMode === v ? "text-ink" : "text-muted hover:text-ink"}`}>
                    {signMode === v && <motion.span layoutId="sign" className="absolute inset-0 rounded-lg bg-white shadow-sm" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                    <span className="relative">{l}</span>
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <Btn type="submit" disabled={!ready} className="mt-7 h-12 w-full" icon="arrow">Reconcile</Btn>
          {!ready && <p className="mt-3 text-center text-xs text-muted">Add both files to continue.</p>}
        </aside>
      </div>
    </form>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <div>
      <div className="mb-1.5">
        <span className="text-[13px] font-medium">{label}{required && <span className="text-rose"> *</span>}</span>
        {hint && <span className="block text-[11.5px] text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
