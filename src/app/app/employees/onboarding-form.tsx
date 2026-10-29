"use client";

import { useId } from "react";
import { ActionForm, Checkbox, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";

export type OnboardingDefaults = Record<string, string | undefined>;

function Group({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <fieldset className="rounded-lg border border-line p-4">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {note && <p className="mb-3 text-xs text-muted">{note}</p>}
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

const DOCUMENT_TYPES = [
  ["MARKSHEET_10", "10th marksheet"], ["MARKSHEET_12", "12th marksheet"], ["DEGREE", "Degree / diploma"], ["PROFESSIONAL_CERTIFICATE", "Professional certificate"],
  ["ADDRESS_PROOF", "Address proof"], ["OFFER_LETTER", "Offer letter"], ["APPOINTMENT_LETTER", "Appointment letter"], ["JOINING_LETTER", "Joining letter"],
  ["JOINING_FORM", "Joining form"], ["RELIEVING_LETTER", "Relieving letter"], ["EXPERIENCE_CERTIFICATE", "Experience certificate"], ["SALARY_SLIP", "Salary slip"],
  ["CANCELLED_CHEQUE", "Cancelled cheque"], ["POLICY_ACKNOWLEDGEMENT", "Policy acknowledgement"], ["OTHER", "Other"],
].map(([value, label]) => ({ value, label }));

function FileInput({ label, name, hint, accept = "application/pdf,image/*" }: { label: string; name: string; hint?: string; accept?: string }) {
  const id = `${name}-${useId()}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={id} name={name} type="file" accept={accept} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function OnboardingForm({
  action,
  d,
  selfService,
  aadhaarLast4,
}: {
  action: (p: FormState, fd: FormData) => Promise<FormState>;
  d: OnboardingDefaults;
  selfService: boolean;
  aadhaarLast4?: string | null;
}) {
  return (
    <ActionForm action={action}>
      <Group title="Personal details">
        <TextField label="First name" name="firstName" required defaultValue={d.firstName} />
        <TextField label="Last name" name="lastName" defaultValue={d.lastName} />
        <SelectField label="Gender" name="gender" defaultValue={d.gender} options={[
          { value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }, { value: "OTHER", label: "Other" }, { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
        ]} />
        <TextField label="Date of birth" name="dateOfBirth" type="date" defaultValue={d.dateOfBirth} />
        <SelectField label="Marital status" name="maritalStatus" defaultValue={d.maritalStatus} options={[
          { value: "SINGLE", label: "Single" }, { value: "MARRIED", label: "Married" }, { value: "DIVORCED", label: "Divorced" }, { value: "WIDOWED", label: "Widowed" }, { value: "OTHER", label: "Other" },
        ]} />
        <TextField label="Father's name" name="fatherName" defaultValue={d.fatherName} />
        <TextField label="Mother's name" name="motherName" defaultValue={d.motherName} />
        <FileInput label="Photograph" name="profilePicture" accept="image/*" hint="JPG or PNG, up to 10 MB" />
      </Group>

      <Group title="Contact">
        <TextField label="Mobile" name="mobile" type="tel" defaultValue={d.mobile} />
        <TextField label="Personal email" name="email" type="email" defaultValue={d.email} />
        <TextArea label="Current address" name="currentAddress" rows={2} defaultValue={d.currentAddress} />
        <TextArea label="Permanent address" name="permanentAddress" rows={2} defaultValue={d.permanentAddress} />
        <TextField label="Emergency contact name" name="emergencyContactName" defaultValue={d.emergencyContactName} />
        <TextField label="Relation (Reference)" name="emergencyContactRelation" defaultValue={d.emergencyContactRelation} />
        <TextField label="Emergency contact number" name="emergencyContactPhone" type="tel" defaultValue={d.emergencyContactPhone} />
      </Group>

      <Group title="Identity & statutory" note="Aadhaar is stored encrypted; only the last four digits are ever displayed.">
        <TextField label="PAN" name="panNumber" maxLength={10} autoCapitalize="characters" defaultValue={d.panNumber} />
        <FileInput label="PAN card" name="panDocument" />
        <TextField label="Aadhaar number" name="aadhaar" inputMode="numeric" autoComplete="off" hint={aadhaarLast4 ? `On file: XXXX XXXX ${aadhaarLast4}. Leave blank to keep.` : "12 digits"} />
        <FileInput label="Aadhaar card (front & back)" name="aadhaarDocument" />
        <TextField label="Voter ID / other ID" name="voterIdNumber" defaultValue={d.voterIdNumber} />
        <TextField label="UAN (EPF)" name="uanNumber" defaultValue={d.uanNumber} hint="If previously in PF" />
        <TextField label="ESI IP number" name="esiIpNumber" defaultValue={d.esiIpNumber} hint="If previously covered" />
      </Group>

      <Group title="Bank account (salary transfer)" note="Account number is stored encrypted.">
        <TextField label="Account holder" name="bankAccountHolder" defaultValue={d.bankAccountHolder} />
        <TextField label="Account number" name="bankAccountNumber" inputMode="numeric" autoComplete="off" hint={d.bankLast4 ? `On file: ••••${d.bankLast4}. Re-enter to change.` : undefined} />
        <TextField label="IFSC" name="ifscCode" maxLength={11} autoCapitalize="characters" defaultValue={d.ifscCode} />
        <TextField label="Bank name" name="bankName" defaultValue={d.bankName} />
        <TextField label="Branch" name="branch" defaultValue={d.branch} />
        <FileInput label="Cancelled cheque / passbook" name="bankBook" hint="Optional" />
      </Group>

      <Group title="Qualification">
        <TextField label="Highest qualification" name="qualification" defaultValue={d.qualification} />
        <TextField label="Board / university" name="institution" defaultValue={d.institution} />
        <TextField label="Year of passing" name="yearOfPassing" type="number" defaultValue={d.yearOfPassing} />
        <FileInput label="Certificate / marksheet" name="qualificationCertificate" />
      </Group>

      <Group title="Previous employer" note="If experienced.">
        <TextField label="Employer name" name="previousEmployer" defaultValue={d.previousEmployer} />
        <TextField label="Designation" name="previousDesignation" defaultValue={d.previousDesignation} />
        <TextArea label="Employer address" name="previousEmployerAddress" rows={2} defaultValue={d.previousEmployerAddress} />
        <TextField label="Employer contact number" name="previousEmployerContact" defaultValue={d.previousEmployerContact} />
        <TextField label="From" name="previousFrom" type="date" defaultValue={d.previousFrom} />
        <TextField label="To" name="previousTo" type="date" defaultValue={d.previousTo} />
        <FileInput label="Experience / relieving letter" name="experienceCertificate" />
      </Group>

      <Group title="Other documents" note="10th / 12th marksheets, degree, address proof, letters… Up to 3 at a time; save again to add more.">
        {[1, 2, 3].map((i) => (
          <div key={i} className="grid gap-3 sm:col-span-full sm:grid-cols-2">
            <SelectField label={`Document ${i}: type`} name={`docType${i}`} placeholder="Choose…" options={DOCUMENT_TYPES} />
            <FileInput label={`Document ${i}: file`} name={`docFile${i}`} />
          </div>
        ))}
      </Group>

      <TextArea label="Message / remarks" name="remarks" rows={2} defaultValue={d.remarks} />
      {selfService && <Checkbox name="submit" label="My details are complete — submit for approval" />}
      <SubmitButton>{selfService ? "Save" : "Save details"}</SubmitButton>
    </ActionForm>
  );
}
