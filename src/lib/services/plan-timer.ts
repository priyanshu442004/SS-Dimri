import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError } from "@/lib/actions";
import { addDays, dateOnly, hhmmToMinutes, isoDateInTz, minutesOfDayInTz, todayDateOnly, toIsoDate, zonedDateTime } from "@/lib/dates";
import { hhmm } from "@/lib/domain/attendance-policy";
import { TIMER_WORK } from "@/lib/domain/task-time";
import type { AppContext } from "@/lib/session";
import { getPolicy, plansApplyTo } from "./office-rules";
import { loadTaskForCtx, performTaskAction, taskActionsFor } from "./tasks";

// The to-do list (client feedback, 17 Nov 2026): every line of today's morning plan — and every open
// task given to the person, added to the plan by itself — has Start / Stop. Stop writes the timed
// work to the timesheet, so nobody enters it twice. "Done" also sends a task for review.


const OPEN_FOR_TODO = ["ASSIGNED", "IN_PROGRESS", "CHANGES_REQUESTED"] as const;

/** Adds today's open tasks of the person to today's plan (once each). Returns how many were added. */
export async function syncAssignedTasks(ctx: AppContext): Promise<number> {
  if (!ctx.employee || !plansApplyTo(ctx)) return 0;
  const tz = ctx.organization.timezone;
  const day = todayDateOnly(tz);
  const endOfDay = zonedDateTime(toIsoDate(addDays(day, 1)), 0, tz);
  const me = ctx.employee.id;
  const tasks = await prisma.task.findMany({
    where: {
      organizationId: ctx.organization.id,
      status: { in: [...OPEN_FOR_TODO] },
      OR: [{ assignments: { some: { employeeId: me, removedAt: null } } }, { makerEmployeeId: me }],
      AND: [{ OR: [{ startAt: null }, { startAt: { lt: endOfDay } }] }],
    },
    orderBy: [{ isAsap: "desc" }, { dueAt: { sort: "asc", nulls: "last" } }],
    take: 40,
    select: { id: true, title: true, clientId: true, dueAt: true, client: { select: { tradeName: true } } },
  });
  if (!tasks.length) return 0;
  return prisma.$transaction(async (tx) => {
    const plan = await tx.dailyPlan.upsert({
      where: { employeeId_planDate: { employeeId: me, planDate: day } },
      update: {},
      create: { organizationId: ctx.organization.id, employeeId: me, planDate: day },
      include: { items: { select: { taskId: true, sortOrder: true } } },
    });
    if (plan.eodSubmittedAt) return 0;
    const have = new Set(plan.items.map((i) => i.taskId).filter(Boolean));
    const fresh = tasks.filter((t) => !have.has(t.id));
    let order = Math.max(0, ...plan.items.map((i) => i.sortOrder)) + 1;
    for (const t of fresh) {
      await tx.dailyPlanItem.create({
        data: {
          planId: plan.id, taskId: t.id, clientId: t.clientId, clientName: t.client?.tradeName ?? null, task: t.title,
          expectedBy: t.dueAt ? dateOnly(isoDateInTz(t.dueAt, tz)) : null,
          origin: plan.planSubmittedAt ? "NEW" : "PLANNED", sortOrder: order++,
        },
      });
    }
    return fresh.length;
  });
}

type TimerItem = { id: string; task: string; clientId: string | null; clientName: string | null; taskId: string | null; startedAt: Date | null };

/** Writes one timed stretch to the timesheet. A timer left running overnight stops at that day's office end. */
async function logStretch(tx: Prisma.TransactionClient, ctx: AppContext, item: TimerItem, from: Date, to: Date, officeEnd: string, done: boolean) {
  const tz = ctx.organization.timezone;
  const iso = isoDateInTz(from, tz);
  const sameDay = isoDateInTz(to, tz) === iso;
  const end = sameDay ? to : new Date(Math.max(from.getTime(), zonedDateTime(iso, hhmmToMinutes(officeEnd), tz).getTime()));
  const minutes = Math.round((end.getTime() - from.getTime()) / 60_000);
  if (minutes < 1) return 0;
  const day = dateOnly(iso);
  const me = ctx.employee!.id;
  const task = item.taskId ? await tx.task.findUnique({ where: { id: item.taskId }, select: { clientServiceId: true } }) : null;
  const allocation = item.clientId
    ? await tx.teamAllocation.findFirst({ where: { clientId: item.clientId, employeeId: me, status: { in: ["ACTIVE", "PLANNED", "ENDED"] }, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] }, select: { id: true, resourceType: true } })
    : null;
  const serialNumber = (await tx.timesheetEntry.count({ where: { employeeId: me, workDate: day } })) + 1;
  await tx.timesheetEntry.create({
    data: {
      organizationId: ctx.organization.id, employeeId: me, serialNumber, workDate: day,
      clientId: item.clientId, clientNameText: item.clientName ?? "Office / Other", clientServiceId: task?.clientServiceId,
      taskId: item.taskId, teamAllocationId: allocation?.id, resourceType: allocation?.resourceType,
      typeOfWork: TIMER_WORK, startTime: hhmm(minutesOfDayInTz(from, tz)), endTime: hhmm(minutesOfDayInTz(end, tz)), approxMinutes: minutes,
      workDetails: `${item.task} — timed from the to-do list`, workStatus: done ? "COMPLETED" : "IN_PROGRESS",
    },
  });
  return minutes;
}

async function myItem(ctx: AppContext, itemId: string) {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  const item = await prisma.dailyPlanItem.findFirst({
    where: { id: itemId, plan: { employeeId: ctx.employee.id, organizationId: ctx.organization.id } },
    include: { plan: { select: { planDate: true, eodSubmittedAt: true } } },
  });
  if (!item) throw new BusinessRuleError("This to-do line was not found. Refresh the page.");
  return item;
}

/** Stops the timer on a line and writes the time to the timesheet. Returns the minutes written. */
async function stopRunning(ctx: AppContext, item: TimerItem, done: boolean) {
  if (!item.startedAt) return 0;
  const { row } = await getPolicy(ctx.organization.id);
  return prisma.$transaction(async (tx) => {
    const claim = await tx.dailyPlanItem.updateMany({ where: { id: item.id, startedAt: item.startedAt }, data: { startedAt: null } });
    if (claim.count !== 1) return 0; // stopped in another tab
    const minutes = await logStretch(tx, ctx, item, item.startedAt!, new Date(), row.officeEnd, done);
    if (minutes) await tx.dailyPlanItem.update({ where: { id: item.id }, data: { workedMinutes: { increment: minutes } } });
    return minutes;
  });
}

export async function startTodo(ctx: AppContext, itemId: string): Promise<string> {
  const item = await myItem(ctx, itemId);
  const today = todayDateOnly(ctx.organization.timezone);
  if (item.plan.planDate.getTime() !== today.getTime()) throw new BusinessRuleError("Only today's to-do lines can be started.");
  if (item.plan.eodSubmittedAt) throw new BusinessRuleError("Today's EOD report is already filed.");
  if (item.status === "DONE") throw new BusinessRuleError("This line is already marked Done.");
  if (item.startedAt) return "Already running.";
  // One timer at a time: whatever else is running stops first (its time goes to the timesheet).
  const running = await prisma.dailyPlanItem.findMany({ where: { startedAt: { not: null }, plan: { employeeId: ctx.employee!.id }, id: { not: item.id } } });
  let paused = "";
  for (const r of running) {
    const m = await stopRunning(ctx, r, false);
    paused = `"${r.task.slice(0, 40)}" paused${m ? ` (${m} min logged)` : ""}. `;
  }
  // A task line also starts the task itself (status In progress).
  if (item.taskId) {
    const task = await loadTaskForCtx(ctx, item.taskId);
    if (task && (await taskActionsFor(ctx, task)).includes("start")) await performTaskAction(ctx, task.id, "start");
  }
  await prisma.dailyPlanItem.updateMany({ where: { id: item.id, startedAt: null }, data: { startedAt: new Date() } });
  return `${paused}Timer started. Stop it when you finish or take a break; the time goes to your timesheet.`;
}

export async function stopTodo(ctx: AppContext, itemId: string, done: boolean): Promise<string> {
  const item = await myItem(ctx, itemId);
  const minutes = await stopRunning(ctx, item, done);
  let extra = "";
  if (done) {
    await prisma.dailyPlanItem.update({ where: { id: item.id }, data: { status: "DONE", reason: null } });
    // Finished work on a task goes to its checker, with the time already in the timesheet.
    if (item.taskId) {
      const task = await loadTaskForCtx(ctx, item.taskId);
      if (task && (await taskActionsFor(ctx, task)).includes("submit")) {
        await performTaskAction(ctx, task.id, "submit");
        extra = " The task is sent for review.";
      }
    }
  }
  const logged = minutes ? `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} h ` : ""}${minutes % 60} min added to your timesheet.` : "";
  return `${done ? "Marked Done." : "Timer stopped."} ${logged}${extra}`.trim();
}
