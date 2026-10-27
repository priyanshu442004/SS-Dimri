"use client";

import { ActionForm, SubmitButton, TextField, type FormState } from "@/components/form";

export function ForgotForm({ action }: { action: (p: FormState, fd: FormData) => Promise<FormState> }) {
  return (
    <ActionForm action={action}>
      <TextField label="Login ID or email" name="identifier" required autoComplete="username" autoCapitalize="none" />
      <SubmitButton>Request reset link</SubmitButton>
    </ActionForm>
  );
}
