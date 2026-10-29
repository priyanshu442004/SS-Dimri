"use client";

import { clsx } from "clsx";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { aadhaarSchema, mobileSchema, panSchema } from "@/lib/validation/identifiers";

// The people behind a constitution (proprietor, partners, directors, karta…),
// shared by client and firm registration. Posted as a JSON array in `people`.

export type ConstitutionOption = { id: string; name: string; representativeRole: string; allowsMultiple: boolean };
export type Person = { key: number; role: string; fullName: string; mobile: string; email: string; address: string; pan: string; aadhaar: string };
export type PersonField = "fullName" | "mobile" | "email" | "pan" | "aadhaar";

export const ROLE_LABEL: Record<string, string> = { PROPRIETOR: "Proprietor", PARTNER: "Partner", DIRECTOR: "Director", TRUSTEE: "Trustee", KARTA: "Karta", MEMBER: "Member", OTHER: "Person" };

const valid = (schema: z.ZodType, value: string) => schema.safeParse(value).success;

export const emptyPerson = (key: number, role: string): Person => ({ key, role, fullName: "", mobile: "", email: "", address: "", pan: "", aadhaar: "" });

/** Checks one person's details; keys are `p<key>.<field>`. */
export function personErrors(p: Person): Record<string, string> {
  const e: Record<string, string> = {};
  if (!p.fullName.trim()) e[`p${p.key}.fullName`] = "Enter the full name, or remove this entry";
  if (p.mobile && !valid(mobileSchema, p.mobile)) e[`p${p.key}.mobile`] = "Enter a valid 10-digit mobile number";
  if (p.email && !valid(z.email(), p.email.trim())) e[`p${p.key}.email`] = "Enter a valid email";
  if (p.pan && !valid(panSchema, p.pan)) e[`p${p.key}.pan`] = "Enter a valid PAN, e.g. ABCDE1234F";
  if (p.aadhaar && !valid(aadhaarSchema, p.aadhaar)) e[`p${p.key}.aadhaar`] = "Enter a valid 12-digit Aadhaar number";
  return e;
}

/** The value posted as `people`: named entries only, without the local key. */
export const peopleToJson = (people: Person[]) => JSON.stringify(people.filter((p) => p.fullName.trim()).map(({ key: _k, ...p }) => p));

/**
 * Editable list of the constitution's people. The parent owns the list; `error`
 * returns the message to show for a person's field (or undefined).
 */
export function PeopleEditor({ constitution, people, onChange, onAdd, error, onBlurField, inputClass }: {
  constitution: ConstitutionOption;
  people: Person[];
  onChange: (people: Person[]) => void;
  onAdd: () => void;
  error: (key: number, field: PersonField) => string | undefined;
  onBlurField?: (key: number, field: PersonField) => void;
  inputClass: string;
}) {
  const update = (key: number, patch: Partial<Person>) => onChange(people.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const role = ROLE_LABEL[constitution.representativeRole].toLowerCase();
  // The error sits outside the <label> (so it never becomes part of the field's name) and is linked with aria-describedby.
  const errorId = (p: Person, f: PersonField) => `person-${p.key}-${f}-error`;
  const field = (p: Person, f: PersonField) => ({
    "aria-invalid": !!error(p.key, f),
    "aria-describedby": error(p.key, f) ? errorId(p, f) : undefined,
    onBlur: () => onBlurField?.(p.key, f),
    className: clsx(inputClass, "mt-1"),
  });
  const msg = (p: Person, f: PersonField) => {
    const m = error(p.key, f);
    return m && <p id={errorId(p, f)} className="mt-1 text-xs text-danger">{m}</p>;
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Add the {role}{constitution.allowsMultiple ? "s" : ""}. Mobile, email and address are optional; PAN and Aadhaar are optional, stored securely and visible only to authorised staff.
      </p>
      {people.map((p, i) => (
        <fieldset key={p.key} className="rounded-md border border-line p-4">
          <legend className="sr-only">{ROLE_LABEL[p.role]} {i + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-sm">Full name <span className="text-danger" aria-hidden>*</span>
                <input value={p.fullName} onChange={(e) => update(p.key, { fullName: e.target.value })} {...field(p, "fullName")} />
              </label>
              {msg(p, "fullName")}
            </div>
            <label className="text-sm">Role
              <select value={p.role} onChange={(e) => update(p.key, { role: e.target.value })} className={clsx(inputClass, "mt-1")}>
                {Object.entries(ROLE_LABEL)
                  .filter(([k]) => k === constitution.representativeRole || k === "MEMBER" || k === "OTHER")
                  .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div>
              <label className="block text-sm">Mobile
                <input value={p.mobile} onChange={(e) => update(p.key, { mobile: e.target.value.replace(/\D/g, "").slice(0, 10) })} type="tel" inputMode="numeric" maxLength={10} {...field(p, "mobile")} />
              </label>
              {msg(p, "mobile")}
            </div>
            <div>
              <label className="block text-sm">Email
                <input value={p.email} onChange={(e) => update(p.key, { email: e.target.value })} type="email" {...field(p, "email")} />
              </label>
              {msg(p, "email")}
            </div>
            <label className="text-sm sm:col-span-2">Address
              <input value={p.address} onChange={(e) => update(p.key, { address: e.target.value })} className={clsx(inputClass, "mt-1")} />
            </label>
            <div>
              <label className="block text-sm">PAN
                <input value={p.pan} onChange={(e) => update(p.key, { pan: e.target.value.toUpperCase() })} maxLength={10} autoComplete="off" {...field(p, "pan")} />
              </label>
              {msg(p, "pan")}
            </div>
            <div>
              <label className="block text-sm">Aadhaar
                <input value={p.aadhaar} onChange={(e) => update(p.key, { aadhaar: e.target.value.replace(/\D/g, "").slice(0, 12) })} inputMode="numeric" maxLength={12} autoComplete="off" {...field(p, "aadhaar")} />
              </label>
              {msg(p, "aadhaar")}
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(people.filter((x) => x.key !== p.key))}
            className="mt-3 inline-flex items-center gap-1 text-sm text-danger hover:underline"
            aria-label={`Remove ${p.fullName || `${ROLE_LABEL[p.role].toLowerCase()} ${i + 1}`}`}
          >
            <Trash2 className="size-4" aria-hidden /> Remove
          </button>
        </fieldset>
      ))}
      {(constitution.allowsMultiple || people.length === 0) && (
        <button type="button" onClick={onAdd} className={buttonClass("secondary", "sm")}>
          <Plus className="size-4" aria-hidden /> Add {role}
        </button>
      )}
    </div>
  );
}
