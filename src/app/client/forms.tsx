"use client";

import { useId } from "react";
import { ActionForm, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;

function FileInput({ label, name, hint }: { label: string; name: string; hint?: string }) {
  const id = `${name}-${useId()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={id} name={name} type="file" accept="application/pdf,image/*,.docx,.xlsx" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function ReplyForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <TextArea label="Your reply" name="note" rows={3} required />
      <FileInput label="Attach a document (optional)" name="file" hint="PDF, image, DOCX or XLSX · up to 10 MB · stored privately" />
      <SubmitButton>Send</SubmitButton>
    </ActionForm>
  );
}

export function RemarkForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <TextArea label="Add a remark for our team" name="note" rows={2} required />
      <SubmitButton variant="secondary">Send remark</SubmitButton>
    </ActionForm>
  );
}

export function ObservationForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action}>
      <TextArea label="Observations (required if you are not accepting)" name="note" rows={3} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="ACCEPTED">Accept</SubmitButton>
        <SubmitButton name="decision" value="OBSERVATIONS_RAISED" variant="secondary">Send observations</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function DocumentForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <TextField label="Document name" name="title" required placeholder="e.g. Bank statement September" />
      <FileInput label="File" name="file" hint="PDF, image, DOCX or XLSX · up to 10 MB" />
      <SubmitButton>Upload</SubmitButton>
    </ActionForm>
  );
}
