import "server-only";
import { prisma } from "@/lib/db";

/**
 * The firm whose services the public website lists, only when
 * PUBLIC_ORGANIZATION_ID names one. The portal hosts many firms, so no firm is
 * picked implicitly; without it the website shows the standard service list.
 */
export async function getPublicOrganization() {
  const configured = process.env.PUBLIC_ORGANIZATION_ID;
  if (!configured) return null;
  return prisma.organization.findFirst({ where: { id: configured, status: "ACTIVE" }, select: { id: true, tradeName: true } });
}
