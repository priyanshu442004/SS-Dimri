"use server";

import { revalidatePath } from "next/cache";
import { parseForm, safeAction, type ActionState } from "@/lib/actions";
import { clientActionContext } from "@/lib/session";
import { hasFile } from "@/lib/services/files";
import {
  addClientRemark,
  clientRemarkSchema,
  observationSchema,
  portalDocumentSchema,
  recordObservation,
  respondSchema,
  respondToRequest,
  uploadPortalDocument,
} from "@/lib/services/portal";

export async function respondAction(itemId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(respondSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await clientActionContext();
    await respondToRequest(ctx, itemId, parsed.data.note, fd);
    revalidatePath(`/client/requests/${itemId}`);
    return { ok: true, message: "Reply sent to our team." };
  });
}

export async function clientRemarkAction(taskId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(clientRemarkSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await clientActionContext();
    await addClientRemark(ctx, taskId, parsed.data.note);
    revalidatePath(`/client/work/${taskId}`);
    return { ok: true, message: "Remark sent." };
  });
}

export async function observationAction(taskId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(observationSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await clientActionContext();
    await recordObservation(ctx, taskId, parsed.data.decision, parsed.data.note);
    revalidatePath(`/client/work/${taskId}`);
    return { ok: true, message: "Thank you — your response has been recorded." };
  });
}

export async function uploadDocumentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(portalDocumentSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await clientActionContext();
    const file = fd.get("file");
    if (!hasFile(file)) return { ok: false, fieldErrors: { file: ["Choose a file"] }, message: "Choose a file to upload." };
    await uploadPortalDocument(ctx, parsed.data.title, file);
    revalidatePath("/client/documents");
    return { ok: true, message: "Uploaded. Our team has been notified." };
  });
}
