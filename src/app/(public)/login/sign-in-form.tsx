"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const inputCls =
  "block h-12 w-full rounded-lg border border-ink/15 bg-paper/40 px-3.5 text-[15px] transition-[border-color,box-shadow,background-color] duration-300 focus:border-ink focus:bg-surface focus:shadow-[0_0_0_4px_var(--color-marigold-soft)] focus:outline-none";

export function SignInForm() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const identifier = String(fd.get("identifier") ?? "").trim();
    const password = String(fd.get("password") ?? "");
    if (!identifier || !password) {
      setError("Enter your login ID or email and your password.");
      return;
    }
    setPending(true);
    setError(null);
    const res = identifier.includes("@")
      ? await authClient.signIn.email({ email: identifier, password })
      : await authClient.signIn.username({ username: identifier.toLowerCase(), password });
    if (res.error) {
      setPending(false);
      // One generic message: never reveal whether the account exists.
      setError(res.error.status === 429 ? "Too many attempts. Please wait a minute and try again." : "Incorrect login ID/email or password.");
      return;
    }
    // The server decides the destination from the account's role and status.
    // `next` is only honoured for same-site app paths.
    router.replace(next && /^\/(app|client)(\/|$)/.test(next) ? next : "/app");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div>
        <label htmlFor="identifier" className="mb-1.5 block text-sm font-medium">Login ID or email</label>
        <input id="identifier" name="identifier" autoComplete="username" autoCapitalize="none" className={inputCls} required />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="password" className="block text-sm font-medium">Password</label>
          <Link href="/forgot-password" className="pub-link text-xs font-medium text-stamp">Forgot password?</Link>
        </div>
        <div className="relative">
          <input id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password" className={`${inputCls} pr-10`} required />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute inset-y-0 right-0 grid w-12 place-items-center text-muted transition-colors hover:text-ink active:scale-90"
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
          >
            <span key={String(show)} className="pub-pop">{show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}</span>
          </button>
        </div>
      </div>
      <p aria-live="assertive" className={error ? "pub-swap rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger" : "sr-only"}>{error}</p>
      <button type="submit" disabled={pending} className="pub-btn pub-btn-block">
        {pending && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-paper/30 border-t-paper" />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
