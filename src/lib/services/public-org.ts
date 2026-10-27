import "server-only";
import { prisma } from "@/lib/db";

/**
 * The firm that public visitors register with and whose services the public
 * website lists. Set PUBLIC_ORGANIZATION_ID; when unset and exactly one active
 * organization exists, that one is used. Returns null when it cannot be decided
 * (public registration is then disabled rather than guessing).
 */
export async function getPublicOrganization() {
  const configured = process.env.PUBLIC_ORGANIZATION_ID;
  if (configured) {
    return prisma.organization.findFirst({ where: { id: configured, status: "ACTIVE" }, select: { id: true, tradeName: true } });
  }
  const orgs = await prisma.organization.findMany({ where: { status: "ACTIVE" }, select: { id: true, tradeName: true }, take: 2 });
  return orgs.length === 1 ? orgs[0] : null;
}
