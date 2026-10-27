"use client";

import { ActionForm, Checkbox, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

export function CorrectionForm({ action, employees, date }: { action: Act; employees: Option[]; date: string }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField label="Team member" name="employeeId" required options={employees} />
        <TextField label="Date" name="date" type="date" required defaultValue={date} />
        <SelectField label="Status" name="status" required placeholder={null} defaultValue="PRESENT" options={[
          { value: "PRESENT", label: "Present (P)" }, { value: "ABSENT", label: "Absent (A)" }, { value: "LEAVE", label: "Leave (L)" }, { value: "HALF_DAY", label: "Half day (HD)" },
        ]} />
        <TextField label="Time in" name="timeIn" type="time" />
        <TextField label="Time out" name="timeOut" type="time" />
        <TextField label="Reason" name="reason" required />
      </div>
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}

export function LeaveRequestForm({ action, today }: { action: Act; today: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="From" name="fromDate" type="date" required defaultValue={today} />
        <TextField label="To" name="toDate" type="date" required defaultValue={today} />
        <SelectField label="Type" name="leaveType" placeholder={null} defaultValue="CASUAL" options={[
          { value: "CASUAL", label: "Casual" }, { value: "SICK", label: "Sick" }, { value: "PLANNED", label: "Planned" }, { value: "UNPAID", label: "Unpaid" }, { value: "OTHER", label: "Other" },
        ]} />
        <div className="space-y-2 pt-6">
          <Checkbox name="isHalfDay" label="Half day" />
          <Checkbox name="withIntimation" label="Team lead informed in advance" defaultChecked />
        </div>
      </div>
      <TextArea label="Reason" name="reason" rows={2} />
      <SubmitButton>Request leave</SubmitButton>
    </ActionForm>
  );
}

export function LeaveDecisionForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action}>
      <TextField label="Note (optional)" name="note" />
      <div className="flex gap-2">
        <SubmitButton name="decision" value="approve" size="sm">Approve</SubmitButton>
        <SubmitButton name="decision" value="reject" variant="danger" size="sm">Reject</SubmitButton>
      </div>
    </ActionForm>
  );
}
