"use client";

import { useState } from "react";
import { ActionForm, Checkbox, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

export function LeaveRequestForm({ action, today, plannedNotice, earliestPlanned }: { action: Act; today: string; plannedNotice: number; earliestPlanned: string }) {
  const [type, setType] = useState("CASUAL");
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Type" name="leaveType" placeholder={null} value={type} onChange={(e) => setType(e.target.value)} options={[
          { value: "CASUAL", label: "Casual" }, { value: "SICK", label: "Sick" }, { value: "PLANNED", label: `Planned (${plannedNotice}+ days ahead)` }, { value: "UNPAID", label: "Unpaid" }, { value: "OTHER", label: "Other" },
        ]} />
        <div className="pt-6"><Checkbox name="isHalfDay" label="Half day" /></div>
        <TextField label="From" name="fromDate" type="date" required defaultValue={type === "PLANNED" ? earliestPlanned : today} min={type === "PLANNED" ? earliestPlanned : undefined} key={`f-${type}`} />
        <TextField label="To" name="toDate" type="date" required defaultValue={type === "PLANNED" ? earliestPlanned : today} min={type === "PLANNED" ? earliestPlanned : undefined} key={`t-${type}`} />
      </div>
      {type === "PLANNED" && <p className="text-xs text-muted">Planned leave must be requested and approved at least {plannedNotice} days ahead, so the earliest date is {earliestPlanned}.</p>}
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

const KINDS = [
  { value: "LATE_ARRIVAL", label: "I'll be late / half day", hint: "Before your reporting time: your reason and when you expect to arrive (for a half day, your second-half arrival time). Mark in with your location when you reach. One late arrival a month informed in advance is a warning only." },
  { value: "ABSENT", label: "I can't come today", hint: "Raises a leave request for the day for your Team Lead to decide. Without a request in the ERP an absence counts double." },
  { value: "EARLY_LEAVE", label: "Leave early", hint: "Your Team Lead's permission to leave before your scheduled time. Leaving before the half-day time still counts as a half day." },
  { value: "OVERTIME", label: "Stay late (overtime)", hint: "Prior permission to stay after 6:45 PM: what task, and why it cannot wait till tomorrow. Only approved overtime is counted, in real minutes." },
] as const;

/** One form for everything the rules ask to be raised in the ERP; the fields follow the choice. */
export function RequestForm({ action, today, initialKind, defaults }: { action: Act; today: string; initialKind?: string; defaults: { arrival: string; leaving: string; overtimeUntil: string } }) {
  const [kind, setKind] = useState<string>(KINDS.some((k) => k.value === initialKind) ? initialKind! : "LATE_ARRIVAL");
  const info = KINDS.find((k) => k.value === kind)!;
  return (
    <ActionForm action={action}>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">What do you want to tell your Team Lead?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map((k) => (
            <label key={k.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${kind === k.value ? "border-ink bg-paper font-medium" : "border-line hover:border-ink/30"}`}>
              <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="accent-ink" />
              {k.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{info.hint}</p>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Date" name="requestDate" type="date" required defaultValue={today} min={today} />
        {kind === "LATE_ARRIVAL" && <TextField label="Expected arrival" name="atTime" type="time" required defaultValue={defaults.arrival} key="arr" />}
        {kind === "EARLY_LEAVE" && <TextField label="Leaving at" name="atTime" type="time" required defaultValue={defaults.leaving} key="leave" />}
        {kind === "OVERTIME" && <TextField label="Expected to finish by" name="atTime" type="time" defaultValue={defaults.overtimeUntil} key="ot" />}
      </div>
      {kind === "OVERTIME" && (
        <>
          <TextArea label="What task will you be doing?" name="task" rows={2} required />
          <TextArea label="Why can it not wait till tomorrow?" name="whyNotTomorrow" rows={2} required />
        </>
      )}
      <TextArea label={kind === "OVERTIME" ? "Anything else" : "Reason"} name="reason" rows={2} required={kind !== "OVERTIME"} key={`r-${kind}`} defaultValue={kind === "OVERTIME" ? "Urgent work" : undefined} />
      <SubmitButton>{kind === "LATE_ARRIVAL" || kind === "ABSENT" ? "Inform my Team Lead" : "Ask my Team Lead"}</SubmitButton>
    </ActionForm>
  );
}

/** Team Lead's decision. A late intimation is accepted by default and can be marked not genuine. */
export function RequestDecisionForm({ action, late }: { action: Act; late: boolean }) {
  return (
    <ActionForm action={action}>
      <TextField label="Note (optional)" name="note" />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="approve" size="sm">{late ? "Accept reason" : "Approve"}</SubmitButton>
        <SubmitButton name="decision" value="reject" variant="danger" size="sm">{late ? "Not genuine" : "Reject"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ScheduleForm({ action, employees, officeHours, defaults }: { action: Act; employees: Option[]; officeHours: string; defaults?: { employeeId?: string; place?: "OFFICE" | "SITE"; time?: string; site?: string } }) {
  const [place, setPlace] = useState(defaults?.place ?? "SITE");
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Team member" name="employeeId" required options={employees} defaultValue={defaults?.employeeId} />
        <SelectField label="Works at" name="place" placeholder={null} value={place} onChange={(e) => setPlace(e.target.value as "OFFICE" | "SITE")} options={[
          { value: "SITE", label: "Client site (own reporting time)" }, { value: "OFFICE", label: `Office (${officeHours})` },
        ]} />
        {place === "SITE" && (
          <>
            <TextField label="Client / site" name="siteName" required defaultValue={defaults?.site} placeholder="e.g. ABC Traders, Okhla" />
            <TextField label="Reporting time" name="siteReportingTime" type="time" required defaultValue={defaults?.time ?? "10:00"} hint="Their day lasts 8 hours from this time" />
          </>
        )}
      </div>
      <SubmitButton>Save timing</SubmitButton>
    </ActionForm>
  );
}

export function LunchShiftForm({ action, employees, defaultTime }: { action: Act; employees: Option[]; defaultTime: string }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Team member (in today)" name="employeeId" required options={employees} />
        <TextField label="Lunch from" name="lunchAt" type="time" required defaultValue={defaultTime} />
      </div>
      <SubmitButton>Move today&apos;s lunch</SubmitButton>
    </ActionForm>
  );
}
