import { useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@shared/api";
import { PageHeader, DropZone, ErrorNote, Btn, Icon } from "@shared/ui";
import Processing from "../components/Processing";

const ACCEPT = ".xlsx,.csv";
const S = `${import.meta.env.BASE_URL}samples/`;
export const SAMPLES = [
  ["01_Existing_Fixed_Asset_Register.xlsx", "Asset register"], ["02_Current_Year_Additions.xlsx", "Additions"],
  ["03_Disposals.xlsx", "Disposals"], ["04_Depreciation_Policy.xlsx", "Depreciation policy"], ["05_Sample_Capital_Invoice.pdf", "Capital invoice"],
];

export default function NewRun() {
  const navigate = useNavigate();
  const [files, setFiles] = useState({ register: [], additions: [], disposals: [], policy: [], invoice: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setFiles((f) => ({ ...f, [k]: v }));
  const missing = ["register", "policy"].filter((k) => !files[k].length).length;

  const submit = async (e) => {
    e.preventDefault();
    if (missing) return;
    const f = new FormData();
    for (const [k, v] of Object.entries(files)) for (const file of k === "invoice" ? v : v.slice(0, 1)) f.append(k, file);
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
      <PageHeader eyebrow="New asset run" title="Roll the asset register forward.">
        Upload the existing register, this year's additions and disposals, the depreciation policy and any capital invoices. Invoices are read and agreed to
        the additions, the quarter's book depreciation is computed from the class policy, anything that can't be computed safely is held with the reason,
        and the summary PDF is emailed as soon as it's ready.
      </PageHeader>

      <AnimatePresence>{error && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0 }} className="mb-6"><ErrorNote>{error}</ErrorNote></motion.div>}</AnimatePresence>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
          <DropZone step="01" title="Existing fixed asset register" hint="Asset ID, description, class, purchase date, original cost, available-for-use date, method, life, residual value, status, disposal date." accept={ACCEPT} files={files.register} onFiles={set("register")} minH="min-h-[210px]" />
          <DropZone step="02" title="Current year additions" hint="Invoice number and date, vendor, asset description, class, cost, available-for-use date and the proposed asset ID." accept={ACCEPT} files={files.additions} onFiles={set("additions")} minH="min-h-[210px]" />
          <DropZone step="03" title="Disposals" hint="Asset ID, disposal date, sale proceeds, buyer and approval reference." accept={ACCEPT} files={files.disposals} onFiles={set("disposals")} minH="min-h-[210px]" />
          <DropZone step="04" title="Depreciation policy" hint="Asset class, book method, useful life (years), residual value % and notes. A partial-period convention column is optional." accept={ACCEPT} files={files.policy} onFiles={set("policy")} minH="min-h-[210px]" />
          <div className="sm:col-span-2"><DropZone step="05 · PDF" title="Capital invoices" hint="One or more purchase invoices (text PDFs, up to 10). Each is read and agreed to the additions by invoice number." accept=".pdf" multiple files={files.invoice} onFiles={set("invoice")} dark={false} minH="min-h-[150px]" /></div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted sm:col-span-2">
            <Icon name="file" className="size-4" /> No files to hand? Samples:
            {SAMPLES.map(([f, l], i) => <span key={f}><a className="text-teal-ink underline underline-offset-4" href={`${S}${f}`} download>{l}</a>{i < SAMPLES.length - 1 ? " ·" : ""}</span>)}
          </p>
        </div>

        <aside className="card p-5 sm:p-6 lg:col-span-4">
          <p className="label">What you'll get</p>
          <ul className="mt-4 space-y-3 text-sm">
            {[["Asset rollforward", "Every asset with method, life, residual and the quarter's depreciation"], ["Invoice extraction", "Capital invoices read and agreed to the additions"],
              ["Held calculations", "Method conflicts, disposals and partial periods flagged, never guessed"], ["Exceptions", "Each issue with the action required"], ["PDF + Excel", "The PDF summary is emailed automatically"]].map(([t, d]) => (
              <li key={t} className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name="check" className="size-3.5" strokeWidth={2.2} /></span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ul>
          <p className="mt-5 rounded-xl bg-paper-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">Spreadsheets are recognised from their headers, so the box doesn't matter, and PDFs are always read as invoices. The register and the policy are required; additions, disposals and invoices are optional.</p>
          <Btn type="submit" disabled={Boolean(missing)} className="mt-6 h-12 w-full" icon="arrow">Process assets</Btn>
          {missing > 0 && <p className="mt-3 text-center text-xs text-muted">Add the {missing === 1 ? "last required file" : `${missing} required files`} to continue.</p>}
        </aside>
      </div>
    </form>
  );
}
