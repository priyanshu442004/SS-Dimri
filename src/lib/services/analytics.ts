import "server-only";
import { prisma } from "@/lib/db";
import { dateOnly, isoDateInTz } from "@/lib/dates";
import { daysPending } from "@/lib/domain/derived";
import { OPEN_STATUSES } from "@/lib/domain/task-workflow";
import type { AppContext } from "@/lib/session";

// Chart data for dashboards. Every figure is read from source records and
// scoped to the caller's organization (and, for team views, to the team).

const DAY = 86_400_000;

/** The last `n` local (IST) days as ISO dates, oldest first, ending today. */
function lastDays(ctx: AppContext, n: number) {
  const today = dateOnly(isoDateInTz(new Date(), ctx.organization.timezone));
  return Array.from({ length: n }, (_, i) => new Date(today.getTime() - (n - 1 - i) * DAY).toISOString().slice(0, 10));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const name = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();

export const TASK_STATUS_LABELS: Record<string, string> = {
  PENDING: "Not assigned", ASSIGNED: "Assigned", IN_PROGRESS: "In progress", ON_HOLD: "On hold", AWAITING_CLIENT: "Waiting for client",
  AWAITING_TEAM_MEMBER: "Waiting for team", PENDING_REVIEW: "In review", CHANGES_REQUESTED: "Changes requested", COMPLETED: "Completed", CANCELLED: "Cancelled",
};

/** Hours recorded per day (optionally for some employees). */
async function hoursPerDay(ctx: AppContext, days: string[], employeeIds?: string[]) {
  const rows = await prisma.timesheetEntry.groupBy({
    by: ["workDate"],
    where: { organizationId: ctx.organization.id, workDate: { gte: dateOnly(days[0]) }, ...(employeeIds ? { employeeId: { in: employeeIds } } : {}) },
    _sum: { approxMinutes: true },
  });
  const m = new Map(rows.map((r) => [iso(r.workDate), r._sum.approxMinutes ?? 0]));
  return days.map((d) => ({ date: d, values: [m.get(d) ?? 0] }));
}

/** Open tasks per person (optionally limited to some employees). */
async function openTasksPerPerson(ctx: AppContext, employeeIds?: string[]) {
  const people = await prisma.employee.findMany({
    where: { organizationId: ctx.organization.id, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" }, ...(employeeIds ? { id: { in: employeeIds } } : {}) },
    select: {
      id: true, firstName: true, lastName: true,
      _count: { select: { taskAssignments: { where: { removedAt: null, task: { status: { in: OPEN_STATUSES } } } } } },
    },
  });
  return people
    .map((p) => ({ label: name(p), value: p._count.taskAssignments, href: `/app/employees/${p.id}` }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Whole-firm analytics for the owner/administrator dashboard. */
export async function firmAnalytics(ctx: AppContext) {
  const org = ctx.organization.id;
  const d30 = lastDays(ctx, 30);
  const d14 = lastDays(ctx, 14);
  const from30 = new Date(`${d30[0]}T00:00:00+05:30`);
  const [clients, tasks, hours, attendance, created, completed, pending, byClientHours, dues, people] = await Promise.all([
    prisma.client.groupBy({ by: ["status"], where: { organizationId: org }, _count: true }),
    prisma.task.groupBy({ by: ["status"], where: { organizationId: org }, _count: true }),
    hoursPerDay(ctx, d30),
    prisma.attendanceRecord.groupBy({ by: ["attendanceDate", "status"], where: { organizationId: org, attendanceDate: { gte: dateOnly(d14[0]) } }, _count: true }),
    prisma.task.findMany({ where: { organizationId: org, createdAt: { gte: from30 } }, select: { createdAt: true } }),
    prisma.task.findMany({ where: { organizationId: org, completedAt: { gte: from30 } }, select: { completedAt: true } }),
    prisma.pendingItem.findMany({ where: { organizationId: org, status: { not: "CLOSED" } }, select: { requestedOn: true, closedAt: true, pendingWith: true } }),
    prisma.timesheetEntry.groupBy({ by: ["clientId"], where: { organizationId: org, workDate: { gte: dateOnly(d30[0]) }, clientId: { not: null } }, _sum: { approxMinutes: true } }),
    prisma.clientDue.groupBy({ by: ["clientId"], where: { organizationId: org, status: "OPEN" }, _sum: { amount: true } }),
    openTasksPerPerson(ctx),
  ]);

  const clientNames = new Map(
    (await prisma.client.findMany({
      where: { id: { in: [...byClientHours.map((r) => r.clientId!), ...dues.map((d) => d.clientId)] } },
      select: { id: true, tradeName: true },
    })).map((c) => [c.id, c.tradeName]),
  );

  const localDay = (d: Date) => isoDateInTz(d, ctx.organization.timezone);
  const count = (list: (Date | null)[]) => {
    const m = new Map<string, number>();
    for (const d of list) if (d) m.set(localDay(d), (m.get(localDay(d)) ?? 0) + 1);
    return m;
  };
  const cMap = count(created.map((t) => t.createdAt));
  const dMap = count(completed.map((t) => t.completedAt));

  const ATT = ["PRESENT", "HALF_DAY", "LEAVE", "ABSENT"] as const;
  const att = new Map<string, number[]>();
  for (const r of attendance) {
    const k = iso(r.attendanceDate);
    const v = att.get(k) ?? [0, 0, 0, 0];
    v[ATT.indexOf(r.status as (typeof ATT)[number])] += r._count;
    att.set(k, v);
  }

  const ageBuckets = [
    { label: "0–7 days", max: 7 }, { label: "8–15 days", max: 15 }, { label: "16–30 days", max: 30 }, { label: "Over 30 days", max: Infinity },
  ].map((b) => ({ ...b, client: 0, team: 0 }));
  for (const p of pending) {
    const age = daysPending(p, undefined, ctx.organization.pendingDaysBasis);
    const b = ageBuckets.find((x) => age <= x.max)!;
    if (p.pendingWith === "CLIENT") b.client++;
    else b.team++;
  }

  const CLIENT_LABELS: Record<string, string> = { ACTIVE: "Active", PENDING_APPROVAL: "Awaiting approval", ON_HOLD: "On hold", INACTIVE: "Discontinued", REJECTED: "Rejected", DRAFT: "Draft" };
  const CLIENT_ORDER = ["ACTIVE", "PENDING_APPROVAL", "ON_HOLD", "INACTIVE", "REJECTED", "DRAFT"];
  const TASK_ORDER = Object.keys(TASK_STATUS_LABELS);

  return {
    clientsByStatus: CLIENT_ORDER.map((s) => ({ label: CLIENT_LABELS[s], value: clients.find((c) => c.status === s)?._count ?? 0, href: `/app/clients?status=${s}` })).filter((s) => s.value > 0),
    tasksByStatus: TASK_ORDER.map((s) => ({ label: TASK_STATUS_LABELS[s], value: tasks.find((t) => t.status === s)?._count ?? 0 })).filter((t) => t.value > 0),
    hoursPerDay: hours,
    tasksFlow: d30.map((d) => ({ date: d, values: [cMap.get(d) ?? 0, dMap.get(d) ?? 0] })),
    attendance: d14.map((d) => ({ date: d, values: att.get(d) ?? [0, 0, 0, 0] })),
    attendanceSeries: ["Present", "Half day", "Leave", "Absent"],
    pendingAge: ageBuckets,
    hoursByClient: byClientHours
      .map((r) => ({ label: clientNames.get(r.clientId!) ?? "—", value: r._sum.approxMinutes ?? 0, href: `/app/reports/clients/${r.clientId}` }))
      .sort((a, b) => b.value - a.value).slice(0, 8),
    duesByClient: dues
      .map((d) => ({ label: clientNames.get(d.clientId) ?? "—", value: Number(d._sum.amount ?? 0), href: `/app/reports/clients/${d.clientId}?tab=dues` }))
      .sort((a, b) => b.value - a.value).slice(0, 8),
    openTasksPerPerson: people.slice(0, 10),
  };
}

/** Team analytics for managers (whole firm) and seniors (their reportees). */
export async function teamAnalytics(ctx: AppContext, employeeIds?: string[]) {
  const d14 = lastDays(ctx, 14);
  const [hours, people, tasks] = await Promise.all([
    hoursPerDay(ctx, d14, employeeIds),
    openTasksPerPerson(ctx, employeeIds),
    prisma.task.groupBy({
      by: ["status"],
      where: {
        organizationId: ctx.organization.id,
        status: { in: OPEN_STATUSES },
        ...(employeeIds ? { assignments: { some: { employeeId: { in: employeeIds }, removedAt: null } } } : {}),
      },
      _count: true,
    }),
  ]);
  return {
    hoursPerDay: hours,
    openTasksPerPerson: people.slice(0, 12),
    openTasksByStatus: OPEN_STATUSES.map((s) => ({ label: TASK_STATUS_LABELS[s], value: tasks.find((t) => t.status === s)?._count ?? 0 })).filter((t) => t.value > 0),
  };
}

/** Personal analytics for a team member's workspace. */
export async function myAnalytics(ctx: AppContext) {
  if (!ctx.employee) return null;
  const me = ctx.employee.id;
  const d14 = lastDays(ctx, 14);
  const [hours, tasks] = await Promise.all([
    hoursPerDay(ctx, d14, [me]),
    prisma.task.groupBy({
      by: ["status"],
      where: { organizationId: ctx.organization.id, assignments: { some: { employeeId: me, removedAt: null } } },
      _count: true,
    }),
  ]);
  return {
    hoursPerDay: hours,
    tasksByStatus: Object.keys(TASK_STATUS_LABELS).map((s) => ({ label: TASK_STATUS_LABELS[s], value: tasks.find((t) => t.status === s)?._count ?? 0 })).filter((t) => t.value > 0),
  };
}

/** Staff invitations and approvals per day, last 30 days (employees page). */
export async function staffInvitationFlow(ctx: AppContext) {
  const days = lastDays(ctx, 30);
  const since = new Date(`${days[0]}T00:00:00+05:30`);
  const [invited, approved] = await Promise.all([
    prisma.employee.findMany({ where: { organizationId: ctx.organization.id, createdAt: { gte: since } }, select: { createdAt: true } }),
    prisma.employee.findMany({ where: { organizationId: ctx.organization.id, approvalStatus: "APPROVED", approvedAt: { gte: since } }, select: { approvedAt: true } }),
  ]);
  const per = (list: (Date | null)[]) => {
    const m = new Map<string, number>();
    for (const d of list) if (d) m.set(isoDateInTz(d, ctx.organization.timezone), (m.get(isoDateInTz(d, ctx.organization.timezone)) ?? 0) + 1);
    return m;
  };
  const inv = per(invited.map((e) => e.createdAt));
  const app = per(approved.map((e) => e.approvedAt));
  return days.map((d) => ({ date: d, values: [inv.get(d) ?? 0, app.get(d) ?? 0] }));
}
