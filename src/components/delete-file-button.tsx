"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import clsx from "clsx";
import { toast } from "@/components/toaster";
import { deleteFileAction } from "@/app/app/file-actions";

/**
 * Small "Delete" next to a document, photo, bill or attachment. Render it only for people with
 * the documents.delete right (canDeleteFiles). The record the file belongs to is kept.
 */
export function DeleteFileButton({ fileId, what = "document", compact, className }: { fileId: string; what?: string; compact?: boolean; className?: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      title={`Delete this ${what}`}
      aria-label={`Delete this ${what}`}
      className={clsx("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-danger hover:bg-danger-bg disabled:opacity-60", className)}
      onClick={() => {
        if (!window.confirm(`Delete this ${what}? It is removed for everyone and cannot be opened again. The record it belongs to stays.`)) return;
        start(async () => {
          const r = await deleteFileAction(fileId);
          if (r && r.ok === false) toast(r.message ?? "That didn't work. Please try again.", "error");
          else {
            toast(r?.message ?? "Deleted.", "success");
            router.refresh();
          }
        });
      }}
    >
      <Trash2 aria-hidden className="size-3.5" />
      {!compact && (pending ? "Deleting…" : "Delete")}
    </button>
  );
}
