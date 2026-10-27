"use client";

import { ActionForm, SubmitButton, TextField } from "@/components/form";
import { updateDisplayNameAction } from "@/app/app/account-actions";

export function DisplayNameForm({ name }: { name: string }) {
  return (
    <ActionForm action={updateDisplayNameAction}>
      <TextField label="Your name" name="name" required defaultValue={name} autoComplete="name" />
      <SubmitButton variant="secondary">Save name</SubmitButton>
    </ActionForm>
  );
}
