"use client";

import { ActionForm, SelectField, SubmitButton, TextField, type FormState } from "@/components/form";
import { SearchSelect } from "@/components/pickers";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;

export function SalaryForm({ action, employees, today }: { action: Act; employees: { value: string; label: string }[]; today: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SearchSelect label="Team member" name="employeeId" required options={employees} className="lg:col-span-2" />
        <TextField label="Salary (₹)" name="agreedSalary" type="number" min={1} step="0.01" required />
        <SelectField label="Per" name="salaryPeriod" placeholder={null} defaultValue="MONTHLY" options={[{ value: "MONTHLY", label: "Month" }, { value: "ANNUAL", label: "Year" }]} />
        <TextField label="Effective from" name="effectiveFrom" type="date" required defaultValue={today} />
        <SelectField label="Paid by" name="salaryMode" options={[{ value: "TRANSFER", label: "Bank transfer" }, { value: "CASH", label: "Cash" }]} />
        <TextField label="Note" name="incrementNotes" className="sm:col-span-1 lg:col-span-4" />
      </div>
      <SubmitButton>Save salary</SubmitButton>
    </ActionForm>
  );
}
