import "server-only";
import { prisma } from "@/lib/db";

/**
 * Firm (owner) registration is only open until the practice has been set up.
 * Afterwards it is closed unless ALLOW_FIRM_REGISTRATION=true, so the public
 * cannot create additional tenant organizations.
 */
export async function isFirmRegistrationOpen() {
  if (process.env.ALLOW_FIRM_REGISTRATION === "true") return true;
  return (await prisma.organization.count()) === 0;
}
