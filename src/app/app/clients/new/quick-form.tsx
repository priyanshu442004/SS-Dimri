"use client";

import { ActionForm, FormError, SelectField, SubmitButton, TextArea, TextField } from "@/components/form";
import { quickRegisterAction } from "../actions";

type Option = { value: string; label: string };

export function QuickRegistrationForm({ constitutions, services }: { constitutions: Option[]; services: (Option & { group: string })[] }) {
  const groups = [...new Set(services.map((s) => s.group))];
  return (
    <ActionForm action={quickRegisterAction}>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Trade name" name="tradeName" required className="sm:col-span-2" />
        <TextField label="Legal name" name="legalName" hint="As per PAN / GST" className="sm:col-span-2" />
        <SelectField label="Constitution" name="constitutionId" options={constitutions} />
        <TextField label="PAN" name="pan" maxLength={10} autoCapitalize="characters" />
        <TextArea label="GSTIN(s)" name="gstins" rows={2} hint="One client can have several GSTINs — one per line" className="sm:col-span-2" />
        <SelectField label="Nature of client" name="natureOfClient" hint="Scope still to be confirmed by the firm" options={[
          { value: "ONE_TIME", label: "One time" }, { value: "RETAINER", label: "Retainer" },
        ]} />
        <div />
        <TextField label="Point of contact" name="contactName" />
        <TextField label="Contact mobile" name="contactMobile" type="tel" />
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
      <SubmitButton>Submit for approval</SubmitButton>
    </ActionForm>
  );
}
