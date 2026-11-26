"use client";

import { IdValidate } from "@/components/id-validate";
import { useId, useState } from "react";
import { ActionForm, Checkbox, FormError, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";
import { GST_TYPE_KEYS, GST_TYPES } from "@/lib/domain/gst-type";
import { CompliancePicker, type ComplianceOption } from "@/components/compliance-picker";
import { checkFileInput } from "@/components/upload-guard";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

function FileInput({ label, name, accept = "application/pdf,image/*" }: { label: string; name: string; accept?: string }) {
  const id = `${name}-${useId()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={id} name={name} type="file" accept={accept} onChange={(e) => checkFileInput(e.currentTarget, name === "profilePicture")} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
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
  action, d, constitutions, natures, classifications, completedAt, compliances, groups,
}: {
  action: Act;
  d: Record<string, string>;
  compliances: { items: ComplianceOption[]; departments: string[]; chosenDepartments: string[]; chosenIds: string[]; gstType: string; gstinTypes?: string[] };
  groups?: string[];
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
        <div><TextField label="PAN" name="pan" maxLength={10} defaultValue={d.pan} /><IdValidate kind="PAN" field="pan" /></div>
        <div><TextField label="TAN" name="tan" maxLength={10} defaultValue={d.tan} /><IdValidate kind="TAN" field="tan" /></div>
        <TextArea label="Address" name="address" rows={2} defaultValue={d.address} className="sm:col-span-2" />
        <SelectField label="Nature of business (primary)" name="primaryBusinessNatureId" defaultValue={d.primaryBusinessNatureId} options={natures} />
        <SelectField label="Nature of business (secondary)" name="secondaryBusinessNatureId" defaultValue={d.secondaryBusinessNatureId} options={natures} />
        <FileInput label="Profile picture / logo" name="profilePicture" accept="image/*" />
        <TextField label="State" name="state" defaultValue={d.state} />
        <TextField label="Date of birth / incorporation" name="dateOfBirth" type="date" defaultValue={d.dateOfBirth} />
        <TextField label="IT file no." name="itFileNo" defaultValue={d.itFileNo} />
        <TextArea label="Remark" name="masterRemark" rows={1} defaultValue={d.masterRemark} />
        <div>
          <TextField label="Client group" name="groupName" defaultValue={d.groupName} list="client-groups" autoComplete="off" placeholder="e.g. DNS Group" hint="Clients of the same group (same promoters, or one PAN in several states) are linked. Pick a group or type a new one." />
          <datalist id="client-groups">{(groups ?? []).map((g) => <option key={g} value={g} />)}</datalist>
        </div>
        <TextField label="Client's office opens at" name="officeOpensAt" type="time" defaultValue={d.officeOpensAt} hint="Staff who report straight to this client are late against this time, not the firm's office time. Leave blank to use the firm's time." />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Portal logins <span className="font-normal text-muted">(passwords are stored encrypted and never shown; type one only to set or change it)</span></legend>
        <TextField label="GST user ID" name="gstUserId" defaultValue={d.gstUserId} autoComplete="off" />
        <TextField label="Income Tax user ID" name="incomeTaxUserId" defaultValue={d.incomeTaxUserId} autoComplete="off" hint="Usually the PAN" />
        <TextField label="TRACES user ID" name="tracesUserId" defaultValue={d.tracesUserId} autoComplete="off" />
        <TextField label="GST password" name="gstPassword" type="password" autoComplete="new-password" placeholder={d.gstPasswordSet ? "Saved · type to change" : ""} />
        <TextField label="Income Tax password" name="incomeTaxPassword" type="password" autoComplete="new-password" placeholder={d.incomeTaxPasswordSet ? "Saved · type to change" : ""} />
        <TextField label="TRACES password" name="tracesPassword" type="password" autoComplete="new-password" placeholder={d.tracesPasswordSet ? "Saved · type to change" : ""} />
        <TextField label="E-way bill user ID" name="ewayBillUserId" defaultValue={d.ewayBillUserId} autoComplete="off" hint="ewaybillgst.gov.in login" />
        <TextField label="E-way bill password" name="ewayBillPassword" type="password" autoComplete="new-password" placeholder={d.ewayBillPasswordSet ? "Saved · type to change" : ""} />
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Departments & compliances</legend>
        <input type="hidden" name="compliancesShown" value="on" />
        <CompliancePicker items={compliances.items} departments={compliances.departments} defaultDepartments={compliances.chosenDepartments} defaultIds={compliances.chosenIds} defaultGstType={compliances.gstType} gstinTypes={compliances.gstinTypes} />
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

const GST_TYPE_OPTIONS = GST_TYPE_KEYS.map((k) => ({ value: k, label: GST_TYPES[k] }));

/** Add a GSTIN: its state comes from the code; branch and an own registration type are optional (tracker S.No. 107). */
export function GstinForm({ action, pan }: { action: Act; pan?: string | null }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      <TextField label="Add GSTIN" name="gstin" maxLength={15} autoCapitalize="characters" hint="The state is read from the first two digits" />
      <IdValidate kind="GSTIN" field="gstin" pan={pan} />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Branch / place (optional)" name="branchName" placeholder="e.g. Mumbai branch" />
        <SelectField label="Registration type" name="registrationType" placeholder="Same as the client" options={GST_TYPE_OPTIONS} />
      </div>
      <SubmitButton>Add GSTIN</SubmitButton>
    </ActionForm>
  );
}

export function GstinDetailsForm({ action, d }: { action: Act; d: { branchName: string; registrationType: string } }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-2 sm:grid-cols-2">
        <TextField label="Branch / place" name="branchName" defaultValue={d.branchName} />
        <SelectField label="Registration type" name="registrationType" placeholder="Same as the client" defaultValue={d.registrationType} options={GST_TYPE_OPTIONS} />
      </div>
      <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
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
        <div><TextField label="PAN" name="pan" maxLength={10} /><IdValidate kind="PAN" field="pan" /></div>
        <TextField label="Aadhaar" name="aadhaar" inputMode="numeric" autoComplete="off" hint="Stored encrypted" />
        <TextArea label="Address" name="address" rows={2} className="sm:col-span-2" />
        <FileInput label="Photograph" name="profilePicture" accept="image/*" />
      </div>
      <SubmitButton variant="secondary">Add representative</SubmitButton>
    </ActionForm>
  );
}

/** Tick one or more services (tracker S.No. 99); ones already active on the client are marked. */
function ServiceChecklist({ services, active }: { services: Option[]; active: string[] }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const shown = services.filter((s) => !q.trim() || s.label.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <fieldset className="sm:col-span-3">
      <legend className="mb-1.5 text-sm font-medium">Services <span className="font-normal text-muted">· tick one or more ({picked.size} ticked)</span></legend>
      {services.length > 8 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search services" aria-label="Search services" className="mb-2 h-9 w-full max-w-xs rounded-md border border-line bg-surface px-3 text-sm" />}
      <div className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
        {shown.map((s) => {
          const on = active.includes(s.value);
          return (
            <label key={s.value} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm ${picked.has(s.value) ? "border-brand-600 bg-brand-50" : "border-line hover:bg-subtle"}`}>
              <input type="checkbox" name="serviceIds[]" value={s.value} checked={picked.has(s.value)} onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(s.value); else n.delete(s.value); setPicked(n); }} className="size-4 accent-brand-700" />
              <span>{s.label}{on && <span className="ml-1 text-xs text-muted">(already active)</span>}</span>
            </label>
          );
        })}
      </div>
      <FormError name="serviceIds[]" />
    </fieldset>
  );
}

/** Add one or more services, or (with `d`) correct one already on the client. */
export function EngagementForm({ action, services, today, d, active = [] }: { action: Act; services: Option[]; today: string; d?: Record<string, string>; active?: string[] }) {
  return (
    <ActionForm action={action} resetOnSuccess={!d}>
      <div className="grid gap-3 sm:grid-cols-3">
        {d ? <SelectField label="Service" name="serviceId" required options={services} defaultValue={d?.serviceId} className="sm:col-span-2" /> : <ServiceChecklist services={services} active={active} />}
        <SelectField label="Engagement" name="engagementNature" defaultValue={d?.engagementNature} options={[{ value: "ONE_TIME", label: "One time" }, { value: "RETAINER", label: "Retainer" }]} />
        <TextField label="Agreed fee (₹)" name="agreedFee" type="number" min={0} step="0.01" inputMode="decimal" defaultValue={d?.agreedFee} />
        <TextField label="Start date" name="startDate" type="date" defaultValue={d ? d.startDate : today} />
        <TextField label="Due / end date" name="dueDate" type="date" defaultValue={d?.dueDate} />
        <TextField label="Timeline note" name="timelineNote" className="sm:col-span-3" defaultValue={d?.timelineNote} />
        <TextArea label="Description" name="description" rows={2} className="sm:col-span-3" defaultValue={d?.description} />
        <TextField label="Point of contact" name="pocName" defaultValue={d?.pocName} />
        <TextField label="POC mobile" name="pocMobile" type="tel" defaultValue={d?.pocMobile} />
        <TextField label="POC email" name="pocEmail" type="email" defaultValue={d?.pocEmail} />
        <TextArea label="POC address" name="pocAddress" rows={1} className="sm:col-span-3" defaultValue={d?.pocAddress} />
      </div>
      {!d && <p className="text-xs text-muted">The engagement, fee, dates and contact apply to every ticked service; correct one later with Edit.</p>}
      <SubmitButton>{d ? "Save changes" : "Add services"}</SubmitButton>
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
