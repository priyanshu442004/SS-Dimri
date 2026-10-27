// Operator-only account recovery for a locked-out owner or administrator when
// no other administrator can issue a reset link in the app. Requires database
// credentials (run on a trusted machine). Prints a single-use, 2-hour reset
// link for the operator to deliver out of band; only its SHA-256 hash is
// stored, in the same format as src/lib/services/password-links.ts.
// Usage: npx tsx scripts/issue-recovery-link.ts owner@example.in
import { createHash, randomBytes } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });
const PREFIX = "password-link:";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npx tsx scripts/issue-recovery-link.ts <email>");
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, memberships: { where: { role: { in: ["OWNER", "ADMIN"] } }, select: { id: true, organizationId: true } } },
  });
  if (!user || user.memberships.length === 0) throw new Error("No owner or administrator login with that email.");

  const token = randomBytes(32).toString("base64url");
  const m = user.memberships[0];
  await prisma.$transaction([
    prisma.verification.deleteMany({ where: { identifier: { startsWith: PREFIX }, value: { startsWith: `${user.id}:` } } }),
    prisma.verification.create({
      data: { identifier: PREFIX + createHash("sha256").update(token).digest("hex"), value: `${user.id}:reset`, expiresAt: new Date(Date.now() + 2 * 3_600_000) },
    }),
    prisma.auditLog.create({
      data: { organizationId: m.organizationId, actorUserId: null, action: "account.recovery_link_issued_by_operator", entityType: "user", entityId: user.id },
    }),
  ]);
  console.log(`Single-use reset link (valid 2 hours) — deliver it to the account holder only:\n${process.env.BETTER_AUTH_URL}/reset-password?token=${token}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
