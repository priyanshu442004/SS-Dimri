import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zIsoDate, zMoney, zOptionalText } from "@/lib/actions";
import { dateOnly } from "@/lib/dates";
import { daysPending, isTaskOverdue } from "@/lib/domain/derived";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";

/**
 * Builds the client report (13A) from source records — never from
 * client-supplied totals. The same object is stored as a snapshot.
 */
export async function buildClientReport(organizationId: string, clientId: string, fromIso: string, toIso: string) {
  const from = dateOnly(fromIso);
  const to = dateOnly(toIso);
  const fromTs = new Date(`${fromIso}T00:00:00+05:30`);
  const toTs = new Date(new Date(`${toIso}T00:00:00+05:30`).getTime() + 86_400_000);

  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    include: {
      constitution: { select: { name: true } },
      gstRegistrations: { select: { gstin: true } },
      contacts: { where: { isPrimary: true }, take: 1 },
      services: { include: { service: { select: { name: true } } } },
    },
  });
  if (!client) throw new BusinessRuleError("Client not found.");
  const { pendingDaysBasis: basis } = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { pendingDaysBasis: true } });

  const [allocations, tasks, timesheet, pending, dues, commitments] = await Promise.all([
    prisma.teamAllocation.findMany({
      where: { clientId, startDate: { lte: to }, OR: [{ endDate: null }, { endDate: { gte: from } }], status: { not: "CANCELLED" } },
      include: { employee: { select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } } } } },
    }),
    prisma.task.findMany({
      where: { clientId, OR: [{ status: { notIn: ["COMPLETED", "CANCELLED"] } }, { completedAt: { gte: fromTs, lt: toTs } }] },
      orderBy: { dueAt: "asc" },
      include: {
        maker: { select: { firstName: true, lastName: true } },
        checker: { select: { firstName: true, lastName: true } },
        assignments: { where: { removedAt: null }, select: { employee: { select: { id: true, firstName: true, lastName: true } } } },
      },
    }),
    prisma.timesheetEntry.findMany({
      where: { clientId, workDate: { gte: from, lte: to } },
      select: { workDate: true, status: true, approxMinutes: true, transactionCount: true, employee: { select: { id: true, firstName: true, lastName: true } } },
    }),
    prisma.pendingItem.findMany({
      where: { clientId, OR: [{ status: { not: "CLOSED" } }, { closedAt: { gte: fromTs, lt: toTs } }] },
      orderBy: { requestedOn: "asc" },
      include: { pendingWithEmployee: { select: { firstName: true } } },
    }),
    prisma.clientDue.findMany({
      where: { clientId },
      orderBy: { dueDate: "asc" },
      include: { clientService: { include: { service: { select: { name: true } } } }, followUps: { orderBy: { createdAt: "desc" }, take: 3 } },
    }),
    prisma.workCommitment.findMany({
      where: { clientId, periodStart: { lte: to }, periodEnd: { gte: from } },
      include: { employee: { select: { firstName: true, lastName: true } } },
    }),
  ]);

  const name = (p: { firstName: string; lastName: string | null } | null) => (p ? `${p.firstName} ${p.lastName ?? ""}`.trim() : null);
  type TeamRow = { id: string; name: string; designation: string | null; minutes: number; reviewedMinutes: number; entries: number; tasksCompleted: number; openTasks: number; allocated: boolean };
  const team = new Map<string, TeamRow>();
  const row = (e: { id: string; firstName: string; lastName: string | null }, designation: string | null = null) => {
    if (!team.has(e.id)) team.set(e.id, { id: e.id, name: name(e)!, designation, minutes: 0, reviewedMinutes: 0, entries: 0, tasksCompleted: 0, openTasks: 0, allocated: false });
    return team.get(e.id)!;
  };
  const byDay = new Map<string, number>();
  for (const a of allocations) Object.assign(row(a.employee, a.employee.designation?.name ?? null), { allocated: true });
  for (const t of timesheet) {
    const r = row(t.employee);
    r.minutes += t.approxMinutes ?? 0;
    if (t.status === "REVIEWED") r.reviewedMinutes += t.approxMinutes ?? 0;
    r.entries += t.transactionCount ?? 0;
    const day = t.workDate.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + (t.approxMinutes ?? 0));
  }
  for (const t of tasks) {
    for (const a of t.assignments) {
      const r = row(a.employee);
      if (t.status === "COMPLETED") r.tasksCompleted++;
      else if (t.status !== "CANCELLED") r.openTasks++;
    }
  }

  const fees = client.services
    .filter((s) => s.agreedFee)
    .map((s) => ({ service: s.service.name, nature: s.engagementNature, status: s.status, agreedFee: Number(s.agreedFee) }));
  const openDues = dues.filter((d) => d.status === "OPEN");

  return {
    generatedFor: { from: fromIso, to: toIso },
    client: {
      id: client.id,
      code: client.clientCode,
      tradeName: client.tradeName,
      legalName: client.legalName,
      constitution: client.constitution?.name ?? null,
      gstins: client.gstRegistrations.map((g) => g.gstin),
      contact: client.contacts[0] ? `${client.contacts[0].name} ${client.contacts[0].mobile ?? ""}`.trim() : null,
      status: client.status,
    },
    team: [...team.values()].sort((a, b) => b.minutes - a.minutes),
    hoursByDay: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, minutes]) => ({ date, minutes })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      overdue: isTaskOverdue(t),
      dueAt: t.dueAt?.toISOString() ?? null,
      maker: name(t.maker),
      makerStatus: t.makerStatus,
      checker: name(t.checker),
      checkerStatus: t.checkerStatus,
      observation: t.clientObservationStatus,
      observationNote: t.clientObservationNote,
      assignees: t.assignments.map((a) => name(a.employee)).join(", "),
    })),
    pendingOurSide: pending.filter((p) => p.pendingWith === "TEAM_MEMBER").map((p) => ({ id: p.id, what: p.requestDescription, with: p.pendingWithEmployee?.firstName ?? null, requestedOn: p.requestedOn.toISOString().slice(0, 10), dueBy: p.dueBy?.toISOString().slice(0, 10) ?? null, status: p.status, daysPending: daysPending(p, undefined, basis) })),
    pendingClientSide: pending.filter((p) => p.pendingWith === "CLIENT").map((p) => ({ id: p.id, what: p.requestDescription, requestedOn: p.requestedOn.toISOString().slice(0, 10), dueBy: p.dueBy?.toISOString().slice(0, 10) ?? null, status: p.status, daysPending: daysPending(p, undefined, basis) })),
    fees,
    feesTotal: fees.filter((f) => f.status === "ACTIVE").reduce((s, f) => s + f.agreedFee, 0),
    dues: dues.map((d) => ({
      id: d.id,
      description: d.description,
      service: d.clientService?.service.name ?? null,
      reference: d.referenceNumber,
      amount: Number(d.amount),
      dueDate: d.dueDate?.toISOString().slice(0, 10) ?? null,
      status: d.status,
      followUps: d.followUps.map((f) => ({ at: f.createdAt.toISOString(), note: f.note })),
    })),
    duesOutstanding: openDues.reduce((s, d) => s + Number(d.amount), 0),
    commitments: commitments.map((c) => ({ employee: name(c.employee), description: c.description, targetDate: c.targetDate?.toISOString().slice(0, 10) ?? null, status: c.status })),
  };
}

export type ClientReportData = Awaited<ReturnType<typeof buildClientReport>>;

export async function saveSnapshot(ctx: AppContext, clientId: string, fromIso: string, toIso: string, notes?: string) {
  const data = await buildClientReport(ctx.organization.id, clientId, fromIso, toIso);
  return prisma.$transaction(async (tx) => {
    const r = await tx.clientReport.create({
      data: {
        organizationId: ctx.organization.id,
        clientId,
        periodStart: dateOnly(fromIso),
        periodEnd: dateOnly(toIso),
        status: "FINAL",
        summaryNotes: notes,
        snapshot: JSON.parse(JSON.stringify(data)),
        generatedById: ctx.user.id,
        generatedAt: new Date(),
      },
    });
    await audit(tx, ctx, "client_report.snapshot", "client_report", r.id);
    return r;
  });
}

export const dueSchema = z.object({
  description: z.string().min(2, "Required").max(300),
  amount: zMoney,
  dueDate: zIsoDate.optional(),
  referenceNumber: zOptionalText(80),
  clientServiceId: z.uuid().optional(),
  notes: zOptionalText(1000),
});

export async function addDue(ctx: AppContext, clientId: string, v: z.infer<typeof dueSchema>) {
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId: ctx.organization.id }, select: { id: true } });
  if (!client) throw new BusinessRuleError("Client not found.");
  await prisma.$transaction(async (tx) => {
    const d = await tx.clientDue.create({
      data: {
        organizationId: ctx.organization.id,
        clientId,
        clientServiceId: v.clientServiceId,
        description: v.description,
        amount: v.amount,
        dueDate: v.dueDate ? dateOnly(v.dueDate) : null,
        referenceNumber: v.referenceNumber,
        notes: v.notes,
        createdById: ctx.user.id,
      },
    });
    await audit(tx, ctx, "client_due.created", "client_due", d.id, { amount: v.amount });
  });
}

export async function updateDue(ctx: AppContext, dueId: string, status: "OPEN" | "SETTLED" | "WRITTEN_OFF", note?: string) {
  const due = await prisma.clientDue.findFirst({ where: { id: dueId, organizationId: ctx.organization.id } });
  if (!due) throw new BusinessRuleError("Due not found.");
  await prisma.$transaction(async (tx) => {
    await tx.clientDue.update({ where: { id: due.id }, data: { status, settledAt: status === "SETTLED" ? new Date() : null } });
    await tx.followUp.create({
      data: { organizationId: ctx.organization.id, clientDueId: due.id, note: note ?? `Marked ${status.toLowerCase().replace("_", " ")}`, actorUserId: ctx.user.id },
    });
    await audit(tx, ctx, `client_due.${status.toLowerCase()}`, "client_due", due.id);
  });
}
