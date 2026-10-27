"use client";

import { useId } from "react";
import { ActionForm, Checkbox, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

function FileInput({ label, name, accept = "application/pdf,image/*" }: { label: string; name: string; accept?: string }) {
  const id = `${name}-${useId()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={id} name={name} type="file" accept={accept} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
    </div>
  );
}

const BASIS_LABELS: Record<string, string> = {
  GST_STATUS: "GST status",
  BILLING_BASIS: "Billing basis",
  PLACE_OF_WORK: "Place of work",
  TURNOVER: "Annual turnover",
  PRIORITY: "Priority",
};

export function DetailsForm({
  action, d, constitutions, natures, classifications, completedAt,
}: {
  action: Act;
  d: Record<string, string>;
  constitutions: Option[];
  natures: Option[];
  classifications: (Option & { basis: string })[];
  completedAt: string | null;
}) {
  return (
    <ActionForm action={action}>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Legal & registration</legend>
        <TextField label="Trade name" name="tradeName" required defaultValue={d.tradeName} />
        <TextField label="Legal name" name="legalName" defaultValue={d.legalName} />
        <SelectField label="Constitution" name="constitutionId" defaultValue={d.constitutionId} options={constitutions} />
        <SelectField label="Nature of client" name="natureOfClient" defaultValue={d.natureOfClient} options={[{ value: "ONE_TIME", label: "One time" }, { value: "RETAINER", label: "Retainer" }]} />
        <TextField label="PAN" name="pan" maxLength={10} defaultValue={d.pan} />
        <TextField label="TAN" name="tan" maxLength={10} defaultValue={d.tan} />
        <TextArea label="Address" name="address" rows={2} defaultValue={d.address} className="sm:col-span-2" />
        <SelectField label="Nature of business (primary)" name="primaryBusinessNatureId" defaultValue={d.primaryBusinessNatureId} options={natures} />
        <SelectField label="Nature of business (secondary)" name="secondaryBusinessNatureId" defaultValue={d.secondaryBusinessNatureId} options={natures} />
        <FileInput label="Profile picture / logo" name="profilePicture" accept="image/*" />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Classification</legend>
        {Object.entries(BASIS_LABELS).map(([basis, label]) => (
          <SelectField key={basis} label={label} name={basis} defaultValue={d[basis]} options={classifications.filter((c) => c.basis === basis)} />
        ))}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">MSME, ESI & PF</legend>
        <SelectField label="MSME registered?" name="isMsme" defaultValue={d.isMsme} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
        <TextField label="MSME (Udyam) registration no." name="msmeRegistrationNumber" defaultValue={d.msmeRegistrationNumber} />
        <FileInput label="MSME certificate" name="msmeCertificate" />
        <div />
        <TextField label="ESI number" name="esiNumber" defaultValue={d.esiNumber} />
        <FileInput label="ESI certificate" name="esiCertificate" />
        <TextField label="PF number" name="pfNumber" defaultValue={d.pfNumber} />
        <FileInput label="PF certificate" name="pfCertificate" />
      </fieldset>

      <Checkbox name="markComplete" label={completedAt ? `Registration details complete (marked ${completedAt})` : "All registration details are now complete"} defaultChecked={!!completedAt} />
      <SubmitButton>Save details</SubmitButton>
    </ActionForm>
  );
}

export function TransitionForm({ action, actions }: { action: Act; actions: { action: string; label: string }[] }) {
  return (
    <ActionForm action={action}>
      <TextArea label="Reason / note" name="reason" rows={2} hint="Required when rejecting" />
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <SubmitButton
            key={a.action}
            name="action"
            value={a.action}
            size="sm"
            variant={a.action === "approve" || a.action === "resume" || a.action === "reactivate" ? "primary" : a.action === "reject" || a.action === "deactivate" ? "danger" : "secondary"}
            confirm={a.action === "approve" ? "Approve and activate this client? Their portal logins become active and the client appears in allocations and tasks." : a.action === "reject" || a.action === "deactivate" ? `${a.label}?` : undefined}
          >
            {a.label}
          </SubmitButton>
        ))}
      </div>
    </ActionForm>
  );
}

export function GstinForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="flex items-end gap-2">
        <TextField label="Add GSTIN" name="gstin" maxLength={15} autoCapitalize="characters" className="flex-1" />
        <SubmitButton>Add</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ContactForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Name" name="name" required />
        <TextField label="Designation" name="designation" />
        <TextField label="Mobile" name="mobile" type="tel" />
        <TextField label="Email" name="email" type="email" />
        <TextArea label="Address" name="address" rows={2} className="sm:col-span-2" />
      </div>
      <Checkbox name="isPrimary" label="Primary point of contact" />
      <SubmitButton variant="secondary">Add contact</SubmitButton>
    </ActionForm>
  );
}

export function RepresentativeForm({ action, defaultRole }: { action: Act; defaultRole: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField label="Role" name="role" placeholder={null} defaultValue={defaultRole} options={[
          { value: "PROPRIETOR", label: "Proprietor" }, { value: "PARTNER", label: "Partner" }, { value: "DIRECTOR", label: "Director" },
          { value: "TRUSTEE", label: "Trustee" }, { value: "KARTA", label: "Karta" }, { value: "MEMBER", label: "Member" }, { value: "OTHER", label: "Other" },
        ]} />
        <TextField label="Full name" name="fullName" required />
        <TextField label="Mobile" name="mobile" type="tel" />
        <TextField label="Email" name="email" type="email" />
        <TextField label="PAN" name="pan" maxLength={10} />
        <TextField label="Aadhaar" name="aadhaar" inputMode="numeric" autoComplete="off" hint="Stored encrypted" />
        <TextArea label="Address" name="address" rows={2} className="sm:col-span-2" />
        <FileInput label="Photograph" name="profilePicture" accept="image/*" />
      </div>
      <SubmitButton variant="secondary">Add representative</SubmitButton>
    </ActionForm>
  );
}

export function EngagementForm({ action, services, today }: { action: Act; services: Option[]; today: string }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField label="Service" name="serviceId" required options={services} className="sm:col-span-2" />
        <SelectField label="Engagement" name="engagementNature" options={[{ value: "ONE_TIME", label: "One time" }, { value: "RETAINER", label: "Retainer" }]} />
        <TextField label="Agreed fee (₹)" name="agreedFee" type="number" min={0} step="0.01" inputMode="decimal" />
        <TextField label="Start date" name="startDate" type="date" defaultValue={today} />
        <TextField label="Due / end date" name="dueDate" type="date" />
        <TextField label="Timeline note" name="timelineNote" className="sm:col-span-3" />
        <TextArea label="Description" name="description" rows={2} className="sm:col-span-3" />
        <TextField label="Point of contact" name="pocName" />
        <TextField label="POC mobile" name="pocMobile" type="tel" />
        <TextField label="POC email" name="pocEmail" type="email" />
        <TextArea label="POC address" name="pocAddress" rows={1} className="sm:col-span-3" />
      </div>
      <SubmitButton>Add service</SubmitButton>
    </ActionForm>
  );
}

export function DocumentForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <SelectField label="Type" name="type" placeholder={null} defaultValue="REGISTRATION_CERTIFICATE" options={[
        { value: "REGISTRATION_CERTIFICATE", label: "Certificate" }, { value: "OTHER", label: "Other document" },
      ]} />
      <TextField label="Title" name="title" hint="e.g. GST registration certificate" />
      <FileInput label="File (PDF, image, DOCX or XLSX · max 10 MB)" name="file" accept="application/pdf,image/*,.docx,.xlsx" />
      <SubmitButton>Upload</SubmitButton>
    </ActionForm>
  );
}

export function PortalInviteForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <TextField label="Name" name="name" required />
      <TextField label="Email (used to sign in)" name="email" type="email" required />
      <SubmitButton>Create login & setup link</SubmitButton>
    </ActionForm>
  );
}

export function ResetLinkForm({ action }: { action: (p: FormState) => Promise<FormState> }) {
  return (
    <ActionForm action={action as Act} className="!space-y-1">
      <SubmitButton size="sm" variant="secondary" confirm="Issue a password reset link for this login?">Issue reset link</SubmitButton>
    </ActionForm>
  );
}
