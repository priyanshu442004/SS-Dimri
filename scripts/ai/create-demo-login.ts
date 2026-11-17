// Creates (or resets) the "AI reporting" demo login in a firm's database.
//   npx tsx scripts/ai/create-demo-login.ts <organizationId>
// Uses DATABASE_URL from .env.local. The login is an ADMIN of the given firm.
import Module from "node:module";
const load = (Module as unknown as { _load: (r: string, ...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = (r: string, ...a: unknown[]) => (r === "server-only" ? {} : load(r, ...a));
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

const EMAIL = "demo@gmail.com";
const PASSWORD = "Demo@12345";

async function main() {
  const orgId = process.argv[2];
  if (!orgId) throw new Error("Pass the organization id.");
  const { prisma } = await import("../../src/lib/db");
  const { createCredentialUser } = await import("../../src/lib/services/accounts");
  const { hashPassword } = await import("../../src/lib/auth");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, select: { tradeName: true } });
  let user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (user) {
    await prisma.account.updateMany({ where: { userId: user.id, providerId: "credential" }, data: { password: await hashPassword(PASSWORD) } });
  } else {
    user = await prisma.$transaction((tx) => createCredentialUser(tx, { name: "Demo Account", email: EMAIL, password: PASSWORD }));
  }
  const m = await prisma.organizationMembership.findFirst({ where: { userId: user.id, organizationId: orgId } });
  if (m) await prisma.organizationMembership.update({ where: { id: m.id }, data: { role: "ADMIN", status: "ACTIVE", mustChangePassword: false } });
  else await prisma.organizationMembership.create({ data: { organizationId: orgId, userId: user.id, role: "ADMIN" } });
  console.log(`Ready: ${EMAIL} / ${PASSWORD} (ADMIN of ${org.tradeName})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
