"use client";

import { ActionForm, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;

export function ObservationForm({ action, status, note }: { action: Act; status: string; note: string }) {
  return (
    <ActionForm action={action} className="!space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        <select name="clientObservationStatus" defaultValue={status} aria-label="Client observation status" className="h-8 rounded border border-line bg-surface px-1 text-xs">
          <option value="NOT_SHARED">Not shared</option>
          <option value="PENDING_CLIENT_REVIEW">Pending client review</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="OBSERVATIONS_RAISED">Observations raised</option>
        </select>
        <input name="clientObservationNote" defaultValue={note} aria-label="Observation note" placeholder="Note" className="h-8 w-32 rounded border border-line px-2 text-xs" />
        <SubmitButton size="sm" variant="ghost">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function SnapshotForm({ action, from, to }: { action: Act; from: string; to: string }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <TextArea label="Summary / details for the period" name="notes" rows={3} />
      <SubmitButton>Save snapshot</SubmitButton>
    </ActionForm>
  );
}

export function DueForm({ action, services }: { action: Act; services: { value: string; label: string }[] }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <TextField label="Description" name="description" required placeholder="e.g. Retainer fee — September" />
      <TextField label="Amount (₹)" name="amount" type="number" min={0} step="0.01" required inputMode="decimal" />
      <TextField label="Due date" name="dueDate" type="date" />
      <TextField label="Reference (invoice no.)" name="referenceNumber" />
      <SelectField label="Service" name="clientServiceId" options={services} />
      <TextArea label="Notes" name="notes" rows={2} />
      <SubmitButton>Record due</SubmitButton>
    </ActionForm>
  );
}

export function DueUpdateForm({ action, status }: { action: Act; status: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <SelectField label="Status" name="status" placeholder={null} defaultValue={status} options={[
          { value: "OPEN", label: "Open" }, { value: "SETTLED", label: "Settled" }, { value: "WRITTEN_OFF", label: "Written off" },
        ]} />
        <TextField label="Follow-up note" name="note" />
        <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center rounded-md border border-line bg-surface px-4 text-sm font-medium hover:bg-subtle">
      Print / save PDF
    </button>
  );
}
