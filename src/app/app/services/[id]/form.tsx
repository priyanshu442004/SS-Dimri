"use client";

import { ActionForm, Checkbox, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

export function ServiceEditForm({ action, departments, d }: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  departments: { value: string; label: string }[];
  d: Record<string, string>;
}) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Service name" name="name" required defaultValue={d.name} />
        <TextField label="Service code" name="serviceCode" defaultValue={d.serviceCode} />
        <SelectField label="Department" name="departmentId" defaultValue={d.departmentId} options={departments} />
        <TextField label="Frequency" name="frequency" defaultValue={d.frequency} />
        <TextArea label="Description (public)" name="description" rows={3} defaultValue={d.description} className="sm:col-span-2" />
        <TextArea label="Deliverable (public)" name="deliverable" rows={2} defaultValue={d.deliverable} className="sm:col-span-2" />
        <TextField label="Billing basis (internal)" name="billingBasis" defaultValue={d.billingBasis} />
        <TextField label="Standard fee ₹ (internal)" name="defaultFee" type="number" min={0} step="0.01" defaultValue={d.defaultFee} hint="Never shown on the public website" />
        <TextField label="Estimated duration (days)" name="estimatedDurationDays" type="number" min={0} defaultValue={d.estimatedDurationDays} />
        <div />
        <TextField label="Point of contact" name="pocName" defaultValue={d.pocName} />
        <TextField label="POC mobile" name="pocMobile" defaultValue={d.pocMobile} />
        <TextField label="POC email" name="pocEmail" type="email" defaultValue={d.pocEmail} />
        <TextField label="POC address" name="pocAddress" defaultValue={d.pocAddress} />
      </div>
      <Checkbox name="isConfirmed" label="Confirmed by the firm — show on the public website (when active)" defaultChecked={d.isConfirmed === "on"} />
      <Checkbox name="isActive" label="Active (available for new client engagements)" defaultChecked={d.isActive === "on"} />
      <SubmitButton>Save service</SubmitButton>
    </ActionForm>
  );
}
