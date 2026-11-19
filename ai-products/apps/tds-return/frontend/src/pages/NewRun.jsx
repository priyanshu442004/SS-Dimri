import { useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@shared/api";
import { PageHeader, DropZone, ErrorNote, Btn, Icon } from "@shared/ui";
import Processing from "../components/Processing";

const ACCEPT = ".xlsx,.csv";
const S = `${import.meta.env.BASE_URL}samples/`;
export const SAMPLES = [
  ["01_Payment_Ledger.xlsx", "Payment ledger"], ["02_Vendor_Master.xlsx", "Vendor master"],
  ["03_TDS_Challan_Register.xlsx", "Challan register"], ["04_TDS_Expected_Test_Notes.csv", "Review notes"],
];

export default function NewRun() {
  const navigate = useNavigate();
  const [files, setFiles] = useState({ payments: [], vendors: [], challans: [], notes: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setFiles((f) => ({ ...f, [k]: v }));
  const required = ["payments", "vendors", "challans"];
  const missing = required.filter((k) => !files[k].length).length;

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
      <PageHeader eyebrow="New TDS run" title="Prepare and reconcile the quarter's TDS.">
        Upload the payment ledger, vendor master and challan register. Every deduction is checked for PAN, section and rate, challans are
        reconciled with TDS booked, and the summary PDF is emailed to the finance team as soon as it's ready.
      </PageHeader>

      <AnimatePresence>{error && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0 }} className="mb-6"><ErrorNote>{error}</ErrorNote></motion.div>}</AnimatePresence>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
          <DropZone step="01" title="Payment ledger" hint="Payment_ID, date, vendor, PAN, section, nature, gross, TDS deducted, net paid, deposit date." accept={ACCEPT} files={files.payments} onFiles={set("payments")} minH="min-h-[230px]" />
          <DropZone step="02" title="Vendor master" hint="Vendor_ID, name, PAN, vendor type (Company / LLP / Individual…), PAN status." accept={ACCEPT} files={files.vendors} onFiles={set("vendors")} minH="min-h-[230px]" />
          <DropZone step="03" title="TDS challan register" hint="Challan_ID, BSR code, challan date, serial no., amount, minor head, FY, quarter." accept={ACCEPT} files={files.challans} onFiles={set("challans")} minH="min-h-[230px]" />
          <DropZone step="04 · optional" title="Review notes / rules" hint="A CSV of reviewer instructions or test notes. Each note is checked against the exceptions found." accept=".csv,.xlsx" files={files.notes} onFiles={set("notes")} dark={false} minH="min-h-[230px]" />
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted sm:col-span-2">
            <Icon name="file" className="size-4" /> No files to hand? Samples:
            {SAMPLES.map(([f, l], i) => <span key={f}><a className="text-teal-ink underline underline-offset-4" href={`${S}${f}`} download>{l}</a>{i < SAMPLES.length - 1 ? " ·" : ""}</span>)}
          </p>
        </div>

        <aside className="card p-5 sm:p-6 lg:col-span-4">
          <p className="label">What you'll get</p>
          <ul className="mt-4 space-y-3 text-sm">
            {[["Deduction register", "Every payment with a system review note"], ["Challan reconciliation", "TDS booked vs challans, by quarter and month"],
              ["Exceptions", "Missing PAN, rate consistency, aggregation, schema"], ["PDF + Excel", "The PDF summary is emailed automatically"]].map(([t, d]) => (
              <li key={t} className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name="check" className="size-3.5" strokeWidth={2.2} /></span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ul>
          <p className="mt-5 rounded-xl bg-paper-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">Files can be dropped in any box — each one is recognised from its column headers.</p>
          <Btn type="submit" disabled={Boolean(missing)} className="mt-6 h-12 w-full" icon="arrow">Generate TDS report</Btn>
          {missing > 0 && <p className="mt-3 text-center text-xs text-muted">Add the {missing === 1 ? "last required file" : `${missing} required files`} to continue.</p>}
        </aside>
      </div>
    </form>
  );
}
