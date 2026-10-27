import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseForm, type ActionState } from "@/lib/actions";
import { checkRateLimit } from "@/lib/rate-limit";
import { inspectPasswordLink, consumePasswordLink } from "@/lib/services/password-links";
import { KeyRound, Link2Off as LinkIcon } from "lucide-react";
import { AuthCard, AuthShell } from "@/components/public/auth-shell";
import { ResetForm } from "./form";

export const metadata: Metadata = { title: "Set your password", robots: { index: false } };

const schema = z
  .object({
    token: z.string().min(30).max(100),
    password: z.string().min(10, "Use at least 10 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

async function resetPassword(_p: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  if (!(await checkRateLimit("password-set", 10, 900))) return { ok: false, message: "Too many attempts. Please wait and try again." };
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  const ok = await consumePasswordLink(parsed.data.token, parsed.data.password);
  if (!ok) return { ok: false, message: "This link is invalid, expired or has already been used. Ask your administrator for a new one." };
  redirect("/login?reset=1");
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const token = (await searchParams).token;
  const link = typeof token === "string" ? await inspectPasswordLink(token) : null;
  return link ? (
    <AuthShell
      icon={<KeyRound className="size-7" aria-hidden />}
      eyebrow="Secure link"
      title={link.purpose === "setup" ? "Set up your account" : "Choose a new password"}
      em={["account", "password"]}
      description="This link works once. After saving, sign in with your new password."
    >
      <AuthCard>
        <ResetForm action={resetPassword} token={token as string} />
      </AuthCard>
    </AuthShell>
  ) : (
    <AuthShell
      icon={<LinkIcon className="size-7" aria-hidden />}
      tone="warn"
      eyebrow="Secure link"
      title="This link can't be used"
      em={["can't"]}
      description="The link is invalid, has expired or was already used. Ask your administrator to send a new one."
    >
      <Link href="/forgot-password" className="pub-btn">Request a new link</Link>
    </AuthShell>
  );
}
