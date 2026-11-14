"use server";

import { revalidatePath } from "next/cache";
import { parseForm, safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
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
