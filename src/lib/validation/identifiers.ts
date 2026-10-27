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
