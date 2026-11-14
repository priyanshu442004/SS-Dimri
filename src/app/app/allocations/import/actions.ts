"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions";
import { previewAllocationImport, runAllocationImport, type AllocationImportPreview } from "@/lib/services/allocation-import";
import { hasFile } from "@/lib/services/files";
import { actionContext } from "@/lib/session";

const mappingOf = (fd: FormData) => {
  try {
    return JSON.parse(String(fd.get("mapping") ?? "null"));
  } catch {
    return null;
  }
};

export type AllocationPreviewResult = { ok: true; preview: AllocationImportPreview & { missing: string[] } } | { ok: false; message: string };

export async function previewAllocationImportAction(fd: FormData): Promise<AllocationPreviewResult> {
  let preview: (AllocationImportPreview & { missing: string[] }) | null = null;
  const r = await safeAction(async () => {
    const ctx = await actionContext("allocations.manage");
    const file = fd.get("file");
    if (!hasFile(file)) return { ok: false, message: "Choose an Excel or CSV file first." };
    preview = await previewAllocationImport(ctx, file, mappingOf(fd));
  });
  if (r.ok === false || !preview) return { ok: false, message: r.message ?? "Something went wrong. Please try again." };
  return { ok: true, preview };
}

export type AllocationImportResult = { ok: boolean; message: string; failures?: { row: number; message: string }[] };

export async function runAllocationImportAction(fd: FormData): Promise<AllocationImportResult> {
  let failures: { row: number; message: string }[] = [];
  const r = await safeAction(async () => {
    const ctx = await actionContext("allocations.manage");
    const file = fd.get("file");
    if (!hasFile(file)) return { ok: false, message: "Choose an Excel or CSV file first." };
    const out = await runAllocationImport(ctx, file, mappingOf(fd), fd.get("includeClashes") === "on");
    failures = out.failures;
    revalidatePath("/app/allocations");
    revalidatePath("/app/clients");
    const parts = [
      `${out.created} ${out.created === 1 ? "allocation" : "allocations"} imported.`,
      out.duplicates ? `${out.duplicates} already allocated (skipped).` : "",
      out.clashesSkipped ? `${out.clashesSkipped} clashing ${out.clashesSkipped === 1 ? "row was" : "rows were"} skipped.` : "",
      out.failed ? `${out.failed} ${out.failed === 1 ? "row has" : "rows have"} errors (skipped).` : "",
    ];
    return { ok: true, message: parts.filter(Boolean).join(" ") };
  });
  return { ok: r.ok !== false, message: r.message ?? "Something went wrong. Please try again.", failures };
}
