import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { AuthorizationError } from "@/lib/session";

export type ActionState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export class BusinessRuleError extends Error {}

/** FormData → plain object. Repeated keys become arrays; empty strings become undefined. */
export function formToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(fd.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const values = fd.getAll(key).map((v) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim()) : v));
    out[key] = key.endsWith("[]") ? values.filter((v) => v !== undefined) : values[0];
  }
  return out;
}

export function parseForm<T extends z.ZodType>(schema: T, fd: FormData):
  | { success: true; data: z.infer<T> }
  | { success: false; state: ActionState } {
  const result = schema.safeParse(formToObject(fd));
  if (result.success) return { success: true, data: result.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { success: false, state: { ok: false, message: "Please correct the highlighted fields.", fieldErrors } };
}

/**
 * Runs an action body and converts expected failures into a safe message.
 * Raw database errors are logged server-side (without values) and never shown.
 */
export async function safeAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() propagate
    if (e instanceof AuthorizationError || e instanceof BusinessRuleError) return { ok: false, message: e.message };
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") return { ok: false, message: "A record with these details already exists." };
      if (e.code === "P2003") return { ok: false, message: "This record is linked to other records and cannot be changed this way." };
      if (e.code === "P2025") return { ok: false, message: "The record was not found or you no longer have access to it." };
      console.error("Database error", e.code);
    } else {
      console.error("Action failed", e instanceof Error ? e.name : "unknown");
    }
    return { ok: false, message: "Something went wrong. Please try again." };
  }
}

// Shared Zod helpers for form fields.
export const zOptionalText = (max = 500) => z.string().max(max).optional();
export const zRequiredText = (max = 200) => z.string({ error: "Required" }).min(1, "Required").max(max);
export const zIsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date");
export const zUuid = z.uuid("Invalid selection");
export const zCheckbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const zInt = (min = 0, max = 1_000_000) => z.coerce.number().int().min(min).max(max);
export const zMoney = z.coerce.number().min(0).max(999_999_999_999);
