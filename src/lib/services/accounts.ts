import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth";

/**
 * Create a credential (email/username + password) login inside a transaction,
 * the same way Better Auth's sign-up stores it, but without signing the
 * current user out or in. Used for owner registration and admin-issued staff IDs.
 */
export async function createCredentialUser(
  tx: Prisma.TransactionClient,
  input: { name: string; email: string; password: string; username?: string },
) {
  const user = await tx.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      emailVerified: false,
      username: input.username?.toLowerCase(),
      displayUsername: input.username,
    },
  });
  await tx.account.create({
    data: { accountId: user.id, providerId: "credential", userId: user.id, password: await hashPassword(input.password) },
  });
  return user;
}

/** Replace a user's password (admin reset). Existing sessions are revoked. */
export async function resetCredentialPassword(tx: Prisma.TransactionClient, userId: string, password: string) {
  const hash = await hashPassword(password);
  const updated = await tx.account.updateMany({ where: { userId, providerId: "credential" }, data: { password: hash } });
  if (updated.count === 0) {
    await tx.account.create({ data: { accountId: userId, providerId: "credential", userId, password: hash } });
  }
  await tx.session.deleteMany({ where: { userId } });
}

/** Placeholder email for staff created with a login ID only (Better Auth requires an email). */
export function placeholderEmail(username: string, organizationId: string) {
  return `${username.toLowerCase()}.${organizationId.slice(0, 8)}@staff.invalid`;
}

export function generateTemporaryPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}
