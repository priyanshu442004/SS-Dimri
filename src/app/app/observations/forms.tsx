"use client";

import { ActionForm, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

export function ObservationCreateForm({ action, clients, employees, today, defaultClient }: {
  action: Act; clients: Option[]; employees: Option[]; today: string; defaultClient?: string;
}) {
  return (
    <ActionForm action={action}>
      <SelectField label="Client" name="clientId" options={clients} required defaultValue={defaultClient} />
      <TextField label="Observed on" name="observedOn" type="date" required defaultValue={today} />
      <TextArea label="Observation" name="details" rows={4} required />
      <SelectField label="Responsible team member" name="responsibleEmployeeId" options={employees} placeholder="Unassigned" />
      <SubmitButton>Log observation</SubmitButton>
    </ActionForm>
  );
}

export function ObservationUpdateForm({ action, next, employees, current }: {
  action: Act; next: Option[]; employees?: Option[]; current?: string;
}) {
  return (
    <ActionForm action={action} resetOnSuccess>
      {next.length > 0 && <SelectField label="Change status" name="status" options={next} placeholder="Keep current status" />}
      {employees && <SelectField label="Responsible" name="responsibleEmployeeId" options={employees} defaultValue={current} placeholder="Unassigned" />}
      <TextArea label="Note (recorded in history; becomes the resolution when resolving)" name="note" rows={3} required />
      <SubmitButton>Save update</SubmitButton>
    </ActionForm>
  );
}
