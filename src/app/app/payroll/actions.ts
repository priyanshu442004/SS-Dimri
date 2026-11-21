"use server";

import { revalidatePath } from "next/cache";
import { parseForm, safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { addAdvance, advanceEditSchema, advanceSchema, cancelConveyance, conveyanceDecisionSchema, conveyanceSchema, decideConveyance, deleteAdvance, editAdvance, submitConveyance } from "@/lib/services/claims";
import { deleteSalary, editSalary, salaryEditSchema, salarySchema, setSalary } from "@/lib/services/payroll";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

// Salaries can be fixed by managers (their team) and administrators (everyone); the service checks whose.
export async function setSalaryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(salarySchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("payroll.view_own");
    const r = await setSalary(ctx, parsed.data);
    revalidatePath("/app/payroll");
    return { ok: true, message: `${r.name}: salary ${inr(r.amount)} ${r.period === "ANNUAL" ? "a year" : "a month"} from ${parsed.data.effectiveFrom}. They are notified.` };
  });
}

export async function editSalaryAction(recordId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(salaryEditSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("payroll.view_own");
    await editSalary(ctx, recordId, parsed.data);
    revalidatePath("/app/payroll");
    return { ok: true, message: "Salary entry corrected." };
  });
}

export async function deleteSalaryAction(recordId: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("payroll.view_own");
    await deleteSalary(ctx, recordId);
    revalidatePath("/app/payroll");
    return { ok: true, message: "Salary entry removed. The earlier salary applies again." };
  });
}

// ---------------------------------------------------------------- conveyance claims and advances (tracker S.No. 84, 85)


export async function submitConveyanceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(conveyanceSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("payroll.view_own");
    await submitConveyance(ctx, parsed.data, fd);
    revalidatePath("/app/payroll");
    return { ok: true, message: `Conveyance claim of ${inr(parsed.data.amount)} sent for approval. Once approved it is paid with that month's salary.` };
  });
}

export async function cancelConveyanceAction(id: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("payroll.view_own");
    await cancelConveyance(ctx, id);
    revalidatePath("/app/payroll");
    return { ok: true, message: "Claim withdrawn." };
  });
}

export async function decideConveyanceAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(conveyanceDecisionSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("payroll.manage");
    await decideConveyance(ctx, id, parsed.data);
    revalidatePath("/app/payroll");
    return { ok: true, message: parsed.data.decision === "approve" ? "Approved: it is added to that month's salary." : "Claim rejected." };
  });
}

export async function addAdvanceAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(advanceSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("payroll.manage");
    const name = await addAdvance(ctx, parsed.data);
    revalidatePath("/app/payroll");
    return { ok: true, message: `Advance of ${inr(parsed.data.amount)} recorded for ${name}: ${inr(parsed.data.monthlyDeduction)} a month is deducted from ${parsed.data.startMonth}.` };
  });
}

export async function editAdvanceAction(id: string, month: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(advanceEditSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("payroll.manage");
    await editAdvance(ctx, id, parsed.data, month);
    revalidatePath("/app/payroll");
    return { ok: true, message: parsed.data.close === "close" ? "Advance closed: no more deductions." : parsed.data.close === "reopen" ? "Advance reopened." : "Advance updated." };
  });
}

export async function deleteAdvanceAction(id: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("payroll.manage");
    await deleteAdvance(ctx, id);
    revalidatePath("/app/payroll");
    return { ok: true, message: "Advance removed." };
  });
}
