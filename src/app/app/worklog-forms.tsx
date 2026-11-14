"use client";

import { useState } from "react";
import { ActionForm, Checkbox, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";
import { SearchSelect } from "@/components/pickers";
import { minutesBetween } from "@/lib/domain/timesheet";
import { BRANCHES, ISSUE_LEVEL_HINT, ISSUE_LEVELS, ISSUE_STATUSES, PENDING_STATUSES, PLACES_OF_WORK, STATUS_OF_WORK_LABEL, STATUSES_OF_WORK } from "@/lib/domain/tracker";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

const RESOURCE_OPTIONS = ["Dedicated", "Shared", "Backend Team"].map((v) => ({ value: v, label: v }));

/** Start and end time; the hours worked are shown as soon as both are filled. */
function TimeBlock({ start, end, hours, minutes }: { start?: string; end?: string; hours?: string; minutes?: string }) {
  const [from, setFrom] = useState(start ?? "");
  const [to, setTo] = useState(end ?? "");
  const worked = minutesBetween(from, to);
  return (
    <>
      <TextField label="Start time" name="startTime" type="time" value={from} onChange={(e) => setFrom(e.target.value)} />
      <TextField label="End time" name="endTime" type="time" value={to} onChange={(e) => setTo(e.target.value)} hint={worked ? `Hours invested: ${Math.floor(worked / 60)}h ${String(worked % 60).padStart(2, "0")}m` : from && to ? "The end time must be after the start time" : undefined} />
      {!worked && (
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Or hours" name="hours" type="number" min={0} max={24} defaultValue={hours} />
          <TextField label="Minutes" name="minutes" type="number" min={0} max={59} defaultValue={minutes} />
        </div>
      )}
    </>
  );
}

const opts = (xs: readonly string[]) => xs.map((v) => ({ value: v, label: v }));
const STATUS_OPTIONS = STATUSES_OF_WORK.map((v) => ({ value: v, label: STATUS_OF_WORK_LABEL[v] }));

/** Issue and the two pending points, the same columns in the daily log and the tracker. */
export function PendingIssueFields({ d = {} }: { d?: Record<string, string> }) {
  return (
    <>
      <fieldset className="grid gap-3 rounded-lg border border-line p-3 sm:col-span-3 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Issue / discomfort</legend>
        <SelectField label="Issue level" name="issueLevel" defaultValue={d.issueLevel} options={ISSUE_LEVELS.map((v) => ({ value: v, label: `${v} – ${ISSUE_LEVEL_HINT[v]}` }))} placeholder="No issue" />
        <TextArea label="Issue / discomfort details" name="issueDetails" rows={1} defaultValue={d.issueDetails} />
        <SelectField label="Issue status" name="issueStatus" defaultValue={d.issueStatus} options={opts(ISSUE_STATUSES)} hint="Open until resolved" />
      </fieldset>
      <fieldset className="grid gap-3 rounded-lg border border-warn/30 bg-warn-bg/40 p-3 sm:col-span-3 sm:grid-cols-4">
        <legend className="px-1 text-sm font-semibold">Pending with client <span className="font-normal text-muted">(we asked, client has not given)</span></legend>
        <TextArea label="Pending item – client" name="clientPendingItem" rows={1} defaultValue={d.clientPendingItem} hint="Several points can go in one box" />
        <TextField label="Raised on – client" name="clientRaisedOn" type="date" defaultValue={d.clientRaisedOn} />
        <TextField label="Due by – client" name="clientDueBy" type="date" defaultValue={d.clientDueBy} />
        <SelectField label="Status – client" name="clientPendingStatus" defaultValue={d.clientPendingStatus} options={opts(PENDING_STATUSES)} />
      </fieldset>
      <fieldset className="grid gap-3 rounded-lg border border-info/30 bg-info-bg/40 p-3 sm:col-span-3 sm:grid-cols-4">
        <legend className="px-1 text-sm font-semibold">Pending with team member <span className="font-normal text-muted">(our side, still to do)</span></legend>
        <TextArea label="Pending item – team" name="teamPendingItem" rows={1} defaultValue={d.teamPendingItem} />
        <TextField label="Raised on – team" name="teamRaisedOn" type="date" defaultValue={d.teamRaisedOn} />
        <TextField label="Due by – team" name="teamDueBy" type="date" defaultValue={d.teamDueBy} />
        <SelectField label="Status – team" name="teamPendingStatus" defaultValue={d.teamPendingStatus} options={opts(PENDING_STATUSES)} />
      </fieldset>
    </>
  );
}

/** The Team Daily Work Log row, column for column. */
function LogFields({ clients, workTypes, lines, d, years, tasks }: {
  clients: Option[]; workTypes: Option[]; lines: Option[]; d: Record<string, string>; years: string[]; tasks?: Option[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <TextField label="Date of visit / work" name="workDate" type="date" required defaultValue={d.workDate} />
      <SelectField label="Tracker Ref No." name="trackerLineId" options={lines} defaultValue={d.trackerLineId} placeholder="New work (no Ref No.)" hint="Work given to you in the tracker; leave as new otherwise" />
      <SelectField label="Branch" name="branch" options={opts(BRANCHES)} defaultValue={d.branch} />
      <SearchSelect label="Client" name="clientId" options={clients} defaultValue={d.clientId} placeholder="Search your clients…" emptyLabel="Office / Other" hint="Your allocated clients for this date" />
      <TextField label="Office / other — what was it?" name="clientNameText" defaultValue={d.clientNameText} hint="Optional, e.g. office work or a client not allocated to you" />
      <SelectField label="Place of work" name="placeOfWork" options={opts(PLACES_OF_WORK)} defaultValue={d.placeOfWork} />
      <SelectField label="Type of work" name="workTypeId" options={workTypes} defaultValue={d.workTypeId} required />
      <TextField label="Bank name" name="bankName" defaultValue={d.bankName} hint="Required for bank posting, reconciliation and card work" />
      <TextField label="No. of transactions / entries" name="transactionCount" type="number" min={0} defaultValue={d.transactionCount} />
      <TextField label="Period from" name="periodFrom" type="date" required defaultValue={d.periodFrom} />
      <TextField label="Period to" name="periodTo" type="date" required defaultValue={d.periodTo} />
      <SelectField label="Status of work" name="workStatus" options={STATUS_OPTIONS} defaultValue={d.workStatus} />
      <TimeBlock start={d.startTime} end={d.endTime} hours={d.hours} minutes={d.minutes} />
      <TextArea label="Elaboration / details of work done" name="workDetails" rows={2} defaultValue={d.workDetails} className="sm:col-span-3" />
      <PendingIssueFields d={d} />
      <details className="rounded-lg border border-line p-3 sm:col-span-3">
        <summary className="cursor-pointer text-sm font-medium text-muted">More (optional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {tasks && <SelectField label="Related task" name="taskId" options={tasks} placeholder="None" />}
          <SelectField label="Resource type" name="resourceType" options={RESOURCE_OPTIONS} defaultValue={d.resourceType} hint="Filled from the allocation if left blank" />
          <SelectField label="Assessment year (AY)" name="assessmentYear" options={[...new Set([...years, ...(d.assessmentYear ? [d.assessmentYear] : [])])].map((y) => ({ value: y, label: y }))} defaultValue={d.assessmentYear} />
          <TextArea label="Message sent on WhatsApp (if any)" name="whatsappMessage" rows={1} defaultValue={d.whatsappMessage} />
        </div>
      </details>
    </div>
  );
}

export function TimesheetForm({ action, clients, workTypes, tasks, lines, date, years, prefill = {} }: {
  action: Act; clients: Option[]; workTypes: Option[]; tasks: Option[]; lines: Option[]; date: string; years: string[]; prefill?: Record<string, string>;
}) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <LogFields clients={clients} workTypes={workTypes} lines={lines} tasks={tasks} years={years} d={{ workDate: date, ...prefill }} />
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
        {withWhom === "TEAM_MEMBER" && <SearchSelect label="Team member" name="pendingWithEmployeeId" options={employees} emptyLabel="Me" />}
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
        <SubmitButton variant="secondary">Mark selected as Checked – OK</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EntryReviewForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action}>
      <TextArea label="Review remark" name="note" rows={2} hint="Required when returning the entry for correction" />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="REVIEWED" size="sm">Checked – OK</SubmitButton>
        <SubmitButton name="decision" value="RETURNED" variant="secondary" size="sm">Checked – Needs correction</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function EntryCorrectionForm({ action, clients, workTypes, lines, d, needsReason, years }: {
  action: Act; clients: Option[]; workTypes: Option[]; lines: Option[]; d: Record<string, string>; needsReason: boolean; years: string[];
}) {
  return (
    <ActionForm action={action}>
      <LogFields clients={clients} workTypes={workTypes} lines={lines} years={years} d={d} />
      <TextField label="Reason for correction" name="reason" required={needsReason} hint={needsReason ? "Required when correcting someone else's entry" : "Optional"} />
      <SubmitButton variant="secondary">Save correction</SubmitButton>
    </ActionForm>
  );
}
