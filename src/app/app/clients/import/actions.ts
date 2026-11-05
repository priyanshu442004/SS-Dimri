"use server";

import { revalidatePath } from "next/cache";
import { safeAction } from "@/lib/actions";
import { previewClientImport, runClientImport, type ImportPreview } from "@/lib/services/client-import";
import { hasFile } from "@/lib/services/files";
import { actionContext } from "@/lib/session";

const mappingOf = (fd: FormData) => {
  try {
    return JSON.parse(String(fd.get("mapping") ?? "null"));
  } catch {
    return null;
  }
};

export type PreviewResult = { ok: true; preview: ImportPreview } | { ok: false; message: string };

export async function previewImportAction(fd: FormData): Promise<PreviewResult> {
  let preview: ImportPreview | null = null;
  const r = await safeAction(async () => {
    const ctx = await actionContext("clients.import");
    const file = fd.get("file");
    if (!hasFile(file)) return { ok: false, message: "Choose an Excel file first." };
    preview = await previewClientImport(ctx, file, mappingOf(fd));
  });
  if (r.ok === false || !preview) return { ok: false, message: r.message ?? "Something went wrong. Please try again." };
  return { ok: true, preview };
}

export type ImportResult = { ok: boolean; message: string; failures?: { row: number; message: string }[] };

export async function runImportAction(fd: FormData): Promise<ImportResult> {
  let failures: { row: number; message: string }[] = [];
  const r = await safeAction(async () => {
    const ctx = await actionContext("clients.import");
    const file = fd.get("file");
    if (!hasFile(file)) return { ok: false, message: "Choose an Excel file first." };
    const out = await runClientImport(ctx, file, mappingOf(fd), fd.get("activate") === "on");
    failures = out.failures;
    revalidatePath("/app/clients");
    const skipped = out.skipped ? ` ${out.skipped} rows were skipped (duplicates or errors).` : "";
    return { ok: true, message: `${out.created} ${out.created === 1 ? "client" : "clients"} imported.${skipped}` };
  });
  return { ok: r.ok !== false, message: r.message ?? "Something went wrong. Please try again.", failures };
}
