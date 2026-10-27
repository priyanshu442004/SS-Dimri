import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zOptionalText } from "@/lib/actions";
import { OPEN_STATUSES } from "@/lib/domain/task-workflow";
import { isoDateInTz } from "@/lib/dates";
import type { AppContext } from "@/lib/session";
import { hasFile, storeUpload } from "./files";
import { notifyEmployees, notifyRoles } from "./notifications";
import { createClientObservationFromTask } from "./observations";

// Client-portal data access. Every query is pinned to ctx.client.id; only
// records staff explicitly marked client-visible are returned, and only
// client-safe fields are selected (no internal remarks, HR or other clients).

type ClientCtx = AppContext & { client: NonNullable<AppContext["client"]> };

export async function portalOverview(ctx: ClientCtx) {
  const clientId = ctx.client.id;
  const [client, requests, openWork, awaitingReview, completed, dues, team] = await Promise.all([
    prisma.client.findUniqueOrThrow({
      where: { id: clientId },
      select: {
        tradeName: true, legalName: true, clientCode: true, status: true, approvedAt: true,
        services: { where: { status: "ACTIVE" }, select: { id: true, dueDate: true, timelineNote: true, pocName: true, pocMobile: true, pocEmail: true, service: { select: { name: true } } } },
      },
    }),
    prisma.pendingItem.findMany({
      where: { clientId, pendingWith: "CLIENT", clientVisible: true, status: { not: "CLOSED" } },
      orderBy: [{ dueBy: { sort: "asc", nulls: "last" } }, { requestedOn: "asc" }],
      select: { id: true, requestDescription: true, requestedOn: true, dueBy: true, status: true },
    }),
    prisma.task.findMany({
      where: { clientId, clientVisible: true, status: { in: OPEN_STATUSES }, clientObservationStatus: { not: "PENDING_CLIENT_REVIEW" } },
      orderBy: { dueAt: { sort: "asc", nulls: "last" } },
      select: { id: true, title: true, status: true, dueAt: true },
    }),
    prisma.task.findMany({
      where: { clientId, clientVisible: true, clientObservationStatus: "PENDING_CLIENT_REVIEW" },
      select: { id: true, title: true, status: true, dueAt: true },
    }),
    prisma.task.findMany({
      where: { clientId, clientVisible: true, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 10,
      select: { id: true, title: true, completedAt: true, clientObservationStatus: true },
    }),
    prisma.clientDue.findMany({ where: { clientId, status: "OPEN" }, orderBy: { dueDate: "asc" }, select: { id: true, description: true, amount: true, dueDate: true, referenceNumber: true } }),
    prisma.teamAllocation.findMany({
      where: { clientId, status: "ACTIVE" },
      select: { id: true, employee: { select: { firstName: true, lastName: true, designation: { select: { name: true } } } } },
    }),
  ]);
  return { client, requests, openWork, awaitingReview, completed, dues, team };
}

export async function portalRequest(ctx: ClientCtx, id: string) {
  return prisma.pendingItem.findFirst({
    where: { id, clientId: ctx.client.id, pendingWith: "CLIENT", clientVisible: true },
    select: {
      id: true, requestDescription: true, requestedOn: true, dueBy: true, status: true,
      followUps: {
        where: { clientVisible: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, note: true, createdAt: true, fileId: true, actor: { select: { name: true } } },
      },
    },
  });
}

export const respondSchema = z.object({ note: z.string().trim().min(1, "Write a reply").max(2000) });

/** Client replies to a request, optionally attaching the requested document. */
export async function respondToRequest(ctx: ClientCtx, id: string, note: string, fd: FormData) {
  const item = await prisma.pendingItem.findFirst({
    where: { id, clientId: ctx.client.id, pendingWith: "CLIENT", clientVisible: true, status: { not: "CLOSED" } },
    select: { id: true, raisedByEmployeeId: true, requestDescription: true },
  });
  if (!item) throw new BusinessRuleError("This request is not open.");
  const file = fd.get("file");
  const stored = hasFile(file) ? await storeUpload(ctx, file, { area: "clients", ownerId: ctx.client.id }) : null;
  await prisma.$transaction(async (tx) => {
    if (stored) {
      await tx.clientDocument.create({ data: { clientId: ctx.client.id, fileId: stored.id, type: "OTHER", title: `Reply: ${item.requestDescription.slice(0, 120)}` } });
    }
    await tx.followUp.create({
      data: {
        organizationId: ctx.organization.id,
        pendingItemId: item.id,
        note,
        clientVisible: true,
        fileId: stored?.id,
        actorUserId: ctx.user.id,
      },
    });
    const note2 = { type: "client.replied", title: `${ctx.client.tradeName} replied to a request`, body: note.slice(0, 140), link: `/app/pending?tab=communication&client=${ctx.client.id}` };
    if (item.raisedByEmployeeId) await notifyEmployees(tx, ctx.organization.id, [item.raisedByEmployeeId], note2);
    else await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN", "MANAGER"], note2);
  });
}

export async function portalTask(ctx: ClientCtx, id: string) {
  return prisma.task.findFirst({
    where: { id, clientId: ctx.client.id, clientVisible: true },
    select: {
      id: true, title: true, status: true, dueAt: true, completedAt: true, clientObservationStatus: true, clientObservationNote: true,
      activities: {
        where: { type: "COMMENT", clientVisible: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, note: true, createdAt: true, actor: { select: { name: true } } },
      },
    },
  });
}

export const clientRemarkSchema = z.object({ note: z.string().trim().min(1, "Write a remark").max(2000) });
export const observationSchema = z.object({ decision: z.enum(["ACCEPTED", "OBSERVATIONS_RAISED"]), note: zOptionalText(2000) });

export async function addClientRemark(ctx: ClientCtx, taskId: string, note: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, clientId: ctx.client.id, clientVisible: true },
    select: { id: true, title: true, assignments: { where: { removedAt: null }, select: { employeeId: true } } },
  });
  if (!task) throw new BusinessRuleError("Task not found.");
  await prisma.$transaction(async (tx) => {
    await tx.taskActivity.create({ data: { taskId: task.id, actorUserId: ctx.user.id, type: "COMMENT", note, clientVisible: true } });
    await notifyEmployees(tx, ctx.organization.id, task.assignments.map((a) => a.employeeId), {
      type: "client.remark", title: `Client remark on: ${task.title}`, body: note.slice(0, 140), link: `/app/tasks/${task.id}`,
    });
  });
}

/** Client accepts delivered work or raises observations (13A "client observation status"). */
export async function recordObservation(ctx: ClientCtx, taskId: string, decision: "ACCEPTED" | "OBSERVATIONS_RAISED", note?: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, clientId: ctx.client.id, clientVisible: true, clientObservationStatus: "PENDING_CLIENT_REVIEW" },
    select: { id: true, title: true, clientId: true, checkerEmployeeId: true, makerEmployeeId: true },
  });
  if (!task) throw new BusinessRuleError("This work is not awaiting your review.");
  if (decision === "OBSERVATIONS_RAISED" && !note) throw new BusinessRuleError("Describe your observations.");
  await prisma.$transaction(async (tx) => {
    await tx.task.update({ where: { id: task.id }, data: { clientObservationStatus: decision, clientObservationNote: note } });
    await tx.taskActivity.create({
      data: { taskId: task.id, actorUserId: ctx.user.id, type: "COMMENT", clientVisible: true, note: `${decision === "ACCEPTED" ? "Accepted by client" : "Client observations"}${note ? `: ${note}` : ""}` },
    });
    if (decision === "OBSERVATIONS_RAISED" && note) {
      // Tracked as a client observation with its own lifecycle and history (Page 56).
      await createClientObservationFromTask(tx, ctx.organization.id, { ...task, clientId: ctx.client.id }, note, ctx.user.id, isoDateInTz(new Date(), ctx.organization.timezone));
    }
    const ids = [task.makerEmployeeId, task.checkerEmployeeId].filter((x): x is string => !!x);
    await notifyEmployees(tx, ctx.organization.id, ids, {
      type: "client.observation", title: `${decision === "ACCEPTED" ? "Client accepted" : "Client raised observations on"}: ${task.title}`, link: `/app/tasks/${task.id}`,
    });
  });
}

export const portalDocumentSchema = z.object({ title: z.string().trim().min(2, "Give the document a name").max(200) });

export async function uploadPortalDocument(ctx: ClientCtx, title: string, file: File) {
  const stored = await storeUpload(ctx, file, { area: "clients", ownerId: ctx.client.id });
  await prisma.$transaction(async (tx) => {
    await tx.clientDocument.create({ data: { clientId: ctx.client.id, fileId: stored.id, type: "OTHER", title } });
    await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN", "MANAGER"], {
      type: "client.document", title: `${ctx.client.tradeName} uploaded “${title}”`, link: `/app/clients/${ctx.client.id}?tab=documents`,
    });
  });
}
