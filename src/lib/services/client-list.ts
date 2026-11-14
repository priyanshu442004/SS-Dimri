import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { AppContext } from "@/lib/session";
import { clientScope } from "./clients";

// Filters and sorting of the Clients list, shared with its Excel export so both show the same clients.

export const CLIENT_STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "PENDING_APPROVAL", label: "Pending approval" },
  { key: "ACTIVE", label: "Active" },
  { key: "ON_HOLD", label: "On hold" },
  { key: "INACTIVE", label: "Discontinued" },
  { key: "REJECTED", label: "Rejected" },
] as const;

export const CLIENT_SORTS = { name: "Name A–Z", name_desc: "Name Z–A", code: "Client code", newest: "Newest first", oldest: "Oldest first" } as const;
export type ClientSort = keyof typeof CLIENT_SORTS;

export type ClientFilters = {
  status: string;
  q: string;
  service: string;
  department: string;
  constitution: string;
  state: string;
  /** An employee id, or "none" for clients with no team allocated. */
  team: string;
  sort: ClientSort;
};

const UUID = /^[0-9a-f-]{36}$/i;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseClientFilters(sp: Record<string, string | string[] | undefined>): ClientFilters {
  const status = str(sp.status);
  const sort = str(sp.sort);
  const team = str(sp.team);
  return {
    status: CLIENT_STATUS_TABS.some((t) => t.key === status) ? status : "all",
    q: str(sp.q).slice(0, 80),
    service: UUID.test(str(sp.service)) ? str(sp.service) : "",
    department: str(sp.dept).slice(0, 60),
    constitution: UUID.test(str(sp.con)) ? str(sp.con) : "",
    state: str(sp.state).slice(0, 60),
    team: team === "none" || UUID.test(team) ? team : "",
    sort: sort in CLIENT_SORTS ? (sort as ClientSort) : "name",
  };
}

export function clientListWhere(ctx: AppContext, f: ClientFilters): Prisma.ClientWhereInput {
  const q = f.q;
  return {
    AND: [
      clientScope(ctx),
      f.status === "all" ? {} : { status: f.status as Prisma.EnumClientStatusFilter["equals"] },
      q
        ? {
            OR: [
              { tradeName: { contains: q, mode: "insensitive" } },
              { legalName: { contains: q, mode: "insensitive" } },
              { clientCode: { contains: q, mode: "insensitive" } },
              { pan: { contains: q.toUpperCase() } },
              { tan: { contains: q.toUpperCase() } },
              { itFileNo: { contains: q, mode: "insensitive" } },
              { gstRegistrations: { some: { gstin: { contains: q.toUpperCase() } } } },
              { contacts: { some: { OR: [{ name: { contains: q, mode: "insensitive" } }, { mobile: { contains: q } }, { email: { contains: q, mode: "insensitive" } }] } } },
            ],
          }
        : {},
      f.service ? { services: { some: { serviceId: f.service, status: "ACTIVE" } } } : {},
      f.department ? { departments: { has: f.department } } : {},
      f.constitution ? { constitutionId: f.constitution } : {},
      f.state ? { state: { equals: f.state, mode: "insensitive" } } : {},
      f.team === "none"
        ? { teamAllocations: { none: { status: { in: ["ACTIVE", "PLANNED"] } } } }
        : f.team
          ? { teamAllocations: { some: { employeeId: f.team, status: { in: ["ACTIVE", "PLANNED"] } } } }
          : {},
    ],
  };
}

export function clientListOrder(sort: ClientSort): Prisma.ClientOrderByWithRelationInput[] {
  switch (sort) {
    case "newest": return [{ createdAt: "desc" }];
    case "oldest": return [{ createdAt: "asc" }];
    case "code": return [{ clientCode: { sort: "asc", nulls: "last" } }, { tradeName: "asc" }];
    case "name_desc": return [{ tradeName: "desc" }];
    default: return [{ tradeName: "asc" }];
  }
}

export function clientFiltersQuery(f: ClientFilters, extra: Record<string, string | number> = {}) {
  const p = new URLSearchParams({
    ...(f.status !== "all" && { status: f.status }),
    ...(f.q && { q: f.q }),
    ...(f.service && { service: f.service }),
    ...(f.department && { dept: f.department }),
    ...(f.constitution && { con: f.constitution }),
    ...(f.state && { state: f.state }),
    ...(f.team && { team: f.team }),
    ...(f.sort !== "name" && { sort: f.sort }),
  });
  for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
