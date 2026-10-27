"use client";

import { ActionForm, Checkbox, FormError, SelectField, SubmitButton, TextArea, TextField } from "@/components/form";
import { quickRegisterClientAction } from "../actions";

export function QuickForm({ services }: { services: { value: string; label: string }[] }) {
  return (
    <ActionForm action={quickRegisterClientAction} className="mt-8">
      <fieldset className="grid gap-4 rounded-2xl border border-ink/10 bg-surface p-5 shadow-[0_20px_40px_-32px_rgb(15_29_51/.45)] sm:p-6 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Business</legend>
        <TextField label="Trade name" name="tradeName" required className="sm:col-span-2" />
        <TextField label="PAN" name="pan" maxLength={10} autoCapitalize="characters" />
        <SelectField label="Engagement" name="natureOfClient" hint="Optional" options={[{ value: "ONE_TIME", label: "One-time work" }, { value: "RETAINER", label: "Ongoing (retainer)" }]} />
        <TextArea label="GSTIN(s)" name="gstins" rows={2} hint="Optional · one per line" className="sm:col-span-2" />
      </fieldset>
      <fieldset className="grid gap-4 rounded-2xl border border-ink/10 bg-surface p-5 shadow-[0_20px_40px_-32px_rgb(15_29_51/.45)] sm:p-6 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold">Contact &amp; login</legend>
        <TextField label="Contact person" name="contactName" required autoComplete="name" />
        <TextField label="Mobile" name="contactMobile" type="tel" required autoComplete="tel" />
        <TextField label="Email" name="email" type="email" required autoComplete="email" className="sm:col-span-2" hint="You will sign in with this email" />
        <TextField label="Password" name="password" type="password" required autoComplete="new-password" hint="At least 10 characters" />
        <TextField label="Confirm password" name="confirmPassword" type="password" required autoComplete="new-password" />
      </fieldset>
      {services.length > 0 && (
        <fieldset className="rounded-2xl border border-ink/10 bg-surface p-5 shadow-[0_20px_40px_-32px_rgb(15_29_51/.45)] sm:p-6">
          <legend className="px-1 text-sm font-semibold">Services you are interested in (optional)</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => (
              <label key={s.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="serviceIds[]" value={s.value} className="size-4 accent-brand-700" /> {s.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div aria-hidden className="hidden"><input name="website" tabIndex={-1} autoComplete="off" /></div>
      <Checkbox name="consent" label="I confirm the information is correct and agree that S S Dimri & Associates may use it to process this registration." />
      <FormError name="consent" />
      <SubmitButton>Submit registration</SubmitButton>
    </ActionForm>
  );
}
