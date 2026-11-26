import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zIsoDate, zOptionalText } from "@/lib/actions";
import { addDays, dateOnly, formatDate, monthRange, todayDateOnly, toIsoDate } from "@/lib/dates";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { NO_EMPLOYEE } from "@/lib/ids";
import { advanceInMonth, type AdvanceTerms } from "@/lib/domain/advance";
export { advanceInMonth };
import { audit } from "./audit";
import { hasFile, storeUpload } from "./files";
import { notifyEmployees, notifyRoles } from "./notifications";

// Conveyance claims and salary advances (tracker S.No. 84 and 85, 21 Nov 2026).
//   Conveyance: a team member claims a day's travel (client, km / fare, bill photo); an administrator
//   approves it, and approved claims are paid with that month's salary ("Any other").
//   Advance: an administrator records an advance and its monthly deduction (EMI); each month's
//   deduction and the balance are worked out from it, and the payslip shows both.

const money = z.coerce.number("Enter the amount").positive("Enter the amount").max(1_000_000);
import { CONVEYANCE_MODES, conveyanceAmount, isOwnVehicle } from "@/lib/domain/conveyance";
export { CONVEYANCE_MODES, conveyanceAmount, isOwnVehicle };

// ---------------------------------------------------------------- conveyance

export const conveyanceSchema = z.object({
  claimDate: zIsoDate,
  clientId: z.uuid().optional(),
  place: zOptionalText(300),
  mode: z.enum(CONVEYANCE_MODES, { error: "Choose the mode of conveyance" }),
  /** Own vehicle: the day's total run and the home ↔ office km to take off. */
  totalRunKm: z.coerce.number().min(0).max(5000).optional(),
  commuteKm: z.coerce.number().min(0).max(1000).optional(),
  rememberCommute: zCheckbox.optional(),
  /** Older form: the distance as one figure. */
  km: z.coerce.number().min(0).max(5000).optional(),
  /** Fare paid (metro, bus, cab …); for an own vehicle it is worked out. */
  amount: z.coerce.number().min(0).max(1_000_000).optional(),
  purpose: zOptionalText(500),
  remark: zOptionalText(500),
});

/**
 * The clients a person may pick on a claim (client, 25 Nov 2026: "specific and related clients only"):
 * the clients they are allocated to (now or in the last two months), have tasks for, or checked in at
 * as a client visit. Administrators also get every other active client after their own.
 */
export async function conveyanceClientOptions(ctx: AppContext) {
  const me = ctx.employee?.id ?? NO_EMPLOYEE;
  const since = addDays(todayDateOnly(ctx.organization.timezone), -62);
  const related = await prisma.client.findMany({
    where: {
      organizationId: ctx.organization.id,
      status: { in: ["ACTIVE", "ON_HOLD"] },
      OR: [
        { teamAllocations: { some: { employeeId: me, status: { not: "CANCELLED" }, OR: [{ endDate: null }, { endDate: { gte: since } }] } } },
        { tasks: { some: { OR: [{ assignments: { some: { employeeId: me } } }, { makerEmployeeId: me }, { checkerEmployeeId: me }], updatedAt: { gte: since } } } },
        { tasks: { some: { status: { notIn: ["COMPLETED", "CANCELLED"] }, OR: [{ assignments: { some: { employeeId: me, removedAt: null } } }, { makerEmployeeId: me }, { checkerEmployeeId: me }] } } },
        { clientVisits: { some: { employeeId: me, startedAt: { gte: since } } } },
      ],
    },
    orderBy: { tradeName: "asc" },
    select: { id: true, tradeName: true },
  });
  const mine = related.map((c) => ({ value: c.id, label: c.tradeName }));
  if (!can(ctx, "org.manage")) return mine;
  const ids = new Set(related.map((c) => c.id));
  const others = await prisma.client.findMany({ where: { organizationId: ctx.organization.id, status: { in: ["ACTIVE", "ON_HOLD"] }, id: { notIn: [...ids] } }, orderBy: { tradeName: "asc" }, select: { id: true, tradeName: true } });
  return [...mine, ...others.map((c) => ({ value: c.id, label: `${c.tradeName} (not your client)` }))];
}

export async function submitConveyance(ctx: AppContext, v: z.infer<typeof conveyanceSchema>, fd: FormData) {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  const day = dateOnly(v.claimDate);
  const today = todayDateOnly(ctx.organization.timezone);
  if (day > today) throw new BusinessRuleError("The date is in the future. Claim travel after it is done.");
  if (day < addDays(today, -62)) throw new BusinessRuleError("Claims can be made for at most two months back.");
  if (!v.clientId && !v.place) throw new BusinessRuleError("Choose the client, or say where you travelled.");
  const client = v.clientId ? await prisma.client.findFirst({ where: { id: v.clientId, organizationId: ctx.organization.id }, select: { id: true, tradeName: true } }) : null;
  if (v.clientId && !client) throw new BusinessRuleError("Client not found.");
  // Only the person's own (related) clients can be claimed for; administrators may pick any client.
  if (client && !(await conveyanceClientOptions(ctx)).some((o) => o.value === client.id)) throw new BusinessRuleError(`${client.tradeName} is not one of your clients (allocated, with your tasks, or visited). Choose your client, or write the place instead.`);
  const own = isOwnVehicle(v.mode);
  let km = v.km ?? null;
  let totalRunKm: number | null = null;
  let commuteKm: number | null = null;
  let ratePerKm: number | null = null;
  let amount = v.amount ?? 0;
  if (own) {
    const [policy, emp] = await Promise.all([
      prisma.attendancePolicy.findUnique({ where: { organizationId: ctx.organization.id }, select: { conveyanceRatePerKm: true } }),
      prisma.employee.findUniqueOrThrow({ where: { id: ctx.employee.id }, select: { commuteKm: true } }),
    ]);
    if (v.totalRunKm === undefined || v.totalRunKm <= 0) throw new BusinessRuleError("Enter the total run (km) of the day.");
    totalRunKm = v.totalRunKm;
    commuteKm = v.commuteKm ?? (emp.commuteKm ? Number(emp.commuteKm) : 0);
    if (commuteKm > totalRunKm) throw new BusinessRuleError("The home ↔ office km cannot be more than the total run.");
    ratePerKm = policy ? Number(policy.conveyanceRatePerKm) : 4.5;
    ({ km, amount } = conveyanceAmount(totalRunKm, commuteKm, ratePerKm));
    if (amount <= 0) throw new BusinessRuleError("Nothing to claim: the km for office work is 0 (total run less home ↔ office).");
  } else if (!amount || amount <= 0) throw new BusinessRuleError("Enter the fare paid.");
  const bill = fd.get("bill");
  const file = hasFile(bill) ? await storeUpload(ctx, bill, { area: "employees", ownerId: ctx.employee.id }) : null;
  const claim = await prisma.$transaction(async (tx) => {
    const c = await tx.conveyanceClaim.create({
      data: {
        organizationId: ctx.organization.id, employeeId: ctx.employee!.id, claimDate: day, clientId: client?.id, place: v.place, mode: v.mode,
        km, totalRunKm, commuteKm, ratePerKm, amount, purpose: v.purpose, remark: v.remark, billFileId: file?.id,
      },
    });
    if (own && v.rememberCommute && commuteKm !== null) await tx.employee.update({ where: { id: ctx.employee!.id }, data: { commuteKm } });
    await audit(tx, ctx, "conveyance.claimed", "conveyance_claim", c.id);
    await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], {
      type: "conveyance.claimed",
      title: `Conveyance claim from ${ctx.employee!.firstName}: ₹${amount.toLocaleString("en-IN")}`,
      body: `${formatDate(day)} · ${client?.tradeName ?? v.place ?? ""} · ${v.mode}${km ? ` · ${km} km for office` : ""}`,
      link: "/app/payroll?tab=conveyance",
    }, ctx.user.id);
    return c;
  });
  return claim;
}

export async function cancelConveyance(ctx: AppContext, id: string) {
  const c = await prisma.conveyanceClaim.findFirst({ where: { id, employeeId: ctx.employee?.id ?? NO_EMPLOYEE, status: "PENDING" } });
  if (!c) throw new BusinessRuleError("Only your own claims that are still waiting can be withdrawn.");
  await prisma.$transaction(async (tx) => {
    await tx.conveyanceClaim.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(tx, ctx, "conveyance.withdrawn", "conveyance_claim", id);
  });
}

export const conveyanceDecisionSchema = z.object({ decision: z.enum(["approve", "reject"]), note: zOptionalText(500), amount: z.coerce.number().positive().max(1_000_000).optional() });

/** An administrator approves (optionally correcting the amount) or rejects a claim. */
export async function decideConveyance(ctx: AppContext, id: string, v: z.infer<typeof conveyanceDecisionSchema>) {
  if (!can(ctx, "payroll.manage")) throw new BusinessRuleError("Only an administrator can decide conveyance claims.");
  const c = await prisma.conveyanceClaim.findFirst({ where: { id, organizationId: ctx.organization.id } });
  if (!c || c.status === "CANCELLED") throw new BusinessRuleError("Claim not found or withdrawn.");
  if (c.employeeId === ctx.employee?.id && ctx.role !== "OWNER") throw new BusinessRuleError("You cannot approve your own claim.");
  const approve = v.decision === "approve";
  await prisma.$transaction(async (tx) => {
    const res = await tx.conveyanceClaim.updateMany({
      where: { id, status: c.status },
      data: { status: approve ? "APPROVED" : "REJECTED", decidedById: ctx.user.id, decidedAt: new Date(), decisionNote: v.note ?? null, ...(approve && v.amount ? { amount: v.amount } : {}) },
    });
    if (res.count !== 1) throw new BusinessRuleError("The claim was changed by someone else. Refresh the page.");
    await audit(tx, ctx, approve ? "conveyance.approved" : "conveyance.rejected", "conveyance_claim", id);
    await notifyEmployees(tx, ctx.organization.id, [c.employeeId], {
      type: "conveyance.decided",
      title: `Your conveyance claim for ${formatDate(c.claimDate)} was ${approve ? `approved (₹${Number(v.amount ?? c.amount).toLocaleString("en-IN")}, paid with ${c.claimDate.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })} salary)` : "rejected"}`,
      body: v.note,
      link: "/app/payroll?tab=conveyance",
    });
  });
}

export async function myConveyance(ctx: AppContext) {
  if (!ctx.employee) return [];
  return prisma.conveyanceClaim.findMany({
    where: { employeeId: ctx.employee.id },
    orderBy: [{ claimDate: "desc" }, { createdAt: "desc" }],
    take: 60,
    include: { client: { select: { tradeName: true } }, decidedBy: { select: { name: true } } },
  });
}

/** One person's claims of a month, in date order: the SSDA conveyance sheet. */
export async function conveyanceSheet(ctx: AppContext, month: string, employeeId: string) {
  const { start, end } = monthRange(`${month}-01`);
  return prisma.conveyanceClaim.findMany({
    where: { organizationId: ctx.organization.id, employeeId, claimDate: { gte: start, lte: end }, status: { not: "CANCELLED" } },
    orderBy: [{ claimDate: "asc" }, { createdAt: "asc" }],
    include: { client: { select: { tradeName: true } }, employee: { select: { firstName: true, lastName: true } } },
  });
}

/** Claims for the administrators: waiting ones, and the month's decided ones. */
export async function conveyanceForMonth(ctx: AppContext, month: string) {
  const { start, end } = monthRange(`${month}-01`);
  return prisma.conveyanceClaim.findMany({
    where: { organizationId: ctx.organization.id, OR: [{ status: "PENDING" }, { claimDate: { gte: start, lte: end }, status: { in: ["APPROVED", "REJECTED"] } }] },
    orderBy: [{ status: "desc" }, { claimDate: "asc" }],
    take: 500,
    include: { client: { select: { tradeName: true } }, employee: { select: { firstName: true, lastName: true } }, decidedBy: { select: { name: true } } },
  });
}

/** Approved conveyance per employee for a month (paid with that month's salary). */
export async function conveyanceTotals(organizationId: string, month: string, employeeIds?: string[]) {
  const { start, end } = monthRange(`${month}-01`);
  const rows = await prisma.conveyanceClaim.groupBy({
    by: ["employeeId"],
    where: { organizationId, status: "APPROVED", claimDate: { gte: start, lte: end }, ...(employeeIds ? { employeeId: { in: employeeIds } } : {}) },
    _sum: { amount: true },
    _count: true,
  });
  return new Map(rows.map((r) => [r.employeeId, { amount: Number(r._sum.amount ?? 0), count: r._count }]));
}

// ---------------------------------------------------------------- advances

const terms = (a: { amount: unknown; monthlyDeduction: unknown; startMonth: string; closedMonth: string | null }): AdvanceTerms => ({ amount: Number(a.amount), monthlyDeduction: Number(a.monthlyDeduction), startMonth: a.startMonth, closedMonth: a.closedMonth });

/** Advance deduction per employee for a month, with the balance left after it. */
export async function advanceTotals(organizationId: string, month: string, employeeIds?: string[]) {
  const rows = await prisma.employeeAdvance.findMany({ where: { organizationId, startMonth: { lte: month }, ...(employeeIds ? { employeeId: { in: employeeIds } } : {}) } });
  const out = new Map<string, { deduction: number; balance: number }>();
  for (const r of rows) {
    const x = advanceInMonth(terms(r), month);
    const g = out.get(r.employeeId) ?? { deduction: 0, balance: 0 };
    g.deduction = Math.round((g.deduction + x.deduction) * 100) / 100;
    g.balance = Math.round((g.balance + x.after) * 100) / 100;
    out.set(r.employeeId, g);
  }
  return out;
}

/** Advances of one person with this month's deduction and the balance (for the payslip and the admin list). */
export async function advancesOf(organizationId: string, employeeId: string | null, month: string) {
  const rows = await prisma.employeeAdvance.findMany({
    where: { organizationId, ...(employeeId ? { employeeId } : {}) },
    orderBy: [{ givenOn: "desc" }],
    include: { employee: { select: { firstName: true, lastName: true } }, createdBy: { select: { name: true } } },
  });
  return rows.map((r) => {
    const t = terms(r);
    const now = advanceInMonth(t, month);
    const recovered = month < t.startMonth ? 0 : Math.round((t.amount - now.before) * 100) / 100;
    return { ...r, amount: t.amount, monthlyDeduction: t.monthlyDeduction, thisMonth: now.deduction, balanceAfter: now.after, recoveredBefore: recovered, settled: now.before <= 0 || (!!t.closedMonth && month >= t.closedMonth) };
  });
}

export const advanceSchema = z.object({
  employeeId: z.uuid("Select a team member"),
  givenOn: zIsoDate,
  amount: money,
  monthlyDeduction: money,
  startMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose the first month to deduct"),
  note: zOptionalText(500),
});

export async function addAdvance(ctx: AppContext, v: z.infer<typeof advanceSchema>) {
  if (!can(ctx, "payroll.manage")) throw new BusinessRuleError("Only an administrator can record advances.");
  const emp = await prisma.employee.findFirst({ where: { id: v.employeeId, organizationId: ctx.organization.id }, select: { id: true, firstName: true } });
  if (!emp) throw new BusinessRuleError("Team member not found.");
  if (v.monthlyDeduction > v.amount) throw new BusinessRuleError("The monthly deduction cannot be more than the advance.");
  if (v.startMonth < v.givenOn.slice(0, 7)) throw new BusinessRuleError("Deductions cannot start before the month the advance was given.");
  await prisma.$transaction(async (tx) => {
    const a = await tx.employeeAdvance.create({
      data: { organizationId: ctx.organization.id, employeeId: emp.id, givenOn: dateOnly(v.givenOn), amount: v.amount, monthlyDeduction: v.monthlyDeduction, startMonth: v.startMonth, note: v.note, createdById: ctx.user.id },
    });
    await audit(tx, ctx, "payroll.advance_given", "employee", emp.id, { advanceId: a.id });
    const months = Math.ceil(v.amount / v.monthlyDeduction);
    await notifyEmployees(tx, ctx.organization.id, [emp.id], {
      type: "payroll.advance",
      title: `Advance of ₹${v.amount.toLocaleString("en-IN")} recorded`,
      body: `₹${v.monthlyDeduction.toLocaleString("en-IN")} a month is deducted from your salary from ${monthLabel(v.startMonth)} (${months} month${months === 1 ? "" : "s"}).`,
      link: "/app/payroll",
    });
  });
  return emp.firstName;
}

export const advanceEditSchema = z.object({ monthlyDeduction: money, note: zOptionalText(500), close: z.enum(["", "close", "reopen"]).optional() });

/** Change the EMI (from the next unpaid month the schedule recalculates), or close / reopen the advance. */
export async function editAdvance(ctx: AppContext, id: string, v: z.infer<typeof advanceEditSchema>, month: string) {
  if (!can(ctx, "payroll.manage")) throw new BusinessRuleError("Only an administrator can change advances.");
  const a = await prisma.employeeAdvance.findFirst({ where: { id, organizationId: ctx.organization.id } });
  if (!a) throw new BusinessRuleError("Advance not found.");
  if (v.monthlyDeduction > Number(a.amount)) throw new BusinessRuleError("The monthly deduction cannot be more than the advance.");
  await prisma.$transaction(async (tx) => {
    await tx.employeeAdvance.update({
      where: { id },
      data: { monthlyDeduction: v.monthlyDeduction, note: v.note ?? null, ...(v.close === "close" ? { closedMonth: month } : v.close === "reopen" ? { closedMonth: null } : {}) },
    });
    await audit(tx, ctx, "payroll.advance_changed", "employee", a.employeeId, { advanceId: id, close: v.close ?? null });
  });
}

export async function deleteAdvance(ctx: AppContext, id: string) {
  if (!can(ctx, "payroll.manage")) throw new BusinessRuleError("Only an administrator can remove advances.");
  const a = await prisma.employeeAdvance.findFirst({ where: { id, organizationId: ctx.organization.id } });
  if (!a) throw new BusinessRuleError("Advance not found.");
  await prisma.$transaction(async (tx) => {
    await tx.employeeAdvance.delete({ where: { id } });
    await audit(tx, ctx, "payroll.advance_removed", "employee", a.employeeId, { advanceId: id });
  });
}

export const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
export const isoMonth = (d: Date) => toIsoDate(d).slice(0, 7);
