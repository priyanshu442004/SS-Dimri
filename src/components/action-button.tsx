"use client";

import { useTransition, type ReactNode } from "react";
import { buttonClass } from "@/components/ui";
import { toast } from "@/components/toaster";

type Result = { ok?: boolean; message?: string } | void;

/** One-click server action (remove, status change…) with optional confirmation; the result is shown as a toast. */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
}: {
  action: () => Promise<Result>;
  children: ReactNode;
  confirm?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      aria-busy={pending}
      className={buttonClass(variant, size)}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const r = await action();
          if (r && r.ok === false) toast(r.message ?? "That didn't work. Please try again.", "error");
          else if (r && r.message) toast(r.message, "success");
        });
      }}
    >
      {pending && <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {pending ? "Working…" : children}
    </button>
  );
}
