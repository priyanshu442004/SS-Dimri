"use client";

import { useId } from "react";
import { ActionForm, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

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
  const t = (label: string, name: string, hint?: string) => <TextField key={name} label={label} name={name} type="time" defaultValue={d[name]} hint={hint} />;
  const n = (label: string, name: string, hint?: string, step?: string) => <TextField key={name} label={label} name={name} type="number" step={step} defaultValue={d[name]} hint={hint} />;
  return (
    <ActionForm action={action}>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Office timings (rules 5 and 7)</legend>
        <TextField label="Office name" name="officeName" defaultValue={d.officeName} hint="Shown as the first work location, e.g. Naraina Office" />
        {t("Office start", "officeStart")}{t("Grace until", "reportingGraceUntil", "Up to 15 minutes late: no deduction")}
        {t("Office end", "officeEnd")}{t("Lunch from", "lunchStart")}{t("Lunch to", "lunchEnd", "Never more than this; a Team Lead may move it")}
        {n("Client-site day (minutes)", "onsiteRequiredMinutes", "480 = 8 hours from the reporting time the Team Lead fixes")}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Reporting and late arrival (rules 3 and 6)</legend>
        {t("Marked absent if not in by", "autoAbsentAt", "The ERP marks the day Absent; it cannot become Present")}
        {n("Late days (15 min – 1 h) per half day", "lateArrivalsPerHalfDay", "3 in a month = half a day's salary")}
        {n("Late by more than (minutes) = half day", "veryLateAfterMinutes", "60 = over an hour late is a half day")}
        {n("Late arrivals excused a month", "lateGracePerMonth", "With a genuine reason, informed in the ERP beforehand")}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Leaving early, staying late and overtime (rules 8 and 9)</legend>
        {t("Half day if leaving before", "halfDayIfLeavingBefore")}
        {t("Overtime counts after", "leavingGraceUntil", "Prior approval needed; actual minutes from the next minute")}
        {n("Overtime minutes paid as one day", "overtimeMinutesPerDay", "Pay = day rate × overtime minutes ÷ this")}
        {t("Remind to mark out at", "markOutReminderAt", "Anyone still marked in gets a reminder")}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Leave (rule 10)</legend>
        {n("Paid leaves per month (with intimation)", "paidLeavesPerMonth", undefined, "0.5")}
        {n("Planned leave notice (days)", "plannedLeaveNoticeDays", "Request and approval this many days ahead")}
        {n("Days added for a month without leave", "noLeaveBonusDays", undefined, "0.5")}
        {n("Days counted for an absence without a request", "unrequestedAbsenceDays", "2 = double absent", "0.5")}
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Morning plan and EOD report (rule 2)</legend>
        {t("Morning plan due by", "morningPlanBy")}
        {n("Fine for an EOD not filed (₹)", "eodPenaltyRupees", "Filed by the next day's reporting time = no fine")}
        {n("Fine for a Team Lead not escalating (₹)", "leadPenaltyRupees")}
      </fieldset>
      <SubmitButton>Save policy</SubmitButton>
    </ActionForm>
  );
}

export function HolidayForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="flex flex-wrap items-end gap-2">
        <TextField label="Date" name="holidayDate" type="date" required />
        <div className="min-w-0 flex-1"><TextField label="Holiday" name="name" required placeholder="e.g. Diwali" /></div>
        <SubmitButton variant="secondary">Add</SubmitButton>
      </div>
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

export function PreferencesForm({ action, basis, graceDays, penalty }: { action: Act; basis: string; graceDays: string; penalty: string }) {
  return (
    <ActionForm action={action}>
      <TextField label="Timesheet penalty per breach (₹)" name="timesheetPenaltyRupees" type="number" min={0} max={100000} required defaultValue={penalty} hint="Shown for a late review (not reviewed within 36 hours), as in the Team Timesheet. EOD fines are set in the Leave & timing policy. Enter 0 to switch it off." />
      <SelectField
        label="Count pending days on"
        name="pendingDaysBasis"
        required
        defaultValue={basis}
        options={[{ value: "CALENDAR", label: "Calendar days (every day counts)" }, { value: "BUSINESS", label: "Business days (Sundays excluded)" }]}
        hint="Used by the pending tracker, communication timesheet and client reports. Office holidays (Leave & timing policy) are used by attendance and payroll."
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
