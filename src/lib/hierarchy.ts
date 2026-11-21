import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { can, type Capability } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";

// Hierarchy-based visibility (tracker S.No. 96, 97, 21 Nov 2026): a team member sees their own data,
// a Team Leader / Manager their own line (everyone reporting to them, directly or through others),
// the owner and administrators everything. Someone given a "see all" right by name (Settings → access)
// still sees the whole firm for that right.

const DEPTH = 4;
const NOBODY = "00000000-0000-0000-0000-000000000000";

/** Sees the whole firm for this right: owners / administrators, or the right granted by name. */
export function seesFirm(ctx: AppContext, capability: Capability): boolean {
  return can(ctx, "org.manage") || (ctx.grantedCapabilities.includes(capability) && can(ctx, capability));
}

/** Employees reporting to `me`, directly or through others (up to 4 levels). */
export function underMe(me: string, depth = DEPTH): Prisma.EmployeeWhereInput {
  return { reportsTo: { some: depth > 1 ? { OR: [{ managerId: me }, { manager: underMe(me, depth - 1) }] } : { managerId: me } } };
}

/** `me` and everyone in my line. */
export function inLine(ctx: AppContext): Prisma.EmployeeWhereInput {
  const me = ctx.employee?.id ?? NOBODY;
  return { OR: [{ id: me }, underMe(me)] };
}

/** Ids of my line (me included). */
export async function lineIds(ctx: AppContext): Promise<string[]> {
  if (!ctx.employee) return [];
  const rows = await prisma.employee.findMany({ where: { organizationId: ctx.organization.id, ...inLine(ctx) }, select: { id: true } });
  return rows.map((r) => r.id);
}
