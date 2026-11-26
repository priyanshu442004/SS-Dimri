"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Check } from "lucide-react";
import { GST_TYPE_KEYS, GST_TYPE_NOTE, GST_TYPES, gstItemApplies, isGstType, type GstType } from "@/lib/domain/gst-type";

export type ComplianceOption = { id: string; department: string; name: string; form: string | null; frequency: string | null; dueDateRule: string | null };

/**
 * Departments the client is with (GST, Income Tax, TDS…). Picking one lists every compliance
 * of that department from the master data, all ticked, to untick what does not apply.
 * Posts departments[] and complianceItemIds[].
 */
export function CompliancePicker({ items: allItems, departments, defaultDepartments = [], defaultIds, defaultGstType = "", gstinTypes = [] }: {
  items: ComplianceOption[];
  departments: string[];
  defaultDepartments?: string[];
  /** Omitted: every compliance of the chosen departments starts ticked. */
  defaultIds?: string[];
  /** GST registration type (tracker S.No. 74): the GST compliances listed follow it. */
  defaultGstType?: string;
  /** Own types of the client's GSTINs (e.g. a separate ISD registration): their compliances are listed too. */
  gstinTypes?: string[];
}) {
  const [gstType, setGstType] = useState<GstType | "">(isGstType(defaultGstType) ? defaultGstType : "");
  const extra = gstinTypes.filter(isGstType);
  const types = (t: GstType | "") => (t || extra.length ? [t || null, ...extra] : null);
  const items = allItems.filter((i) => gstItemApplies(types(gstType), i));
  const [chosen, setChosen] = useState(() => new Set(defaultDepartments));
  const [ids, setIds] = useState(() => new Set(defaultIds ?? allItems.filter((i) => defaultDepartments.includes(i.department) && gstItemApplies(types(isGstType(defaultGstType) ? defaultGstType : ""), i)).map((i) => i.id)));
  function changeGstType(t: GstType | "") {
    setGstType(t);
    // GST compliances of the new type start ticked (if GST is chosen); the others are dropped.
    setIds((prev) => {
      const next = new Set([...prev].filter((id) => { const i = allItems.find((x) => x.id === id); return !i || gstItemApplies(types(t), i); }));
      if (chosen.has("GST")) for (const i of allItems) if (i.department === "GST" && gstItemApplies(types(t), i)) next.add(i.id);
      return next;
    });
  }

  function toggleDept(d: string, on: boolean) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(d); else next.delete(d);
      return next;
    });
    const deptIds = items.filter((i) => i.department === d).map((i) => i.id);
    setIds((prev) => {
      const next = new Set(prev);
      for (const id of deptIds) if (on) next.add(id); else next.delete(id);
      return next;
    });
  }
  const toggleIds = (list: string[], on: boolean) =>
    setIds((prev) => {
      const next = new Set(prev);
      for (const id of list) if (on) next.add(id); else next.delete(id);
      return next;
    });

  return (
    <div className="space-y-4">
      <label className="block max-w-md">
        <span className="mb-1 block text-sm font-medium">GST registration type</span>
        <select name="gstRegistrationType" value={gstType} onChange={(e) => changeGstType(e.target.value as GstType | "")} className="h-10 w-full rounded-md border border-line bg-surface px-2 text-sm">
          <option value="">Not set</option>
          {GST_TYPE_KEYS.map((k) => <option key={k} value={k}>{GST_TYPES[k]}</option>)}
        </select>
        <span className="mt-1 block text-xs text-muted">{gstType ? GST_TYPE_NOTE[gstType] : "Regular, Composition dealer, ISD or Surrendered (cancelled): the GST compliances below follow it."}{extra.length ? ` A GSTIN of this client is registered as ${extra.map((t) => GST_TYPES[t]).join(", ")}: its compliances are listed too.` : ""}</span>
      </label>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Departments the client is with</legend>
        <div className="flex flex-wrap gap-2" role="group">
          {departments.map((d) => {
            const on = chosen.has(d);
            const count = items.filter((i) => i.department === d).length;
            return (
              <label key={d} className={clsx("inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors", on ? "border-ink bg-ink text-paper" : "border-line bg-surface hover:border-ink/40")}>
                <input type="checkbox" name="departments[]" value={d} checked={on} onChange={(e) => toggleDept(d, e.target.checked)} className="sr-only" />
                {on && <Check className="size-3.5" aria-hidden />}
                {d}
                {count > 0 && <span className={clsx("text-xs", on ? "text-paper/70" : "text-muted")}>{count}</span>}
              </label>
            );
          })}
        </div>
      </fieldset>
      {[...chosen].filter((d) => departments.includes(d)).map((d) => {
        const list = items.filter((i) => i.department === d);
        if (!list.length) return <p key={d} className="text-xs text-muted">{d === "GST" && gstType === "SURRENDERED" ? "GST: the registration is surrendered (cancelled) — no regular GST returns." : `${d}: no statutory compliances in the master list.`}</p>;
        const listIds = list.map((i) => i.id);
        const ticked = listIds.filter((id) => ids.has(id)).length;
        return (
          <fieldset key={d} className="rounded-lg border border-line p-3">
            <legend className="flex w-full items-center justify-between gap-3 px-1">
              <span className="text-sm font-semibold">{d} compliances <span className="font-normal text-muted">({ticked} of {list.length})</span></span>
            </legend>
            <label className="mb-2 inline-flex cursor-pointer items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                ref={(el) => { if (el) el.indeterminate = ticked > 0 && ticked < list.length; }}
                checked={ticked === list.length}
                onChange={(e) => toggleIds(listIds, e.target.checked)}
                className="size-4 accent-brand-700"
              />
              Select all in {d}
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {list.map((i) => (
                <label key={i.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-line p-2 text-sm hover:bg-subtle has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                  <input type="checkbox" name="complianceItemIds[]" value={i.id} checked={ids.has(i.id)} onChange={(e) => toggleIds([i.id], e.target.checked)} className="mt-0.5 size-4 accent-brand-700" />
                  <span className="min-w-0">
                    <span className="font-medium">{i.name}</span>
                    <span className="block text-xs text-muted">{[i.form, i.frequency, i.dueDateRule].filter(Boolean).join(" · ")}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
