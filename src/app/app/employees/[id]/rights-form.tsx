"use client";

import { useState } from "react";
import { ActionForm, SubmitButton, type FormState } from "@/components/form";
import { GRANTABLE_RIGHTS, MODULES, SUPPORT_STAFF_MODULES, can, type Capability, type ModuleKey, type Role } from "@/lib/permissions";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;

const MODULE_LIST = Object.entries(MODULES) as [ModuleKey, string][];
const GROUPS = [...new Set(GRANTABLE_RIGHTS.map((r) => r.group))];

/** Module access (e.g. attendance and payroll only) and extra rights for one person. */
export function RightsForm({ action, role, rights, restricted, modules, until = {}, today }: {
  action: Act; role: Role; rights: string[]; restricted: boolean; modules: string[]; until?: Record<string, string>; today: string;
}) {
  const [checked, setChecked] = useState<string[]>(rights);
  const [mode, setMode] = useState<"FULL" | "SUPPORT" | "CUSTOM">(
    !restricted ? "FULL" : modules.length === SUPPORT_STAFF_MODULES.length && SUPPORT_STAFF_MODULES.every((m) => modules.includes(m)) ? "SUPPORT" : "CUSTOM",
  );
  const [picked, setPicked] = useState<string[]>(restricted ? modules : [...SUPPORT_STAFF_MODULES]);
  const shown = mode === "SUPPORT" ? [...SUPPORT_STAFF_MODULES] as string[] : picked;
  const byRole = (c: Capability) => can(role, c);

  return (
    <ActionForm action={action}>
      <input type="hidden" name="moduleAccess" value={mode === "FULL" ? "FULL" : "CUSTOM"} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Which modules can they open?</legend>
        <div className="space-y-1.5 text-sm">
          {([
            ["FULL", "Everything their role allows"],
            ["SUPPORT", "Attendance & payroll only (peon, driver, support staff)"],
            ["CUSTOM", "Only the modules I choose"],
          ] as const).map(([v, label]) => (
            <label key={v} className="flex items-start gap-2">
              <input type="radio" name="accessChoice" value={v} checked={mode === v} onChange={() => setMode(v)} className="mt-0.5 accent-brand-700" />
              <span>{label}</span>
            </label>
          ))}
        </div>
        {mode !== "FULL" && (
          <div className="mt-2 grid gap-1 rounded-md border border-line p-2 sm:grid-cols-2">
            {MODULE_LIST.map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="modules[]"
                  value={k}
                  disabled={mode === "SUPPORT"}
                  checked={shown.includes(k)}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...p, k] : p.filter((x) => x !== k)))}
                  className="accent-brand-700"
                />
                {label}
                {/* A disabled checkbox is not posted, so the preset's modules are sent here. */}
                {mode === "SUPPORT" && shown.includes(k) && <input type="hidden" name="modules[]" value={k} />}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Extra rights</legend>
        <p className="mb-2 text-xs text-muted">Beyond what their role already allows. Ticked and greyed means the role already includes it. For a <strong className="text-ink">temporary right</strong> (e.g. adding clients for a week), set its <strong className="text-ink">Until</strong> date: the right is removed automatically after that day. Leave it blank for a permanent right.</p>
        <div className="space-y-3">
          {GROUPS.map((g) => (
            <div key={g}>
              <p className="mb-1 text-xs font-medium text-muted">{g}</p>
              <div className="space-y-1">
                {GRANTABLE_RIGHTS.filter((r) => r.group === g).map((r) => {
                  const on = checked.includes(r.capability) && !byRole(r.capability);
                  const lapsed = until[r.capability] && until[r.capability] < today;
                  return (
                    <div key={r.capability} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="rights[]"
                          value={r.capability}
                          disabled={byRole(r.capability)}
                          defaultChecked={byRole(r.capability) || rights.includes(r.capability)}
                          onChange={(e) => setChecked((c) => (e.target.checked ? [...c, r.capability] : c.filter((x) => x !== r.capability)))}
                          className="accent-brand-700"
                        />
                        {r.label}
                        {lapsed && <span className="text-xs text-danger">(ended {until[r.capability]})</span>}
                      </label>
                      {on && (
                        <label className="flex items-center gap-1.5 text-xs text-muted">
                          Until
                          <input type="date" name={`until.${r.capability}`} min={today} defaultValue={lapsed ? "" : until[r.capability] ?? ""}
                            aria-label={`${r.label}: last day (blank = permanent)`} className="h-7 rounded border border-line bg-surface px-1.5 text-xs text-ink" />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <SubmitButton>Save rights</SubmitButton>
    </ActionForm>
  );
}
