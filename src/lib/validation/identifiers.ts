import { z } from "zod";

// Indian statutory identifier formats. Values are upper-cased and trimmed.
const upper = (s: string) => s.trim().toUpperCase();

export const panSchema = z.string().transform(upper).pipe(z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN"));

export const tanSchema = z.string().transform(upper).pipe(z.string().regex(/^[A-Z]{4}[0-9]{5}[A-Z]$/, "Invalid TAN"));

/** Format check only; GST-portal verification is a separate (future) integration. */
export const gstinSchema = z
  .string()
  .transform(upper)
  .pipe(z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "Invalid GSTIN"));

export const ifscSchema = z.string().transform(upper).pipe(z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC"));

export const aadhaarSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, ""))
  .pipe(z.string().regex(/^[2-9][0-9]{11}$/, "Invalid Aadhaar number"));

export const mobileSchema = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+91)?[6-9][0-9]{9}$/, "Invalid mobile number"));

/**
 * Indian mobile (10 digits, optional +91) or an international number in
 * +<country code><number> form (E.164: at most 15 digits in all).
 */
export const intlMobileSchema = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^((\+91)?[6-9][0-9]{9}|\+(?!91)[1-9][0-9]{5,14})$/, "Invalid mobile number"));

/** Combine a country code (e.g. "+91") and the digits typed after it into one stored value. */
export function joinMobile(code: string | undefined, digits: string | undefined) {
  if (!digits) return undefined;
  if (!code || code === "+91") return digits; // Indian numbers are stored as the 10 digits
  return `${code}${digits}`;
}
