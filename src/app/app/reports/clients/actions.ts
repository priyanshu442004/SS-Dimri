"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, parseForm, safeAction, zIsoDate, zOptionalText, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { addDue, dueSchema, saveSnapshot, updateDue } from "@/lib/services/client-report";

const snapshotSchema = z.object({ from: zIsoDate, to: zIsoDate, notes: zOptionalText(4000) });

export async function saveSnapshotAction(clientId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(snapshotSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("reports.client");
    await saveSnapshot(ctx, clientId, parsed.data.from, parsed.data.to, parsed.data.notes);
    revalidatePath(`/app/reports/clients/${clientId}`);
    return { ok: true, message: "Report snapshot saved." };
  });
}

export async function addDueAction(clientId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(dueSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("dues.manage");
    await addDue(ctx, clientId, parsed.data);
    revalidatePath(`/app/reports/clients/${clientId}`);
    return { ok: true, message: "Due recorded." };
  });
}

const dueUpdateSchema = z.object({ status: z.enum(["OPEN", "SETTLED", "WRITTEN_OFF"]), note: zOptionalText(500) });

export async function updateDueAction(clientId: string, dueId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(dueUpdateSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("dues.manage");
    await updateDue(ctx, dueId, parsed.data.status, parsed.data.note);
    revalidatePath(`/app/reports/clients/${clientId}`);
    return { ok: true, message: "Updated." };
  });
}

const observationSchema = z.object({
  clientObservationStatus: z.enum(["NOT_SHARED", "PENDING_CLIENT_REVIEW", "ACCEPTED", "OBSERVATIONS_RAISED"]),
  clientObservationNote: zOptionalText(1000),
});

export async function setObservationAction(clientId: string, taskId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(observationSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("reports.client");
    const res = await prisma.task.updateMany({ where: { id: taskId, clientId, organizationId: ctx.organization.id }, data: parsed.data });
    if (res.count !== 1) throw new BusinessRuleError("Task not found.");
    revalidatePath(`/app/reports/clients/${clientId}`);
    return { ok: true, message: "Saved." };
  });
}
