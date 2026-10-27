import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zIsoDate } from "@/lib/actions";
import { dateOnly } from "@/lib/dates";
import { NO_EMPLOYEE } from "@/lib/ids";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { notifyEmployees } from "./notifications";
import { canMoveObservation } from "@/lib/domain/observation-workflow";


/** Leads see every observation in the organization; others see those assigned to them. */
export function observationScope(ctx: AppContext): Prisma.ClientObservationWhereInput {
  return can(ctx.role, "observations.manage")
    ? { organizationId: ctx.organization.id }
    : { organizationId: ctx.organization.id, responsibleEmployeeId: ctx.employee?.id ?? NO_EMPLOYEE };
}

export const observationSchema = z.object({
  clientId: z.uuid("Choose a client"),
  observedOn: zIsoDate,
  details: z.string().trim().min(3, "Describe the observation").max(4000),
  taskId: z.uuid().optional(),
  clientServiceId: z.uuid().optional(),
  responsibleEmployeeId: z.uuid().optional(),
});

export async function createObservation(ctx: AppContext, v: z.infer<typeof observationSchema>) {
  if (!can(ctx.role, "observations.manage")) throw new BusinessRuleError("You cannot log observations.");
  const org = ctx.organization.id;
  const [client, task, service, employee] = await Promise.all([
    prisma.client.findFirst({ where: { id: v.clientId, organizationId: org }, select: { id: true, tradeName: true } }),
    v.taskId ? prisma.task.findFirst({ where: { id: v.taskId, organizationId: org, clientId: v.clientId }, select: { id: true } }) : null,
    v.clientServiceId ? prisma.clientService.findFirst({ where: { id: v.clientServiceId, clientId: v.clientId }, select: { id: true } }) : null,
    v.responsibleEmployeeId ? prisma.employee.findFirst({ where: { id: v.responsibleEmployeeId, organizationId: org }, select: { id: true } }) : null,
  ]);
  if (!client) throw new BusinessRuleError("Client not found.");
  if (v.taskId && !task) throw new BusinessRuleError("That task does not belong to this client.");
  if (v.clientServiceId && !service) throw new BusinessRuleError("That service does not belong to this client.");
  if (v.responsibleEmployeeId && !employee) throw new BusinessRuleError("Team member not found.");
  return prisma.$transaction(async (tx) => {
    const o = await tx.clientObservation.create({
      data: {
        organizationId: org, clientId: client.id, taskId: task?.id, clientServiceId: service?.id, responsibleEmployeeId: employee?.id,
        observedOn: dateOnly(v.observedOn), details: v.details, source: "STAFF", createdById: ctx.user.id,
      },
    });
    await audit(tx, ctx, "observation.created", "client_observation", o.id);
    if (employee && employee.id !== ctx.employee?.id) {
      await notifyEmployees(tx, org, [employee.id], { type: "observation.assigned", title: `Client observation for ${client.tradeName}`, link: `/app/observations/${o.id}` });
    }
    return o;
  });
}

export const observationUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  note: z.string().trim().min(2, "Add a note").max(2000),
  responsibleEmployeeId: z.uuid().optional(),
});

/** Every change is a follow-up row (the observation's history) plus an audit entry. */
export async function updateObservation(ctx: AppContext, id: string, v: z.infer<typeof observationUpdateSchema>) {
  const o = await prisma.clientObservation.findFirst({ where: { id, ...observationScope(ctx) } });
  if (!o) throw new BusinessRuleError("Observation not found.");
  const manager = can(ctx.role, "observations.manage");
  if (v.status && v.status !== o.status) {
    if (!canMoveObservation(o.status, v.status)) throw new BusinessRuleError(`An observation cannot move from ${o.status.toLowerCase()} to ${v.status.toLowerCase()}.`);
    if (v.status === "CLOSED" && !manager) throw new BusinessRuleError("Only a manager can close an observation.");
  }
  let reassignTo: string | null = null;
  if (v.responsibleEmployeeId && v.responsibleEmployeeId !== o.responsibleEmployeeId) {
    if (!manager) throw new BusinessRuleError("Only a manager can reassign an observation.");
    const e = await prisma.employee.findFirst({ where: { id: v.responsibleEmployeeId, organizationId: ctx.organization.id }, select: { id: true } });
    if (!e) throw new BusinessRuleError("Team member not found.");
    reassignTo = e.id;
  }
  const status = v.status ?? o.status;
  const res = await prisma.clientObservation.updateMany({
    where: { id: o.id, updatedAt: o.updatedAt },
    data: {
      status,
      ...(reassignTo && { responsibleEmployeeId: reassignTo }),
      ...(status === "RESOLVED" && { resolution: v.note }),
      closedAt: status === "CLOSED" ? new Date() : status === "OPEN" || status === "IN_PROGRESS" ? null : o.closedAt,
    },
  });
  if (res.count === 0) throw new BusinessRuleError("Someone else updated this observation. Reload and try again.");
  await prisma.$transaction(async (tx) => {
    const prefix = [status !== o.status && `Status → ${status.replace("_", " ").toLowerCase()}`, reassignTo && "Reassigned"].filter(Boolean).join(" · ");
    await tx.followUp.create({ data: { organizationId: ctx.organization.id, observationId: o.id, note: prefix ? `${prefix}: ${v.note}` : v.note, actorUserId: ctx.user.id } });
    await audit(tx, ctx, "observation.updated", "client_observation", o.id, { from: o.status, to: status, reassigned: !!reassignTo });
    if (reassignTo && reassignTo !== ctx.employee?.id) {
      await notifyEmployees(tx, ctx.organization.id, [reassignTo], { type: "observation.assigned", title: "A client observation was assigned to you", link: `/app/observations/${o.id}` });
    }
  });
}

/** Called from the client portal when the client raises observations on delivered work. */
export async function createClientObservationFromTask(
  tx: Prisma.TransactionClient,
  organizationId: string,
  task: { id: string; clientId: string; makerEmployeeId: string | null },
  details: string,
  userId: string,
  observedOnIso: string,
) {
  return tx.clientObservation.create({
    data: {
      organizationId, clientId: task.clientId, taskId: task.id, responsibleEmployeeId: task.makerEmployeeId,
      observedOn: dateOnly(observedOnIso), details, source: "CLIENT", createdById: userId,
    },
  });
}
