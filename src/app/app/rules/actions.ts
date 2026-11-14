"use server";

import { revalidatePath } from "next/cache";
import { safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { acknowledgeRules } from "@/lib/services/office-rules";

export async function acceptRulesAction(): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("app.use");
    await acknowledgeRules(ctx);
    revalidatePath("/app", "layout");
    return { ok: true, message: "Thank you. Your acceptance is recorded." };
  });
}
