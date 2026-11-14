"use client";

import { ActionForm, FormError, PhoneField, SelectField, SubmitButton, TextArea, TextField, upperCaseInput } from "@/components/form";
import { quickRegisterAction } from "../../actions";
import { CompliancePicker, type ComplianceOption } from "@/components/compliance-picker";
import { checkFileInput, uploadsTooLarge } from "@/components/upload-guard";

type Option = { value: string; label: string };

export function QuickRegistrationForm({ constitutions, services, compliances }: {
  constitutions: Option[]; services: (Option & { group: string })[]; compliances: { items: ComplianceOption[]; departments: string[] };
}) {
  const groups = [...new Set(services.map((s) => s.group))];
  return (
    // Capture phase: files too large together stop the submission before it is sent.
    <div onSubmitCapture={(e) => { if (uploadsTooLarge(e.target as HTMLFormElement)) { e.preventDefault(); e.stopPropagation(); } }}>
    <ActionForm action={quickRegisterAction}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Trade name" name="tradeName" required className="sm:col-span-2" />
        <TextField label="Legal name" name="legalName" hint="As per PAN / GST" className="sm:col-span-2" />
        <SelectField label="Constitution" name="constitutionId" options={constitutions} />
        <TextField label="PAN" name="pan" maxLength={10} autoCapitalize="characters" spellCheck={false} onInput={upperCaseInput} />
        <TextArea label="GSTIN(s)" name="gstins" rows={2} hint="One client can have several GSTINs — one per line" className="sm:col-span-2 [&_textarea]:uppercase" spellCheck={false} />
        <SelectField label="Nature of client" name="natureOfClient" hint="Scope still to be confirmed by the firm" options={[
          { value: "ONE_TIME", label: "One time" }, { value: "RETAINER", label: "Retainer" },
        ]} />
        <div />
        <TextField label="Contact person" name="contactName" required />
        <PhoneField label="Contact mobile" name="contactMobile" />
        <TextField label="Contact email" name="contactEmail" type="email" />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Services offered</legend>
        <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {groups.map((g) => (
            <div key={g}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{g}</p>
              {services.filter((s) => s.group === g).map((s) => (
                <label key={s.value} className="mt-1 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="serviceIds[]" value={s.value} className="accent-brand-700" />
                  {s.label}
                </label>
              ))}
            </div>
          ))}
        </div>
        <FormError name="serviceIds[]" />
      </fieldset>
      <CompliancePicker items={compliances.items} departments={compliances.departments} />
      <div>
        <label htmlFor="quick-certificates" className="mb-1 block text-sm font-medium">Documents <span className="font-normal text-muted">(optional)</span></label>
        <input id="quick-certificates" name="certificates" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,.docx,.xlsx" onChange={(e) => checkFileInput(e.currentTarget)} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5" />
        <p className="mt-1 text-xs text-muted">GST, PAN or incorporation certificates · PDF, JPG, PNG, DOCX · up to 10 MB each, 11 MB together. More can be added later on the client&apos;s Documents tab.</p>
      </div>
      <SubmitButton>Submit for approval</SubmitButton>
    </ActionForm>
    </div>
  );
}
