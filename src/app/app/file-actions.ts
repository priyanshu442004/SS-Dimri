"use server";

import { revalidatePath } from "next/cache";
import { safeAction, BusinessRuleError, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { deleteStoredFile } from "@/lib/services/file-removal";

/** Delete one stored document / photo / attachment (owners, administrators, or those granted the right). */
export async function deleteFileAction(fileId: string): Promise<ActionState> {
  return safeAction(async () => {
    if (!/^[0-9a-f-]{36}$/i.test(fileId)) throw new BusinessRuleError("This document was not found.");
    const ctx = await actionContext("app.use");
    const { name } = await deleteStoredFile(ctx, fileId);
    revalidatePath("/app", "layout");
    revalidatePath("/client", "layout");
    return { ok: true, message: `Deleted “${name}”.` };
  });
}
