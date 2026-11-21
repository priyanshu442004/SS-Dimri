"use client";

import { ActionForm, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";
import { SearchSelect } from "@/components/pickers";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

/** Record a notice received for a client, with the date its reply is due. */
export function NoticeForm({ action, clients, employees, departments, today }: { action: Act; clients: Option[]; employees: Option[]; departments: readonly string[]; today: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-2">
        <SearchSelect label="Client" name="clientId" options={clients} required placeholder="Search the client…" />
        <SelectField label="Department" name="department" required options={departments.map((d) => ({ value: d, label: d }))} />
        <TextField label="Section / form" name="section" placeholder="e.g. ASMT-10, 143(2), TDS default" />
        <TextField label="Notice no. / DIN" name="reference" />
        <TextField label="Received on" name="receivedOn" type="date" defaultValue={today} max={today} />
        <TextField label="Reply due by" name="replyDueDate" type="date" required />
        <SearchSelect label="Handled by" name="responsibleEmployeeId" options={employees} emptyLabel="Not assigned" placeholder="Search the team member…" />
        <TextArea label="Remarks" name="remarks" rows={1} />
      </div>
      <SubmitButton>Record notice</SubmitButton>
    </ActionForm>
  );
}
