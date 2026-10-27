"use server";

import { revalidatePath } from "next/cache";
import { parseForm, safeAction, type ActionState } from "@/lib/actions";
import { isoDateInTz } from "@/lib/dates";
import { actionContext } from "@/lib/session";
import { allocationSchema, changeAllocation, changeSchema, createAllocation, endAllocation } from "@/lib/services/allocations";

export async function createAllocationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(allocationSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("allocations.manage");
    await createAllocation(ctx, parsed.data);
    revalidatePath("/app/allocations");
    return { ok: true, message: "Team member allocated." };
  });
}

export async function changeAllocationAction(allocationId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(changeSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("allocations.manage");
    await changeAllocation(ctx, allocationId, parsed.data);
    revalidatePath("/app/allocations");
    return { ok: true, message: "Allocation changed. The previous allocation is kept in history." };
  });
}

export async function endAllocationAction(allocationId: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("allocations.manage");
    await endAllocation(ctx, allocationId, isoDateInTz(new Date(), ctx.organization.timezone));
    revalidatePath("/app/allocations");
  });
}
