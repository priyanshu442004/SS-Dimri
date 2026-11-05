import "server-only";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@/generated/prisma/client";
import { serverEnv } from "@/lib/env";
import { applyLocalNeonProxy } from "@/lib/neon-local";

// Single Prisma client per process (reused across hot reloads in development).
// Runtime traffic uses Neon's pooled connection string via the Neon adapter.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  applyLocalNeonProxy();
  const adapter = new PrismaNeon({ connectionString: serverEnv().DATABASE_URL });
  return new PrismaClient({
    adapter,
    // Some transactions hash a password or touch many rows: 5 s (Prisma's default) is too tight on a busy server.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
