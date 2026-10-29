"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { z } from "zod";
import { Check } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { PasswordInput, upperCaseInput, useSubmitWithoutReset, type FormState } from "@/components/form";
import { toast } from "@/components/toaster";
import { PeopleEditor, ROLE_LABEL, emptyPerson, peopleToJson, personErrors, type ConstitutionOption, type Person } from "@/components/representatives";
import { mobileSchema, panSchema, tanSchema } from "@/lib/validation/identifiers";
import { fullRegisterClientAction } from "../actions";

type Option = { value: string; label: string };
type Errors = Record<string, string>;

const STEPS = ["Business identity", "Constitution & people", "GST registrations", "Compliance & documents", "Services", "Account & review"] as const;

// Which step owns each server-side field (to jump back on validation errors).
const FIELD_STEP: Record<string, number> = {
  tradeName: 0, legalName: 0, address: 0, pan: 0, tan: 0, primaryBusinessNatureId: 0, contactName: 0, contactMobile: 0, contactDesignation: 0,
  constitutionId: 1, people: 1, gstins: 2,
  isMsme: 3, msmeRegistrationNumber: 3, esiNumber: 3, pfNumber: 3,
  "serviceIds[]": 4, natureOfClient: 4,
  email: 5, password: 5, confirmPassword: 5, consent: 5,
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const input = "block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-danger";
const valid = (schema: z.ZodType, value: string) => schema.safeParse(value).success;

function Field({ label, name, required, hint, error, children }: { label: string; name: string; required?: boolean; hint?: string; error?: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={`f-${name}`} className="mb-1 block text-sm font-medium">
        {label}{required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-danger">{error}</p> : hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** "Select all" checkbox for a set of services; shows a dash when only some are chosen. */
function SelectAll({ ids, chosen, onToggle, label, className }: { ids: string[]; chosen: Set<string>; onToggle: (ids: string[], on: boolean) => void; label: string; className?: string }) {
  const count = ids.filter((id) => chosen.has(id)).length;
  return (
    <label className={clsx("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input
        type="checkbox"
        ref={(el) => { if (el) el.indeterminate = count > 0 && count < ids.length; }}
        checked={ids.length > 0 && count === ids.length}
        onChange={(e) => onToggle(ids, e.target.checked)}
        className="size-4 accent-brand-700"
      />
      {label}
    </label>
  );
}

export function BusinessWizard({ constitutions, natures, services }: {
  constitutions: ConstitutionOption[];
  natures: Option[];
  services: (Option & { group: string; description: string })[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(fullRegisterClientAction, {});
  // Server-side problems with the submission are announced as a toast (step checks stay inline).
  useEffect(() => {
    if (state.ok === false) toast(state.message ?? "Please check the highlighted fields.", "error");
  }, [state]);
  const formRef = useRef<HTMLFormElement>(null);
  // Keep everything the applicant typed if the server rejects the submission.
  const onSubmit = useSubmitWithoutReset(formAction);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [constitutionId, setConstitutionId] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [gstins, setGstins] = useState<string[]>([]);
  const [gstDraft, setGstDraft] = useState("");
  const [gstError, setGstError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [review, setReview] = useState<[string, string, number][]>([]);
  // Steps the applicant tried to leave: their errors are shown and re-checked as they type.
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [fieldErrs, setFieldErrs] = useState<Errors>({});
  const nextKey = useRef(1);
  const gstRef = useRef<HTMLInputElement>(null);

  const constitution = constitutions.find((c) => c.id === constitutionId);
  const serverErrors = state.fieldErrors ?? {};

  /** Checks the form fields of step `s` (people and constitution are checked from state). */
  function formErrors(s: number): Errors {
    const fd = new FormData(formRef.current!);
    const v = (n: string) => String(fd.get(n) ?? "").trim();
    const e: Errors = {};
    if (s === 0) {
      if (!v("tradeName")) e.tradeName = "Enter the trade name";
      if (v("pan") && !valid(panSchema, v("pan"))) e.pan = "Enter a valid PAN, e.g. ABCDE1234F";
      if (v("tan") && !valid(tanSchema, v("tan"))) e.tan = "Enter a valid TAN, e.g. DELA12345B";
      if (!v("contactName")) e.contactName = "Enter the contact person's name";
      if (!v("contactMobile")) e.contactMobile = "Enter the contact mobile number";
      else if (!valid(mobileSchema, v("contactMobile"))) e.contactMobile = "Enter a valid 10-digit mobile number";
    }
    if (s === 2 && gstRef.current?.value.trim()) e.gstins = "Click “Add GSTIN” for the number you typed, or clear the box.";
    if (s === 5) {
      if (!v("email")) e.email = "Enter your email";
      else if (!valid(z.email(), v("email"))) e.email = "Enter a valid email";
      if (v("password").length < 10) e.password = "Use at least 10 characters";
      if (v("confirmPassword") !== v("password")) e.confirmPassword = "Passwords do not match";
      if (!fd.get("consent")) e.consent = "Please confirm to continue";
    }
    return e;
  }
  function stateErrors(s: number): Errors {
    if (s !== 1) return {};
    const e: Errors = constitutionId ? {} : { constitutionId: "Select the constitution of the business" };
    for (const p of people) Object.assign(e, personErrors(p));
    return e;
  }

  const errs: Errors = { ...fieldErrs, ...(attempted.has(step) ? stateErrors(step) : {}) };
  const err = (n: string) => errs[n] ?? serverErrors[n]?.[0];

  // After a server-side rejection, open the first step that has an error
  // (adjusting state when the action result changes, without an effect).
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    const first = Object.keys(state.fieldErrors ?? {}).map((f) => FIELD_STEP[f] ?? 5).sort()[0];
    if (first !== undefined) setStep(first);
  }

  function choose(id: string) {
    setConstitutionId(id);
    const c = constitutions.find((x) => x.id === id);
    if (c && people.length === 0) addPerson(c.representativeRole);
  }
  function addPerson(role = constitution?.representativeRole ?? "OTHER") {
    setPeople((p) => [...p, emptyPerson(nextKey.current++, role)]);
  }

  function addGstin() {
    const g = gstDraft.trim().toUpperCase();
    if (!GSTIN_RE.test(g)) return setGstError("Enter a valid 15-character GSTIN (e.g. 07AAACE1234F1Z5).");
    if (gstins.includes(g)) return setGstError("This GSTIN is already in the list.");
    setGstins((l) => [...l, g]);
    setGstDraft("");
    setGstError(null);
    setFieldErrs((e) => { const { gstins: _g, ...rest } = e; return rest; });
  }

  const toggleServices = (ids: string[], on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      for (const id of ids) if (on) next.add(id); else next.delete(id);
      return next;
    });

  const peopleJson = useMemo(() => peopleToJson(people), [people]);

  /** Re-check the current step as the applicant types, once they have tried to leave it. */
  function recheck() {
    if (attempted.has(step)) setFieldErrs(formErrors(step));
  }

  function go(to: number) {
    if (to > step) {
      for (let s = step; s < to; s++) {
        const e = { ...formErrors(s), ...stateErrors(s) };
        if (Object.keys(e).length) {
          setAttempted((a) => new Set(a).add(s));
          setFieldErrs(formErrors(s));
          setStep(s);
          setStepError("Please correct the highlighted fields before continuing.");
          formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
      }
    }
    setStepError(null);
    setFieldErrs(attempted.has(to) ? formErrors(to) : {});
    if (to === 5) buildReview();
    setStep(to);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    const errors = formErrors(5);
    if (Object.keys(errors).length) {
      e.preventDefault();
      setAttempted((a) => new Set(a).add(5));
      setFieldErrs(errors);
      setStepError("Please correct the highlighted fields before submitting.");
      return;
    }
    setStepError(null);
    onSubmit(e);
  }

  function buildReview() {
    const fd = new FormData(formRef.current!);
    const v = (n: string) => String(fd.get(n) ?? "").trim();
    const files = ["certificates", "msmeCertificate", "esiCertificate", "pfCertificate", "profilePicture"]
      .flatMap((n) => fd.getAll(n).filter((f): f is File => f instanceof File && f.size > 0).map((f) => f.name));
    const chosenNames = services.filter((s) => chosen.has(s.value)).map((s) => s.label);
    setReview([
      ["Trade name", v("tradeName"), 0],
      ["Legal name", v("legalName"), 0],
      ["Address", v("address"), 0],
      ["PAN / TAN", [v("pan"), v("tan")].filter(Boolean).join(" / ").toUpperCase(), 0],
      ["Contact", [v("contactName"), v("contactMobile")].filter(Boolean).join(" · "), 0],
      ["Constitution", constitution?.name ?? "", 1],
      ["People", people.filter((p) => p.fullName).map((p) => `${p.fullName} (${ROLE_LABEL[p.role]})`).join(", "), 1],
      ["GSTINs", gstins.join(", "), 2],
      ["MSME", v("isMsme") === "yes" ? `Yes ${v("msmeRegistrationNumber")}` : v("isMsme") === "no" ? "No" : "", 3],
      ["ESI / PF", [v("esiNumber"), v("pfNumber")].filter(Boolean).join(" / "), 3],
      ["Documents", files.join(", "), 3],
      ["Services", chosenNames.join(", "), 4],
    ]);
  }

  const missing = review.filter(([k, v]) => ["Trade name", "Contact", "Constitution"].includes(k) && !v).map(([k]) => k);
  const groups = [...new Set(services.map((s) => s.group))];
  const allServiceIds = services.map((s) => s.value);

  return (
    <form ref={formRef} onSubmit={submit} onChange={recheck} noValidate className="mt-8 scroll-mt-6">
      {/* Progress */}
      <ol className="mb-6 grid grid-cols-6 gap-1" aria-label="Registration progress">
        {STEPS.map((label, i) => (
          <li key={label}>
            <button type="button" onClick={() => go(i)} className="w-full text-left" aria-current={i === step ? "step" : undefined}>
              <span className={clsx("block h-1.5 origin-left rounded-full transition-all duration-500 ease-[var(--ease-out-expo)]", i < step ? "bg-ink" : i === step ? "scale-y-150 bg-stamp-bright" : "bg-ink/10")} />
              <span className={clsx("mt-1.5 hidden text-xs sm:block", i === step ? "font-semibold text-ink" : "text-muted")}>{label}</span>
            </button>
          </li>
        ))}
      </ol>
      <p className="mb-4 text-sm font-medium text-muted sm:hidden">Step {step + 1} of 6 · {STEPS[step]}</p>

      <div className="rounded-2xl border border-ink/10 bg-surface p-5 shadow-[0_20px_40px_-32px_rgb(15_29_51/.45)] sm:p-6">
        {/* A — Business identity */}
        <section hidden={step !== 0} className="grid gap-4 sm:grid-cols-2">
          <h2 className="text-lg font-semibold sm:col-span-2">A · Business identity</h2>
          <Field label="Trade name" name="tradeName" required error={err("tradeName")}><input id="f-tradeName" name="tradeName" className={input} aria-invalid={!!err("tradeName")} /></Field>
          <Field label="Legal name" name="legalName" hint="As per PAN / GST"><input id="f-legalName" name="legalName" className={input} /></Field>
          <div className="sm:col-span-2"><Field label="Business address" name="address" error={err("address")}><textarea id="f-address" name="address" rows={2} className={input} /></Field></div>
          <Field label="PAN" name="pan" hint="10 characters, e.g. ABCDE1234F" error={err("pan")}><input id="f-pan" name="pan" maxLength={10} autoCapitalize="characters" autoComplete="off" onInput={upperCaseInput} className={input} aria-invalid={!!err("pan")} /></Field>
          <Field label="TAN" name="tan" hint="10 characters, e.g. DELA12345B" error={err("tan")}><input id="f-tan" name="tan" maxLength={10} autoCapitalize="characters" autoComplete="off" onInput={upperCaseInput} className={input} aria-invalid={!!err("tan")} /></Field>
          <Field label="Nature of business" name="primaryBusinessNatureId">
            <select id="f-primaryBusinessNatureId" name="primaryBusinessNatureId" className={input} defaultValue="">
              <option value="">Select…</option>
              {natures.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
            </select>
          </Field>
          <Field label="Logo / profile picture" name="profilePicture" hint="Optional · image up to 10 MB">
            <input id="f-profilePicture" name="profilePicture" type="file" accept="image/*" className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5" />
          </Field>
          <Field label="Contact person" name="contactName" required error={err("contactName")}><input id="f-contactName" name="contactName" autoComplete="name" className={input} aria-invalid={!!err("contactName")} /></Field>
          <Field label="Contact mobile" name="contactMobile" required hint="10-digit mobile number" error={err("contactMobile")}><input id="f-contactMobile" name="contactMobile" type="tel" inputMode="tel" maxLength={13} autoComplete="tel" className={input} aria-invalid={!!err("contactMobile")} /></Field>
          <Field label="Contact's designation" name="contactDesignation"><input id="f-contactDesignation" name="contactDesignation" className={input} /></Field>
        </section>

        {/* B — Constitution & people */}
        <section hidden={step !== 1}>
          <h2 className="text-lg font-semibold">B · Constitution and associated people</h2>
          <input type="hidden" name="constitutionId" value={constitutionId} />
          <input type="hidden" name="people" value={peopleJson} />
          <fieldset className="mt-4">
            <legend className="mb-2 text-sm font-medium">Constitution of the business <span className="text-danger" aria-hidden>*</span></legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {constitutions.map((c) => (
                <label key={c.id} className={clsx("flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm", c.id === constitutionId ? "border-brand-600 bg-brand-50" : "border-line hover:bg-subtle")}>
                  <input type="radio" name="constitutionChoice" value={c.id} checked={c.id === constitutionId} onChange={() => choose(c.id)} className="accent-brand-700" />
                  {c.name}
                </label>
              ))}
            </div>
            {err("constitutionId") && <p className="mt-1 text-xs text-danger">{err("constitutionId")}</p>}
          </fieldset>
          {constitution && (
            <div className="mt-6 space-y-4">
              <PeopleEditor
                constitution={constitution}
                people={people}
                onChange={setPeople}
                onAdd={() => addPerson()}
                error={(key, f) => err(`p${key}.${f}`)}
                inputClass={input}
              />
              {serverErrors.people?.[0] && <p className="text-xs text-danger">Check the details of the people entered: {serverErrors.people[0]}</p>}
            </div>
          )}
        </section>

        {/* C — GST */}
        <section hidden={step !== 2}>
          <h2 className="text-lg font-semibold">C · GST registrations</h2>
          <p className="mt-1 text-sm text-muted">Add every GSTIN of the business (one per state). Leave empty if not registered.</p>
          <input type="hidden" name="gstins" value={gstins.join("\n")} />
          <div className="mt-4 flex gap-2">
            <label htmlFor="gst-draft" className="sr-only">GSTIN</label>
            <input
              id="gst-draft"
              ref={gstRef}
              value={gstDraft}
              onChange={(e) => { setGstDraft(e.target.value.toUpperCase()); setGstError(null); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGstin(); } }}
              maxLength={15}
              placeholder="07AAACE1234F1Z5"
              className={`${input} font-mono`}
              aria-invalid={!!(gstError || err("gstins"))}
            />
            <button type="button" onClick={addGstin} className={buttonClass("secondary")}>Add GSTIN</button>
          </div>
          {(gstError || err("gstins")) && <p role="alert" className="mt-1 text-xs text-danger">{gstError ?? err("gstins")}</p>}
          <ul className="mt-4 divide-y divide-line rounded-md border border-line">
            {gstins.map((g) => (
              <li key={g} className="flex items-center justify-between px-3 py-2 font-mono text-sm">
                {g}
                <button type="button" onClick={() => setGstins((l) => l.filter((x) => x !== g))} className="text-xs text-danger hover:underline" aria-label={`Remove ${g}`}>Remove</button>
              </li>
            ))}
            {gstins.length === 0 && <li className="px-3 py-3 text-sm text-muted">No GSTIN added.</li>}
          </ul>
        </section>

        {/* D — Compliance & documents */}
        <section hidden={step !== 3} className="grid gap-4 sm:grid-cols-2">
          <h2 className="text-lg font-semibold sm:col-span-2">D · Compliance and documents</h2>
          <Field label="MSME (Udyam) registered?" name="isMsme">
            <select id="f-isMsme" name="isMsme" defaultValue="" className={input}><option value="">Select…</option><option value="yes">Yes</option><option value="no">No</option></select>
          </Field>
          <Field label="MSME registration number" name="msmeRegistrationNumber"><input id="f-msmeRegistrationNumber" name="msmeRegistrationNumber" className={input} /></Field>
          <Field label="ESI number" name="esiNumber"><input id="f-esiNumber" name="esiNumber" className={input} /></Field>
          <Field label="PF number" name="pfNumber"><input id="f-pfNumber" name="pfNumber" className={input} /></Field>
          <div className="space-y-3 sm:col-span-2">
            <p className="text-sm font-medium">Documents <span className="font-normal text-muted">(PDF, JPG, PNG, DOCX · max 10 MB each · stored privately)</span></p>
            {[
              ["certificates", "Registration certificates (GST, incorporation, etc.)", true],
              ["msmeCertificate", "MSME certificate", false],
              ["esiCertificate", "ESI certificate", false],
              ["pfCertificate", "PF certificate", false],
            ].map(([name, label, multiple]) => (
              <label key={String(name)} className="block text-sm">
                {label}
                <input name={String(name)} type="file" multiple={!!multiple} accept="application/pdf,image/*,.docx" className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-1.5" />
              </label>
            ))}
          </div>
        </section>

        {/* E — Services */}
        <section hidden={step !== 4}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">E · Services and engagement</h2>
            {services.length > 0 && (
              <SelectAll
                ids={allServiceIds}
                chosen={chosen}
                onToggle={toggleServices}
                label={`Select all services${chosen.size ? ` (${chosen.size} selected)` : ""}`}
                className="rounded-md border border-line px-3 py-1.5 font-medium hover:bg-subtle has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50"
              />
            )}
          </div>
          {services.length === 0 && <p className="mt-3 text-sm text-muted">No services are listed yet. Our office will confirm the services with you.</p>}
          <div className="mt-4 space-y-5">
            {groups.map((g) => {
              const ids = services.filter((s) => s.group === g).map((s) => s.value);
              return (
                <fieldset key={g}>
                  <legend className="flex w-full items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">{g}</span>
                    {groups.length > 1 && <SelectAll ids={ids} chosen={chosen} onToggle={toggleServices} label={`Select all in ${g}`} className="text-xs text-muted hover:text-ink" />}
                  </legend>
                  <div className="mt-2 space-y-2">
                    {services.filter((s) => s.group === g).map((s) => (
                      <label key={s.value} className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3 text-sm hover:bg-subtle has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                        <input type="checkbox" name="serviceIds[]" value={s.value} checked={chosen.has(s.value)} onChange={(e) => toggleServices([s.value], e.target.checked)} className="mt-0.5 size-4 accent-brand-700" />
                        <span><span className="font-medium">{s.label}</span><span className="block text-xs text-muted">{s.description}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
          <div className="mt-5 max-w-sm">
            <Field label="Type of engagement" name="natureOfClient" hint="Optional — we will confirm this with you">
              <select id="f-natureOfClient" name="natureOfClient" defaultValue="" className={input}>
                <option value="">Not sure yet</option><option value="ONE_TIME">One-time work</option><option value="RETAINER">Ongoing (retainer)</option>
              </select>
            </Field>
          </div>
        </section>

        {/* F — Account & review */}
        <section hidden={step !== 5}>
          <h2 className="text-lg font-semibold">F · Your login and review</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Field label="Email (used to sign in)" name="email" required error={err("email")}><input id="f-email" name="email" type="email" autoComplete="email" className={input} aria-invalid={!!err("email")} /></Field></div>
            <Field label="Password" name="password" required hint="At least 10 characters" error={err("password")}><PasswordInput id="f-password" name="password" autoComplete="new-password" className={input} aria-invalid={!!err("password")} /></Field>
            <Field label="Confirm password" name="confirmPassword" required error={err("confirmPassword")}><PasswordInput id="f-confirmPassword" name="confirmPassword" autoComplete="new-password" className={input} aria-invalid={!!err("confirmPassword")} /></Field>
          </div>
          <h3 className="mt-6 text-sm font-semibold">Review your registration</h3>
          {missing.length > 0 && <p className="mt-2 text-sm text-danger">Missing: {missing.join(", ")}</p>}
          <dl className="mt-2 divide-y divide-line rounded-md border border-line text-sm">
            {review.map(([k, v, s]) => (
              <div key={k} className="grid gap-1 px-3 py-2 sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted">{k}</dt>
                <dd className="flex items-start justify-between gap-2 break-words">
                  <span>{v || <span className="text-muted">—</span>}</span>
                  <button type="button" onClick={() => go(s)} className="shrink-0 text-xs text-brand-700 hover:underline">Edit</button>
                </dd>
              </div>
            ))}
          </dl>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-brand-700" aria-invalid={!!err("consent")} />
            I confirm the information is correct and agree that Office ERP may use it to process this registration.
          </label>
          {err("consent") && <p className="text-xs text-danger">{err("consent")}</p>}
          <div aria-hidden className="hidden"><input name="website" tabIndex={-1} autoComplete="off" /></div>
        </section>
      </div>

      <p aria-live="polite" className={stepError ? "mt-3 text-sm text-danger" : "sr-only"}>{stepError}</p>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(step - 1)} disabled={step === 0} className={buttonClass("secondary")}>Back</button>
        {step < 5 ? (
          // Distinct keys: React must never morph this button into the submit button mid-click.
          <button key="continue" type="button" onClick={() => go(step + 1)} className={buttonClass("primary")}>Continue</button>
        ) : (
          <button key="submit" type="submit" disabled={pending} className={buttonClass("primary")}>
            {pending ? "Submitting…" : <><Check className="size-4" aria-hidden /> Submit registration</>}
          </button>
        )}
      </div>
    </form>
  );
}
