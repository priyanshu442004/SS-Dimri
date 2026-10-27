import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import type { ActionState } from "@/lib/actions";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifyRoles } from "@/lib/services/notifications";
import { KeyRound, MailCheck } from "lucide-react";
import { AuthCard, AuthShell } from "@/components/public/auth-shell";
import { ForgotForm } from "./form";

export const metadata: Metadata = { title: "Forgot password" };

/**
 * Password reset request. The response is identical whether or not the account
 * exists (no enumeration). No email provider is configured, so the request is
 * routed to the firm's administrators, who issue a single-use reset link.
 */
async function requestReset(_p: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const identifier = z.string().trim().min(3).max(200).safeParse(fd.get("identifier"));
  if (!identifier.success) return { ok: false, fieldErrors: { identifier: ["Enter your login ID or email"] } };
  if (await checkRateLimit("password-reset", 5, 900)) {
    const id = identifier.data.toLowerCase();
    const user = await prisma.user.findFirst({ where: id.includes("@") ? { email: id } : { username: id }, select: { id: true, name: true } });
    if (user) {
      const m = await prisma.organizationMembership.findFirst({
        where: { userId: user.id },
        select: { organizationId: true, employeeId: true, clientId: true, role: true },
      });
      if (m && m.role !== "OWNER") {
        await prisma.$transaction((tx) =>
          notifyRoles(tx, m.organizationId, ["OWNER", "ADMIN"], {
            type: "account.password_reset_requested",
            title: `Password reset requested: ${user.name}`,
            body: "Issue a reset link from their profile and share it with them directly.",
            link: m.employeeId ? `/app/employees/${m.employeeId}` : m.clientId ? `/app/clients/${m.clientId}?tab=portal` : "/app",
          }),
        );
      }
    }
  }
  redirect("/forgot-password?sent=1");
}

export default async function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  const sent = (await searchParams).sent === "1";
  return sent ? (
    <AuthShell icon={<MailCheck className="size-7" aria-hidden />} tone="ok" eyebrow="Password help" title="Request received." em={["received."]}>
      <AuthCard>
        <p role="status" className="text-sm leading-relaxed text-ink/75">
          If an account matches what you entered, the firm&apos;s administrator has been notified and will send you a secure link to set a new password. The link can be used once and expires after two hours.
        </p>
        <Link href="/login" transitionTypes={["nav-back"]} className="pub-btn pub-btn-ghost mt-6">Back to sign in</Link>
      </AuthCard>
    </AuthShell>
  ) : (
    <AuthShell
      icon={<KeyRound className="size-7" aria-hidden />}
      eyebrow="Password help"
      title="Forgot your password?"
      em={["password?"]}
      description="Enter your login ID or registered email. We will arrange a secure link to reset your password."
    >
      <AuthCard>
        <ForgotForm action={requestReset} />
      </AuthCard>
      <p className="mt-6 text-sm"><Link href="/login" transitionTypes={["nav-back"]} className="pub-link text-stamp">← Back to sign in</Link></p>
    </AuthShell>
  );
}
