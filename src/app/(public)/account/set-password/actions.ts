"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseForm, safeAction, type ActionState } from "@/lib/actions";
import { getContext } from "@/lib/session";
import { resetCredentialPassword } from "@/lib/services/accounts";
import { audit } from "@/lib/services/audit";
import { setFlash } from "@/lib/flash";

const schema = z
  .object({ newPassword: z.string().min(10, "Use at least 10 characters").max(128), confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

/** First sign-in with an emailed temporary password: replace it with the person's own. */
export async function setFirstPasswordAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  const ctx = await getContext();
  if (!ctx) return { ok: false, message: "Your session has ended. Sign in again with the temporary password from your email." };
  if (!ctx.mustChangePassword) redirect(ctx.role === "CLIENT" ? "/client" : "/app");
  if (ctx.tempPasswordExpiresAt && ctx.tempPasswordExpiresAt < new Date()) {
    return { ok: false, message: "Your temporary password has expired. Ask your administrator to resend the invitation." };
  }
  const r = await safeAction(async () => {
    await prisma.$transaction(async (tx) => {
      await resetCredentialPassword(tx, ctx.user.id, parsed.data.newPassword); // ends the temporary-password session
      await tx.organizationMembership.update({ where: { id: ctx.membershipId }, data: { mustChangePassword: false, tempPasswordExpiresAt: null } });
      await audit(tx, ctx, "account.password_set", "user", ctx.user.id);
    });
  });
  if (r.ok === false) return r;
  // Sign in again with the new password (sets a fresh session cookie).
  await auth.api.signInEmail({ body: { email: ctx.user.email, password: parsed.data.newPassword }, headers: await headers() });
  await setFlash("Password set. You are signed in.");
  redirect(ctx.role === "CLIENT" ? "/client" : "/app/onboarding");
}
