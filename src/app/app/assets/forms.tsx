"use client";

import { ActionForm, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";
import { SearchSelect } from "@/components/pickers";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

export function AssetForm({ action, categories, conditions, d = {}, edit = false }: { action: Act; categories: readonly string[]; conditions: Option[]; d?: Record<string, string>; edit?: boolean }) {
  return (
    <ActionForm action={action} resetOnSuccess={!edit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Asset code" name="code" required defaultValue={d.code} placeholder="e.g. LAP-001" />
        <SelectField label="Category" name="category" defaultValue={d.category} options={categories.map((c) => ({ value: c, label: c }))} />
        <TextField label="Description" name="description" required defaultValue={d.description} placeholder="e.g. Dell Latitude 5420, i5, 16 GB" className="sm:col-span-2" />
        <TextField label="Serial no." name="serialNo" defaultValue={d.serialNo} />
        <TextField label="Purchase date" name="purchaseDate" type="date" defaultValue={d.purchaseDate} />
        <TextField label="Vendor" name="vendor" defaultValue={d.vendor} />
        <TextField label="Cost (₹)" name="cost" type="number" min={0} step="1" defaultValue={d.cost} />
        <TextField label="Location" name="location" defaultValue={d.location} placeholder="e.g. Naraina office" />
        <SelectField label="Condition" name="condition" defaultValue={d.condition} options={conditions} />
        {edit && d.status !== "ISSUED" && <SelectField label="Status" name="status" defaultValue={d.status} placeholder={null} options={[{ value: "IN_STOCK", label: "In stock" }, { value: "UNDER_REPAIR", label: "Under repair" }, { value: "DISPOSED", label: "Disposed" }]} />}
        <TextArea label="Notes" name="notes" rows={1} defaultValue={d.notes} />
      </div>
      <SubmitButton>{edit ? "Save asset" : "Add asset"}</SubmitButton>
    </ActionForm>
  );
}

export function IssueForm({ action, employees, conditions, today }: { action: Act; employees: Option[]; conditions: Option[]; today: string }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-2 sm:grid-cols-2">
        <SearchSelect label="Issue to" name="employeeId" options={employees} required placeholder="Search the team member…" />
        <TextField label="Issue (out) date" name="issuedOn" type="date" required defaultValue={today} />
        <SelectField label="Condition at issue" name="issueCondition" options={conditions} />
        <TextField label="Notes" name="notes" placeholder="e.g. with charger and bag" />
      </div>
      <SubmitButton size="sm">Issue</SubmitButton>
    </ActionForm>
  );
}

export function ReturnForm({ action, conditions, today }: { action: Act; conditions: Option[]; today: string }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-2 sm:grid-cols-3">
        <TextField label="Return (in) date" name="returnedOn" type="date" required defaultValue={today} />
        <SelectField label="Condition at return" name="returnCondition" options={conditions} />
        <TextField label="Notes" name="notes" />
      </div>
      <SubmitButton size="sm">Take back</SubmitButton>
    </ActionForm>
  );
}
