"use client";

import { ActionForm, SubmitButton, TextField } from "@/components/form";
import { changePasswordAction } from "@/app/app/account-actions";

export function ChangePasswordForm() {
  return (
    <ActionForm action={changePasswordAction} resetOnSuccess>
      <TextField label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
      <TextField label="New password" name="newPassword" type="password" autoComplete="new-password" required hint="At least 10 characters" />
      <TextField label="Confirm new password" name="confirmPassword" type="password" autoComplete="new-password" required />
      <SubmitButton variant="secondary">Change password</SubmitButton>
    </ActionForm>
  );
}
