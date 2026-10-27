import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { resetCredentialPassword } from "./accounts";

// Single-use, time-limited password links (account setup and password reset).
// Only a SHA-256 hash of the token is stored (in Better Auth's `verifications`
// table); the raw token exists only in the link given to the person.

const PREFIX = "password-link:";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export type LinkPurpose = "setup" | "reset";

export async function createPasswordLink(userId: string, purpose: LinkPurpose, hoursValid = purpose === "setup" ? 72 : 2) {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    // Issuing a new link invalidates earlier unused links for the same user.
    prisma.verification.deleteMany({ where: { identifier: { startsWith: PREFIX }, value: { startsWith: `${userId}:` } } }),
    prisma.verification.create({
      data: { identifier: PREFIX + hash(token), value: `${userId}:${purpose}`, expiresAt: new Date(Date.now() + hoursValid * 3_600_000) },
    }),
  ]);
  return { url: `${serverEnv().BETTER_AUTH_URL}/reset-password?token=${token}`, expiresInHours: hoursValid };
}

/** Look up a token without consuming it (to show the right page state). */
export async function inspectPasswordLink(token: string) {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return null;
  const v = await prisma.verification.findFirst({ where: { identifier: PREFIX + hash(token) } });
  if (!v || v.expiresAt < new Date()) return null;
  const [userId, purpose] = v.value.split(":");
  return { userId, purpose: purpose as LinkPurpose };
}

/** Consume the token and set the password. Returns false for invalid/expired tokens. */
export async function consumePasswordLink(token: string, newPassword: string) {
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return false;
  return prisma.$transaction(async (tx) => {
    const v = await tx.verification.findFirst({ where: { identifier: PREFIX + hash(token) } });
    if (!v) return false;
    await tx.verification.delete({ where: { id: v.id } }); // single use, even if expired
    if (v.expiresAt < new Date()) return false;
    const [userId] = v.value.split(":");
    await resetCredentialPassword(tx, userId, newPassword); // also revokes existing sessions
    await tx.organizationMembership.updateMany({ where: { userId }, data: { mustChangePassword: false } });
    return true;
  });
}
