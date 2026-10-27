import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AppContext } from "@/lib/session";

/** Record a sensitive action. Never put secrets or raw PAN/Aadhaar/bank numbers in metadata. */
export function audit(
  tx: Prisma.TransactionClient,
  ctx: AppContext,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata?: Prisma.InputJsonValue,
) {
  return tx.auditLog.create({
    data: { organizationId: ctx.organization.id, actorUserId: ctx.user.id, action, entityType, entityId, metadata },
  });
}
