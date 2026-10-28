import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/session";
import { landingPath } from "@/lib/permissions";
import { AuthCard, AuthShell } from "@/components/public/auth-shell";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/login">) {
  const ctx = await getContext();
  if (ctx) redirect(landingPath(ctx.role));
  const sp = await searchParams;
  return (
    <AuthShell
      eyebrow="Client & staff portal"
      title="Sign in to the portal"
      em={["portal"]}
      description="Sign in with your email. New staff: use the temporary password from your invitation email; you will then choose your own."
    >
      {sp.reason === "access-ended" && (
        <p role="status" className="pub-swap mb-4 rounded-xl border border-warn/30 bg-warn-bg px-4 py-3 text-sm text-warn">
          Your access period has ended and you have been signed out. Your account can be used again once it is approved. You can sign in to see its status.
        </p>
      )}
      {sp.reason === "signed-out" && (
        <p role="status" className="pub-swap mb-4 rounded-xl border border-ink/15 bg-paper-2 px-4 py-3 text-sm">You have been signed out because your access changed. Sign in again, or contact the office.</p>
      )}
      {sp.reset === "1" && <p role="status" className="pub-swap mb-4 rounded-xl border border-ok/30 bg-ok-bg px-4 py-3 text-sm text-ok">Your password has been set. Sign in with your new password.</p>}
      <AuthCard>
        <SignInForm />
      </AuthCard>
      <p className="mt-6 text-sm text-muted">
        New to Office ERP? <Link href="/register" className="pub-link font-medium text-stamp">Create an account</Link>
      </p>
    </AuthShell>
  );
}
