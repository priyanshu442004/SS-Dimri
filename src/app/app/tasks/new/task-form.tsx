"use client";

import { ActionForm, Checkbox, FormError, SelectField, SubmitButton, TextArea, TextField } from "@/components/form";
import { createTaskAction } from "../actions";

type Option = { value: string; label: string; level?: string | null };

const LEVEL: Record<string, string> = { JUNIOR: "Junior", MID_LEVEL: "Mid-level", SENIOR: "Senior" };

export function TaskForm({ employees, clients, defaultClient }: { employees: Option[]; clients: Option[]; defaultClient: string }) {
  return (
    <ActionForm action={createTaskAction}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Task" name="title" required className="sm:col-span-2" placeholder="e.g. GSTR-3B for September" />
        <SelectField label="Client" name="clientId" defaultValue={defaultClient} options={clients} placeholder="No client (internal)" />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Priority" name="priority" placeholder={null} defaultValue="MEDIUM" options={[
            { value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" },
          ]} />
          <div className="pt-7"><Checkbox name="isAsap" label="ASAP" /></div>
        </div>
        <TextField label="Start" name="startAt" type="datetime-local" />
        <TextField label="Due by" name="dueAt" type="datetime-local" />
        <TextArea label="Details / written work" name="description" rows={4} className="sm:col-span-2" />
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Assign to (one or more)</legend>
        <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border border-line p-2 sm:grid-cols-2">
          {employees.map((e) => (
            <label key={e.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="assigneeIds[]" value={e.value} className="accent-brand-700" />
              <span>{e.label}{e.level && <span className="text-xs text-muted"> · {LEVEL[e.level]}</span>}</span>
            </label>
          ))}
          {employees.length === 0 && <p className="text-sm text-muted">No approved employees yet.</p>}
        </div>
        <FormError name="assigneeIds[]" />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Maker" name="makerEmployeeId" options={employees} hint="Defaults to the assignee when there is only one" />
        <SelectField label="Checker" name="checkerEmployeeId" options={employees} hint="Reviews and approves the work" />
        <TextArea label="Writing for (client side) — remark" name="writingForRemark" rows={2} />
        <TextArea label="Writing from (team side) — remark" name="writingFromRemark" rows={2} />
        <TextField label="Reminder" name="remindAt" type="datetime-local" hint="In-app reminder to the assignees" />
        <div>
          <label htmlFor="attachments" className="mb-1 block text-sm font-medium">Attach images or documents</label>
          <input id="attachments" name="attachments" type="file" multiple accept="application/pdf,image/*,.docx,.xlsx" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
        </div>
      </div>
      <Checkbox name="clientVisible" label="Share with the client in their portal (title, status, due date and client-visible remarks only)" />
      <SubmitButton>Create task</SubmitButton>
    </ActionForm>
  );
}
