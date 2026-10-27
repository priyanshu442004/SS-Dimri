"use client";

import { ActionForm, Checkbox, SelectField, SubmitButton, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string; level?: string | null };

export function AllocationForm({ action, employees, clients, defaultClient, today }: { action: Act; employees: Option[]; clients: Option[]; defaultClient: string; today: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <SelectField label="Client" name="clientId" required defaultValue={defaultClient} options={clients} />
      <SelectField label="Team member" name="employeeId" required options={employees} />
      <SelectField label="Role on this client" name="seniorityLevel" options={[
        { value: "JUNIOR", label: "Junior" }, { value: "MID_LEVEL", label: "Mid-level" }, { value: "SENIOR", label: "Senior" },
      ]} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="From" name="startDate" type="date" required defaultValue={today} />
        <TextField label="To" name="endDate" type="date" hint="Blank = ongoing" />
      </div>
      <TextField label="Share of time (%)" name="allocationPercent" type="number" min={1} max={100} hint="Blank = full time" />
      <Checkbox name="allowOverlap" label="Allow overlap with other allocations" />
      <SubmitButton>Allocate</SubmitButton>
    </ActionForm>
  );
}

export function ChangeForm({ action, employees, today }: { action: Act; employees: Option[]; today: string }) {
  return (
    <ActionForm action={action}>
      <SelectField label="Replace with" name="employeeId" required options={employees} />
      <TextField label="Effective from" name="effectiveDate" type="date" required defaultValue={today} />
      <TextField label="Reason" name="changeReason" />
      <Checkbox name="allowOverlap" label="Allow overlap" />
      <SubmitButton size="sm" confirm="Replace the current team member on this allocation from the effective date?">Change allocation</SubmitButton>
    </ActionForm>
  );
}
