import { useState } from "react";
import { useNavigate } from "react-router";
import { motion } from "motion/react";
import { PageHeader, DropZone, Btn, ErrorNote, Icon, rise } from "@shared/ui";
import { gst, FY } from "../lib";

const GSTIN = /^[0-9]{2}[A-Z0-9]{13}$/;
const STAGES = ["Creating the case", "Uploading documents", "AI is mapping document layouts", "Matching books with GSTR-1 / 2B / 3B", "Calculating GSTR-9 / 9C and writing reports"];

export default function NewCase() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ legal_name: "", gstin: "", financial_year: FY[1] });
  const [files, setFiles] = useState([]);
  const [stage, setStage] = useState(-1);
  const [error, setError] = useState("");
  const busy = stage >= 0;
  const valid = form.legal_name.trim().length >= 2 && GSTIN.test(form.gstin);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setError("");
    let id;
    try {
      setStage(0);
      const created = await gst("/cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, legal_name: form.legal_name.trim() }) });
      id = created.id;
      if (files.length) {
        setStage(1);
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        await gst(`/cases/${id}/files`, { method: "POST", body: fd });
        setStage(2);
        const tick = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 9000);
        try { await gst(`/cases/${id}/run`, { method: "POST" }); } finally { clearInterval(tick); }
      }
      navigate(`/cases/${id}${files.length ? "/reconciliation" : ""}`);
    } catch (err) {
      setError(err.message);
      setStage(-1);
      if (id) navigate(`/cases/${id}`);
    }
  };

  const field = "mt-1.5 h-11 w-full rounded-xl border border-ink/12 bg-white px-3.5 text-[15px] outline-none transition-colors focus:border-teal";

  return (
    <>
      <PageHeader eyebrow="New case" title="Start a GST annual-return case">
        Enter the taxpayer, drop the complete source package, and the analysis runs straight away. You can add more files later.
      </PageHeader>
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <motion.div {...rise(1)} className="card grid gap-4 p-5 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">Legal name
              <input className={field} required minLength={2} value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} placeholder="Shree Ganesh Traders Private Limited" />
            </label>
            <label className="text-sm">GSTIN
              <input className={`${field} font-mono uppercase`} required maxLength={15} value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="09AABCS1234F1Z5" />
              {form.gstin && !GSTIN.test(form.gstin) && <span className="mt-1 block text-[12px] text-rose">15 characters, starting with the 2-digit state code.</span>}
            </label>
            <label className="text-sm">Financial year
              <select className={field} value={form.financial_year} onChange={(e) => setForm({ ...form, financial_year: e.target.value })}>
                {FY.map((y) => <option key={y}>{y}</option>)}
              </select>
            </label>
          </motion.div>
          <motion.div {...rise(2)}>
            <DropZone title="Source package" step="Excel · CSV · PDF" multiple accept=".xlsx,.xlsm,.csv,.pdf" files={files} onFiles={setFiles} minH="min-h-[240px]"
              hint="Outward & inward registers, GSTR-2B, GSTR-1 and GSTR-3B summaries, RCM working, cash / credit ledgers. Drop them all at once." />
            {files.length > 0 && (
              <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {files.map((f) => (
                  <li key={f.name} className="flex items-center gap-2 truncate rounded-lg bg-white/60 px-3 py-2 font-mono text-[12.5px]">
                    <Icon name="file" className="size-4 shrink-0 text-muted" /><span className="truncate">{f.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
          {error && <ErrorNote>{error}</ErrorNote>}
          <div className="flex flex-wrap items-center gap-3">
            <Btn type="submit" variant="dark" icon="arrow" disabled={!valid || busy}>{files.length ? "Create case & run analysis" : "Create case"}</Btn>
            {busy && <span className="flex items-center gap-2 text-sm text-muted"><span className="size-2 animate-pulse rounded-full bg-teal" />{STAGES[stage]}… {stage >= 2 && "(about a minute)"}</span>}
          </div>
        </div>

        <motion.aside {...rise(3)} className="h-fit rounded-2xl bg-ink p-6 text-paper">
          <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-lime"><Icon name="check" /></span>
          <h2 className="mt-4 text-xl font-medium">Controlled by design</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-mist">
            {["Original files are never changed.", "AI maps layouts and explains — it never writes a return figure.", "Every amount keeps its source file and row.", "Missing audited figures stay DATA NEEDED.", "A senior must approve before filing on the portal."].map((t) => (
              <li key={t} className="flex gap-2.5"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-lime" />{t}</li>
            ))}
          </ul>
        </motion.aside>
      </form>
    </>
  );
}
