"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseForm, safeAction, zOptionalText, type ActionState } from "@/lib/actions";
import { formatDate } from "@/lib/dates";
import { actionContext } from "@/lib/session";
import {
  addComplianceColumn,
  completeComplianceEntry,
  complianceColumnSchema,
  complianceEntrySchema,
  createComplianceEntry,
  removeComplianceColumn,
  setAppliesToFirm,
  setExtendedDateRemark,
  updateComplianceEntry,
} from "@/lib/services/compliance";

const refresh = () => revalidatePath("/app/compliances");

export async function createComplianceEntryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(complianceEntrySchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("compliance.manage");
    await createComplianceEntry(ctx, parsed.data, fd);
    refresh();
    return { ok: true, message: "Added to the tracker." };
  });
}

export async function updateComplianceEntryAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(complianceEntrySchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("compliance.manage");
    await updateComplianceEntry(ctx, id, parsed.data, fd);
    refresh();
    return { ok: true, message: "Saved." };
  });
}

export async function completeComplianceEntryAction(id: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("compliance.use");
    const { nextDue } = await completeComplianceEntry(ctx, id);
    refresh();
    return { ok: true, message: nextDue ? `Marked as done. The next one is added, due ${formatDate(nextDue)}.` : "Marked as done." };
  });
}

export async function addComplianceColumnAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(complianceColumnSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("compliance.manage");
    await addComplianceColumn(ctx, parsed.data.label);
    refresh();
    return { ok: true, message: "Column added." };
  });
}

export async function removeComplianceColumnAction(id: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("compliance.manage");
    await removeComplianceColumn(ctx, id);
    refresh();
    return { ok: true, message: "Column removed." };
  });
}

const appliesSchema = z.object({ value: z.enum(["yes", "no"]) });

const extendSchema = z.object({ remark: zOptionalText(300) });

export async function setExtendedDateRemarkAction(itemId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(extendSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("compliance.manage");
    await setExtendedDateRemark(ctx, itemId, parsed.data.remark);
    refresh();
    return { ok: true, message: parsed.data.remark ? "Extended date saved." : "Remark cleared." };
  });
}

export async function setAppliesToFirmAction(itemId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(appliesSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("compliance.manage");
    await setAppliesToFirm(ctx, itemId, parsed.data.value === "yes");
    refresh();
    return { ok: true };
  });
}
