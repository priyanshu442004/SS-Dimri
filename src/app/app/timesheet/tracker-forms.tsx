"use client";

import { ActionForm, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";
import { SearchSelect } from "@/components/pickers";
import { BRANCHES, CHECKER_STATUSES, PRIORITIES, STATUS_OF_WORK_LABEL, STATUSES_OF_WORK } from "@/lib/domain/tracker";
import { PendingIssueFields } from "../worklog-forms";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };
const opts = (xs: readonly string[]) => xs.map((v) => ({ value: v, label: v }));

/** One line of the Accounting Workflow Tracker, in the workbook's column order. */
export function TrackerLineForm({ action, clients, workTypes, people, d = {}, submitLabel }: {
  action: Act; clients: Option[]; workTypes: string[]; people: Option[]; d?: Record<string, string>; submitLabel: string;
}) {
  return (
    <ActionForm action={action} resetOnSuccess={!d.refNo}>
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="Tracker Ref No." name="refNo" defaultValue={d.refNo} hint="Blank = next free number for the client, e.g. RDK-001" />
        <SearchSelect label="Client" name="clientId" options={clients} defaultValue={d.clientId} placeholder="Search clients…" emptyLabel="Not in the list" />
        <TextField label="Client name (if not in list)" name="clientNameText" defaultValue={d.clientNameText} />
        <SelectField label="Branch" name="branch" options={opts(BRANCHES)} defaultValue={d.branch} />
        <SelectField label="Type of work" name="typeOfWork" options={opts(workTypes)} defaultValue={d.typeOfWork} required />
        <TextField label="Bank name" name="bankName" defaultValue={d.bankName} hint="Required for bank and card work" />
        <TextField label="Period from" name="periodFrom" type="date" defaultValue={d.periodFrom} />
        <TextField label="Period to" name="periodTo" type="date" defaultValue={d.periodTo} hint="Blank = onwards" />
        <SelectField label="Status of work" name="statusOfWork" placeholder={null} options={STATUSES_OF_WORK.map((v) => ({ value: v, label: STATUS_OF_WORK_LABEL[v] }))} defaultValue={d.statusOfWork ?? "NOT_STARTED"} />
        <PendingIssueFields d={d} />
        <TextField label="Get from (client contact)" name="getFrom" defaultValue={d.getFrom} />
        <TextField label="Date received" name="dateReceived" type="date" defaultValue={d.dateReceived} hint="When the client's data came in; clears the client item" />
        <SelectField label="Priority" name="priority" options={opts(PRIORITIES)} defaultValue={d.priority} />
        <SearchSelect label="Maker" name="makerEmployeeId" options={people} defaultValue={d.makerEmployeeId} placeholder="Search team…" emptyLabel="Not assigned" hint="The work shows in their timesheet" />
        <SearchSelect label="Checker" name="checkerEmployeeId" options={people} defaultValue={d.checkerEmployeeId} placeholder="Search team…" emptyLabel="Not assigned" />
        <SelectField label="Checker status" name="checkerStatus" options={opts(CHECKER_STATUSES)} defaultValue={d.checkerStatus} />
        <TextField label="Work start date" name="workStartDate" type="date" defaultValue={d.workStartDate} />
        <TextField label="Next follow-up date" name="nextFollowUpOn" type="date" defaultValue={d.nextFollowUpOn} />
        <TextArea label="Remarks (internal)" name="remarks" rows={1} defaultValue={d.remarks} />
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}
