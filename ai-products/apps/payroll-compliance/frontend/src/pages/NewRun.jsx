import { useState } from "react";
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from "motion/react";
import { api } from "@shared/api";
import { PageHeader, DropZone, ErrorNote, Btn, Icon } from "@shared/ui";
import Processing from "../components/Processing";

const ACCEPT = ".xlsx,.csv";
const S = `${import.meta.env.BASE_URL}samples/`;
export const SAMPLES = [
  ["01_Employee_Salary_Master.xlsx", "Salary master"], ["02_Attendance_Leave.xlsx", "Attendance"],
  ["03_Payroll_Inputs.xlsx", "Payroll inputs"], ["04_Statutory_Rule_Configuration.xlsx", "Rule configuration"], ["05_Payroll_Test_Notes.csv", "Test notes"],
];

export default function NewRun() {
  const navigate = useNavigate();
  const [files, setFiles] = useState({ master: [], attendance: [], inputs: [], rules: [], notes: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setFiles((f) => ({ ...f, [k]: v }));
  const missing = ["master", "attendance"].filter((k) => !files[k].length).length;

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
      <PageHeader eyebrow="New payroll run" title="Run this month's payroll.">
        Upload the salary master, attendance and leave, payroll inputs and the statutory rule configuration. Loss of pay, overtime, incentives and recoveries
        are computed for every employee, statutory gaps are flagged before anything is paid, and the summary PDF is emailed as soon as it's ready.
      </PageHeader>

      <AnimatePresence>{error && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0 }} className="mb-6"><ErrorNote>{error}</ErrorNote></motion.div>}</AnimatePresence>

      <div className="grid items-start gap-4 lg:grid-cols-12">
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-8">
          <DropZone step="01" title="Employee salary master" hint="Employee ID, name, joining date, Basic, HRA, Special and Other allowance. PF basis and PF applicability flag are optional." accept={ACCEPT} files={files.master} onFiles={set("master")} minH="min-h-[210px]" />
          <DropZone step="02" title="Attendance & leave" hint="Employee ID, period, calendar days, weekly offs, paid and unpaid leave, present days and overtime hours." accept={ACCEPT} files={files.attendance} onFiles={set("attendance")} minH="min-h-[210px]" />
          <DropZone step="03" title="Payroll inputs" hint="Employee ID, period, incentive, reimbursement, advance recovery, other deduction and overtime rate per hour." accept={ACCEPT} files={files.inputs} onFiles={set("inputs")} minH="min-h-[210px]" />
          <DropZone step="04" title="Statutory rule configuration" hint="Rule name, configured value and notes: payroll period, proration denominator, PF / ESI rates, professional tax, TDS." accept={ACCEPT} files={files.rules} onFiles={set("rules")} minH="min-h-[210px]" />
          <div className="sm:col-span-2"><DropZone step="05 · optional" title="Payroll test notes" hint="A CSV of scenarios to check. Each one is shown next to what the payroll run found." accept=".csv,.xlsx" files={files.notes} onFiles={set("notes")} dark={false} minH="min-h-[150px]" /></div>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted sm:col-span-2">
            <Icon name="file" className="size-4" /> No files to hand? Samples:
            {SAMPLES.map(([f, l], i) => <span key={f}><a className="text-teal-ink underline underline-offset-4" href={`${S}${f}`} download>{l}</a>{i < SAMPLES.length - 1 ? " ·" : ""}</span>)}
          </p>
        </div>

        <aside className="card p-5 sm:p-6 lg:col-span-4">
          <p className="label">What you'll get</p>
          <ul className="mt-4 space-y-3 text-sm">
            {[["Payroll register", "Gross and net for every employee, with loss of pay and overtime"], ["Proration", "Unpaid leave and mid-month joining or exit"],
              ["Statutory checks", "PF, ESI, professional tax and TDS gaps flagged, never guessed"], ["Exceptions & controls", "Every issue with the action required, plus control totals"], ["PDF + Excel", "The PDF summary is emailed automatically"]].map(([t, d]) => (
              <li key={t} className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name="check" className="size-3.5" strokeWidth={2.2} /></span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ul>
          <p className="mt-5 rounded-xl bg-paper-2 px-3.5 py-3 text-[12.5px] leading-relaxed text-muted">Every file is recognised from its headers, so it doesn't matter which box you drop it in. Payroll inputs and the rule configuration are optional, but without them variable pay is nil and every statutory item is flagged.</p>
          <Btn type="submit" disabled={Boolean(missing)} className="mt-6 h-12 w-full" icon="arrow">Run payroll</Btn>
          {missing > 0 && <p className="mt-3 text-center text-xs text-muted">Add the {missing === 1 ? "last required file" : `${missing} required files`} to continue.</p>}
        </aside>
      </div>
    </form>
  );
}
