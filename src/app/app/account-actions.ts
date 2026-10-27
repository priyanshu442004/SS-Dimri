"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parseForm, safeAction, type ActionState } from "@/lib/actions";
import { getContext } from "@/lib/session";
import { audit } from "@/lib/services/audit";
import { setFlash } from "@/lib/flash";

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  await setFlash("You have been signed out.", "info");
  redirect("/login");
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Required"),
    newPassword: z.string().min(10, "Use at least 10 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Choose a different password" });

export async function changePasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(passwordSchema, fd);
  if (!parsed.success) return parsed.state;
  const result = await safeAction(async () => {
    const ctx = await getContext(); // staff and client logins can change their own password
    if (!ctx) return { ok: false, message: "Your session has expired. Please sign in again." };
    try {
      await auth.api.changePassword({
        body: { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword, revokeOtherSessions: true },
        headers: await headers(),
      });
    } catch {
      return { ok: false, fieldErrors: { currentPassword: ["Current password is incorrect"] }, message: "Password not changed." };
    }
    await prisma.organizationMembership.update({ where: { id: ctx.membershipId }, data: { mustChangePassword: false } });
  });
  if (result.ok === false) return result;
  return { ok: true, message: "Password changed. Other sessions have been signed out." };
}

const nameSchema = z.object({ name: z.string().trim().min(2, "Enter your name").max(120) });

/** Every signed-in user (staff or client) may change their own display name; role and status stay read-only. */
export async function updateDisplayNameAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(nameSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await getContext();
    if (!ctx) return { ok: false, message: "Your session has expired. Please sign in again." };
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: ctx.user.id }, data: { name: parsed.data.name } });
      await audit(tx, ctx, "account.name_changed", "user", ctx.user.id);
    });
    revalidatePath("/", "layout");
    return { ok: true, message: "Name updated." };
  });
}
