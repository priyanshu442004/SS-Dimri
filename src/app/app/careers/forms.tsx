"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { ActionForm, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;

/** The candidate's details, sliding in over the list. Esc, the × or a click outside closes it (back to the same list). */
export function CandidatePanel({ closeHref, title, children }: { closeHref: string; title: string; children: ReactNode }) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") router.push(closeHref, { scroll: false }); };
    document.addEventListener("keydown", close);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = prev; };
  }, [closeHref, router]);
  return (
    <div className="fixed inset-0 z-[70] flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Close" onClick={() => router.push(closeHref, { scroll: false })} className="cv-panel-backdrop absolute inset-0 bg-night/35 backdrop-blur-[2px]" />
      <div ref={panel} tabIndex={-1} className="cv-panel relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-canvas shadow-[-24px_0_60px_-30px_rgb(15_29_51/.55)] outline-none">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3.5">
          <h2 className="min-w-0 truncate font-editorial text-xl text-ink">{title}</h2>
          <button type="button" onClick={() => router.push(closeHref, { scroll: false })} aria-label="Close" className="grid size-9 place-items-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink">
            <X className="size-5" />
          </button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function StatusForm({ action, statuses, status, note }: { action: Act; statuses: { value: string; label: string }[]; status: string; note: string }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
        <SelectField label="Status" name="status" defaultValue={status} options={statuses} placeholder={null} />
        <TextArea label="Note (only administrators see it)" name="adminNote" rows={2} defaultValue={note} placeholder="e.g. Call on Monday; strong in GST" />
      </div>
      <SubmitButton size="sm">Save</SubmitButton>
    </ActionForm>
  );
}

export function FollowUpForm({ action, subject }: { action: Act; subject: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <TextField label="Subject" name="subject" defaultValue={subject} />
      <TextArea label="Message to the candidate" name="message" rows={4} required placeholder={"e.g. Thank you. Could you come for an interview on Tuesday at 11 am at our Naraina office?"} />
      <p className="-mt-2 text-xs text-muted">Sent as a reply in the same email conversation, signed by the recruitment team. Their answer comes back here.</p>
      <SubmitButton size="sm">Send to the candidate</SubmitButton>
    </ActionForm>
  );
}

export function ResendForm({ action, email }: { action: Act; email: string }) {
  return (
    <ActionForm action={action}>
      <TextField label="Send to" name="email" type="email" defaultValue={email} hint="Correct the address here if it was wrong; the resume's record is updated too." />
      <SubmitButton size="sm" variant="secondary">Send the email again</SubmitButton>
    </ActionForm>
  );
}
