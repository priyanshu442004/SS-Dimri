import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { FREQUENCY_KEYS, type Frequency } from "@/lib/domain/allocation-schedule";
import { lineIds, seesFirm } from "@/lib/hierarchy";
import { NO_EMPLOYEE } from "@/lib/ids";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";

/**
 * Who sees which allocations (tracker S.No. 110, hierarchy rule of S.No. 97): the owner / administrators
 * (or "see everyone's allocation" given by name) everything; a Team Leader / Manager their own line
 * (everyone reporting to them, all levels); anyone else only their own — where they are the team member,
 * the reviewer (Reports to) or the Team Leader.
 */
export async function allocationScope(ctx: AppContext): Promise<{ where: Prisma.TeamAllocationWhereInput; firm: boolean; line: string[] | null }> {
  if (seesFirm(ctx, "allocations.view_all")) return { where: {}, firm: true, line: null };
  const me = ctx.employee?.id ?? NO_EMPLOYEE;
  const line = can(ctx, "allocations.view_all") ? await lineIds(ctx) : [me];
  const ids = line.length ? line : [me];
  return { where: { OR: [{ employeeId: { in: ids } }, { reportsToEmployeeId: { in: ids } }, { teamLeaderEmployeeId: { in: ids } }] }, firm: false, line: ids };
}

// Filters of the Team allocation page, shared with its Excel export so both show the same rows.

export const ALLOCATION_STATUS_FILTERS = {
  current: "Current & planned",
  ACTIVE: "Active now",
  PLANNED: "Starting later",
  ENDED: "Ended (history)",
  all: "All",
} as const;
export type AllocationStatusFilter = keyof typeof ALLOCATION_STATUS_FILTERS;

export type AllocationFilters = {
  client: string;
  person: string;
  type: string;
  frequency: Frequency | "";
  status: AllocationStatusFilter;
  q: string;
};

const UUID = /^[0-9a-f-]{36}$/i;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseAllocationFilters(sp: Record<string, string | string[] | undefined>): AllocationFilters {
  const status = str(sp.status);
  const frequency = str(sp.freq);
  return {
    client: UUID.test(str(sp.client)) ? str(sp.client) : "",
    person: UUID.test(str(sp.person)) ? str(sp.person) : "",
    type: str(sp.type).slice(0, 60),
    frequency: (FREQUENCY_KEYS as string[]).includes(frequency) ? (frequency as Frequency) : "",
    status: status in ALLOCATION_STATUS_FILTERS ? (status as AllocationStatusFilter) : "current",
    q: str(sp.q).slice(0, 80),
  };
}

export function allocationWhere(organizationId: string, f: AllocationFilters, scope: Prisma.TeamAllocationWhereInput = {}): Prisma.TeamAllocationWhereInput {
  return {
    organizationId,
    // The person's view (see allocationScope) AND the filters.
    AND: [scope, f.person ? { employeeId: f.person } : {}],
    ...(f.client ? { clientId: f.client } : {}),
    ...(f.type ? { resourceType: f.type } : {}),
    ...(f.frequency ? { frequency: f.frequency } : {}),
    status: f.status === "current" ? { in: ["ACTIVE", "PLANNED"] } : f.status === "all" ? { not: "CANCELLED" } : f.status,
    ...(f.q
      ? {
          OR: [
            { client: { tradeName: { contains: f.q, mode: "insensitive" } } },
            { client: { clientCode: { contains: f.q, mode: "insensitive" } } },
            { employee: { firstName: { contains: f.q, mode: "insensitive" } } },
            { employee: { lastName: { contains: f.q, mode: "insensitive" } } },
            { remark: { contains: f.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export const filtersQuery = (f: AllocationFilters, extra: Record<string, string> = {}) => {
  const p = new URLSearchParams({
    ...(f.client && { client: f.client }),
    ...(f.person && { person: f.person }),
    ...(f.type && { type: f.type }),
    ...(f.frequency && { freq: f.frequency }),
    ...(f.status !== "current" && { status: f.status }),
    ...(f.q && { q: f.q }),
    ...extra,
  });
  const s = p.toString();
  return s ? `?${s}` : "";
};
