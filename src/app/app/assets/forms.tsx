"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { ActionForm, inputCls, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";
import { SearchSelect } from "@/components/pickers";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

type Spare = { key: number; name: string; issuedOn: string };

/**
 * Spare parts of an asset (client feedback, 26 Nov 2026): one row per part — the part and the date it
 * was issued. "+ Add spare part" adds a row; the whole list is saved with "Save asset".
 */
function SpareParts({ initial, today }: { initial: { name: string; issuedOn: string }[]; today: string }) {
  const [rows, setRows] = useState<Spare[]>(() => initial.map((p, i) => ({ key: i, ...p })));
  const [next, setNext] = useState(initial.length);
  const add = () => { setRows((r) => [...r, { key: next, name: "", issuedOn: today }]); setNext((n) => n + 1); };
  const set = (key: number, patch: Partial<Spare>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  return (
    <fieldset className="sm:col-span-2">
      <input type="hidden" name="sparePartsShown" value="1" />
      <legend className="mb-1.5 text-sm font-medium">Spare parts{rows.length ? ` (${rows.length})` : ""}</legend>
      {rows.length === 0 && <p className="mb-2 text-xs text-muted">None yet. Add a charger, RAM, battery, toner… with the date it was issued.</p>}
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_9.5rem_auto] items-end gap-2">
            <label className="text-sm">
              {i === 0 && <span className="mb-1 block text-xs text-muted">Spare part</span>}
              <input name="spareName" value={r.name} onChange={(e) => set(r.key, { name: e.target.value })} required maxLength={200} placeholder="e.g. Charger 65 W" aria-label={`Spare part ${i + 1}`} className={inputCls} />
            </label>
            <label className="text-sm">
              {i === 0 && <span className="mb-1 block text-xs text-muted">Issue date</span>}
              <input name="spareDate" type="date" value={r.issuedOn} onChange={(e) => set(r.key, { issuedOn: e.target.value })} required aria-label={`Issue date of spare part ${i + 1}`} className={inputCls} />
            </label>
            <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove spare part ${i + 1}`} title="Remove"
              className="grid size-10 place-items-center rounded-md border border-line text-muted hover:border-danger/40 hover:text-danger">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="mt-2 inline-flex items-center gap-1 rounded-md border border-dashed border-line px-3 py-1.5 text-sm font-medium text-brand-700 hover:border-brand-700/40 hover:bg-subtle">
        <Plus className="size-4" aria-hidden /> Add spare part
      </button>
    </fieldset>
  );
}

export function AssetForm({ action, categories, conditions, d = {}, edit = false, spareParts, today = "" }: {
  action: Act; categories: readonly string[]; conditions: Option[]; d?: Record<string, string>; edit?: boolean;
  /** Edit form only: the asset's spare parts. */
  spareParts?: { name: string; issuedOn: string }[]; today?: string;
}) {
  return (
    <ActionForm action={action} resetOnSuccess={!edit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Asset code" name="code" required defaultValue={d.code} placeholder="e.g. LAP-001" />
        <SelectField label="Category" name="category" defaultValue={d.category} options={categories.map((c) => ({ value: c, label: c }))} />
        <TextField label="Description" name="description" required defaultValue={d.description} placeholder="e.g. Dell Latitude 5420, i5, 16 GB" className="sm:col-span-2" />
        <TextField label="Serial no." name="serialNo" defaultValue={d.serialNo} />
        <TextField label="Purchase date" name="purchaseDate" type="date" defaultValue={d.purchaseDate} />
        <TextField label="Vendor" name="vendor" defaultValue={d.vendor} />
        <TextField label="Cost (₹)" name="cost" type="number" min={0} step="1" defaultValue={d.cost} />
        <TextField label="Location" name="location" defaultValue={d.location} placeholder="e.g. Naraina office" />
        <SelectField label="Condition" name="condition" defaultValue={d.condition} options={conditions} />
        {edit && d.status !== "ISSUED" && <SelectField label="Status" name="status" defaultValue={d.status} placeholder={null} options={[{ value: "IN_STOCK", label: "In stock" }, { value: "UNDER_REPAIR", label: "Under repair" }, { value: "DISPOSED", label: "Disposed" }]} />}
        <TextArea label="Notes" name="notes" rows={1} defaultValue={d.notes} />
        {edit && spareParts && <SpareParts initial={spareParts} today={today} />}
      </div>
      <SubmitButton>{edit ? "Save asset" : "Add asset"}</SubmitButton>
    </ActionForm>
  );
}

export function IssueForm({ action, employees, conditions, today }: { action: Act; employees: Option[]; conditions: Option[]; today: string }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-2 sm:grid-cols-2">
        <SearchSelect label="Issue to" name="employeeId" options={employees} required placeholder="Search the team member…" />
        <TextField label="Issue (out) date" name="issuedOn" type="date" required defaultValue={today} />
        <SelectField label="Condition at issue" name="issueCondition" options={conditions} />
        <TextField label="Notes" name="notes" placeholder="e.g. with charger and bag" />
      </div>
      <SubmitButton size="sm">Issue</SubmitButton>
    </ActionForm>
  );
}

/** Issue any asset in stock to a team member, from the Asset allocation tab. */
export function AllocateForm({ action, assets, employees, conditions, today }: { action: Act; assets: Option[]; employees: Option[]; conditions: Option[]; today: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <SearchSelect label="Asset (in stock)" name="assetId" options={assets} required placeholder="Search code or description…" />
      <SearchSelect label="Issue to" name="employeeId" options={employees} required placeholder="Search the team member…" />
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField label="Issue (out) date" name="issuedOn" type="date" required defaultValue={today} />
        <SelectField label="Condition at issue" name="issueCondition" options={conditions} />
      </div>
      <TextField label="Notes" name="notes" placeholder="e.g. with charger and bag" />
      <SubmitButton>Issue asset</SubmitButton>
    </ActionForm>
  );
}

export function ReturnForm({ action, conditions, today }: { action: Act; conditions: Option[]; today: string }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-2 sm:grid-cols-3">
        <TextField label="Return (in) date" name="returnedOn" type="date" required defaultValue={today} />
        <SelectField label="Condition at return" name="returnCondition" options={conditions} />
        <TextField label="Notes" name="notes" />
      </div>
      <SubmitButton size="sm">Take back</SubmitButton>
    </ActionForm>
  );
}
