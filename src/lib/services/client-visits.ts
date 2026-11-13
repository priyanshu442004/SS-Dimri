import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zOptionalText } from "@/lib/actions";
import { formatTime, todayDateOnly } from "@/lib/dates";
import { OPEN_STATUSES } from "@/lib/domain/task-workflow";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { clientScope } from "./clients";
import { notifyUsers } from "./notifications";

// Client visits during the day (client feedback 12 Nov 2026): someone who visits several
// clients checks in at each one ("move to next client" ends the current visit and starts the
// next), so the firm can see where they are, and on arrival they are told what is still
// pending for that client.

const coord = (min: number, max: number) => z.coerce.number().min(min).max(max).optional();

export const visitSchema = z
  .object({
    clientId: z.union([z.uuid(), z.literal("")]).optional(),
    placeName: zOptionalText(160),
    purpose: zOptionalText(300),
    latitude: coord(-90, 90),
    longitude: coord(-180, 180),
  })
  .refine((v) => !!v.clientId || !!v.placeName?.trim(), { message: "Choose the client, or type the place", path: ["clientId"] });

export const visitEndSchema = z.object({ latitude: coord(-90, 90), longitude: coord(-180, 180) });

/** Clients this person may check in at: the ones they can see, active or on hold. */
export async function visitClientOptions(ctx: AppContext) {
  const rows = await prisma.client.findMany({
    where: { AND: [clientScope(ctx), { status: { in: ["ACTIVE", "ON_HOLD"] } }] },
    orderBy: { tradeName: "asc" },
    select: { id: true, tradeName: true },
  });
  return rows.map((c) => ({ value: c.id, label: c.tradeName }));
}

async function todaysOpenRecord(ctx: AppContext) {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  const rec = await prisma.attendanceRecord.findFirst({
    where: { organizationId: ctx.organization.id, employeeId: ctx.employee.id, attendanceDate: todayDateOnly(ctx.organization.timezone) },
  });
  if (!rec?.timeIn) throw new BusinessRuleError("Mark in first, then check in at the client.");
  if (rec.timeOut) throw new BusinessRuleError("You have already marked out today.");
  return rec;
}

/** Open work for a client that this person should know about when they arrive there. */
export async function clientPendency(organizationId: string, clientId: string, employeeId: string) {
  const [tasks, pending] = await Promise.all([
    prisma.task.findMany({
      where: { organizationId, clientId, status: { in: OPEN_STATUSES }, assignments: { some: { employeeId, removedAt: null } } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
      take: 6,
      select: { id: true, title: true, dueAt: true, status: true },
    }),
    prisma.pendingItem.findMany({
      where: { organizationId, clientId, status: { not: "CLOSED" }, OR: [{ pendingWith: "CLIENT" }, { pendingWithEmployeeId: employeeId }] },
      orderBy: [{ dueBy: { sort: "asc", nulls: "last" } }],
      take: 6,
      select: { id: true, requestDescription: true, dueBy: true, pendingWith: true },
    }),
  ]);
  return { tasks, pending };
}

/** Check in at a client (or another place). An open visit ends at the same moment. */
export async function startVisit(ctx: AppContext, v: z.infer<typeof visitSchema>) {
  await todaysOpenRecord(ctx);
  const me = ctx.employee!;
  const org = ctx.organization.id;
  let client: { id: string; tradeName: string } | null = null;
  if (v.clientId) {
    client = await prisma.client.findFirst({ where: { AND: [clientScope(ctx), { id: v.clientId }] }, select: { id: true, tradeName: true } });
    if (!client) throw new BusinessRuleError("Client not found.");
  }
  const place = client?.tradeName ?? v.placeName!.trim();
  const now = new Date();
  const pendency = client ? await clientPendency(org, client.id, me.id) : null;
  await prisma.$transaction(async (tx) => {
    await tx.clientVisit.updateMany({ where: { employeeId: me.id, endedAt: null }, data: { endedAt: now, endLatitude: v.latitude, endLongitude: v.longitude } });
    const visit = await tx.clientVisit.create({
      data: {
        organizationId: org, employeeId: me.id, clientId: client?.id, placeName: place, purpose: v.purpose?.trim() || null,
        visitDate: todayDateOnly(ctx.organization.timezone), startedAt: now, startLatitude: v.latitude, startLongitude: v.longitude,
      },
    });
    await audit(tx, ctx, "client_visit.started", "client_visit", visit.id);
    if (client && pendency && (pendency.tasks.length || pendency.pending.length)) {
      const parts = [
        pendency.tasks.length && `${pendency.tasks.length} open task${pendency.tasks.length > 1 ? "s" : ""}`,
        pendency.pending.length && `${pendency.pending.length} pending item${pendency.pending.length > 1 ? "s" : ""}`,
      ].filter(Boolean);
      await notifyUsers(tx, org, [ctx.user.id], {
        type: "client_visit.pendency",
        title: `At ${client.tradeName}: ${parts.join(" and ")}`,
        body: [...pendency.tasks.map((t) => t.title), ...pendency.pending.map((p) => p.requestDescription)].slice(0, 5).join(" · "),
        link: `/app/clients/${client.id}`,
      });
    }
  });
  const count = pendency ? pendency.tasks.length + pendency.pending.length : 0;
  return `Checked in at ${place} at ${formatTime(now, ctx.organization.timezone)}.` + (count ? ` ${count} pending item${count > 1 ? "s" : ""} for this client are listed below.` : "");
}

/** Leave the current client without going to another. */
export async function endVisit(ctx: AppContext, v: z.infer<typeof visitEndSchema>) {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  const now = new Date();
  const res = await prisma.clientVisit.updateMany({ where: { employeeId: ctx.employee.id, endedAt: null }, data: { endedAt: now, endLatitude: v.latitude, endLongitude: v.longitude } });
  if (!res.count) throw new BusinessRuleError("You are not checked in at a client.");
  return `Checked out at ${formatTime(now, ctx.organization.timezone)}.`;
}

/** This person's visits today, oldest first; the last one may still be open. */
export function myVisitsToday(ctx: AppContext) {
  if (!ctx.employee) return Promise.resolve([]);
  return prisma.clientVisit.findMany({
    where: { organizationId: ctx.organization.id, employeeId: ctx.employee.id, visitDate: todayDateOnly(ctx.organization.timezone) },
    orderBy: { startedAt: "asc" },
  });
}

/** Everyone's visits on a day, grouped by person, for the "where is everyone" board. */
export async function teamVisits(ctx: AppContext, day: Date, employeeId?: string) {
  const visits = await prisma.clientVisit.findMany({
    where: { organizationId: ctx.organization.id, visitDate: day, ...(employeeId ? { employeeId } : {}) },
    orderBy: { startedAt: "asc" },
    include: { employee: { select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } } } } },
  });
  const byPerson = new Map<string, { employee: (typeof visits)[number]["employee"]; visits: typeof visits }>();
  for (const v of visits) {
    const g = byPerson.get(v.employeeId) ?? { employee: v.employee, visits: [] };
    g.visits.push(v);
    byPerson.set(v.employeeId, g);
  }
  return [...byPerson.values()].sort((a, b) => a.employee.firstName.localeCompare(b.employee.firstName));
}
