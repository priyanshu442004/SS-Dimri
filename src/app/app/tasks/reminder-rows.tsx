"use client";

import { useEffect, useRef, useState } from "react";
import { BellPlus, X } from "lucide-react";
import { FormError, inputCls } from "@/components/form";

const MAX_ROWS = 10;

/** Any number of reminder times (up to 10), each posted as remindAt[]. */
export function ReminderRows({ now, initialRows = 0 }: { now: string; initialRows?: number }) {
  const nextId = useRef(initialRows + 1);
  const [rows, setRows] = useState<number[]>(Array.from({ length: initialRows }, (_, i) => i + 1));
  const box = useRef<HTMLFieldSetElement>(null);

  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const reset = () => setRows(Array.from({ length: initialRows }, (_, i) => i + 1));
    form.addEventListener("reset", reset);
    return () => form.removeEventListener("reset", reset);
  }, [initialRows]);

  const add = () => setRows((r) => [...r, nextId.current++]);
  const remove = (id: number) => setRows((r) => r.filter((x) => x !== id));

  return (
    <fieldset ref={box}>
      <legend className="mb-1 text-sm font-medium text-ink">Reminders</legend>
      <div className="space-y-2">
        {rows.map((id, i) => (
          <div key={id} className="flex items-center gap-2">
            <input
              type="datetime-local"
              name="remindAt[]"
              min={now}
              aria-label={`Reminder ${i + 1}`}
              className={inputCls}
            />
            <button type="button" onClick={() => remove(id)} aria-label={`Remove reminder ${i + 1}`} title="Remove" className="grid size-9 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-danger">
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
      {rows.length < MAX_ROWS && (
        <button type="button" onClick={add} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-1.5 text-sm text-ink transition-colors hover:border-ink/30 hover:bg-subtle">
          <BellPlus className="size-4" aria-hidden /> {rows.length ? "Add another reminder" : "Add a reminder"}
        </button>
      )}
      <p className="mt-1 text-xs text-muted">In-app reminders to everyone on the task. Add as many as you need, up to {MAX_ROWS}.</p>
      <FormError name="remindAt[]" />
    </fieldset>
  );
}
