"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BusinessRuleError, formToObject, safeAction, type ActionState } from "@/lib/actions";
import { setFlash } from "@/lib/flash";
import { LETTERS, MEMOS, type LetterKind, type MemoFormat } from "@/lib/hr-letters/specs";
import { actionContext } from "@/lib/session";
import { decideOnboarding } from "@/lib/services/employees";
import { acceptLetter, acknowledgeMemo, issueLetter, issueMemo, prepareFields } from "@/lib/services/hr-letters";
import type { MailResult } from "@/lib/services/mailer";

const mailNote = (m: MailResult) =>
  m.status === "SENT" ? "It was emailed to the staff member with the Word file attached." : m.status === "SKIPPED" ? `Not emailed (${m.error ?? "test address"}).` : `The email could not be sent (${m.error}).`;

const asLetterKind = (k: string): LetterKind => {
  if (!(k in LETTERS)) throw new BusinessRuleError("Unknown letter.");
  return k as LetterKind;
};
const asMemoFormat = (f: string): MemoFormat => {
  if (!(f in MEMOS)) throw new BusinessRuleError("Unknown memo format.");
  return f as MemoFormat;
};

/** Raw form values as strings (blank fields stay blank, so required checks see them). */
function rawValues(fd: FormData) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(formToObject(fd))) if (typeof v === "string") out[k] = v;
  return out;
}

export async function issueLetterAction(employeeId: string, kind: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  let target = "";
  const r = await safeAction(async () => {
    const ctx = await actionContext("employees.manage");
    const { letter, mail } = await issueLetter(ctx, employeeId, asLetterKind(kind), rawValues(fd));
    revalidatePath(`/app/employees/${employeeId}`);
    await setFlash(`${LETTERS[letter.kind].title} ${letter.referenceNo} issued. ${mailNote(mail)}`, mail.status === "FAILED" ? "warning" : "success");
    target = `/app/letters/${letter.id}`;
  });
  if (target) redirect(target);
  return r;
}

/** Final approval and the appointment letter in one step (the letter is checked before approving). */
export async function approveWithLetterAction(employeeId: string, kind: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  let target = "";
  const r = await safeAction(async () => {
    const ctx = await actionContext("employees.manage");
    const k = asLetterKind(kind);
    const raw = rawValues(fd);
    prepareFields(LETTERS[k].fields, raw);
    const permanentEmployeeCode = raw.permanentEmployeeCode?.trim();
    if (!permanentEmployeeCode) throw new BusinessRuleError("Enter the permanent employee ID to approve.");
    if (permanentEmployeeCode.length > 30) throw new BusinessRuleError("The employee ID is too long.");
    await decideOnboarding(ctx, employeeId, { decision: "APPROVE", permanentEmployeeCode, note: raw.note?.slice(0, 1000) });
    const { letter, mail } = await issueLetter(ctx, employeeId, k, raw);
    revalidatePath(`/app/employees/${employeeId}`);
    revalidatePath("/app/employees");
    await setFlash(`Approved with ID ${permanentEmployeeCode}, and ${LETTERS[k].title.toLowerCase()} ${letter.referenceNo} issued. ${mailNote(mail)}`, mail.status === "FAILED" ? "warning" : "success");
    target = `/app/letters/${letter.id}`;
  });
  if (target) redirect(target);
  return r;
}

export async function issueMemoAction(employeeId: string, format: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  let target = "";
  const r = await safeAction(async () => {
    const ctx = await actionContext("employees.manage");
    const { memo, mail } = await issueMemo(ctx, employeeId, asMemoFormat(format), rawValues(fd));
    revalidatePath(`/app/employees/${employeeId}`);
    await setFlash(`Memo ${memo.memoNumber} issued. ${mailNote(mail)}`, mail.status === "FAILED" ? "warning" : "success");
    target = `/app/letters/${memo.id}`;
  });
  if (target) redirect(target);
  return r;
}

/** Staff: accept an offer / appointment letter (allowed while awaiting approval). */
export async function acceptLetterAction(letterId: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext();
    await acceptLetter(ctx, letterId);
    revalidatePath(`/app/letters/${letterId}`);
    return { ok: true, message: "Thank you — your acceptance has been recorded." };
  });
}

/** Staff: acknowledge a memo, with an optional written explanation. */
export async function acknowledgeMemoAction(memoId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const reply = fd.get("reply");
  return safeAction(async () => {
    const ctx = await actionContext();
    if (typeof reply === "string" && reply.length > 4000) throw new BusinessRuleError("Keep the reply under 4000 characters.");
    await acknowledgeMemo(ctx, memoId, typeof reply === "string" ? reply : undefined);
    revalidatePath(`/app/letters/${memoId}`);
    return { ok: true, message: "Recorded. The firm has been notified." };
  });
}
