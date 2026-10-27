"use client";

import { ActionForm, SubmitButton, TextField, type FormState } from "@/components/form";

export function ResetForm({ action, token }: { action: (p: FormState, fd: FormData) => Promise<FormState>; token: string }) {
  return (
    <ActionForm action={action}>
      <input type="hidden" name="token" value={token} />
      <TextField label="New password" name="password" type="password" required autoComplete="new-password" hint="At least 10 characters" />
      <TextField label="Confirm new password" name="confirmPassword" type="password" required autoComplete="new-password" />
      <SubmitButton>Save password</SubmitButton>
    </ActionForm>
  );
}
