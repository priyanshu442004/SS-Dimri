import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zOptionalText, zRequiredText } from "@/lib/actions";
import { can } from "@/lib/permissions";
import { availableActions, canPerform, nextStatus, OPEN_STATUSES, type TaskAction, type TaskStatus } from "@/lib/domain/task-workflow";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { hasFile, storeUpload } from "./files";
import { notifyClientUsers, notifyEmployees, notifyUsers } from "./notifications";

/** Tasks the caller may see. Team members see only tasks assigned to them (or where they are maker/checker). */
export function taskScope(ctx: AppContext): Prisma.TaskWhereInput {
  if (can(ctx.role, "tasks.view_all")) return { organizationId: ctx.organization.id };
  const me = ctx.employee?.id ?? "00000000-0000-0000-0000-000000000000";
  return {
    organizationId: ctx.organization.id,
    OR: [{ assignments: { some: { employeeId: me, removedAt: null } } }, { makerEmployeeId: me }, { checkerEmployeeId: me }],
  };
}

const zDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter date and time");
/** <input type="datetime-local"> value interpreted in the firm's timezone (IST, fixed +05:30). */
export function localDateTimeToUtc(v: string) {
  return new Date(`${v}:00+05:30`);
}

export const taskSchema = z.object({
  title: zRequiredText(200),
  description: zOptionalText(5000),
  clientId: z.uuid().optional(),
  clientServiceId: z.uuid().optional(),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]),
  isAsap: zCheckbox.optional(),
  startAt: zDateTime.optional(),
  dueAt: zDateTime.optional(),
  "assigneeIds[]": z.array(z.uuid()).default([]),
  makerEmployeeId: z.uuid().optional(),
  checkerEmployeeId: z.uuid().optional(),
  writingForRemark: zOptionalText(2000),
  writingFromRemark: zOptionalText(2000),
  remindAt: zDateTime.optional(),
  clientVisible: zCheckbox.optional(),
});

async function assertEmployees(organizationId: string, ids: (string | undefined)[]) {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  const n = await prisma.employee.count({ where: { id: { in: list }, organizationId, approvalStatus: "APPROVED" } });
  if (n !== list.length) throw new BusinessRuleError("Select approved employees of your organization.");
}

export async function createTask(ctx: AppContext, v: z.infer<typeof taskSchema>, fd: FormData) {
  if (v.makerEmployeeId && v.makerEmployeeId === v.checkerEmployeeId) throw new BusinessRuleError("Maker and checker must be different people.");
  await assertEmployees(ctx.organization.id, [...v["assigneeIds[]"], v.makerEmployeeId, v.checkerEmployeeId]);
  if (v.clientId && !(await prisma.client.findFirst({ where: { id: v.clientId, organizationId: ctx.organization.id }, select: { id: true } }))) {
    throw new BusinessRuleError("Client not found.");
  }
  const startAt = v.startAt ? localDateTimeToUtc(v.startAt) : null;
  const dueAt = v.dueAt ? localDateTimeToUtc(v.dueAt) : null;
  // Start cannot be in the past; the 2-minute allowance covers the minute rounding of the input and the round trip.
  if (startAt && startAt.getTime() < Date.now() - 2 * 60_000) throw new BusinessRuleError("The start date and time cannot be earlier than now.");
  if (startAt && dueAt && dueAt < startAt) throw new BusinessRuleError("The due date must be after the start date.");
  const assignees = v["assigneeIds[]"];
  const maker = v.makerEmployeeId ?? (assignees.length === 1 ? assignees[0] : undefined);

  const task = await prisma.$transaction(async (tx) => {
    const t = await tx.task.create({
      data: {
        organizationId: ctx.organization.id,
        title: v.title,
        description: v.description,
        clientId: v.clientId,
        clientServiceId: v.clientServiceId,
        priority: v.priority,
        isAsap: !!v.isAsap,
        clientVisible: !!v.clientVisible && !!v.clientId,
        startAt,
        dueAt,
        status: assignees.length ? "ASSIGNED" : "PENDING",
        makerEmployeeId: maker,
        checkerEmployeeId: v.checkerEmployeeId,
        writingForRemark: v.writingForRemark,
        writingFromEmployeeId: ctx.employee?.id,
        writingFromRemark: v.writingFromRemark,
        createdById: ctx.user.id,
        assignments: { create: assignees.map((employeeId) => ({ employeeId, assignedById: ctx.user.id })) },
        activities: { create: { actorUserId: ctx.user.id, type: "CREATED", toValue: assignees.length ? "ASSIGNED" : "PENDING" } },
        reminders: v.remindAt ? { create: { remindAt: localDateTimeToUtc(v.remindAt), createdById: ctx.user.id } } : undefined,
      },
    });
    await notifyEmployees(tx, ctx.organization.id, assignees, {
      type: "task.assigned",
      title: `New task: ${t.title}`,
      body: dueAt ? `Due ${dueAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : undefined,
      link: `/app/tasks/${t.id}`,
    });
    return t;
  });

  for (const f of fd.getAll("attachments")) {
    if (hasFile(f)) await addAttachment(ctx, task.id, f);
  }
  return task;
}

export async function loadTaskForCtx(ctx: AppContext, taskId: string) {
  return prisma.task.findFirst({
    where: { AND: [taskScope(ctx), { id: taskId }] },
    include: { assignments: { where: { removedAt: null }, select: { employeeId: true } } },
  });
}

function actorFor(ctx: AppContext, task: { assignments: { employeeId: string }[] }) {
  return { role: ctx.role, employeeId: ctx.employee?.id ?? null, isAssignee: task.assignments.some((a) => a.employeeId === ctx.employee?.id) };
}

export async function taskActionsFor(ctx: AppContext, task: NonNullable<Awaited<ReturnType<typeof loadTaskForCtx>>>) {
  return availableActions(task.status as TaskStatus, actorFor(ctx, task), task);
}

export async function performTaskAction(ctx: AppContext, taskId: string, action: TaskAction, comment?: string) {
  const task = await loadTaskForCtx(ctx, taskId);
  if (!task) throw new BusinessRuleError("Task not found.");
  const to = nextStatus(task.status as TaskStatus, action);
  if (!to) throw new BusinessRuleError("That change is not possible from the task's current status.");
  if (!canPerform(actorFor(ctx, task), task, action)) throw new BusinessRuleError("You are not allowed to do this on this task.");
  if (action === "request_changes" && !comment) throw new BusinessRuleError("Explain what needs to change.");

  await prisma.$transaction(async (tx) => {
    const data: Prisma.TaskUpdateManyMutationInput = { status: to };
    const now = new Date();
    if (action === "start") Object.assign(data, { makerStatus: "IN_PROGRESS", makerUpdatedAt: now });
    if (action === "submit") Object.assign(data, { makerStatus: "SUBMITTED", makerUpdatedAt: now, checkerStatus: "IN_REVIEW", checkerUpdatedAt: now });
    if (action === "approve") Object.assign(data, { checkerStatus: "APPROVED", checkerUpdatedAt: now, completedAt: now });
    if (action === "request_changes") Object.assign(data, { checkerStatus: "CHANGES_REQUESTED", checkerUpdatedAt: now, makerStatus: "IN_PROGRESS" });
    if (action === "reopen") Object.assign(data, { completedAt: null });
    const res = await tx.task.updateMany({ where: { id: task.id, status: task.status }, data });
    if (res.count !== 1) throw new BusinessRuleError("The task was updated by someone else. Refresh and try again.");
    await tx.taskActivity.create({
      data: { taskId: task.id, actorUserId: ctx.user.id, type: "STATUS_CHANGED", fromValue: task.status, toValue: to, note: comment },
    });
    if ((action === "approve" || action === "request_changes") && ctx.employee) {
      await tx.taskReview.create({
        data: { taskId: task.id, reviewerEmployeeId: ctx.employee.id, decision: action === "approve" ? "APPROVED" : "CHANGES_REQUESTED", comment },
      });
    }
    if (action === "submit") {
      const reviewers = task.checkerEmployeeId ? [task.checkerEmployeeId] : [];
      await notifyEmployees(tx, ctx.organization.id, reviewers, { type: "task.review", title: `Review requested: ${task.title}`, link: `/app/tasks/${task.id}` });
    }
    if (action === "approve" || action === "request_changes") {
      await notifyEmployees(tx, ctx.organization.id, task.assignments.map((a) => a.employeeId), {
        type: "task.reviewed",
        title: `${action === "approve" ? "Approved" : "Changes requested"}: ${task.title}`,
        body: comment,
        link: `/app/tasks/${task.id}`,
      });
    }
    if (action === "cancel") await audit(tx, ctx, "task.cancelled", "task", task.id, { reason: comment ?? null });
  });
}

export async function addRemark(ctx: AppContext, taskId: string, note: string, clientVisible = false) {
  const task = await loadTaskForCtx(ctx, taskId);
  if (!task) throw new BusinessRuleError("Task not found.");
  // Only tasks shared with the client can carry client-visible remarks.
  const visible = clientVisible && task.clientVisible && !!task.clientId;
  await prisma.$transaction(async (tx) => {
    await tx.taskActivity.create({ data: { taskId: task.id, actorUserId: ctx.user.id, type: "COMMENT", note, clientVisible: visible } });
    // Tell the rest of the task team (assignees, maker, checker) — never the author.
    const team = await tx.task.findUniqueOrThrow({
      where: { id: task.id },
      select: { makerEmployeeId: true, checkerEmployeeId: true, assignments: { where: { removedAt: null }, select: { employeeId: true } } },
    });
    const others = [...team.assignments.map((a) => a.employeeId), team.makerEmployeeId, team.checkerEmployeeId].filter((x): x is string => !!x && x !== ctx.employee?.id);
    await notifyEmployees(tx, ctx.organization.id, [...new Set(others)], { type: "task.remark", title: `New remark on: ${task.title}`, body: note.slice(0, 140), link: `/app/tasks/${task.id}` });
    if (visible) await notifyClientUsers(tx, ctx.organization.id, task.clientId!, { type: "task.update", title: `Update on: ${task.title}`, body: note.slice(0, 140), link: `/client/work/${task.id}` });
  });
}

/** Share or unshare a task with the client, or ask the client to review delivered work. */
export async function setClientSharing(ctx: AppContext, taskId: string, v: { clientVisible: boolean; requestReview: boolean }) {
  if (!can(ctx.role, "tasks.review")) throw new BusinessRuleError("You cannot change client sharing.");
  const task = await loadTaskForCtx(ctx, taskId);
  if (!task || !task.clientId) throw new BusinessRuleError("Only tasks linked to a client can be shared.");
  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: task.id },
      data: { clientVisible: v.clientVisible, ...(v.requestReview && v.clientVisible ? { clientObservationStatus: "PENDING_CLIENT_REVIEW" } : {}) },
    });
    await tx.taskActivity.create({ data: { taskId: task.id, actorUserId: ctx.user.id, type: "UPDATED", note: v.clientVisible ? (v.requestReview ? "Shared with client for review" : "Shared with client") : "No longer shared with client" } });
    if (v.clientVisible && v.requestReview) {
      await notifyClientUsers(tx, ctx.organization.id, task.clientId!, { type: "task.review_requested", title: `Please review: ${task.title}`, link: `/client/work/${task.id}` });
    }
  });
}

export async function addAttachment(ctx: AppContext, taskId: string, file: File) {
  const task = await loadTaskForCtx(ctx, taskId);
  if (!task) throw new BusinessRuleError("Task not found.");
  const stored = await storeUpload(ctx, file, { area: "tasks", ownerId: task.id });
  await prisma.$transaction([
    prisma.taskAttachment.create({ data: { taskId: task.id, fileId: stored.id, kind: stored.mimeType.startsWith("image/") ? "IMAGE" : "DOCUMENT", caption: file.name.slice(0, 200) } }),
    prisma.taskActivity.create({ data: { taskId: task.id, actorUserId: ctx.user.id, type: "ATTACHMENT_ADDED", toValue: file.name.slice(0, 200) } }),
  ]);
}

export async function setAssignees(ctx: AppContext, taskId: string, employeeIds: string[], makerId?: string, checkerId?: string) {
  if (!can(ctx.role, "tasks.create")) throw new BusinessRuleError("You cannot change assignments.");
  const task = await loadTaskForCtx(ctx, taskId);
  if (!task) throw new BusinessRuleError("Task not found.");
  if (makerId && makerId === checkerId) throw new BusinessRuleError("Maker and checker must be different people.");
  await assertEmployees(ctx.organization.id, [...employeeIds, makerId, checkerId]);
  const current = new Set(task.assignments.map((a) => a.employeeId));
  const next = new Set(employeeIds);
  const added = [...next].filter((e) => !current.has(e));
  const removed = [...current].filter((e) => !next.has(e));
  await prisma.$transaction(async (tx) => {
    for (const employeeId of added) {
      await tx.taskAssignment.upsert({
        where: { taskId_employeeId: { taskId: task.id, employeeId } },
        update: { removedAt: null, assignedAt: new Date(), assignedById: ctx.user.id },
        create: { taskId: task.id, employeeId, assignedById: ctx.user.id },
      });
      await tx.taskActivity.create({ data: { taskId: task.id, actorUserId: ctx.user.id, type: "ASSIGNED", toValue: employeeId } });
    }
    for (const employeeId of removed) {
      await tx.taskAssignment.update({ where: { taskId_employeeId: { taskId: task.id, employeeId } }, data: { removedAt: new Date() } });
      await tx.taskActivity.create({ data: { taskId: task.id, actorUserId: ctx.user.id, type: "UNASSIGNED", fromValue: employeeId } });
    }
    await tx.task.update({
      where: { id: task.id },
      data: {
        makerEmployeeId: makerId ?? null,
        checkerEmployeeId: checkerId ?? null,
        ...(task.status === "PENDING" && next.size ? { status: "ASSIGNED" } : {}),
      },
    });
    await notifyEmployees(tx, ctx.organization.id, added, { type: "task.assigned", title: `New task: ${task.title}`, link: `/app/tasks/${task.id}` });
  });
}

/**
 * Turn due task reminders into in-app notifications. Called on page load, so
 * reminders work without a scheduler; an external channel (email/WhatsApp)
 * can be added behind this function later.
 */
export async function deliverDueReminders(organizationId: string) {
  await deliverOverdueNotices(organizationId);
  const due = await prisma.taskReminder.findMany({
    where: { status: "SCHEDULED", remindAt: { lte: new Date() }, task: { organizationId } },
    take: 50,
    include: { task: { select: { id: true, title: true, status: true, assignments: { where: { removedAt: null }, select: { employeeId: true } } } } },
  });
  for (const r of due) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.taskReminder.updateMany({ where: { id: r.id, status: "SCHEDULED" }, data: { status: "SENT", sentAt: new Date() } });
      if (claimed.count !== 1 || ["COMPLETED", "CANCELLED"].includes(r.task.status)) return;
      const targets = r.recipientEmployeeId ? [r.recipientEmployeeId] : r.task.assignments.map((a) => a.employeeId);
      const members = await tx.organizationMembership.findMany({ where: { organizationId, employeeId: { in: targets } }, select: { userId: true } });
      const userIds = members.map((m) => m.userId);
      if (!userIds.length && r.createdById) userIds.push(r.createdById);
      await notifyUsers(tx, organizationId, userIds, { type: "task.reminder", title: `Reminder: ${r.task.title}`, body: r.note ?? undefined, link: `/app/tasks/${r.task.id}` });
    });
  }
}

/**
 * One-time "overdue" notice per task (to assignees, maker and checker), claimed
 * via overdueNotifiedAt so concurrent page loads never notify twice. If due-date
 * editing is added later, it must clear overdueNotifiedAt.
 */
async function deliverOverdueNotices(organizationId: string) {
  const overdue = await prisma.task.findMany({
    where: { organizationId, overdueNotifiedAt: null, dueAt: { lt: new Date() }, status: { in: OPEN_STATUSES } },
    take: 50,
    select: { id: true, title: true, makerEmployeeId: true, checkerEmployeeId: true, assignments: { where: { removedAt: null }, select: { employeeId: true } } },
  });
  for (const t of overdue) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.task.updateMany({ where: { id: t.id, overdueNotifiedAt: null }, data: { overdueNotifiedAt: new Date() } });
      if (claimed.count !== 1) return;
      const ids = [...t.assignments.map((a) => a.employeeId), t.makerEmployeeId, t.checkerEmployeeId].filter((x): x is string => !!x);
      await notifyEmployees(tx, organizationId, [...new Set(ids)], { type: "task.overdue", title: `Overdue: ${t.title}`, link: `/app/tasks/${t.id}` });
    });
  }
}
