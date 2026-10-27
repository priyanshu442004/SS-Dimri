import "server-only";
import { NO_EMPLOYEE } from "@/lib/ids";
import { prisma } from "@/lib/db";
import { addDays, dateOnly, isoDateInTz } from "@/lib/dates";
import { OPEN_STATUSES } from "@/lib/domain/task-workflow";
import type { AppContext } from "@/lib/session";

export async function orgOverview(ctx: AppContext) {
  const org = ctx.organization.id;
  const today = dateOnly(isoDateInTz(new Date(), ctx.organization.timezone));
  const now = new Date();
  const [
    clientsByStatus, onboardingPending, tasksOpen, tasksOverdue, tasksReview, employees, presentToday, leaveToday,
    pendingByWith, duesOpen, timesheetToday, recent, activeAllocations,
  ] = await Promise.all([
    prisma.client.groupBy({ by: ["status"], where: { organizationId: org }, _count: true }),
    prisma.employee.count({ where: { organizationId: org, approvalStatus: { in: ["PENDING", "UNDER_REVIEW"] }, onboardingSubmittedAt: { not: null } } }),
    prisma.task.count({ where: { organizationId: org, status: { in: OPEN_STATUSES } } }),
    prisma.task.count({ where: { organizationId: org, status: { in: OPEN_STATUSES }, dueAt: { lt: now } } }),
    prisma.task.count({ where: { organizationId: org, status: "PENDING_REVIEW" } }),
    prisma.employee.count({ where: { organizationId: org, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } } }),
    prisma.attendanceRecord.count({ where: { organizationId: org, attendanceDate: today, status: { in: ["PRESENT", "HALF_DAY"] } } }),
    prisma.leaveRequest.count({ where: { organizationId: org, status: "APPROVED", fromDate: { lte: today }, toDate: { gte: today } } }),
    prisma.pendingItem.groupBy({ by: ["pendingWith"], where: { organizationId: org, status: { not: "CLOSED" } }, _count: true }),
    prisma.clientDue.aggregate({ where: { organizationId: org, status: "OPEN" }, _sum: { amount: true }, _count: true }),
    prisma.timesheetEntry.aggregate({ where: { organizationId: org, workDate: today }, _sum: { approxMinutes: true }, _count: true }),
    prisma.auditLog.findMany({ where: { organizationId: org }, orderBy: { createdAt: "desc" }, take: 8, include: { actor: { select: { name: true } } } }),
    prisma.teamAllocation.count({ where: { organizationId: org, status: "ACTIVE" } }),
  ]);
  const clients = Object.fromEntries(clientsByStatus.map((c) => [c.status, c._count]));
  return {
    clients,
    onboardingPending,
    tasksOpen,
    tasksOverdue,
    tasksReview,
    employees,
    presentToday,
    leaveToday,
    pendingClient: pendingByWith.find((p) => p.pendingWith === "CLIENT")?._count ?? 0,
    pendingTeam: pendingByWith.find((p) => p.pendingWith === "TEAM_MEMBER")?._count ?? 0,
    duesAmount: Number(duesOpen._sum.amount ?? 0),
    duesCount: duesOpen._count,
    timesheetMinutesToday: timesheetToday._sum.approxMinutes ?? 0,
    timesheetEntriesToday: timesheetToday._count,
    recent,
    activeAllocations,
  };
}

/** Workload and review queue for managers and seniors. `teamIds` = people who report to the lead (empty = whole org). */
export async function leadOverview(ctx: AppContext, scope: "org" | "team") {
  const org = ctx.organization.id;
  const me = ctx.employee?.id ?? NO_EMPLOYEE;
  const now = new Date();
  const week = addDays(now, 7);
  const reportees = await prisma.employeeReportingRelationship.findMany({ where: { managerId: me }, select: { employeeId: true } });
  const teamIds = reportees.map((r) => r.employeeId);
  const teamFilter = scope === "team" ? { id: { in: teamIds } } : {};
  const [reviewQueue, workload, deadlines, dayReports, timesheetToReview, pendingByWith] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId: org, status: "PENDING_REVIEW", OR: [{ checkerEmployeeId: me }, { checkerEmployeeId: null }], makerEmployeeId: { not: me } },
      orderBy: { dueAt: "asc" },
      take: 10,
      select: { id: true, title: true, dueAt: true, client: { select: { tradeName: true } }, maker: { select: { firstName: true } } },
    }),
    prisma.employee.findMany({
      where: { organizationId: org, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" }, ...teamFilter },
      orderBy: { firstName: "asc" },
      select: {
        id: true, firstName: true, lastName: true,
        _count: { select: { taskAssignments: { where: { removedAt: null, task: { status: { in: OPEN_STATUSES } } } }, teamAllocations: { where: { status: "ACTIVE" } } } },
      },
    }),
    prisma.task.findMany({
      where: {
        organizationId: org,
        status: { in: OPEN_STATUSES },
        dueAt: { lte: week },
        ...(scope === "team" ? { assignments: { some: { employeeId: { in: [...teamIds, me] }, removedAt: null } } } : {}),
      },
      orderBy: { dueAt: "asc" },
      take: 10,
      select: { id: true, title: true, dueAt: true, status: true, isAsap: true, client: { select: { tradeName: true } } },
    }),
    prisma.dayReport.findMany({
      where: { organizationId: org, recipients: { some: { recipientEmployeeId: me, acknowledgedAt: null } }, status: "SUBMITTED" },
      orderBy: { reportDate: "desc" },
      take: 8,
      select: { id: true, reportDate: true, reportingEmployee: { select: { firstName: true } } },
    }),
    prisma.timesheetEntry.count({ where: { organizationId: org, status: "SUBMITTED", ...(scope === "team" ? { employeeId: { in: teamIds } } : {}) } }),
    prisma.pendingItem.groupBy({
      by: ["pendingWith"],
      where: { organizationId: org, status: { not: "CLOSED" }, ...(scope === "team" ? { OR: [{ pendingWithEmployeeId: { in: [...teamIds, me] } }, { raisedByEmployeeId: { in: [...teamIds, me] } }] } : {}) },
      _count: true,
    }),
  ]);
  return {
    teamSize: scope === "team" ? teamIds.length : workload.length,
    reviewQueue,
    workload,
    deadlines,
    dayReports,
    timesheetToReview,
    pendingClient: pendingByWith.find((p) => p.pendingWith === "CLIENT")?._count ?? 0,
    pendingTeam: pendingByWith.find((p) => p.pendingWith === "TEAM_MEMBER")?._count ?? 0,
  };
}

export async function myOverview(ctx: AppContext) {
  const me = ctx.employee?.id ?? NO_EMPLOYEE;
  const tz = ctx.organization.timezone;
  const today = dateOnly(isoDateInTz(new Date(), tz));
  const [tasks, attendance, timesheet, dayReport, pending, allocations] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId: ctx.organization.id, status: { in: OPEN_STATUSES }, assignments: { some: { employeeId: me, removedAt: null } } },
      orderBy: [{ isAsap: "desc" }, { dueAt: { sort: "asc", nulls: "last" } }],
      take: 12,
      select: { id: true, title: true, status: true, dueAt: true, isAsap: true, priority: true, client: { select: { tradeName: true } } },
    }),
    prisma.attendanceRecord.findFirst({ where: { employeeId: me, attendanceDate: today }, orderBy: { createdAt: "desc" } }),
    prisma.timesheetEntry.aggregate({ where: { employeeId: me, workDate: today }, _sum: { approxMinutes: true }, _count: true }),
    prisma.dayReport.findFirst({ where: { reportingEmployeeId: me, reportDate: today }, select: { status: true } }),
    prisma.pendingItem.count({ where: { status: { not: "CLOSED" }, OR: [{ pendingWithEmployeeId: me }, { raisedByEmployeeId: me }] } }),
    prisma.teamAllocation.findMany({
      where: { employeeId: me, status: "ACTIVE" },
      select: { id: true, client: { select: { id: true, tradeName: true } }, startDate: true, endDate: true },
    }),
  ]);
  return { tasks, attendance, timesheetMinutes: timesheet._sum.approxMinutes ?? 0, timesheetEntries: timesheet._count, dayReport, pending, allocations };
}
