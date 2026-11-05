"use server";

import { revalidatePath } from "next/cache";
import { safeAction, BusinessRuleError, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import type { DeletionEntity, DeletionPreview } from "@/lib/deletion-types";
import { canDelete, deleteRecord, previewDeletion } from "@/lib/services/deletions";

const ENTITIES: DeletionEntity[] = ["client", "employee", "task", "allocation", "timesheet", "attendance", "leave", "pending", "observation", "due", "dayreport", "compliance"];

async function guarded(entity: DeletionEntity, id: string) {
  if (!ENTITIES.includes(entity) || !/^[0-9a-f-]{36}$/i.test(id)) throw new BusinessRuleError("This record was not found.");
  const ctx = await actionContext("app.use");
  if (!canDelete(ctx, entity)) throw new BusinessRuleError("You do not have the right to delete this. Ask your administrator.");
  return ctx;
}

export async function previewDeletionAction(entity: DeletionEntity, id: string): Promise<{ ok: true; preview: DeletionPreview } | { ok: false; message: string }> {
  let preview: DeletionPreview | null = null;
  const r = await safeAction(async () => {
    const ctx = await guarded(entity, id);
    preview = await previewDeletion(ctx, entity, id);
  });
  if (r.ok === false || !preview) return { ok: false, message: r.message ?? "Something went wrong. Please try again." };
  return { ok: true, preview };
}

export async function deleteRecordAction(entity: DeletionEntity, id: string, typed: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await guarded(entity, id);
    await deleteRecord(ctx, entity, id, typed);
    revalidatePath("/app", "layout");
    return { ok: true, message: "Deleted." };
  });
}
