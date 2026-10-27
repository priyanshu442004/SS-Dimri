import "server-only";
import { prisma } from "@/lib/db";
import { PUBLIC_SERVICES } from "@/lib/firm";
import { getPublicOrganization } from "./public-org";

export type PublicServiceView = {
  slug: string;
  code: string | null;
  name: string;
  department: string;
  description: string | null;
  frequency: string | null;
  deliverable: string | null;
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * Services shown on the public website: the firm's services that are confirmed
 * ("approved for publication") and active. Before the firm is set up in the
 * database, the confirmed services from the master data pack are used.
 * Fees are never included.
 */
export async function getPublicServices(): Promise<PublicServiceView[]> {
  const org = await getPublicOrganization();
  if (!org) {
    return PUBLIC_SERVICES.map((s) => ({
      slug: slugify(s.code), code: s.code, name: s.name, department: s.department, description: s.description, frequency: s.frequency, deliverable: s.deliverable,
    }));
  }
  const rows = await prisma.service.findMany({
    where: { organizationId: org.id, isActive: true, isConfirmed: true },
    orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
    select: { serviceCode: true, name: true, description: true, frequency: true, deliverable: true, department: { select: { name: true } } },
  });
  return rows.map((s) => ({
    slug: slugify(s.serviceCode ?? s.name),
    code: s.serviceCode,
    name: s.name,
    department: s.department?.name ?? "Other services",
    description: s.description,
    frequency: s.frequency,
    deliverable: s.deliverable,
  }));
}
