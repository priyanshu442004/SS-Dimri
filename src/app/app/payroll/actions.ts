"use server";

import { revalidatePath } from "next/cache";
import { parseForm, safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { salarySchema, setSalary } from "@/lib/services/payroll";

export async function setSalaryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(salarySchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("payroll.manage");
    await setSalary(ctx, parsed.data);
    revalidatePath("/app/payroll");
    return { ok: true, message: "Salary saved." };
  });
}
