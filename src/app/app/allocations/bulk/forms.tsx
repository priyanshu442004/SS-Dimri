"use client";

import { useActionState, useMemo, useState } from "react";
import { clsx } from "clsx";
import { ErrorsContext, SelectField, TextField, Checkbox, useSubmitWithoutReset } from "@/components/form";
import { SearchSelect } from "@/components/pickers";
import { buttonClass } from "@/components/ui";
import type { DayCapacity } from "@/lib/domain/allocation";
import { ALLOCATION_RESOURCE_TYPES, ALLOCATION_ROLES } from "@/lib/domain/allocation-import";
import { HalfDayHours, VisitPlan } from "../forms";

export type BulkState = { ok?: boolean; message?: string; fieldErrors?: Record<string, string[] | undefined>; results?: { client: string; ok: boolean; message: string }[] };
type Act = (p: BulkState, fd: FormData) => Promise<BulkState>;
type Option = { value: string; label: string; level?: string | null };
export type BulkClient = { id: string; name: string; code: string | null; people: { id: string; name: string }[] };
export type TransferRow = { id: string; client: string; code: string | null; days: string; hours: string; period: string; status: string };

const inputCls = "h-10 rounded-md border border-line bg-surface px-3 text-sm";

function Results({ state }: { state: BulkState }) {
  if (!state.message && !state.results) return null;
  const ok = state.results?.filter((r) => r.ok).length ?? 0;
  const failed = state.results?.filter((r) => !r.ok) ?? [];
  return (
    <div role="status" className={clsx("rounded-lg border p-3 text-sm", state.ok && !failed.length ? "border-ok/30 bg-ok-bg" : state.ok ? "border-warn/30 bg-warn-bg" : "border-danger/30 bg-danger-bg")}>
      <p className="font-medium">{state.message}</p>
      {state.results && state.results.length > 0 && (
        <>
          <p className="mt-1 text-xs">{ok} done{failed.length ? `, ${failed.length} not done` : ""}.</p>
          <ul className="mt-2 max-h-72 space-y-1 overflow-y-auto text-xs">
            {[...failed, ...state.results.filter((r) => r.ok)].map((r, i) => (
              <li key={i} className="flex gap-2"><span className={r.ok ? "text-ok" : "text-danger"}>{r.ok ? "✓" : "✗"}</span><span><strong>{r.client}</strong> — {r.message}</span></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return <button type="submit" disabled={pending} aria-busy={pending} className={buttonClass("primary", "md")}>{pending ? "Saving…" : children}</button>;
}

/** Tick many clients: search, show one person's clients or the unallocated ones, select all shown. */
function ClientChecklist({ clients, selected, setSelected, ofPerson, setOfPerson, people }: {
  clients: BulkClient[]; selected: Set<string>; setSelected: (s: Set<string>) => void; ofPerson: string; setOfPerson: (v: string) => void; people: Option[];
}) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return clients.filter((c) =>
      (ofPerson === "" || (ofPerson === "none" ? c.people.length === 0 : c.people.some((p) => p.id === ofPerson))) &&
      (!t || c.name.toLowerCase().includes(t) || (c.code ?? "").toLowerCase().includes(t)));
  }, [clients, q, ofPerson]);
  const allShown = shown.length > 0 && shown.every((c) => selected.has(c.id));
  const toggle = (id: string, on: boolean) => { const s = new Set(selected); if (on) s.add(id); else s.delete(id); setSelected(s); };
  return (
    <fieldset className="rounded-lg border border-line">
      <legend className="ml-3 px-1 text-sm font-medium">Clients <span className="font-normal text-muted">· {selected.size} selected</span></legend>
      <div className="flex flex-wrap gap-2 border-b border-line p-3">
        <select value={ofPerson} onChange={(e) => setOfPerson(e.target.value)} aria-label="Show the clients of" className={`${inputCls} max-w-[16rem]`}>
          <option value="">All active clients</option>
          <option value="none">Clients with no team yet</option>
          {people.map((p) => <option key={p.value} value={p.value}>Clients of {p.label}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client or code" aria-label="Search clients" className={`${inputCls} w-56`} />
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => { const s = new Set(selected); for (const c of shown) if (allShown) s.delete(c.id); else s.add(c.id); setSelected(s); }}>
          {allShown ? `Untick the ${shown.length} shown` : `Tick all ${shown.length} shown`}
        </button>
        {selected.size > 0 && <button type="button" className={buttonClass("ghost", "sm")} onClick={() => setSelected(new Set())}>Clear</button>}
      </div>
      <ul className="max-h-80 divide-y divide-line overflow-y-auto text-sm">
        {shown.length === 0 && <li className="p-3 text-muted">No client matches.</li>}
        {shown.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-subtle/60">
              <input type="checkbox" checked={selected.has(c.id)} onChange={(e) => toggle(c.id, e.target.checked)} className="mt-0.5 accent-ink" />
              <span className="min-w-0"><span className="font-medium">{c.name}</span>{c.code && <span className="ml-1 font-mono text-xs text-muted">{c.code}</span>}
                <span className="block text-xs text-muted">{c.people.length ? c.people.map((p) => p.name).join(", ") : "No team yet"}</span></span>
            </label>
          </li>
        ))}
      </ul>
      {[...selected].map((id) => <input key={id} type="hidden" name="clientIds[]" value={id} />)}
    </fieldset>
  );
}

/** Allocate one person to many clients at once (tracker S.No. 106). */
export function BulkAllocateForm({ action, employees, clients, today, capacity }: { action: Act; employees: Option[]; clients: BulkClient[]; today: string; capacity: DayCapacity }) {
  const [state, formAction, pending] = useActionState(action, {});
  const onSubmit = useSubmitWithoutReset(formAction);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [ofPerson, setOfPerson] = useState("");
  const [copy, setCopy] = useState(true);
  const person = employees.find((e) => e.value === ofPerson);
  const copying = !!person && copy;
  return (
    <ErrorsContext.Provider value={state.fieldErrors}>
      <form onSubmit={onSubmit} className="space-y-4">
        <SearchSelect label="Team member to allocate" name="employeeId" required options={employees} hint="e.g. the new junior who joins the team" />
        <ClientChecklist clients={clients} selected={selected} setSelected={setSelected} ofPerson={ofPerson} setOfPerson={setOfPerson} people={employees} />
        {person && (
          <label className="flex items-start gap-2 rounded-lg border border-line bg-paper p-3 text-sm">
            <input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} className="mt-0.5 accent-ink" />
            <span>Same days and hours as <strong>{person.label}</strong> on each client, with {person.label.split(" — ")[0]} as the reviewer <span className="block text-xs text-muted">Untick to set the days and hours yourself below.</span></span>
            {copy && <input type="hidden" name="copyFromEmployeeId" value={person.value} />}
          </label>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="From" name="startDate" type="date" required defaultValue={today} />
          <TextField label="To" name="endDate" type="date" hint="Blank = ongoing" />
          <SelectField label="Role on these clients" name="seniorityLevel" options={Object.entries(ALLOCATION_ROLES).map(([value, label]) => ({ value, label }))} />
          <SelectField label="Resource type" name="resourceType" options={ALLOCATION_RESOURCE_TYPES.map((t) => ({ value: t, label: t }))} />
        </div>
        {!copying && (
          <div className="space-y-3 rounded-lg border border-line p-3">
            <HalfDayHours capacity={capacity} />
            <VisitPlan />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <SearchSelect label="Reports to (timesheet reviewer)" name="reportsToEmployeeId" options={employees} emptyLabel={copying ? "The person above" : "Their usual manager"} />
          <SearchSelect label="Team leader (escalation)" name="teamLeaderEmployeeId" options={employees} emptyLabel={copying ? "Same as on that allocation" : "None"} />
        </div>
        <Checkbox name="allowOverlap" label="Allow overlap with their other allocations" />
        <TextField label="Remark" name="remark" />
        <Results state={state} />
        <Submit pending={pending}>Allocate to {selected.size || "the ticked"} client{selected.size === 1 ? "" : "s"}</Submit>
      </form>
    </ErrorsContext.Provider>
  );
}

/** Move many clients from one person to another in one go (tracker S.No. 105). */
export function BulkTransferForm({ action, employees, from, rows, today }: { action: Act; employees: Option[]; from: string; rows: TransferRow[]; today: string }) {
  const [state, formAction, pending] = useActionState(action, {});
  const onSubmit = useSubmitWithoutReset(formAction);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.map((r) => r.id)));
  const all = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string, on: boolean) => { const s = new Set(selected); if (on) s.add(id); else s.delete(id); setSelected(s); };
  return (
    <ErrorsContext.Provider value={state.fieldErrors}>
      <form onSubmit={onSubmit} className="space-y-4">
        <input type="hidden" name="fromEmployeeId" value={from} />
        {rows.length === 0 ? <p className="text-sm text-muted">This person has no current or planned allocation.</p> : (
          <fieldset className="rounded-lg border border-line">
            <legend className="ml-3 px-1 text-sm font-medium">Their clients <span className="font-normal text-muted">· {selected.size} of {rows.length} ticked</span></legend>
            <div className="border-b border-line p-2">
              <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setSelected(all ? new Set() : new Set(rows.map((r) => r.id)))}>{all ? "Untick all" : "Tick all"}</button>
            </div>
            <ul className="max-h-96 divide-y divide-line overflow-y-auto text-sm">
              {rows.map((r) => (
                <li key={r.id}>
                  <label className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-subtle/60">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={(e) => toggle(r.id, e.target.checked)} className="mt-0.5 accent-ink" />
                    <span className="min-w-0"><span className="font-medium">{r.client}</span>{r.code && <span className="ml-1 font-mono text-xs text-muted">{r.code}</span>}
                      <span className="block text-xs text-muted">{r.days} · {r.hours} · {r.period}{r.status === "PLANNED" ? " · starts later" : ""}</span></span>
                  </label>
                </li>
              ))}
            </ul>
            {[...selected].map((id) => <input key={id} type="hidden" name="allocationIds[]" value={id} />)}
          </fieldset>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <SearchSelect label="Move them to" name="toEmployeeId" required options={employees.filter((e) => e.value !== from)} />
          <TextField label="Effective from" name="effectiveDate" type="date" required defaultValue={today} hint="The old allocations end the day before" />
        </div>
        <TextField label="Reason" name="changeReason" placeholder="e.g. Left the job / moved to other clients" />
        <Checkbox name="handOverRoles" label="Also make the new person the reviewer / team leader wherever the old person was" />
        <Checkbox name="allowOverlap" label="Allow overlap with the new person's other allocations" />
        <Results state={state} />
        <Submit pending={pending}>Move {selected.size} client{selected.size === 1 ? "" : "s"}</Submit>
      </form>
    </ErrorsContext.Provider>
  );
}
