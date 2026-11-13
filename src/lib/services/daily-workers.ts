import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zIsoDate, zOptionalText, zRequiredText } from "@/lib/actions";
import { dateOnly } from "@/lib/dates";
import { summarizeWorkerDays, wageForDay, type WorkerDayStatus } from "@/lib/domain/attendance-extras";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";

// Daily (contract) workers (client feedback 12 Nov 2026): businesses that take on labour by
// the day keep a register of them, a supervisor marks them in and out with a photo (see
// attendance-proxy.ts), and the payoff sheet adds up what each one has earned and been paid.

const wage = z.coerce.number({ error: "Enter the daily wage" }).min(0, "Cannot be negative").max(1_000_000, "Too large");

export const workerSchema = z.object({
  name: zRequiredText(120),
  mobile: z.union([z.string().regex(/^[0-9+ -]{7,20}$/, "Enter a valid mobile number"), z.literal("")]).optional(),
  workType: zOptionalText(80),
  contractor: zOptionalText(120),
  dailyWage: wage,
  remarks: zOptionalText(500),
});

export async function saveWorker(ctx: AppContext, id: string | null, v: z.infer<typeof workerSchema>) {
  const data = {
    name: v.name.trim(),
    mobile: v.mobile?.trim() || null,
    workType: v.workType?.trim() || null,
    contractor: v.contractor?.trim() || null,
    dailyWage: v.dailyWage,
    remarks: v.remarks?.trim() || null,
  };
  return prisma.$transaction(async (tx) => {
    if (id) {
      const res = await tx.dailyWorker.updateMany({ where: { id, organizationId: ctx.organization.id }, data });
      if (!res.count) throw new BusinessRuleError("Worker not found.");
      await audit(tx, ctx, "daily_worker.updated", "daily_worker", id);
      return id;
    }
    const w = await tx.dailyWorker.create({ data: { ...data, organizationId: ctx.organization.id, createdById: ctx.user.id } });
    await audit(tx, ctx, "daily_worker.created", "daily_worker", w.id);
    return w.id;
  });
}

export async function setWorkerActive(ctx: AppContext, id: string, active: boolean) {
  const res = await prisma.dailyWorker.updateMany({ where: { id, organizationId: ctx.organization.id }, data: { isActive: active } });
  if (!res.count) throw new BusinessRuleError("Worker not found.");
}

export const workerDaySchema = z.object({
  workerId: z.uuid("Choose the worker"),
  date: zIsoDate,
  status: z.enum(["PRESENT", "HALF_DAY", "ABSENT"]),
  timeIn: z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal("")]).optional(),
  timeOut: z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal("")]).optional(),
  remarks: zOptionalText(300),
});

/**
 * Record or correct a worker's day by hand (a day nobody marked, half day, absent).
 * The day's earnings follow the status at the worker's current wage. A paid day cannot be changed.
 */
export async function saveWorkerDay(ctx: AppContext, v: z.infer<typeof workerDaySchema>) {
  const w = await prisma.dailyWorker.findFirst({ where: { id: v.workerId, organizationId: ctx.organization.id } });
  if (!w) throw new BusinessRuleError("Worker not found.");
  const day = dateOnly(v.date);
  const at = (t?: string) => (t ? new Date(`${v.date}T${t}:00+05:30`) : null);
  const timeIn = at(v.timeIn || undefined);
  const timeOut = at(v.timeOut || undefined);
  if (timeIn && timeOut && timeOut < timeIn) throw new BusinessRuleError("Time out must be after time in.");
  const existing = await prisma.dailyWorkerDay.findUnique({ where: { workerId_workDate: { workerId: w.id, workDate: day } } });
  if (existing?.paidAt) throw new BusinessRuleError("This day is already paid. Undo the payment first to change it.");
  const amount = wageForDay(Number(w.dailyWage), v.status as WorkerDayStatus);
  await prisma.$transaction(async (tx) => {
    const data = {
      status: v.status,
      wage: amount,
      remarks: v.remarks?.trim() || existing?.remarks || null,
      // Times typed here replace the marked ones; left empty, the marked ones stay.
      ...(timeIn ? { timeIn } : {}),
      ...(timeOut ? { timeOut } : {}),
    };
    const row = existing
      ? await tx.dailyWorkerDay.update({ where: { id: existing.id }, data })
      : await tx.dailyWorkerDay.create({ data: { ...data, organizationId: ctx.organization.id, workerId: w.id, workDate: day, markedById: ctx.user.id } });
    await audit(tx, ctx, "daily_worker.day_saved", "daily_worker_day", row.id, { status: v.status, previous: existing?.status ?? null });
  });
}

/** Mark all unpaid days of a worker in the period as paid (or undo it). */
export async function setWorkerPaid(ctx: AppContext, workerId: string, from: string, to: string, paid: boolean) {
  const w = await prisma.dailyWorker.findFirst({ where: { id: workerId, organizationId: ctx.organization.id }, select: { id: true, name: true } });
  if (!w) throw new BusinessRuleError("Worker not found.");
  const res = await prisma.$transaction(async (tx) => {
    const r = await tx.dailyWorkerDay.updateMany({
      where: { workerId: w.id, organizationId: ctx.organization.id, workDate: { gte: dateOnly(from), lte: dateOnly(to) }, paidAt: paid ? null : { not: null }, status: { in: ["PRESENT", "HALF_DAY"] } },
      data: paid ? { paidAt: new Date(), paidById: ctx.user.id } : { paidAt: null, paidById: null },
    });
    await audit(tx, ctx, paid ? "daily_worker.paid" : "daily_worker.payment_undone", "daily_worker", w.id, { from, to, days: r.count });
    return r;
  });
  if (!res.count) throw new BusinessRuleError(paid ? "Nothing unpaid for this worker in the period." : "Nothing paid for this worker in the period.");
  return { name: w.name, days: res.count };
}

/** Pay per worker over a period (workers with no days are listed only while active). */
export async function workerPayoffs(organizationId: string, from: string, to: string) {
  const [workers, days] = await Promise.all([
    prisma.dailyWorker.findMany({ where: { organizationId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.dailyWorkerDay.findMany({ where: { organizationId, workDate: { gte: dateOnly(from), lte: dateOnly(to) } }, select: { workerId: true, status: true, wage: true, paidAt: true } }),
  ]);
  return workers
    .map((w) => {
      const mine = days.filter((d) => d.workerId === w.id);
      return { worker: w, hasDays: mine.length > 0, ...summarizeWorkerDays(mine.map((d) => ({ status: d.status, wage: Number(d.wage), paid: !!d.paidAt }))) };
    })
    .filter((r) => r.worker.isActive || r.hasDays);
}

/** Every worker's day for one date (the day sheet). */
export async function workerDaySheet(organizationId: string, day: Date) {
  const [workers, days] = await Promise.all([
    prisma.dailyWorker.findMany({ where: { organizationId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    prisma.dailyWorkerDay.findMany({ where: { organizationId, workDate: day }, include: { markedBy: { select: { name: true } }, paidBy: { select: { name: true } } } }),
  ]);
  const dayBy = new Map(days.map((d) => [d.workerId, d]));
  return workers.filter((w) => w.isActive || dayBy.has(w.id)).map((w) => ({ worker: w, day: dayBy.get(w.id) ?? null }));
}
