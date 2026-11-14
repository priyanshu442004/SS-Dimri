"use client";

import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ActionForm, inputCls, SubmitButton, type FormState } from "@/components/form";
import { Badge } from "@/components/ui";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Status = "DONE" | "PENDING" | "CARRIED_FORWARD";

export type EditorLine = {
  id?: string;
  clientId?: string | null;
  clientName?: string | null;
  task: string;
  expectedBy?: string | null;
  origin: "PLANNED" | "CARRIED" | "NEW";
  carriedFromId?: string | null;
  status?: Status | null;
  reason?: string | null;
  /** Shown only: where an old-work line came from. */
  note?: string | null;
};

const STATUS: { value: Status; label: string }[] = [
  { value: "DONE", label: "Done" },
  { value: "PENDING", label: "Pending" },
  { value: "CARRIED_FORWARD", label: "Carried forward" },
];

let seq = 0;
const key = () => `k${++seq}`;

/**
 * Morning plan (client, task, expected completion), the EOD report (each line Done / Pending /
 * Carried Forward, a reason for unfinished ones, and new work), and the Team Lead's edit.
 * Lines are posted as JSON in one hidden field.
 */
export function PlanEditor({ action, mode, lines: initial, clients, today, submitLabel, draftLabel, extraButtons, note }: {
  action: Act;
  mode: "plan" | "eod" | "lead";
  lines: EditorLine[];
  clients: { value: string; label: string }[];
  today: string;
  submitLabel: string;
  draftLabel?: string;
  extraButtons?: { intent: string; label: string; variant?: "secondary" | "ghost" }[];
  note?: string | null;
}) {
  const [lines, setLines] = useState(() => initial.map((l) => ({ ...l, _k: key() })));
  // When the saved lines change on the server (the plan was sent, the Team Lead edited it), show them.
  const signature = JSON.stringify(initial);
  const [seen, setSeen] = useState(signature);
  if (signature !== seen) {
    setSeen(signature);
    setLines(initial.map((l) => ({ ...l, _k: key() })));
  }
  const listId = useId();
  const byLabel = new Map(clients.map((c) => [c.label.toLowerCase(), c.value]));
  const eod = mode === "eod";
  const update = (k: string, patch: Partial<EditorLine>) => setLines((ls) => ls.map((l) => (l._k === k ? { ...l, ...patch } : l)));
  const add = () => setLines((ls) => [...ls, { _k: key(), task: "", origin: eod ? "NEW" : "PLANNED", clientName: "", expectedBy: today, status: eod ? "DONE" : null }]);
  const payload = JSON.stringify(
    lines.filter((l) => l.task.trim()).map(({ _k: _key, note: _note, ...l }) => {
      const id = byLabel.get((l.clientName ?? "").trim().toLowerCase());
      return { ...l, clientId: id ?? null, clientName: l.clientName?.trim() || null, expectedBy: l.expectedBy || null };
    }),
  );

  return (
    <ActionForm action={action}>
      <input type="hidden" name="items" value={payload} />
      <datalist id={listId}>{clients.map((c) => <option key={c.value} value={c.label} />)}</datalist>
      {lines.length === 0 && <p className="rounded-lg border border-dashed border-line p-4 text-center text-sm text-muted">{eod ? "No lines yet. Add the work you did today." : "No tasks yet. Add what you will work on today."}</p>}
      <ol className="space-y-3">
        {lines.map((l, i) => (
          <li key={l._k} className="rounded-lg border border-line bg-surface p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-muted">{i + 1}.</span>
              {l.origin === "CARRIED" && <Badge tone="info">Old work</Badge>}
              {l.origin === "NEW" && <Badge tone="brand">New work</Badge>}
              {l.note && <span className="text-muted">{l.note}</span>}
              <button type="button" onClick={() => setLines((ls) => ls.filter((x) => x._k !== l._k))} className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted hover:bg-subtle hover:text-danger" aria-label={`Remove line ${i + 1}`}>
                <Trash2 className="size-3.5" aria-hidden /> Remove
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_2fr_10rem]">
              <label className="text-xs font-medium">Client
                <input list={listId} value={l.clientName ?? ""} onChange={(e) => update(l._k, { clientName: e.target.value })} placeholder="Client or 'Internal'" className={`${inputCls} mt-1`} autoComplete="off" />
              </label>
              <label className="text-xs font-medium">Task
                <input value={l.task} onChange={(e) => update(l._k, { task: e.target.value })} placeholder="What will be done" className={`${inputCls} mt-1`} required />
              </label>
              <label className="text-xs font-medium">Expected completion
                <input type="date" value={l.expectedBy ?? ""} onChange={(e) => update(l._k, { expectedBy: e.target.value })} className={`${inputCls} mt-1`} />
              </label>
            </div>
            {eod && (
              <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr] sm:items-end">
                <fieldset>
                  <legend className="mb-1 text-xs font-medium">Status</legend>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUS.map((s) => (
                      <label key={s.value} className={`cursor-pointer rounded-md border px-2.5 py-1.5 text-xs transition-colors ${l.status === s.value ? (s.value === "DONE" ? "border-ok bg-ok-bg font-medium text-ok" : "border-marigold bg-warn-bg font-medium text-warn") : "border-line hover:border-ink/30"}`}>
                        <input type="radio" className="sr-only" name={`st-${l._k}`} checked={l.status === s.value} onChange={() => update(l._k, { status: s.value })} />
                        {s.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {l.status && l.status !== "DONE" && (
                  <label className="text-xs font-medium">Reason it is not done
                    <input value={l.reason ?? ""} onChange={(e) => update(l._k, { reason: e.target.value })} placeholder="e.g. waiting for bank statement from client" className={`${inputCls} mt-1`} required />
                  </label>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
      <button type="button" onClick={add} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-ink/30 px-3 py-2 text-sm font-medium hover:bg-paper">
        <Plus className="size-4" aria-hidden /> {eod ? "Add work not in the plan" : "Add a task"}
      </button>
      {eod && (
        <label className="block text-sm font-medium">Note for your Team Lead (optional)
          <textarea name="eodNote" defaultValue={note ?? ""} rows={2} className={`${inputCls} mt-1`} />
        </label>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <SubmitButton name="intent" value={mode === "lead" ? "edit_approve" : "submit"}>{submitLabel}</SubmitButton>
        {draftLabel && <SubmitButton name="intent" value="save" variant="secondary">{draftLabel}</SubmitButton>}
        {extraButtons?.map((b) => <SubmitButton key={b.intent} name="intent" value={b.intent} variant={b.variant ?? "secondary"}>{b.label}</SubmitButton>)}
      </div>
    </ActionForm>
  );
}
