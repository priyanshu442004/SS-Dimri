"use client";

import { ActionForm, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";
import { PeoplePicker } from "@/components/pickers";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

/** Approve / hold / reject submitted details. The staff member is emailed the result. */
export function DecisionForm({ action, canHold }: { action: Act; canHold: boolean }) {
  return (
    <ActionForm action={action}>
      <TextField label="Permanent employee ID" name="permanentEmployeeCode" hint="Required to approve, e.g. OERP-031" />
      <TextArea label="Note to the staff member" name="note" rows={2} hint="Required when rejecting; included in the email" />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="APPROVE" confirm="Approve this staff member? They can sign in and use the portal, and are emailed now. The employee ID cannot be reused.">
          Approve
        </SubmitButton>
        {canHold && (
          <SubmitButton name="decision" value="HOLD" variant="secondary" confirm="Put these details on hold? The staff member is emailed and still cannot use the portal.">
            Hold
          </SubmitButton>
        )}
        <SubmitButton name="decision" value="REJECT" variant="danger" confirm="Reject these details? The staff member is emailed and can correct and resubmit.">
          Reject
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

export function AccessForm({
  action,
  defaults,
  designations,
  departments,
  colleagues,
}: {
  action: Act;
  defaults: { role: string; status: string; designationId: string; departmentId: string; employmentStatus: string; attendanceProfile: string; managerIds: string[] };
  designations: Option[];
  departments: Option[];
  colleagues: Option[];
}) {
  return (
    <ActionForm action={action}>
      <SelectField label="System role" name="role" placeholder={null} defaultValue={defaults.role} options={[
        { value: "STAFF", label: "Team member" }, { value: "SENIOR", label: "Senior" }, { value: "MANAGER", label: "Manager" }, { value: "ADMIN", label: "Administrator" },
      ]} />
      <SelectField label="Login" name="status" placeholder={null} defaultValue={defaults.status} options={[
        { value: "ACTIVE", label: "Active" }, { value: "DISABLED", label: "Disabled (cannot sign in)" },
      ]} />
      <SelectField label="Designation" name="designationId" defaultValue={defaults.designationId} options={designations} />
      <SelectField label="Department" name="departmentId" defaultValue={defaults.departmentId} options={departments} />
      <SelectField label="Employment status" name="employmentStatus" placeholder={null} defaultValue={defaults.employmentStatus} options={[
        { value: "PROBATION", label: "Probation" }, { value: "ACTIVE", label: "Active" },
      ]} />
      <SelectField label="Attendance hours profile" name="attendanceProfile" placeholder={null} defaultValue={defaults.attendanceProfile}
        hint="Required daily hours under the Leave & Timing Policy"
        options={[
          { value: "STANDARD", label: "Office (9:30–6:30)" }, { value: "ONSITE", label: "Client site (8h from the time the Team Lead sets)" },
          { value: "FAR_CLIENT", label: "Far-off client (old policy, counted as office)" }, { value: "REDUCED_HOURS", label: "Reduced hours (old policy, counted as office)" },
        ]} />
      <PeoplePicker label="Whom to report (select one or more)" name="managerIds[]" options={colleagues} defaultValue={defaults.managerIds} />
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}

/** Resigned or terminated: leaves the active lists, sign-in is disabled, allocations end. */
export function ExitForm({ action, today }: { action: Act; today: string }) {
  return (
    <ActionForm action={action}>
      <SelectField label="Reason for leaving" name="exitType" required options={[
        { value: "RESIGNED", label: "Resigned" }, { value: "TERMINATED", label: "Terminated" }, { value: "OTHER", label: "Other" },
      ]} />
      <TextField label="Last working day" name="exitDate" type="date" required defaultValue={today} />
      <TextArea label="Note (optional)" name="exitReason" rows={2} />
      <SubmitButton variant="danger" confirm="Move this person to Ex-Employees? Their sign-in is disabled and their client allocations end on the last working day. Attendance, payroll and letters stay as history.">
        Move to Ex-Employee
      </SubmitButton>
    </ActionForm>
  );
}

export function ResetPasswordForm({ action }: { action: (p: FormState) => Promise<FormState> }) {
  return (
    <ActionForm action={action as Act}>
      <p className="text-sm text-muted">Issue a single-use link the employee can use to set a new password. Earlier unused links stop working.</p>
      <SubmitButton variant="secondary" confirm="Issue a password reset link for this employee?">Issue reset link</SubmitButton>
    </ActionForm>
  );
}
