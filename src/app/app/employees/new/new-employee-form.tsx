"use client";

import { ActionForm, SelectField, SubmitButton, TextField } from "@/components/form";
import { createEmployeeAction } from "../actions";

/** Invite a staff member: only name, email, mobile, role and access. Everything else they fill in themselves. */
export function NewEmployeeForm({ canInviteAdmin }: { canInviteAdmin: boolean }) {
  return (
    <ActionForm action={createEmployeeAction} resetOnSuccess>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Full name" name="fullName" required autoComplete="off" className="sm:col-span-2" />
        <TextField label="Email" name="email" type="email" required autoComplete="off" hint="They sign in with this email" />
        <TextField label="Mobile" name="mobile" type="tel" required hint="10-digit Indian mobile number" />
        <SelectField
          label="Role"
          name="role"
          required
          placeholder={null}
          defaultValue="STAFF"
          options={[
            { value: "STAFF", label: "Team member" },
            { value: "SENIOR", label: "Senior" },
            { value: "MANAGER", label: "Manager" },
            ...(canInviteAdmin ? [{ value: "ADMIN", label: "Administrator" }] : []),
          ]}
        />
        <SelectField
          label="Module access"
          name="moduleAccess"
          required
          placeholder={null}
          defaultValue="FULL"
          hint="Peons, drivers and other support staff usually need only attendance and payroll"
          options={[
            { value: "FULL", label: "Everything their role allows" },
            { value: "SUPPORT", label: "Attendance & payroll only" },
          ]}
        />
      </div>
      <SubmitButton>Send invitation</SubmitButton>
    </ActionForm>
  );
}
