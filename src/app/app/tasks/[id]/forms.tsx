"use client";

import { ActionForm, Checkbox, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";
import { PeoplePicker, SearchSelect } from "@/components/pickers";
import { VoiceRecorder } from "@/components/voice-note";
import { ReminderRows } from "../reminder-rows";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string; level?: string | null };

export function TransitionForm({ action, actions }: { action: Act; actions: { action: string; label: string }[] }) {
  return (
    <ActionForm action={action}>
      <TextArea label="Comment" name="comment" rows={2} hint="Required when requesting changes" />
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <SubmitButton
            key={a.action}
            name="action"
            value={a.action}
            size="sm"
            variant={a.action === "cancel" ? "danger" : a.action === "approve" || a.action === "submit" || a.action === "start" ? "primary" : "secondary"}
            confirm={a.action === "cancel" ? "Cancel this task? It stays in the history." : undefined}
          >
            {a.label}
          </SubmitButton>
        ))}
      </div>
    </ActionForm>
  );
}

/** Correct a task's details until the work is started. */
export function EditTaskForm({ action, clients, d }: { action: Act; clients: Option[]; d: Record<string, string> }) {
  return (
    <ActionForm action={action}>
      <TextField label="Task" name="title" required defaultValue={d.title} />
      <SearchSelect label="Client" name="clientId" defaultValue={d.clientId} options={clients} placeholder="Search clients…" emptyLabel="No client (internal)" />
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Priority" name="priority" placeholder={null} defaultValue={d.priority} options={[{ value: "HIGH", label: "High" }, { value: "MEDIUM", label: "Medium" }, { value: "LOW", label: "Low" }]} />
        <div className="pt-7"><Checkbox name="isAsap" label="ASAP" defaultChecked={d.isAsap === "on"} /></div>
        <TextField label="Start" name="startAt" type="datetime-local" defaultValue={d.startAt} />
        <TextField label="Due by" name="dueAt" type="datetime-local" defaultValue={d.dueAt} />
      </div>
      <TextArea label="Details / written work" name="description" rows={3} defaultValue={d.description} />
      <TextArea label="Writing for (client side) — remark" name="writingForRemark" rows={1} defaultValue={d.writingForRemark} />
      <TextArea label="Writing from (team side) — remark" name="writingFromRemark" rows={1} defaultValue={d.writingFromRemark} />
      <SubmitButton variant="secondary">Save changes</SubmitButton>
    </ActionForm>
  );
}

export function RemarkForm({ action, canShare }: { action: Act; canShare: boolean }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <TextArea label="Add a remark" name="note" rows={2} hint={canShare ? "Internal by default — tick below to show it to the client" : "Internal remark"} />
      {canShare && <Checkbox name="clientVisible" label="Visible to the client" />}
      <VoiceRecorder compact />
      <div className="flex flex-wrap items-center gap-3">
        <input name="attachment" type="file" aria-label="Attach a file" accept="application/pdf,image/*,.docx,.xlsx" className="text-sm file:mr-2 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1 file:text-sm" />
        <SubmitButton variant="secondary" size="sm">Post</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AssignForm({ action, employees, assigned, maker, checker }: { action: Act; employees: Option[]; assigned: string[]; maker: string; checker: string }) {
  return (
    <ActionForm action={action}>
      <PeoplePicker label="Assigned to" name="assigneeIds[]" options={employees} defaultValue={assigned} />
      <SearchSelect label="Maker" name="makerEmployeeId" defaultValue={maker} options={employees} emptyLabel="No maker" />
      <SearchSelect label="Checker" name="checkerEmployeeId" defaultValue={checker} options={employees} emptyLabel="No checker" hint="The same person can be maker and checker" />
      <SubmitButton variant="secondary" size="sm">Save assignment</SubmitButton>
    </ActionForm>
  );
}

export function ReminderForm({ action, now }: { action: Act; now: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <ReminderRows now={now} initialRows={1} />
      <SelectField label="Who to remind" name="audience" placeholder={null} defaultValue="team" options={[
        { value: "team", label: "Everyone on this task" }, { value: "me", label: "Only me" },
      ]} />
      <TextField label="Note" name="note" />
      <SubmitButton variant="secondary" size="sm">Set reminder</SubmitButton>
    </ActionForm>
  );
}

export function SharingForm({ action, shared }: { action: Act; shared: boolean }) {
  return (
    <ActionForm action={action}>
      <Checkbox name="clientVisible" label="Show this task in the client portal" defaultChecked={shared} />
      <Checkbox name="requestReview" label="Ask the client to review / confirm the delivered work" />
      <SubmitButton variant="secondary" size="sm">Save</SubmitButton>
    </ActionForm>
  );
}
