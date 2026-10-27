"use client";

import { useId } from "react";
import { ActionForm, Checkbox, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type D = Record<string, string>;

function FileInput({ label, name, accept = "application/pdf,image/*" }: { label: string; name: string; accept?: string }) {
  const id = `${name}-${useId()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={id} name={name} type="file" accept={accept} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
    </div>
  );
}

export function OrganizationForm({ action, d, usedLicences }: { action: Act; d: D; usedLicences: number }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Trade name" name="tradeName" required defaultValue={d.tradeName} />
        <TextField label="Legal name" name="legalName" defaultValue={d.legalName} />
        <TextArea label="Address" name="address" rows={2} defaultValue={d.address} className="sm:col-span-2" />
        <TextField label="PAN" name="pan" defaultValue={d.pan} />
        <TextField label="TAN" name="tan" defaultValue={d.tan} />
        <TextField label="GSTIN" name="gstin" defaultValue={d.gstin} />
        <FileInput label="Profile picture / logo" name="profilePicture" accept="image/*" />
        <TextField label="Contact person" name="contactPersonName" defaultValue={d.contactPersonName} />
        <TextField label="Contact mobile" name="contactMobile" defaultValue={d.contactMobile} />
        <TextField label="Contact email" name="contactEmail" type="email" defaultValue={d.contactEmail} />
        <TextField label="Phone" name="contactPhone" defaultValue={d.contactPhone} />
        <SelectField label="Access" name="accessMode" placeholder={null} defaultValue={d.accessMode} options={[{ value: "MULTI_USER", label: "Multi-user" }, { value: "SINGLE_USER", label: "Single user" }]} />
        <TextField label="User licences (sub-users)" name="licensedUserLimit" type="number" min={1} defaultValue={d.licensedUserLimit} hint={`${usedLicences} in use`} />
        <TextField label="Number of employees" name="declaredEmployeeCount" type="number" min={0} defaultValue={d.declaredEmployeeCount} />
        <TextField label="Number of clients" name="declaredClientCount" type="number" min={0} defaultValue={d.declaredClientCount} />
        <TextField label="Probation / trial period (days)" name="defaultProbationDays" type="number" min={0} defaultValue={d.defaultProbationDays} />
      </div>
      <SubmitButton>Save</SubmitButton>
    </ActionForm>
  );
}

export function CertificateForm({ action, d, replacing }: { action: Act; d: D; replacing: boolean }) {
  return (
    <ActionForm action={action}>
      <TextField label="Certificate name" name="certificateName" defaultValue={d.certificateName} />
      <TextField label="Certificate number" name="certificateNumber" defaultValue={d.certificateNumber} />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Issued on" name="issuedOn" type="date" defaultValue={d.issuedOn} />
        <TextField label="Expires on" name="expiresOn" type="date" defaultValue={d.expiresOn} />
      </div>
      <FileInput label={replacing ? "Replace file (optional)" : "Certificate file"} name="file" />
      <SubmitButton variant="secondary">{replacing ? "Update certificate" : "Upload certificate"}</SubmitButton>
    </ActionForm>
  );
}

export function LeavePolicyDocForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <TextField label="Title" name="title" placeholder="Leave & Timing Policy" />
      <TextField label="Effective from" name="effectiveFrom" type="date" />
      <FileInput label="Document" name="file" accept="application/pdf,image/*,.docx" />
      <SubmitButton variant="secondary">Upload</SubmitButton>
    </ActionForm>
  );
}

export function PolicyForm({ action, d }: { action: Act; d: D }) {
  const t = (label: string, name: string) => <TextField key={name} label={label} name={name} type="time" defaultValue={d[name]} />;
  const n = (label: string, name: string, hint?: string) => <TextField key={name} label={label} name={name} type="number" defaultValue={d[name]} hint={hint} />;
  return (
    <ActionForm action={action}>
      <fieldset className="grid gap-3 sm:grid-cols-4">
        <legend className="mb-2 text-sm font-semibold">Office timings (LT-01…LT-09)</legend>
        {t("Office start", "officeStart")}{t("Reporting grace until", "reportingGraceUntil")}{t("Lunch from", "lunchStart")}{t("Lunch to", "lunchEnd")}
        {t("Office end", "officeEnd")}{t("Leaving grace until", "leavingGraceUntil")}{t("Half day if leaving before", "halfDayIfLeavingBefore")}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Required working minutes (OT-02 / LT-11)</legend>
        {n("Normal days", "requiredMinutes", "540 = 9h")}{n("Onsite staff", "onsiteRequiredMinutes", "480 = 8h")}{n("Specifically allowed staff", "reducedRequiredMinutes", "510 = 8h30")}
        {n("Far-off client staff, early month", "farClientEarlyMonthMinutes", "510 = 8h30")}{n("…up to day of month", "farClientEarlyMonthUntilDay")}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Late arrival, overtime & leave</legend>
        {n("Late arrivals per half-day", "lateArrivalsPerHalfDay")}{n("Excused lates per month (with reason)", "lateGracePerMonth")}
        <SelectField label="Overtime basis" name="overtimeMode" placeholder={null} defaultValue={d.overtimeMode} options={[
          { value: "ACTUAL_MINUTES", label: "Actual minutes, no slabs (newer version)" }, { value: "SLABS", label: "Slabs after 6:45 PM (older version)" },
        ]} />
        {n("Minutes per OT day", "overtimeMinutesPerDay", "540 per policy 6.5")}{n("Paid leaves per month", "paidLeavesPerMonth")}{n("Planned-leave notice (days)", "plannedLeaveNoticeDays")}
      </fieldset>
      <Checkbox name="policyConfirmed" label="The firm has confirmed these rules (payroll calculations remain disabled in this version)" defaultChecked={d.policyConfirmed === "on"} />
      <SubmitButton>Save policy</SubmitButton>
    </ActionForm>
  );
}

export function ListItemForm({ action, withSeniority }: { action: Act; withSeniority?: boolean }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1"><TextField label="Name" name="name" required /></div>
        {withSeniority && (
          <SelectField label="Seniority" name="seniorityLevel" placeholder="Not set" options={[
            { value: "JUNIOR", label: "Junior" }, { value: "MID_LEVEL", label: "Mid-level" }, { value: "SENIOR", label: "Senior" },
          ]} />
        )}
        <SubmitButton variant="secondary">Add</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function PreferencesForm({ action, basis, graceDays }: { action: Act; basis: string; graceDays: string }) {
  return (
    <ActionForm action={action}>
      <SelectField
        label="Count pending days on"
        name="pendingDaysBasis"
        required
        defaultValue={basis}
        options={[{ value: "CALENDAR", label: "Calendar days (every day counts)" }, { value: "BUSINESS", label: "Business days (Sundays excluded)" }]}
        hint="Used by the pending tracker, communication timesheet and client reports. Public holidays are not excluded: no holiday calendar has been provided."
      />
      <TextField
        label="Client access while awaiting approval (days)"
        name="approvalGraceDays"
        type="number"
        min={0}
        max={90}
        required
        defaultValue={graceDays}
        hint="Newly registered businesses can use the client portal for this many days (from registration) before you approve them. 0 = no access until approved. Staff never get access before approval."
      />
      <SubmitButton>Save preferences</SubmitButton>
    </ActionForm>
  );
}
