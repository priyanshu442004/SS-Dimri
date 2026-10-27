import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import { getContext } from "@/lib/session";
import { signOutAction } from "@/app/app/account-actions";
import { AuthCard, AuthShell } from "@/components/public/auth-shell";
import { SetPasswordForm } from "./form";

export const metadata: Metadata = { title: "Set your password" };

/** Shown right after signing in with an emailed temporary password; nothing else opens until it is replaced. */
export default async function SetPasswordPage() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  if (!ctx.mustChangePassword) redirect(ctx.role === "CLIENT" ? "/client" : "/app");
  const expired = !!ctx.tempPasswordExpiresAt && ctx.tempPasswordExpiresAt < new Date();
  return (
    <AuthShell
      icon={<KeyRound className="size-7" aria-hidden />}
      tone={expired ? "warn" : "ink"}
      eyebrow="First sign-in"
      title={expired ? "Your temporary password has expired" : "Set your password"}
      em={["expired", "password"]}
      description={expired ? (
        <>It was valid until {formatDateTime(ctx.tempPasswordExpiresAt)}. Ask your administrator to resend the invitation; you will get a new temporary password by email.</>
      ) : (
        <>Welcome, {ctx.user.name}. Choose your own password to replace the temporary one from your email. You will sign in with <strong>{ctx.user.email}</strong> and this password from now on.</>
      )}
    >
      {!expired && <AuthCard><SetPasswordForm /></AuthCard>}
      <form action={signOutAction} className="mt-6">
        <button className="pub-btn pub-btn-ghost pub-btn-sm">Sign out</button>
      </form>
    </AuthShell>
  );
}
