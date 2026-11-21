import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { dateOnly } from "@/lib/dates";
import { capacityFromPolicy, describeHours, spanHours } from "@/lib/domain/allocation";
import { ALLOCATION_ROLES } from "@/lib/domain/allocation-import";
import { describeSchedule } from "@/lib/domain/allocation-schedule";
import { getPolicy } from "./office-rules";

// Allocation reports (tracker S.No. 80 and 81, 21 Nov 2026): which clients are allocated and which are
// not (client-wise), and which clients each person has (team-wise) with role, days and hours. "Allocated"
// = an active or planned allocation that has not ended by today. Shared by the page and its Excel export.

export type ReportFilters = { tab: "clients" | "team"; allocated: "" | "yes" | "no"; status: string; q: string; member: string };
const UUID = /^[0-9a-f-]{36}$/i;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseReportFilters(sp: Record<string, unknown>): ReportFilters {
  const allocated = str(sp.allocated);
  const status = str(sp.status);
  return {
    tab: sp.tab === "team" ? "team" : "clients",
    allocated: allocated === "yes" || allocated === "no" ? allocated : "",
    status: ["ACTIVE", "ON_HOLD", "PENDING_APPROVAL", "INACTIVE", "all"].includes(status) ? status : "ACTIVE",
    q: str(sp.q).slice(0, 80),
    member: UUID.test(str(sp.member)) ? str(sp.member) : "",
  };
}

export function reportQuery(f: ReportFilters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ tab: f.tab, ...(f.allocated && { allocated: f.allocated }), ...(f.status !== "ACTIVE" && { status: f.status }), ...(f.q && { q: f.q }), ...(f.member && { member: f.member }), ...extra });
  return `?${p}`;
}

const person = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();

function liveAllocation(today: Date): Prisma.TeamAllocationWhereInput {
  return { status: { in: ["ACTIVE", "PLANNED"] }, OR: [{ endDate: null }, { endDate: { gte: today } }] };
}

/** Client-wise: every client with its team (or none). */
export async function clientAllocationReport(organizationId: string, f: ReportFilters, todayIso: string) {
  const today = dateOnly(todayIso);
  const live = liveAllocation(today);
  const clients = await prisma.client.findMany({
    where: {
      organizationId,
      ...(f.status === "all" ? {} : { status: f.status as Prisma.EnumClientStatusFilter["equals"] }),
      ...(f.q ? { OR: [{ tradeName: { contains: f.q, mode: "insensitive" } }, { clientCode: { contains: f.q, mode: "insensitive" } }] } : {}),
      ...(f.allocated === "yes" ? { teamAllocations: { some: live } } : f.allocated === "no" ? { teamAllocations: { none: live } } : {}),
    },
    orderBy: { tradeName: "asc" },
    take: 5000,
    select: {
      id: true, tradeName: true, clientCode: true, status: true, departments: true,
      services: { where: { status: "ACTIVE" }, select: { service: { select: { name: true } } } },
      teamAllocations: { where: live, orderBy: { startDate: "asc" }, select: { seniorityLevel: true, startDate: true, employee: { select: { firstName: true, lastName: true, designation: { select: { name: true } } } } } },
    },
  });
  const rows = clients.map((c) => ({
    id: c.id, client: c.tradeName, code: c.clientCode ?? "", status: c.status,
    services: c.services.map((s) => s.service.name).join(", "),
    departments: c.departments.join(", "),
    team: c.teamAllocations.map((a) => `${person(a.employee)}${a.seniorityLevel ? ` (${ALLOCATION_ROLES[a.seniorityLevel]})` : ""}`),
    people: new Set(c.teamAllocations.map((a) => person(a.employee))).size,
  }));
  const [allocatedCount, total] = await Promise.all([
    prisma.client.count({ where: { organizationId, ...(f.status === "all" ? {} : { status: f.status as Prisma.EnumClientStatusFilter["equals"] }), teamAllocations: { some: live } } }),
    prisma.client.count({ where: { organizationId, ...(f.status === "all" ? {} : { status: f.status as Prisma.EnumClientStatusFilter["equals"] }) } }),
  ]);
  return { rows, allocatedCount, notAllocated: total - allocatedCount, total };
}

/** Team-wise: each person's clients with role, days and hours. */
export async function teamAllocationReport(organizationId: string, f: ReportFilters, todayIso: string) {
  const today = dateOnly(todayIso);
  const cap = capacityFromPolicy((await getPolicy(organizationId)).row);
  const allocations = await prisma.teamAllocation.findMany({
    where: {
      organizationId, ...liveAllocation(today),
      ...(f.member ? { employeeId: f.member } : {}),
      ...(f.q ? { client: { tradeName: { contains: f.q, mode: "insensitive" } } } : {}),
    },
    orderBy: [{ employee: { firstName: "asc" } }, { client: { tradeName: "asc" } }],
    take: 10000,
    select: {
      id: true, employeeId: true, seniorityLevel: true, resourceType: true, startDate: true, endDate: true, status: true,
      weekDays: true, frequency: true, visitDays: true, firstHalfHours: true, secondHalfHours: true,
      client: { select: { tradeName: true, clientCode: true } },
      employee: { select: { firstName: true, lastName: true, permanentEmployeeCode: true, temporaryEmployeeCode: true, designation: { select: { name: true } } } },
      reportsTo: { select: { firstName: true, lastName: true } },
    },
  });
  const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));
  const rows = allocations.map((a) => {
    const span = { firstHalfHours: num(a.firstHalfHours), secondHalfHours: num(a.secondHalfHours) };
    const h = spanHours(span, cap);
    return {
      id: a.id, employeeId: a.employeeId, member: person(a.employee), code: a.employee.permanentEmployeeCode ?? a.employee.temporaryEmployeeCode ?? "",
      designation: a.employee.designation?.name ?? "", client: a.client.tradeName, clientCode: a.client.clientCode ?? "",
      role: a.seniorityLevel ? ALLOCATION_ROLES[a.seniorityLevel] : "", resourceType: a.resourceType ?? "",
      days: describeSchedule(a), hours: describeHours(span, cap), hoursPerDay: Math.round((h.first + h.second) * 100) / 100,
      from: a.startDate, to: a.endDate, planned: a.status === "PLANNED", reportsTo: a.reportsTo ? person(a.reportsTo) : "",
    };
  });
  const people = await prisma.employee.findMany({
    where: { organizationId, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } },
    orderBy: { firstName: "asc" },
    select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } } },
  });
  const byMember = new Map<string, number>();
  for (const r of rows) byMember.set(r.employeeId, (byMember.get(r.employeeId) ?? 0) + 1);
  const withoutClients = f.member || f.q ? [] : people.filter((p) => !byMember.has(p.id)).map((p) => ({ member: person(p), designation: p.designation?.name ?? "" }));
  return { rows, members: byMember.size, people: people.map((p) => ({ value: p.id, label: person(p) })), withoutClients };
}
