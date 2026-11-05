"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { ActionForm, Checkbox, SelectField, SubmitButton, TextField, type FormState } from "@/components/form";
import { SearchSelect } from "@/components/pickers";
import { formatHours, type DayCapacity } from "@/lib/domain/allocation";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string; level?: string | null };

/** First-half / second-half hours, with one-click choices for the usual patterns. */
function HalfDayHours({ capacity }: { capacity: DayCapacity }) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const presets = [
    { key: "full", label: "Full day", first: "", second: "" },
    { key: "first", label: `First half (${formatHours(capacity.first)} h)`, first: formatHours(capacity.first), second: "0" },
    { key: "second", label: `Second half (${formatHours(capacity.second)} h)`, first: "0", second: formatHours(capacity.second) },
  ];
  const active = presets.find((p) => p.first === first && p.second === second)?.key;
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink">Hours</legend>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={active === p.key}
            onClick={() => { setFirst(p.first); setSecond(p.second); }}
            className={clsx("rounded-full border px-2.5 py-1 text-xs font-medium transition-colors", active === p.key ? "border-ink bg-ink text-paper" : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink")}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <TextField label="First half (hours)" name="firstHalfHours" type="number" min={0} max={capacity.first} step={0.25} value={first} onChange={(e) => setFirst(e.target.value)} hint={`Up to ${formatHours(capacity.first)} h`} />
        <TextField label="Second half (hours)" name="secondHalfHours" type="number" min={0} max={capacity.second} step={0.25} value={second} onChange={(e) => setSecond(e.target.value)} hint={`Up to ${formatHours(capacity.second)} h`} />
      </div>
    </fieldset>
  );
}

export function AllocationForm({ action, employees, clients, defaultClient, today, capacity }: { action: Act; employees: Option[]; clients: Option[]; defaultClient: string; today: string; capacity: DayCapacity }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <SearchSelect label="Client" name="clientId" required defaultValue={defaultClient} options={clients} placeholder="Search clients…" />
      <SearchSelect label="Team member" name="employeeId" required options={employees} />
      <SelectField label="Role on this client" name="seniorityLevel" options={[
        { value: "JUNIOR", label: "Junior" }, { value: "MID_LEVEL", label: "Mid-level" }, { value: "SENIOR", label: "Senior" },
      ]} />
      <SelectField label="Resource type" name="resourceType" options={[
        { value: "Dedicated", label: "Dedicated" }, { value: "Shared", label: "Shared" }, { value: "Backend Team", label: "Backend Team" },
      ]} />
      <div className="grid grid-cols-2 gap-3">
        <TextField label="From" name="startDate" type="date" required defaultValue={today} />
        <TextField label="To" name="endDate" type="date" hint="Blank = ongoing" />
      </div>
      <HalfDayHours capacity={capacity} />
      <SearchSelect label="Reports to (timesheet reviewer)" name="reportsToEmployeeId" options={employees} emptyLabel="Use their usual manager" hint="Reviews this person's timesheet for this client" />
      <SearchSelect label="Team leader (escalation)" name="teamLeaderEmployeeId" options={employees} emptyLabel="None" hint="Told when a review is overdue" />
      <Checkbox name="allowOverlap" label="Allow overlap with other allocations" />
      <SubmitButton>Allocate</SubmitButton>
    </ActionForm>
  );
}

export function ChangeForm({ action, employees, today }: { action: Act; employees: Option[]; today: string }) {
  return (
    <ActionForm action={action}>
      <SearchSelect label="Replace with" name="employeeId" required options={employees} />
      <TextField label="Effective from" name="effectiveDate" type="date" required defaultValue={today} />
      <TextField label="Reason" name="changeReason" />
      <Checkbox name="allowOverlap" label="Allow overlap" />
      <SubmitButton size="sm" confirm="Replace the current team member on this allocation from the effective date?">Change allocation</SubmitButton>
    </ActionForm>
  );
}
