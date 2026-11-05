"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert, Trash2 } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { inputCls } from "@/components/form";
import { toast } from "@/components/toaster";
import type { DeletionEntity, DeletionPreview } from "@/lib/deletion-types";
import { deleteRecordAction, previewDeletionAction } from "@/app/app/delete-actions";

/**
 * Delete with a clear warning: what will go with this record is fetched when the dialog
 * opens, and big deletions (a client, a staff member) must be confirmed by typing the name.
 */
export function DeleteButton({
  entity,
  id,
  label = "Delete",
  redirectTo,
  size = "sm",
  variant = "danger",
}: {
  entity: DeletionEntity;
  id: string;
  label?: string;
  /** Where to go afterwards; without it the current page refreshes. */
  redirectTo?: string;
  size?: "sm" | "md";
  variant?: "danger" | "ghost";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);

  function openDialog() {
    setTyped("");
    setPreview(null);
    setOpen(true);
    start(async () => {
      const r = await previewDeletionAction(entity, id);
      if (!r.ok) {
        setOpen(false);
        toast(r.message, "error");
        return;
      }
      setPreview(r.preview);
    });
  }

  function confirm() {
    start(async () => {
      const r = await deleteRecordAction(entity, id, typed);
      if (!r.ok) {
        toast(r.message ?? "That didn't work. Please try again.", "error");
        return;
      }
      toast(r.message ?? "Deleted.", "success");
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  }

  const needsTyping = !!preview?.confirmText;
  const ready = !!preview && !preview.blocked && (!needsTyping || typed.trim().toLowerCase() === preview.confirmText!.trim().toLowerCase());

  return (
    <>
      <button type="button" onClick={openDialog} className={buttonClass(variant, size)}>
        <Trash2 className="size-3.5" aria-hidden /> {label}
      </button>
      {open && (
        <dialog
          ref={ref}
          onClose={() => setOpen(false)}
          aria-labelledby="delete-title"
          className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-line bg-surface p-0 text-ink shadow-[0_30px_80px_-20px_rgb(15_29_51/.55)] backdrop:bg-night/50 backdrop:backdrop-blur-[2px]"
        >
          <div className="p-5">
            <div className="flex items-start gap-3">
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-danger-bg text-danger"><TriangleAlert className="size-5" /></span>
              <div className="min-w-0">
                <h2 id="delete-title" className="font-semibold">{preview ? preview.title : "Checking what is linked…"}</h2>
                {!preview ? (
                  <span aria-hidden className="mt-3 block size-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />
                ) : preview.blocked ? (
                  <p className="mt-1 text-sm text-danger">{preview.blocked}</p>
                ) : (
                  <p className="mt-1 text-sm text-muted">This cannot be undone. A record of who deleted it stays in the audit log.</p>
                )}
              </div>
            </div>
            {preview && !preview.blocked && preview.lines.length > 0 && (
              <div className="mt-4 rounded-lg border border-line bg-paper/60 p-3 text-sm">
                <p className="mb-1.5 text-xs font-medium text-muted">What happens</p>
                <ul className="list-disc space-y-1 pl-4">
                  {preview.lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            )}
            {preview?.advice && !preview.blocked && <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">{preview.advice}</p>}
            {needsTyping && !preview?.blocked && (
              <div className="mt-4">
                <label htmlFor="delete-confirm" className="mb-1 block text-sm font-medium">
                  Type <strong className="select-all break-all">{preview?.confirmText}</strong> to confirm
                </label>
                <input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={inputCls} />
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className={buttonClass("secondary", "md")}>Cancel</button>
              {!preview?.blocked && (
                <button type="button" onClick={confirm} disabled={!ready || pending} className={buttonClass("danger", "md", "bg-danger text-white hover:bg-danger/90")}>
                  {pending && preview ? "Deleting…" : "Delete permanently"}
                </button>
              )}
            </div>
          </div>
        </dialog>
      )}
    </>
  );
}
