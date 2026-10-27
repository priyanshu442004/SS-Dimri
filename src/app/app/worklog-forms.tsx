"use client";

import { useState } from "react";
import { ActionForm, Checkbox, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

export function TimesheetForm({ action, clients, workTypes, places, tasks, date }: {
  action: Act; clients: Option[]; workTypes: Option[]; places: string[]; tasks: Option[]; date: string;
}) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Date of visit" name="workDate" type="date" required defaultValue={date} />
        <SelectField label="Client" name="clientId" options={clients} hint="Or type the name below if not registered" />
        <TextField label="Client name (if not in list)" name="clientNameText" />
        <div>
          <TextField label="Place of work" name="placeOfWork" list="places" />
          <datalist id="places">{places.map((p) => <option key={p} value={p} />)}</datalist>
        </div>
        <SelectField label="Type of work" name="workTypeId" options={workTypes} />
        <TextField label="Bank name (bank / card work)" name="bankName" />
        <TextField label="Period from" name="periodFrom" type="date" />
        <TextField label="Period to" name="periodTo" type="date" />
        <TextField label="No. of transactions / entries" name="transactionCount" type="number" min={0} />
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Time — hours" name="hours" type="number" min={0} max={24} />
          <TextField label="Minutes" name="minutes" type="number" min={0} max={59} />
        </div>
        <SelectField label="Status of work" name="workStatus" options={[
          { value: "COMPLETED", label: "Completed" }, { value: "IN_PROGRESS", label: "In progress" }, { value: "PENDING", label: "Pending" },
        ]} />
        <SelectField label="Related task" name="taskId" options={tasks} placeholder="None" />
        <TextArea label="Details of work done" name="workDetails" rows={2} className="sm:col-span-3" />
        <TextArea label="Message sent on WhatsApp (if any)" name="whatsappMessage" rows={1} className="sm:col-span-3" />
      </div>
      <SubmitButton>Add entry</SubmitButton>
    </ActionForm>
  );
}

export function PendingForm({ action, clients, employees, category, today, defaultClient, taskId, timesheetEntryId }: {
  action: Act; clients: Option[]; employees: Option[]; category: "DAILY" | "COMMUNICATION"; today: string; defaultClient?: string;
  /** Optional links so the follow-up points at the work it belongs to (no duplicate records). */
  taskId?: string; timesheetEntryId?: string;
}) {
  const [withWhom, setWithWhom] = useState<"CLIENT" | "TEAM_MEMBER">("CLIENT");
  return (
    <ActionForm action={action} resetOnSuccess>
      <input type="hidden" name="category" value={category} />
      {taskId && <input type="hidden" name="taskId" value={taskId} />}
      {timesheetEntryId && <input type="hidden" name="timesheetEntryId" value={timesheetEntryId} />}
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Pending with</legend>
        <div className="flex gap-4 text-sm">
          {(["CLIENT", "TEAM_MEMBER"] as const).map((v) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="pendingWith" value={v} checked={withWhom === v} onChange={() => setWithWhom(v)} className="accent-brand-700" />
              {v === "CLIENT" ? "Client (we asked, client has not provided)" : "Team member (client asked us, still to be done)"}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Client" name="clientId" options={clients} defaultValue={defaultClient} required={withWhom === "CLIENT"} />
        {withWhom === "TEAM_MEMBER" && <SelectField label="Team member" name="pendingWithEmployeeId" options={employees} placeholder="Me" />}
        <TextArea label={withWhom === "CLIENT" ? "What we asked" : "What the client asked us"} name="requestDescription" rows={2} required className="sm:col-span-2" />
        <TextField label="Asked / request given on" name="requestedOn" type="date" required defaultValue={today} />
        <TextField label="Due by (date promised)" name="dueBy" type="date" />
        <TextArea label="Remark (internal)" name="remark" rows={1} className="sm:col-span-2" />
      </div>
      {withWhom === "CLIENT" && <Checkbox name="clientVisible" label="Show this request in the client’s portal so they can reply and upload documents" defaultChecked />}
      <SubmitButton>Add pending item</SubmitButton>
    </ActionForm>
  );
}

export function PendingUpdateForm({ action, status, canShare = false }: { action: Act; status: string; canShare?: boolean }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr_10rem_auto] sm:items-end">
        <SelectField label="Status" name="status" placeholder={null} defaultValue={status} options={[
          { value: "OPEN", label: "Open" }, { value: "IN_PROGRESS", label: "In progress" }, { value: "AWAITING_RESPONSE", label: "Awaiting response" }, { value: "CLOSED", label: "Closed" },
        ]} />
        <TextField label="Follow-up note" name="note" />
        <TextField label="Next follow-up" name="nextFollowUpOn" type="date" />
        <SubmitButton size="sm" variant="secondary">Update</SubmitButton>
      </div>
      {canShare && <Checkbox name="shareWithClient" label="Share this note with the client" />}
    </ActionForm>
  );
}

export function ReviewForm({ action, children }: { action: Act; children: React.ReactNode }) {
  return (
    <ActionForm action={action}>
      {children}
      <div className="flex flex-wrap items-end gap-2">
        <TextField label="Review note" name="note" className="w-full max-w-sm" />
        <SubmitButton variant="secondary">Mark selected as reviewed</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EntryReviewForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action}>
      <TextArea label="Review remark" name="note" rows={2} hint="Required when returning the entry for correction" />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="REVIEWED" size="sm">Mark reviewed</SubmitButton>
        <SubmitButton name="decision" value="RETURNED" variant="secondary" size="sm">Return for correction</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EntryCorrectionForm({ action, clients, workTypes, d, needsReason }: {
  action: Act; clients: Option[]; workTypes: Option[]; d: Record<string, string>; needsReason: boolean;
}) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Date of visit" name="workDate" type="date" required defaultValue={d.workDate} />
        <SelectField label="Client" name="clientId" options={clients} defaultValue={d.clientId} />
        <TextField label="Client name (if not in list)" name="clientNameText" defaultValue={d.clientNameText} />
        <TextField label="Place of work" name="placeOfWork" defaultValue={d.placeOfWork} />
        <SelectField label="Type of work" name="workTypeId" options={workTypes} defaultValue={d.workTypeId} />
        <TextField label="Bank name" name="bankName" defaultValue={d.bankName} />
        <TextField label="Period from" name="periodFrom" type="date" defaultValue={d.periodFrom} />
        <TextField label="Period to" name="periodTo" type="date" defaultValue={d.periodTo} />
        <TextField label="No. of transactions / entries" name="transactionCount" type="number" min={0} defaultValue={d.transactionCount} />
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Hours" name="hours" type="number" min={0} max={24} defaultValue={d.hours} />
          <TextField label="Minutes" name="minutes" type="number" min={0} max={59} defaultValue={d.minutes} />
        </div>
        <SelectField label="Status of work" name="workStatus" defaultValue={d.workStatus} options={[
          { value: "COMPLETED", label: "Completed" }, { value: "IN_PROGRESS", label: "In progress" }, { value: "PENDING", label: "Pending" },
        ]} />
        <TextArea label="Details of work done" name="workDetails" rows={2} defaultValue={d.workDetails} className="sm:col-span-3" />
        <TextArea label="Message sent on WhatsApp" name="whatsappMessage" rows={1} defaultValue={d.whatsappMessage} className="sm:col-span-3" />
        <TextField label="Reason for correction" name="reason" required={needsReason} className="sm:col-span-3" hint={needsReason ? "Required when correcting someone else's entry" : "Optional"} />
      </div>
      <SubmitButton variant="secondary">Save correction</SubmitButton>
    </ActionForm>
  );
}
