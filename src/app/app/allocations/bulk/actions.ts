"use server";

import { revalidatePath } from "next/cache";
import { parseForm, safeAction } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { bulkAllocate, bulkAllocateSchema, bulkTransfer, bulkTransferSchema } from "@/lib/services/allocation-bulk";
import type { BulkState } from "./forms";

const summary = (results: { ok: boolean }[], what: string) => {
  const ok = results.filter((r) => r.ok).length;
  return ok === results.length ? `${what}: all ${ok} done.` : ok ? `${what}: ${ok} of ${results.length} done — see why the rest were not.` : `${what}: nothing was saved — see why below.`;
};

export async function bulkAllocateAction(_p: BulkState, fd: FormData): Promise<BulkState> {
  const parsed = parseForm(bulkAllocateSchema, fd);
  if (!parsed.success) return parsed.state;
  let results: BulkState["results"] = [];
  const state = await safeAction(async () => {
    const ctx = await actionContext("allocations.manage");
    results = await bulkAllocate(ctx, parsed.data);
    revalidatePath("/app/allocations");
    return { ok: results.some((r) => r.ok), message: summary(results, "Allocation") };
  });
  return { ...state, results };
}

export async function bulkTransferAction(_p: BulkState, fd: FormData): Promise<BulkState> {
  const parsed = parseForm(bulkTransferSchema, fd);
  if (!parsed.success) return parsed.state;
  let results: BulkState["results"] = [];
  const state = await safeAction(async () => {
    const ctx = await actionContext("allocations.manage");
    results = await bulkTransfer(ctx, parsed.data);
    revalidatePath("/app/allocations");
    return { ok: results.some((r) => r.ok), message: summary(results, "Transfer") };
  });
  return { ...state, results };
}
