"use client";

import { ActionForm, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;

export function ServiceForm({ action, departments }: { action: Act; departments: { value: string; label: string }[] }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Service name" name="name" required />
        <TextField label="Service code" name="serviceCode" placeholder="SRV-14" />
        <SelectField label="Department" name="departmentId" options={departments} />
        <TextField label="Standard fee (₹)" name="defaultFee" type="number" min={0} step="0.01" />
        <TextField label="Frequency" name="frequency" />
        <TextField label="Estimated duration (days)" name="estimatedDurationDays" type="number" min={0} />
        <TextArea label="Description" name="description" rows={2} className="sm:col-span-2" />
        <TextArea label="Deliverable" name="deliverable" rows={1} className="sm:col-span-2" />
        <TextField label="Point of contact" name="pocName" />
        <TextField label="POC mobile" name="pocMobile" />
        <TextField label="POC email" name="pocEmail" type="email" />
        <TextField label="POC address" name="pocAddress" />
      </div>
      <SubmitButton>Add service</SubmitButton>
    </ActionForm>
  );
}

export function DepartmentForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <TextField label="Department name" name="name" required />
        <TextField label="Code" name="code" placeholder="DEP-11" />
      </div>
      <TextField label="Scope" name="scope" />
      <SubmitButton variant="secondary">Add department</SubmitButton>
    </ActionForm>
  );
}
