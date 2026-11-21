"use server";

import { revalidatePath } from "next/cache";
import { parseForm, safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { assetSchema, deleteAsset, issueAsset, issueSchema, returnAsset, returnSchema, saveAsset } from "@/lib/services/assets";

export async function saveAssetAction(id: string | null, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(assetSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("assets.manage");
    await saveAsset(ctx, parsed.data, id ?? undefined);
    revalidatePath("/app/assets");
    return { ok: true, message: id ? "Asset updated." : `Asset ${parsed.data.code} added to the register.` };
  });
}

export async function issueAssetAction(assetId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(issueSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("assets.manage");
    const name = await issueAsset(ctx, assetId, parsed.data);
    revalidatePath("/app/assets");
    return { ok: true, message: `Issued to ${name}. They see it under My assets.` };
  });
}

export async function returnAssetAction(assetId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(returnSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("assets.manage");
    await returnAsset(ctx, assetId, parsed.data);
    revalidatePath("/app/assets");
    return { ok: true, message: "Asset taken back." };
  });
}

export async function deleteAssetAction(id: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("assets.manage");
    await deleteAsset(ctx, id);
    revalidatePath("/app/assets");
    return { ok: true, message: "Asset removed." };
  });
}
