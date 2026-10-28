"use client";

import { useId } from "react";
import { ActionForm, PhoneField, SelectField, SubmitButton, TextArea, TextField, upperCaseInput } from "@/components/form";
import { createAccount } from "./actions";

type Option = { value: string; label: string };

function Section({ title, step, children }: { title: string; step: number; children: React.ReactNode }) {
  return (
    <fieldset className="pt-2">
      {/* Floated so the heading sits above the card, not on its border */}
      <legend className="float-left mb-3 w-full px-1 text-sm font-semibold text-ink">
        <span className="mr-2 inline-grid size-5 place-items-center rounded-full bg-brand-700 text-xs text-white">{step}</span>
        {title}
      </legend>
      <div className="clear-left grid gap-4 rounded-2xl border border-ink/10 bg-surface p-5 shadow-[0_20px_40px_-32px_rgb(15_29_51/.45)] sm:grid-cols-2 sm:p-6">{children}</div>
    </fieldset>
  );
}

function FileField({ label, name, hint, accept = "application/pdf,image/*", className }: { label: string; name: string; hint?: string; accept?: string; className?: string }) {
  const id = `${name}-${useId()}`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input id={id} name={name} type="file" accept={accept} className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm" />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function CreateAccountForm({ constitutions }: { constitutions: Option[] }) {
  return (
    <ActionForm action={createAccount} className="mt-6">
      <Section title="Your login" step={1}>
        <TextField label="Your full name" name="ownerName" required autoComplete="name" className="sm:col-span-2" />
        <TextField label="Email" name="email" type="email" required autoComplete="email" className="sm:col-span-2" />
        <TextField label="Password" name="password" type="password" required autoComplete="new-password" hint="At least 10 characters" />
        <TextField label="Confirm password" name="confirmPassword" type="password" required autoComplete="new-password" />
      </Section>

      <Section title="Business registration" step={2}>
        <TextField label="Trade name" name="tradeName" required className="sm:col-span-2" />
        <TextField label="Legal name" name="legalName" hint="As per PAN / GST" className="sm:col-span-2" />
        <SelectField label="Constitution" name="constitutionId" required options={constitutions} />
        <TextField label="PAN" name="pan" maxLength={10} autoCapitalize="characters" spellCheck={false} onInput={upperCaseInput} />
        <TextField label="GSTIN" name="gstin" maxLength={15} autoCapitalize="characters" spellCheck={false} onInput={upperCaseInput} />
        <TextField label="TAN" name="tan" maxLength={10} autoCapitalize="characters" spellCheck={false} onInput={upperCaseInput} />
        <TextArea label="Address" name="address" rows={2} className="sm:col-span-2" />
        <PhoneField label="Contact mobile" name="contactMobile" />
      </Section>

      <Section title="Certificate & logo (optional)" step={3}>
        <FileField label="Firm certificate (registration / GST / incorporation)" name="certificateFile" hint="PDF or image, up to 10 MB. Stored privately." className="sm:col-span-2" />
        <TextField label="Certificate name" name="certificateName" hint="e.g. GST registration certificate" />
        <TextField label="Certificate number" name="certificateNumber" />
        <TextField label="Issued on" name="certificateIssuedOn" type="date" />
        <TextField label="Valid until" name="certificateExpiresOn" type="date" />
        <FileField label="Firm logo" name="profilePicture" accept="image/*" hint="JPG, PNG or WEBP" className="sm:col-span-2" />
      </Section>

      <Section title="Users" step={4}>
        <SelectField
          label="Access"
          name="accessMode"
          required
          placeholder={null}
          defaultValue="MULTI_USER"
          options={[
            { value: "MULTI_USER", label: "Multi-user (owner + employees)" },
            { value: "SINGLE_USER", label: "Single user" },
          ]}
        />
        <TextField label="Number of employees" name="declaredEmployeeCount" type="number" min={0} inputMode="numeric" />
        <TextField label="Number of clients" name="declaredClientCount" type="number" min={0} inputMode="numeric" />
      </Section>

      {/* Honeypot for bots — hidden from people and assistive tech */}
      <div aria-hidden className="hidden">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <SubmitButton>Create account</SubmitButton>
    </ActionForm>
  );
}
