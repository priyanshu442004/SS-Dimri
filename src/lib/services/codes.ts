import "server-only";
import type { Prisma } from "@/generated/prisma/client";

// Sequential codes (CL-039, TMP-012). Records can now be deleted, so "count + 1" could
// hand out a code that is still in use: continue after the highest one instead.

export function nextCode(prefix: string, existing: (string | null)[], width = 3) {
  const max = existing.reduce((m, c) => {
    const n = c?.startsWith(`${prefix}-`) ? Number(c.slice(prefix.length + 1)) : NaN;
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(width, "0")}`;
}

export async function nextClientCode(tx: Prisma.TransactionClient, organizationId: string) {
  const rows = await tx.client.findMany({ where: { organizationId, clientCode: { startsWith: "CL-" } }, select: { clientCode: true } });
  return nextCode("CL", rows.map((r) => r.clientCode));
}

export async function nextTemporaryEmployeeCode(tx: Prisma.TransactionClient, organizationId: string) {
  const rows = await tx.employee.findMany({ where: { organizationId, temporaryEmployeeCode: { startsWith: "TMP-" } }, select: { temporaryEmployeeCode: true } });
  return nextCode("TMP", rows.map((r) => r.temporaryEmployeeCode));
}
