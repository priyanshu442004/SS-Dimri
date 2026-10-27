"use client";

import { ActionForm, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;

export function DayReportForm({ action, date, employees, recipients, d }: {
  action: Act;
  date: string;
  employees: { value: string; label: string }[];
  recipients: string[];
  d: Record<string, string>;
}) {
  return (
    <ActionForm action={action}>
      <TextField label="Report date" name="reportDate" type="date" required defaultValue={date} />
      <TextArea label="Morning work plan" name="workPlan" rows={2} defaultValue={d.workPlan} />
      <TextArea label="Work completed" name="completedWork" rows={4} defaultValue={d.completedWork} hint="Pre-filled from today's timesheet and task updates — edit freely" />
      <TextArea label="New work assigned" name="newAssignments" rows={2} defaultValue={d.newAssignments} />
      <TextArea label="Pending work" name="pendingWork" rows={3} defaultValue={d.pendingWork} />
      <TextArea label="Blockers" name="blockers" rows={2} defaultValue={d.blockers} />
      <TextArea label="Notes" name="summary" rows={2} defaultValue={d.summary} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Send to manager(s)</legend>
        <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-line p-2">
          {employees.map((e) => (
            <label key={e.value} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="recipientIds[]" value={e.value} defaultChecked={recipients.includes(e.value)} className="accent-brand-700" />
              {e.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="submit" value="send">Send report</SubmitButton>
        <SubmitButton name="submit" value="draft" variant="secondary">Save draft</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function DayReportReviewForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action}>
      <TextArea label="Review remark (optional)" name="remark" rows={3} />
      <SubmitButton>Mark reviewed</SubmitButton>
    </ActionForm>
  );
}
