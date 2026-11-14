"use client";

import { useState } from "react";
import { ActionForm, SelectField, SubmitButton, TextField, type FormState } from "@/components/form";
import { SearchSelect } from "@/components/pickers";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Current = { monthly: number; period: string } | null;

const inr = (n: number) => `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/**
 * Fix or change a salary. "Set" enters a new figure; an increase is worked out from the salary in
 * force (by % or by ₹ a month) and previewed before saving. Every change is kept as dated history.
 */
export function SalaryForm({ action, employees, today, current, defaultEmployee }: {
  action: Act;
  employees: { value: string; label: string }[];
  today: string;
  current: Record<string, Current>;
  defaultEmployee?: string;
}) {
  const [emp, setEmp] = useState(defaultEmployee ?? "");
  const [change, setChange] = useState<"set" | "percent" | "amount">(defaultEmployee && current[defaultEmployee] ? "percent" : "set");
  const [pct, setPct] = useState("");
  const [amt, setAmt] = useState("");
  const cur = emp ? current[emp] : null;
  const preview = cur && change === "percent" && Number(pct) ? cur.monthly * (1 + Number(pct) / 100) : cur && change === "amount" && Number(amt) ? cur.monthly + Number(amt) : null;
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-2">
        <SearchSelect label="Team member" name="employeeId" required options={employees} value={emp} onChange={(v) => { setEmp(v); if (!current[v]) setChange("set"); }} />
        <SelectField label="Change" name="change" placeholder={null} value={change} onChange={(e) => setChange(e.target.value as typeof change)} options={[
          { value: "set", label: cur ? "Enter the new salary" : "Fix the salary" },
          ...(cur ? [{ value: "percent", label: "Increase by %" }, { value: "amount", label: "Increase by ₹ a month" }] : []),
        ]} />
      </div>
      {emp && <p className="text-sm text-muted">{cur ? <>Current salary: <strong className="text-ink">{inr(cur.monthly)} a month</strong></> : "No salary entered yet."}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {change === "set" && (
          <>
            <TextField label="Salary (₹)" name="agreedSalary" type="number" min={1} step="0.01" required />
            <SelectField label="Per" name="salaryPeriod" placeholder={null} defaultValue="MONTHLY" options={[{ value: "MONTHLY", label: "Month" }, { value: "ANNUAL", label: "Year" }]} />
          </>
        )}
        {change === "percent" && <TextField label="Increase (%)" name="increasePercent" type="number" step="0.01" required value={pct} onChange={(e) => setPct(e.target.value)} hint="Use a minus sign for a reduction" />}
        {change === "amount" && <TextField label="Increase (₹ a month)" name="increaseAmount" type="number" step="0.01" required value={amt} onChange={(e) => setAmt(e.target.value)} hint="Use a minus sign for a reduction" />}
        <TextField label="Effective from" name="effectiveFrom" type="date" required defaultValue={today} />
        <SelectField label="Paid by" name="salaryMode" options={[{ value: "TRANSFER", label: "Bank transfer" }, { value: "CASH", label: "Cash" }]} placeholder="Same as before" />
      </div>
      {preview !== null && <p className="rounded-lg border border-ok/30 bg-ok-bg px-3 py-2 text-sm text-ok">New salary: <strong>{inr(Math.round(preview * 100) / 100)} a month</strong> (was {inr(cur!.monthly)}).</p>}
      <TextField label="Note (reason, appraisal…)" name="incrementNotes" />
      <details className="rounded-lg border border-line p-3 text-sm">
        <summary className="cursor-pointer font-medium">Next increment promised (optional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <TextField label="Due on" name="committedIncrementDate" type="date" />
          <TextField label="By %" name="committedIncrementPercent" type="number" step="0.01" min={0} />
          <TextField label="Or by ₹ a month" name="committedIncrementAmount" type="number" step="0.01" min={0} />
        </div>
      </details>
      <SubmitButton>Save salary</SubmitButton>
    </ActionForm>
  );
}

/** Correct one entry in the history (a typing mistake or a wrong date). */
export function SalaryEditForm({ action, d }: { action: Act; d: Record<string, string> }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextField label="Salary (₹)" name="agreedSalary" type="number" min={1} step="0.01" required defaultValue={d.agreedSalary} />
        <SelectField label="Per" name="salaryPeriod" placeholder={null} defaultValue={d.salaryPeriod} options={[{ value: "MONTHLY", label: "Month" }, { value: "ANNUAL", label: "Year" }]} />
        <TextField label="Effective from" name="effectiveFrom" type="date" required defaultValue={d.effectiveFrom} />
        <SelectField label="Paid by" name="salaryMode" defaultValue={d.salaryMode} options={[{ value: "TRANSFER", label: "Bank transfer" }, { value: "CASH", label: "Cash" }]} />
        <TextField label="Note" name="incrementNotes" defaultValue={d.incrementNotes} className="sm:col-span-2 lg:col-span-4" />
        <TextField label="Next increment due on" name="committedIncrementDate" type="date" defaultValue={d.committedIncrementDate} />
        <TextField label="By %" name="committedIncrementPercent" type="number" step="0.01" defaultValue={d.committedIncrementPercent} />
        <TextField label="Or by ₹ a month" name="committedIncrementAmount" type="number" step="0.01" defaultValue={d.committedIncrementAmount} />
      </div>
      <SubmitButton size="sm">Save correction</SubmitButton>
    </ActionForm>
  );
}
