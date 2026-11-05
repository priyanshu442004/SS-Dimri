"use client";

import { useRef, useState } from "react";
import { ActionForm, Checkbox, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";
import { SearchSelect } from "@/components/pickers";
import { COMPLIANCE_FREQUENCIES, defaultAuthority, normalizeFrequency } from "@/lib/domain/compliance";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string; level?: string | null };

export type ComplianceChoice = { id: string; department: string; name: string; form: string | null; frequency: string | null };
export type EntryDefaults = {
  department: string;
  complianceItemId: string;
  complianceType: string;
  clientId: string;
  issuingAuthority: string;
  registrationNumber: string;
  dueDate: string;
  frequency: string;
  responsibleEmployeeId: string;
  reminderLeadDays: string;
  actionTaken: boolean;
  actionTakenOn: string;
  remarks: string;
  custom: Record<string, string>;
};

const FREQUENCIES = COMPLIANCE_FREQUENCIES.map((f) => ({ value: f, label: f }));

/**
 * The module comes first: choosing GST narrows the compliance list to GST's own
 * (GSTR-1, GSTR-3B, …), and choosing a compliance fills in what it can.
 */
export function ComplianceEntryForm({ action, departments, items, clients, employees, columns, defaults, submitLabel, resetOnSuccess }: {
  action: Act;
  departments: string[];
  items: ComplianceChoice[];
  clients: Option[];
  employees: Option[];
  columns: { id: string; label: string }[];
  defaults: Partial<EntryDefaults>;
  submitLabel: string;
  resetOnSuccess?: boolean;
}) {
  const [department, setDepartment] = useState(defaults.department ?? departments[0] ?? "");
  const [itemId, setItemId] = useState(defaults.complianceItemId ?? "");
  const [type, setType] = useState(defaults.complianceType ?? "");
  const [frequency, setFrequency] = useState(defaults.frequency ?? "");
  const [authority, setAuthority] = useState(defaults.issuingAuthority ?? defaultAuthority(defaults.department ?? departments[0] ?? ""));
  const typedType = useRef(false);

  const available = items.filter((i) => i.department === department);

  function chooseDepartment(next: string) {
    setDepartment(next);
    setItemId("");
    if (!typedType.current) setType("");
    setAuthority(defaultAuthority(next));
  }

  function chooseItem(id: string) {
    setItemId(id);
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setType(item.name);
    typedType.current = false;
    setFrequency(normalizeFrequency(item.frequency));
  }

  return (
    <ActionForm action={action} resetOnSuccess={resetOnSuccess}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField label="Module" name="department" required placeholder={null} value={department} onChange={(e) => chooseDepartment(e.target.value)} options={departments.map((d) => ({ value: d, label: d }))} />
        <SelectField
          label={`${department} compliance`}
          name="complianceItemId"
          value={itemId}
          onChange={(e) => chooseItem(e.target.value)}
          placeholder="Choose…"
          options={available.map((i) => ({ value: i.id, label: i.form && i.form !== "—" && !i.name.includes(i.form) ? `${i.name} (${i.form})` : i.name }))}
        />
        <TextField
          label="Compliance / licence type"
          name="complianceType"
          required
          value={type}
          onChange={(e) => { setType(e.target.value); typedType.current = true; }}
          hint="Add the period if you like, e.g. GSTR-1 (Sep-2026)"
        />
        <SearchSelect label="Client" name="clientId" defaultValue={defaults.clientId ?? ""} options={clients} placeholder="Search clients…" emptyLabel="The firm itself" />
        <TextField label="Issuing authority" name="issuingAuthority" value={authority} onChange={(e) => setAuthority(e.target.value)} />
        <TextField label="Licence / registration no." name="registrationNumber" defaultValue={defaults.registrationNumber} />
        <TextField label="Due date" name="dueDate" type="date" required defaultValue={defaults.dueDate} />
        <SelectField label="Renewal frequency" name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} options={FREQUENCIES} />
        <SearchSelect label="Responsible person" name="responsibleEmployeeId" defaultValue={defaults.responsibleEmployeeId ?? ""} options={employees} emptyLabel="Nobody yet" hint="Gets the reminder" />
        <TextField label="Reminder lead days" name="reminderLeadDays" type="number" min={0} max={365} defaultValue={defaults.reminderLeadDays ?? "7"} hint="Days before the due date" />
        <TextField label="Action taken on" name="actionTakenOn" type="date" defaultValue={defaults.actionTakenOn} />
        <div className="pt-7"><Checkbox name="actionTaken" label="Action taken (filed / renewed)" defaultChecked={defaults.actionTaken} /></div>
        {columns.map((c) => (
          <TextField key={c.id} label={c.label} name={`custom:${c.id}`} defaultValue={defaults.custom?.[c.id]} />
        ))}
        <TextArea label="Remarks" name="remarks" rows={2} defaultValue={defaults.remarks} className="sm:col-span-2 lg:col-span-3" />
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}

export function AddColumnForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action} resetOnSuccess className="flex flex-wrap items-end gap-2 space-y-0">
      <TextField label="New column" name="label" placeholder="e.g. Acknowledgement no." className="min-w-56" />
      <SubmitButton variant="secondary" size="sm">Add column</SubmitButton>
    </ActionForm>
  );
}

/** "Remark (If Date Extend)": type the extended date, saved with the button. */
export function ExtendedDateForm({ action, value, label }: { action: Act; value: string; label: string }) {
  return (
    <ActionForm action={action} className="flex items-end gap-1.5 space-y-0">
      <input name="remark" defaultValue={value} aria-label={label} placeholder="e.g. Extended to 15 Dec 2026" maxLength={300} className="h-8 w-48 rounded-md border border-line bg-surface px-2 text-xs" />
      <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
    </ActionForm>
  );
}

/** Yes / No for "Applies to the firm itself?", saved as soon as it changes. */
export function AppliesToFirmSelect({ action, value, label }: { action: Act; value: boolean; label: string }) {
  const [current, setCurrent] = useState(value ? "yes" : "no");
  const [pending, setPending] = useState(false);
  return (
    <select
      aria-label={label}
      value={current}
      disabled={pending}
      onChange={async (e) => {
        const next = e.target.value;
        setCurrent(next);
        setPending(true);
        const fd = new FormData();
        fd.set("value", next);
        const r = await action({}, fd);
        setPending(false);
        if (r.ok === false) setCurrent(current);
      }}
      className="h-8 rounded-md border border-line bg-surface px-1.5 text-xs"
    >
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  );
}
