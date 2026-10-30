"use client";

import clsx from "clsx";
import { ActionForm, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";
import type { FieldSpec } from "@/lib/hr-letters/specs";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;

/** The merge fields of one template, pre-filled from the staff record. */
export function HrDocumentForm({
  action,
  fields,
  defaults,
  submitLabel,
  confirm,
  approval,
}: {
  action: Act;
  fields: FieldSpec[];
  defaults: Record<string, string>;
  submitLabel: string;
  confirm: string;
  /** Show the permanent ID / note fields of the final approval. */
  approval?: boolean;
}) {
  return (
    <ActionForm action={action}>
      {approval && (
        <div className="grid gap-4 rounded-lg border border-line bg-canvas p-3 sm:grid-cols-2">
          <TextField label="Permanent employee ID" name="permanentEmployeeCode" required hint="e.g. OERP-031" />
          <TextField label="Note to the staff member" name="note" hint="Optional; included in the approval email" />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const common = { label: f.label, name: f.key, required: f.required, hint: f.hint, defaultValue: defaults[f.key] ?? "", className: clsx(!f.half && "sm:col-span-2") };
          if (f.type === "textarea" || f.type === "list" || f.type === "rows") {
            return <TextArea key={f.key} {...common} rows={f.type === "textarea" ? 3 : 4} />;
          }
          return (
            <TextField
              key={f.key}
              {...common}
              type={f.type === "date" ? "date" : "text"}
              inputMode={f.type === "money" || f.type === "number" ? "decimal" : undefined}
            />
          );
        })}
      </div>
      <SubmitButton confirm={confirm}>{submitLabel}</SubmitButton>
    </ActionForm>
  );
}

export function AcknowledgeMemoForm({ action, replyRequired }: { action: Act; replyRequired: boolean }) {
  return (
    <ActionForm action={action}>
      <TextArea
        label={replyRequired ? "Your written explanation" : "Your reply (optional)"}
        name="reply"
        rows={4}
        required={replyRequired}
        hint="Sent to the firm with your acknowledgement"
      />
      <SubmitButton confirm="Submit your acknowledgement? It cannot be changed afterwards.">
        {replyRequired ? "Submit explanation" : "Acknowledge receipt"}
      </SubmitButton>
    </ActionForm>
  );
}
