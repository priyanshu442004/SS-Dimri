"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Check, Plus, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { useSubmitWithoutReset, type FormState } from "@/components/form";
import { toast } from "@/components/toaster";
import { fullRegisterClientAction } from "../actions";

type Constitution = { id: string; name: string; representativeRole: string; allowsMultiple: boolean };
type Option = { value: string; label: string };
type Person = { key: number; role: string; fullName: string; mobile: string; email: string; address: string; pan: string; aadhaar: string };

const STEPS = ["Business identity", "Constitution & people", "GST registrations", "Compliance & documents", "Services", "Account & review"] as const;

// Which step owns each server-side field (to jump back on validation errors).
const FIELD_STEP: Record<string, number> = {
  tradeName: 0, legalName: 0, address: 0, pan: 0, tan: 0, primaryBusinessNatureId: 0, contactName: 0, contactMobile: 0, contactDesignation: 0,
  constitutionId: 1, people: 1, gstins: 2,
  isMsme: 3, msmeRegistrationNumber: 3, esiNumber: 3, pfNumber: 3, poNumber: 3, poDate: 3, poAmount: 3,
  "serviceIds[]": 4, natureOfClient: 4,
  email: 5, password: 5, confirmPassword: 5, consent: 5,
};

const ROLE_LABEL: Record<string, string> = { PROPRIETOR: "Proprietor", PARTNER: "Partner", DIRECTOR: "Director", TRUSTEE: "Trustee", KARTA: "Karta", MEMBER: "Member", OTHER: "Person" };
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const input = "block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-danger";

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

export function BusinessWizard({ constitutions, natures, services }: {
  constitutions: Constitution[];
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
  const [review, setReview] = useState<[string, string][]>([]);
  const nextKey = useRef(1);

  const constitution = constitutions.find((c) => c.id === constitutionId);
  const errors = state.fieldErrors ?? {};
  const err = (n: string) => errors[n]?.[0];

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
    setPeople((p) => [...p, { key: nextKey.current++, role, fullName: "", mobile: "", email: "", address: "", pan: "", aadhaar: "" }]);
  }
  const updatePerson = (key: number, patch: Partial<Person>) => setPeople((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function addGstin() {
    const g = gstDraft.trim().toUpperCase();
    if (!GSTIN_RE.test(g)) return setGstError("Enter a valid 15-character GSTIN (e.g. 07AAACE1234F1Z5).");
    if (gstins.includes(g)) return setGstError("This GSTIN is already in the list.");
    setGstins((l) => [...l, g]);
    setGstDraft("");
    setGstError(null);
  }

  const peopleJson = useMemo(
    () => JSON.stringify(people.filter((p) => p.fullName.trim()).map(({ key: _k, ...p }) => p)),
    [people],
  );

  /** Minimal client-side checks per step; the server validates everything again. */
  function validateStep(s: number): string | null {
    const fd = new FormData(formRef.current!);
    const v = (n: string) => String(fd.get(n) ?? "").trim();
    if (s === 0 && (!v("tradeName") || !v("contactName") || !v("contactMobile"))) return "Trade name, contact person and mobile are required.";
    if (s === 1 && !constitutionId) return "Select the constitution of the business.";
    if (s === 1 && people.some((p) => !p.fullName.trim())) return "Enter a name for each person or remove the empty entry.";
    if (s === 5 && (!v("email") || v("password").length < 10 || v("password") !== v("confirmPassword"))) return "Enter your email and a password of at least 10 characters (both password fields must match).";
    return null;
  }

  function go(to: number) {
    if (to > step) {
      for (let s = step; s < to; s++) {
        const e = validateStep(s);
        if (e) {
          setStep(s);
          setStepError(e);
          return;
        }
      }
    }
    setStepError(null);
    if (to === 5) buildReview();
    setStep(to);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function buildReview() {
    const fd = new FormData(formRef.current!);
    const v = (n: string) => String(fd.get(n) ?? "").trim();
    const files = ["certificates", "msmeCertificate", "esiCertificate", "pfCertificate", "poFile", "profilePicture"]
      .flatMap((n) => fd.getAll(n).filter((f): f is File => f instanceof File && f.size > 0).map((f) => f.name));
    const chosen = services.filter((s) => fd.getAll("serviceIds[]").includes(s.value)).map((s) => s.label);
    setReview([
      ["Trade name", v("tradeName")],
      ["Legal name", v("legalName")],
      ["Address", v("address")],
      ["PAN / TAN", [v("pan"), v("tan")].filter(Boolean).join(" / ")],
      ["Contact", [v("contactName"), v("contactMobile")].filter(Boolean).join(" · ")],
      ["Constitution", constitution?.name ?? ""],
      ["People", people.filter((p) => p.fullName).map((p) => `${p.fullName} (${ROLE_LABEL[p.role]})`).join(", ")],
      ["GSTINs", gstins.join(", ")],
      ["MSME", v("isMsme") === "yes" ? `Yes ${v("msmeRegistrationNumber")}` : v("isMsme") === "no" ? "No" : ""],
      ["ESI / PF", [v("esiNumber"), v("pfNumber")].filter(Boolean).join(" / ")],
      ["Purchase order", v("poNumber")],
      ["Services", chosen.join(", ")],
      ["Documents", files.join(", ")],
    ]);
  }

  const missing = review.filter(([k, v]) => ["Trade name", "Contact", "Constitution"].includes(k) && !v).map(([k]) => k);
  const groups = [...new Set(services.map((s) => s.group))];

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="mt-8 scroll-mt-6">
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

      <div className="rounded-2xl border border-ink/10 bg-surface p-5 shadow-[0_20px_40px_-32px_rgb(15_29_51/.45)] sm:p-6 sm:p-6">
        {/* A — Business identity */}
        <section hidden={step !== 0} className="grid gap-4 sm:grid-cols-2">
          <h2 className="text-lg font-semibold sm:col-span-2">A · Business identity</h2>
          <Field label="Trade name" name="tradeName" required error={err("tradeName")}><input id="f-tradeName" name="tradeName" className={input} aria-invalid={!!err("tradeName")} /></Field>
          <Field label="Legal name" name="legalName" hint="As per PAN / GST"><input id="f-legalName" name="legalName" className={input} /></Field>
          <div className="sm:col-span-2"><Field label="Business address" name="address" error={err("address")}><textarea id="f-address" name="address" rows={2} className={input} /></Field></div>
          <Field label="PAN" name="pan" error={err("pan")}><input id="f-pan" name="pan" maxLength={10} autoCapitalize="characters" className={input} aria-invalid={!!err("pan")} /></Field>
          <Field label="TAN" name="tan" error={err("tan")}><input id="f-tan" name="tan" maxLength={10} autoCapitalize="characters" className={input} aria-invalid={!!err("tan")} /></Field>
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
          <Field label="Contact mobile" name="contactMobile" required error={err("contactMobile")}><input id="f-contactMobile" name="contactMobile" type="tel" autoComplete="tel" className={input} aria-invalid={!!err("contactMobile")} /></Field>
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
              <p className="text-sm text-muted">
                Add the {ROLE_LABEL[constitution.representativeRole].toLowerCase()}{constitution.allowsMultiple ? "s" : ""}. Mobile, email and address are optional; PAN and Aadhaar are optional, stored securely and visible only to authorised staff.
              </p>
              {people.map((p, i) => (
                <fieldset key={p.key} className="rounded-md border border-line p-4">
                  <legend className="px-1 text-sm font-medium">{ROLE_LABEL[p.role]} {i + 1}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">Full name <span className="text-danger" aria-hidden>*</span>
                      <input value={p.fullName} onChange={(e) => updatePerson(p.key, { fullName: e.target.value })} className={`${input} mt-1`} />
                    </label>
                    <label className="text-sm">Role
                      <select value={p.role} onChange={(e) => updatePerson(p.key, { role: e.target.value })} className={`${input} mt-1`}>
                        {Object.entries(ROLE_LABEL)
                          .filter(([k]) => !constitution || k === constitution.representativeRole || k === "MEMBER" || k === "OTHER")
                          .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <label className="text-sm">Mobile<input value={p.mobile} onChange={(e) => updatePerson(p.key, { mobile: e.target.value })} type="tel" className={`${input} mt-1`} /></label>
                    <label className="text-sm">Email<input value={p.email} onChange={(e) => updatePerson(p.key, { email: e.target.value })} type="email" className={`${input} mt-1`} /></label>
                    <label className="text-sm sm:col-span-2">Address<input value={p.address} onChange={(e) => updatePerson(p.key, { address: e.target.value })} className={`${input} mt-1`} /></label>
                    <label className="text-sm">PAN<input value={p.pan} onChange={(e) => updatePerson(p.key, { pan: e.target.value.toUpperCase() })} maxLength={10} className={`${input} mt-1`} /></label>
                    <label className="text-sm">Aadhaar<input value={p.aadhaar} onChange={(e) => updatePerson(p.key, { aadhaar: e.target.value })} inputMode="numeric" autoComplete="off" className={`${input} mt-1`} /></label>
                  </div>
                  <button type="button" onClick={() => setPeople((l) => l.filter((x) => x.key !== p.key))} className="mt-3 inline-flex items-center gap-1 text-sm text-danger hover:underline">
                    <Trash2 className="size-4" aria-hidden /> Remove
                  </button>
                </fieldset>
              ))}
              {(constitution.allowsMultiple || people.length === 0) && (
                <button type="button" onClick={() => addPerson()} className={buttonClass("secondary", "sm")}>
                  <Plus className="size-4" aria-hidden /> Add {ROLE_LABEL[constitution.representativeRole].toLowerCase()}
                </button>
              )}
              {err("people") && <p className="text-xs text-danger">Check the details of the people entered: {err("people")}</p>}
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
              value={gstDraft}
              onChange={(e) => setGstDraft(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGstin(); } }}
              maxLength={15}
              placeholder="07AAACE1234F1Z5"
              className={`${input} font-mono`}
              aria-invalid={!!gstError}
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
          <Field label="Purchase order number" name="poNumber" hint="If you have issued a PO to us"><input id="f-poNumber" name="poNumber" className={input} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="PO date" name="poDate"><input id="f-poDate" name="poDate" type="date" className={input} /></Field>
            <Field label="PO amount (₹)" name="poAmount" error={err("poAmount")}><input id="f-poAmount" name="poAmount" type="number" min={0} step="0.01" className={input} /></Field>
          </div>
          <div className="space-y-3 sm:col-span-2">
            <p className="text-sm font-medium">Documents <span className="font-normal text-muted">(PDF, JPG, PNG, DOCX · max 10 MB each · stored privately)</span></p>
            {[
              ["certificates", "Registration certificates (GST, incorporation, etc.)", true],
              ["msmeCertificate", "MSME certificate", false],
              ["esiCertificate", "ESI certificate", false],
              ["pfCertificate", "PF certificate", false],
              ["poFile", "Purchase order copy", false],
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
          <h2 className="text-lg font-semibold">E · Services and engagement</h2>
          <div className="mt-4 space-y-5">
            {groups.map((g) => (
              <fieldset key={g}>
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted">{g}</legend>
                <div className="mt-2 space-y-2">
                  {services.filter((s) => s.group === g).map((s) => (
                    <label key={s.value} className="flex items-start gap-3 rounded-md border border-line p-3 text-sm hover:bg-subtle has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50">
                      <input type="checkbox" name="serviceIds[]" value={s.value} className="mt-0.5 size-4 accent-brand-700" />
                      <span><span className="font-medium">{s.label}</span><span className="block text-xs text-muted">{s.description}</span></span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
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
            <Field label="Password" name="password" required hint="At least 10 characters" error={err("password")}><input id="f-password" name="password" type="password" autoComplete="new-password" className={input} aria-invalid={!!err("password")} /></Field>
            <Field label="Confirm password" name="confirmPassword" required error={err("confirmPassword")}><input id="f-confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" className={input} aria-invalid={!!err("confirmPassword")} /></Field>
          </div>
          <h3 className="mt-6 text-sm font-semibold">Review your registration</h3>
          {missing.length > 0 && <p className="mt-2 text-sm text-danger">Missing: {missing.join(", ")}</p>}
          <dl className="mt-2 divide-y divide-line rounded-md border border-line text-sm">
            {review.map(([k, v], i) => (
              <div key={k} className="grid gap-1 px-3 py-2 sm:grid-cols-[10rem_1fr]">
                <dt className="text-muted">{k}</dt>
                <dd className="flex items-start justify-between gap-2 break-words">
                  <span>{v || <span className="text-muted">—</span>}</span>
                  <button type="button" onClick={() => go(i <= 4 ? 0 : i === 5 || i === 6 ? 1 : i === 7 ? 2 : i <= 10 ? 3 : i === 11 ? 4 : 3)} className="shrink-0 text-xs text-brand-700 hover:underline">Edit</button>
                </dd>
              </div>
            ))}
          </dl>
          <label className="mt-4 flex items-start gap-2 text-sm">
            <input type="checkbox" name="consent" className="mt-0.5 size-4 accent-brand-700" />
            I confirm the information is correct and agree that S S Dimri &amp; Associates may use it to process this registration.
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
