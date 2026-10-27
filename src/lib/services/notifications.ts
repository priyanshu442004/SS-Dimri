import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Role } from "@/lib/permissions";

type Note = { type: string; title: string; body?: string; link?: string };

export async function notifyUsers(tx: Prisma.TransactionClient, organizationId: string, userIds: string[], note: Note) {
  const unique = [...new Set(userIds)];
  if (!unique.length) return;
  await tx.notification.createMany({ data: unique.map((userId) => ({ organizationId, userId, ...note })) });
}

export async function notifyEmployees(tx: Prisma.TransactionClient, organizationId: string, employeeIds: string[], note: Note) {
  if (!employeeIds.length) return;
  const members = await tx.organizationMembership.findMany({
    where: { organizationId, status: "ACTIVE", employeeId: { in: employeeIds } },
    select: { userId: true },
  });
  await notifyUsers(tx, organizationId, members.map((m) => m.userId), note);
}

/** Notify the portal logins of a client. */
export async function notifyClientUsers(tx: Prisma.TransactionClient, organizationId: string, clientId: string, note: Note) {
  const members = await tx.organizationMembership.findMany({ where: { organizationId, clientId, role: "CLIENT", status: "ACTIVE" }, select: { userId: true } });
  await notifyUsers(tx, organizationId, members.map((m) => m.userId), note);
}

export async function notifyRoles(tx: Prisma.TransactionClient, organizationId: string, roles: Role[], note: Note, exceptUserId?: string) {
  const members = await tx.organizationMembership.findMany({
    where: { organizationId, status: "ACTIVE", role: { in: roles } },
    select: { userId: true },
  });
  await notifyUsers(tx, organizationId, members.map((m) => m.userId).filter((id) => id !== exceptUserId), note);
}
