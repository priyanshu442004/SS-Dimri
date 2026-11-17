import "server-only";
import { prisma } from "@/lib/db";
import { isoDateInTz, formatDate, dateOnly } from "@/lib/dates";
import { GRANTABLE_RIGHTS, parseExpiries } from "@/lib/permissions";
import { notifyUsers, notifyRoles } from "./notifications";

// Temporary rights (tracker, 17 Nov 2026): an administrator gives someone a right until a date
// (e.g. add / edit clients while the client database is being filled). The right stops counting the
// day after (session.ts); this sweep also removes it from the person's rights and tells them.

const LABEL = new Map(GRANTABLE_RIGHTS.map((r) => [r.capability as string, r.label]));

export async function expireTemporaryRights(organizationId: string, tz: string) {
  const today = isoDateInTz(new Date(), tz);
  const members = await prisma.organizationMembership.findMany({
    where: { organizationId, NOT: { grantExpiries: { equals: {} } } },
    select: { id: true, userId: true, grantedCapabilities: true, grantExpiries: true, user: { select: { name: true } } },
  });
  let removed = 0;
  for (const m of members) {
    const until = parseExpiries(m.grantExpiries);
    const lapsed = Object.keys(until).filter((c) => until[c] < today);
    if (!lapsed.length) continue;
    const keepUntil = Object.fromEntries(Object.entries(until).filter(([c]) => !lapsed.includes(c)));
    const rights = m.grantedCapabilities.filter((c) => !lapsed.includes(c));
    const names = lapsed.filter((c) => m.grantedCapabilities.includes(c)).map((c) => LABEL.get(c) ?? c);
    await prisma.$transaction(async (tx) => {
      await tx.organizationMembership.update({ where: { id: m.id }, data: { grantedCapabilities: rights, grantExpiries: keepUntil } });
      await tx.auditLog.create({ data: { organizationId, action: "employee.rights_expired", entityType: "membership", entityId: m.id, metadata: { rights: lapsed } } });
      if (names.length) {
        await notifyUsers(tx, organizationId, [m.userId], { type: "access.rights_expired", title: `Temporary rights ended: ${names.join(", ")}`, link: "/app/profile" });
        await notifyRoles(tx, organizationId, ["OWNER", "ADMIN"], { type: "access.rights_expired", title: `${m.user.name}'s temporary rights ended (${formatDate(dateOnly(until[lapsed[0]]))})`, body: names.join(", ") });
      }
    });
    removed += lapsed.length;
  }
  return { removed };
}
