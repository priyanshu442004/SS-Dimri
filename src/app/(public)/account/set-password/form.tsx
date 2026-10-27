"use client";

import { ActionForm, SubmitButton, TextField } from "@/components/form";
import { setFirstPasswordAction } from "./actions";

export function SetPasswordForm() {
  return (
    <ActionForm action={setFirstPasswordAction}>
      <TextField label="New password" name="newPassword" type="password" autoComplete="new-password" required hint="At least 10 characters" />
      <TextField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required />
      <SubmitButton>Save password</SubmitButton>
    </ActionForm>
  );
}
