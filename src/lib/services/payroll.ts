import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zIsoDate, zOptionalText } from "@/lib/actions";
import { addDays, dateOnly, isoDateInTz, minutesOfDayInTz, monthRange, toIsoDate, todayDateOnly } from "@/lib/dates";
import { computePay, scoreMonth, type DayInput, type MonthScore, type Pay } from "@/lib/domain/attendance-policy";
import { monthlyAmount } from "@/lib/domain/payroll";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { advanceTotals, conveyanceTotals } from "./claims";
import { finesForMonth, type Fines } from "./daily-plans";
import { notifyEmployees } from "./notifications";
import { getPolicy, holidaySet, isOffDay, scheduleOf } from "./office-rules";

export type PayrollRow = {
  employeeId: string;
  name: string;
  code: string;
  designation: string | null;
  department: string | null;
  monthlySalary: number | null;
  salaryMode: string | null;
  /** Fixed monthly allowance in force for the month (SSDA salary slip). */
  fixedAllowance: number;
  dateOfJoining: Date | null;
  score: MonthScore;
  pay: Pay;
  fines: Fines;
  /** Advance balance left after this month's deduction. */
  advanceBalance: number;
  conveyanceClaims: number;
};

export function validMonth(v: unknown, today: string) {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : today.slice(0, 7);
}

const PAD = 7; // days either side, so a Sunday on the month's edge is judged with its neighbours

/**
 * Pay for a month under the Leave, Timing and Office Decorum rules (lib/domain/attendance-policy).
 * Limited to one person for a payslip. The month's latest salary record applies. The firm owner
 * is not on the payroll: the rules do not apply to them.
 */
export async function payrollForMonth(ctx: AppContext, month: string, onlyEmployeeId?: string) {
  const organizationId = ctx.organization.id;
  const tz = ctx.organization.timezone;
  const { start, end } = monthRange(`${month}-01`);
  const from = addDays(start, -PAD);
  const to = addDays(end, PAD);
  const today = todayDateOnly(tz);
  const todayIso = toIsoDate(today);
  const now = new Date();
  const nowMin = minutesOfDayInTz(now, tz);
  const policy = await getPolicy(organizationId);
  const owners = await prisma.organizationMembership.findMany({ where: { organizationId, role: "OWNER", employeeId: { not: null } }, select: { employeeId: true } });
  const ownerIds = owners.map((o) => o.employeeId!);

  const [employees, records, leaves, requested, forms, holidays, fines, conveyance, advances] = await Promise.all([
    prisma.employee.findMany({
      where: {
        organizationId,
        approvalStatus: "APPROVED",
        ...(onlyEmployeeId ? { id: onlyEmployeeId } : { employmentStatus: { not: "EXITED" }, id: { notIn: ownerIds } }),
      },
      orderBy: { firstName: "asc" },
      select: {
        id: true, firstName: true, lastName: true, permanentEmployeeCode: true, temporaryEmployeeCode: true, dateOfJoining: true, exitDate: true,
        attendanceProfile: true, siteReportingTime: true, siteDayMinutes: true,
        designation: { select: { name: true } }, department: { select: { name: true } },
        salaryRecords: { where: { effectiveFrom: { lte: end } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }], take: 1, select: { agreedSalary: true, salaryPeriod: true, salaryMode: true, fixedAllowance: true } },
      },
    }),
    prisma.attendanceRecord.findMany({ where: { organizationId, attendanceDate: { gte: from, lte: to } }, select: { employeeId: true, attendanceDate: true, status: true, timeIn: true, timeOut: true, autoAbsentAt: true, markedOnRequest: true, scheduledStart: true, scheduledEnd: true } }),
    prisma.leaveRequest.findMany({ where: { organizationId, status: "APPROVED", fromDate: { lte: to }, toDate: { gte: from } }, select: { employeeId: true, fromDate: true, toDate: true, isPaid: true, isHalfDay: true, withIntimation: true } }),
    prisma.leaveRequest.findMany({ where: { organizationId, status: { in: ["PENDING", "REJECTED"] }, fromDate: { lte: to }, toDate: { gte: from } }, select: { employeeId: true, fromDate: true, toDate: true } }),
    prisma.attendanceRequest.findMany({ where: { organizationId, requestDate: { gte: from, lte: to }, status: { in: ["PENDING", "APPROVED"] } }, select: { employeeId: true, requestDate: true, kind: true, status: true, inAdvance: true } }),
    holidaySet(organizationId, from, to),
    finesForMonth(organizationId, tz, month, policy),
    conveyanceTotals(organizationId, month, onlyEmployeeId ? [onlyEmployeeId] : undefined),
    advanceTotals(organizationId, month, onlyEmployeeId ? [onlyEmployeeId] : undefined),
  ]);

  const recBy = new Map(records.map((r) => [`${r.employeeId}|${toIsoDate(r.attendanceDate)}`, r]));
  const formBy = new Map<string, typeof forms>();
  for (const f of forms) {
    const k = `${f.employeeId}|${toIsoDate(f.requestDate)}`;
    formBy.set(k, [...(formBy.get(k) ?? []), f]);
  }
  const daysInMonth = end.getUTCDate();
  const complete = end < today;

  const rows: PayrollRow[] = employees.map((e) => {
    const days: (DayInput & { inMonth: boolean })[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const iso = toIsoDate(d);
      const key = `${e.id}|${iso}`;
      const rec = recBy.get(key) ?? null;
      const schedule = scheduleOf(policy, e, rec);
      const leave = leaves.find((l) => l.employeeId === e.id && l.fromDate <= d && l.toDate >= d);
      const f = formBy.get(key) ?? [];
      days.push({
        iso,
        inMonth: d >= start && d <= end,
        // A Sunday / holiday, or an approved weekly off on another day (tracker S.No. 79).
        off: isOffDay(iso, holidays) || f.some((x) => x.kind === "WEEKLY_OFF" && x.status === "APPROVED"),
        employed: (!e.dateOfJoining || e.dateOfJoining <= d) && (!e.exitDate || e.exitDate >= d),
        // Today is counted once the person is in, or after the absent cut-off.
        future: iso > todayIso || (iso === todayIso && !rec && nowMin < schedule.absentAt),
        record: rec ? { status: rec.status, timeIn: rec.timeIn, timeOut: rec.timeOut, autoAbsent: !!rec.autoAbsentAt, markedOnRequest: rec.markedOnRequest } : null,
        schedule,
        leave: leave ? { paid: leave.isPaid, halfDay: leave.isHalfDay, withIntimation: leave.withIntimation } : null,
        // A leave request, or a "please mark my attendance" request: the absence was raised in the ERP.
        requested: requested.some((l) => l.employeeId === e.id && l.fromDate <= d && l.toDate >= d) || f.some((x) => x.kind === "MARK_ATTENDANCE"),
        lateIntimated: f.some((x) => x.kind === "LATE_ARRIVAL" && x.inAdvance),
        earlyLeaveApproved: f.some((x) => x.kind === "EARLY_LEAVE" && x.status === "APPROVED"),
        overtimeApproved: f.some((x) => x.kind === "OVERTIME" && x.status === "APPROVED"),
        offDayWorkApproved: f.some((x) => x.kind === "OFF_DAY_WORK" && x.status === "APPROVED"),
      });
    }
    const score = scoreMonth(days, policy.numbers, tz);
    const salary = e.salaryRecords[0];
    const monthlySalary = salary ? monthlyAmount(Number(salary.agreedSalary), salary.salaryPeriod) : null;
    const fine = fines.get(e.id) ?? { eodMissed: [], leadMissed: [], amount: 0 };
    const fullMonth = (!e.dateOfJoining || e.dateOfJoining <= start) && (!e.exitDate || e.exitDate >= end);
    const conv = conveyance.get(e.id);
    const adv = advances.get(e.id);
    const fixedAllowance = salary?.fixedAllowance ? Number(salary.fixedAllowance) : 0;
    const pay = computePay({ monthlySalary, daysInMonth, complete, fullMonth, score, fines: fine.amount, conveyance: conv?.amount ?? 0, advanceDeduction: adv?.deduction ?? 0, fixedAllowance }, policy.numbers);
    return {
      employeeId: e.id,
      name: `${e.firstName} ${e.lastName ?? ""}`.trim(),
      code: e.permanentEmployeeCode ?? e.temporaryEmployeeCode,
      designation: e.designation?.name ?? null,
      department: e.department?.name ?? null,
      monthlySalary,
      salaryMode: salary?.salaryMode ?? null,
      fixedAllowance,
      dateOfJoining: e.dateOfJoining,
      score,
      pay,
      fines: fine,
      advanceBalance: adv?.balance ?? 0,
      conveyanceClaims: conv?.count ?? 0,
    };
  });

  return {
    rows, daysInMonth, complete, notStarted: start > today, policy,
    paidLeaveAllowance: policy.numbers.paidLeavesPerMonth, isOwner: !!onlyEmployeeId && ownerIds.includes(onlyEmployeeId),
  };
}

// ---------------------------------------------------------------- salaries (who fixes and changes them)

/**
 * Whose salaries this member may see and change: administrators (and anyone given the payroll
 * right) everyone; managers the people under them, directly or through their team leads.
 * Nobody but the owner changes their own salary.
 */
export async function salaryScope(ctx: AppContext): Promise<string[] | "ALL"> {
  if (can(ctx, "payroll.manage")) return "ALL";
  if (!can(ctx, "payroll.salaries") || !ctx.employee) return [];
  const rels = await prisma.employeeReportingRelationship.findMany({ where: { employee: { organizationId: ctx.organization.id } }, select: { employeeId: true, managerId: true } });
  const under = new Set<string>();
  let frontier = [ctx.employee.id];
  while (frontier.length) {
    const next = rels.filter((r) => frontier.includes(r.managerId) && !under.has(r.employeeId) && r.employeeId !== ctx.employee!.id).map((r) => r.employeeId);
    next.forEach((id) => under.add(id));
    frontier = next;
  }
  return [...under];
}

async function assertSalaryAccess(ctx: AppContext, employeeId: string) {
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, organizationId: ctx.organization.id }, select: { id: true, firstName: true, lastName: true } });
  if (!emp) throw new BusinessRuleError("Team member not found.");
  if (employeeId === ctx.employee?.id && ctx.role !== "OWNER") throw new BusinessRuleError("You cannot change your own salary. Ask the owner or an administrator.");
  const scope = await salaryScope(ctx);
  if (scope !== "ALL" && !scope.includes(employeeId)) throw new BusinessRuleError("You can change salaries only for people in your team.");
  return emp;
}

export type SalaryOverviewRow = {
  id: string;
  name: string;
  code: string;
  designation: string | null;
  current: { amount: number; period: string; monthly: number; from: Date; mode: string | null; allowance: number } | null;
  /** The salary before the current one, and the change (tracker S.No. 103: last / current / % increment). */
  previous: { monthly: number; from: Date; until: Date } | null;
  increment: { amount: number; percent: number | null } | null;
  upcoming: { amount: number; monthly: number; from: Date } | null;
  committed: { date: Date | null; amount: number | null; percent: number | null } | null;
  changes: number;
};

/** Current salary of everyone this member may manage, with any change already scheduled. */
export async function salaryOverview(ctx: AppContext): Promise<SalaryOverviewRow[]> {
  const scope = await salaryScope(ctx);
  if (scope !== "ALL" && !scope.length) return [];
  const today = todayDateOnly(ctx.organization.timezone);
  const employees = await prisma.employee.findMany({
    where: { organizationId: ctx.organization.id, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" }, ...(scope === "ALL" ? {} : { id: { in: scope } }) },
    orderBy: { firstName: "asc" },
    select: {
      id: true, firstName: true, lastName: true, permanentEmployeeCode: true, temporaryEmployeeCode: true, designation: { select: { name: true } },
      salaryRecords: { orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] },
    },
  });
  return employees.map((e) => {
    const cur = e.salaryRecords.find((r) => r.effectiveFrom <= today) ?? null;
    const up = e.salaryRecords.filter((r) => r.effectiveFrom > today).at(-1) ?? null;
    const commit = cur && (cur.committedIncrementDate || cur.committedIncrementAmount || cur.committedIncrementPercent) ? cur : null;
    const curIdx = cur ? e.salaryRecords.indexOf(cur) : -1;
    const prev = curIdx >= 0 ? e.salaryRecords.slice(curIdx + 1).find((r) => r.effectiveFrom < cur!.effectiveFrom) ?? null : null;
    const curMonthly = cur ? monthlyAmount(Number(cur.agreedSalary), cur.salaryPeriod) : null;
    const prevMonthly = prev ? monthlyAmount(Number(prev.agreedSalary), prev.salaryPeriod) : null;
    return {
      id: e.id,
      name: `${e.firstName} ${e.lastName ?? ""}`.trim(),
      code: e.permanentEmployeeCode ?? e.temporaryEmployeeCode,
      designation: e.designation?.name ?? null,
      current: cur ? { amount: Number(cur.agreedSalary), period: cur.salaryPeriod, monthly: curMonthly!, from: cur.effectiveFrom, mode: cur.salaryMode, allowance: cur.fixedAllowance ? Number(cur.fixedAllowance) : 0 } : null,
      previous: prev ? { monthly: prevMonthly!, from: prev.effectiveFrom, until: new Date(cur!.effectiveFrom.getTime() - 86_400_000) } : null,
      increment: prevMonthly !== null && curMonthly !== null ? { amount: Math.round((curMonthly - prevMonthly) * 100) / 100, percent: prevMonthly ? Math.round(((curMonthly - prevMonthly) / prevMonthly) * 1000) / 10 : null } : null,
      upcoming: up ? { amount: Number(up.agreedSalary), monthly: monthlyAmount(Number(up.agreedSalary), up.salaryPeriod), from: up.effectiveFrom } : null,
      committed: commit ? { date: commit.committedIncrementDate, amount: commit.committedIncrementAmount ? Number(commit.committedIncrementAmount) : null, percent: commit.committedIncrementPercent ? Number(commit.committedIncrementPercent) : null } : null,
      changes: e.salaryRecords.length,
    };
  });
}

/** Salary history of one person (newest first), with what changed each time. */
export async function salaryHistory(ctx: AppContext, employeeId: string, opts: { own?: boolean } = {}) {
  if (!opts.own) await assertSalaryAccess(ctx, employeeId);
  const rows = await prisma.employeeSalaryRecord.findMany({
    where: { employeeId, employee: { organizationId: ctx.organization.id } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    include: { createdBy: { select: { name: true } } },
  });
  return rows.map((r, i) => {
    const prev = rows[i + 1];
    const monthly = monthlyAmount(Number(r.agreedSalary), r.salaryPeriod);
    const before = prev ? monthlyAmount(Number(prev.agreedSalary), prev.salaryPeriod) : null;
    return {
      id: r.id, effectiveFrom: r.effectiveFrom, amount: Number(r.agreedSalary), period: r.salaryPeriod, monthly, mode: r.salaryMode, notes: r.incrementNotes,
      allowance: r.fixedAllowance ? Number(r.fixedAllowance) : 0, previous: before,
      by: r.createdBy?.name ?? null, at: r.createdAt,
      change: before === null ? null : { amount: Math.round((monthly - before) * 100) / 100, percent: before ? Math.round(((monthly - before) / before) * 1000) / 10 : null },
      committed: { date: r.committedIncrementDate, amount: r.committedIncrementAmount ? Number(r.committedIncrementAmount) : null, percent: r.committedIncrementPercent ? Number(r.committedIncrementPercent) : null },
    };
  });
}

const money = z.coerce.number("Enter an amount").positive("Enter an amount").max(100_000_000);

export const salarySchema = z.object({
  employeeId: z.uuid("Select a team member"),
  /** set = enter the new salary; percent / amount = increase the current one. */
  change: z.enum(["set", "percent", "amount"]).default("set"),
  agreedSalary: money.optional(),
  increasePercent: z.coerce.number().min(-90, "Enter a percentage").max(500).optional(),
  increaseAmount: z.coerce.number().min(-100_000_000).max(100_000_000).optional(),
  salaryPeriod: z.enum(["MONTHLY", "ANNUAL"]).default("MONTHLY"),
  effectiveFrom: zIsoDate,
  salaryMode: z.enum(["TRANSFER", "CASH"]).optional(),
  /** Fixed monthly allowance (₹); blank = the allowance in force before (if any). */
  fixedAllowance: z.coerce.number().min(0).max(10_000_000).optional(),
  incrementNotes: zOptionalText(500),
  committedIncrementDate: zIsoDate.optional(),
  committedIncrementPercent: z.coerce.number().min(0).max(500).optional(),
  committedIncrementAmount: z.coerce.number().min(0).max(100_000_000).optional(),
});

/** New salary record. An increase is worked out from the salary in force on the effective date. */
export async function setSalary(ctx: AppContext, v: z.infer<typeof salarySchema>) {
  const emp = await assertSalaryAccess(ctx, v.employeeId);
  const effective = dateOnly(v.effectiveFrom);
  const base = await prisma.employeeSalaryRecord.findFirst({ where: { employeeId: emp.id, effectiveFrom: { lte: effective } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
  let amount: number;
  let period = v.salaryPeriod;
  if (v.change === "set") {
    if (!v.agreedSalary) throw new BusinessRuleError("Enter the salary.");
    amount = v.agreedSalary;
  } else {
    if (!base) throw new BusinessRuleError("There is no salary yet to increase. Enter the salary first.");
    period = base.salaryPeriod;
    const current = Number(base.agreedSalary);
    if (v.change === "percent") {
      if (v.increasePercent === undefined || v.increasePercent === 0) throw new BusinessRuleError("Enter the increase in %.");
      amount = current * (1 + v.increasePercent / 100);
    } else {
      if (v.increaseAmount === undefined || v.increaseAmount === 0) throw new BusinessRuleError("Enter the increase in ₹.");
      amount = current + (period === "ANNUAL" ? v.increaseAmount * 12 : v.increaseAmount);
    }
  }
  amount = Math.round(amount * 100) / 100;
  if (amount <= 0) throw new BusinessRuleError("The salary must be more than zero.");
  const same = await prisma.employeeSalaryRecord.findFirst({ where: { employeeId: emp.id, effectiveFrom: effective } });
  if (same) throw new BusinessRuleError(`There is already a salary from ${v.effectiveFrom}. Edit that entry in the history instead.`);
  await prisma.$transaction(async (tx) => {
    const r = await tx.employeeSalaryRecord.create({
      data: {
        employeeId: emp.id, agreedSalary: amount, salaryPeriod: period, effectiveFrom: effective, salaryMode: v.salaryMode ?? base?.salaryMode ?? undefined,
        fixedAllowance: v.fixedAllowance ?? base?.fixedAllowance ?? null,
        incrementNotes: v.incrementNotes,
        committedIncrementDate: v.committedIncrementDate ? dateOnly(v.committedIncrementDate) : null,
        committedIncrementPercent: v.committedIncrementPercent ?? null,
        committedIncrementAmount: v.committedIncrementAmount ?? null,
        createdById: ctx.user.id,
      },
    });
    // Amounts are kept out of the audit log; who changed it and when is what matters there.
    await audit(tx, ctx, v.change === "set" ? "payroll.salary_set" : "payroll.salary_increased", "employee", emp.id, { salaryRecordId: r.id });
    await notifyEmployees(tx, ctx.organization.id, [emp.id], {
      type: "payroll.salary_changed",
      title: base ? "Your salary has been revised" : "Your salary has been entered",
      body: `Effective from ${v.effectiveFrom}. See it on your payslip.`,
      link: "/app/payroll",
    });
  });
  return { name: `${emp.firstName} ${emp.lastName ?? ""}`.trim(), amount, period };
}

export const salaryEditSchema = z.object({
  agreedSalary: money,
  salaryPeriod: z.enum(["MONTHLY", "ANNUAL"]),
  effectiveFrom: zIsoDate,
  salaryMode: z.enum(["TRANSFER", "CASH"]).optional(),
  fixedAllowance: z.coerce.number().min(0).max(10_000_000).optional(),
  incrementNotes: zOptionalText(500),
  committedIncrementDate: zIsoDate.optional(),
  committedIncrementPercent: z.coerce.number().min(0).max(500).optional(),
  committedIncrementAmount: z.coerce.number().min(0).max(100_000_000).optional(),
});

/** Correct a salary entry (a typing mistake, a wrong date). */
export async function editSalary(ctx: AppContext, recordId: string, v: z.infer<typeof salaryEditSchema>) {
  const r = await prisma.employeeSalaryRecord.findFirst({ where: { id: recordId, employee: { organizationId: ctx.organization.id } } });
  if (!r) throw new BusinessRuleError("Salary entry not found.");
  await assertSalaryAccess(ctx, r.employeeId);
  const clash = await prisma.employeeSalaryRecord.findFirst({ where: { employeeId: r.employeeId, effectiveFrom: dateOnly(v.effectiveFrom), id: { not: r.id } } });
  if (clash) throw new BusinessRuleError(`Another entry already starts on ${v.effectiveFrom}.`);
  await prisma.$transaction(async (tx) => {
    await tx.employeeSalaryRecord.update({
      where: { id: r.id },
      data: {
        agreedSalary: v.agreedSalary, salaryPeriod: v.salaryPeriod, effectiveFrom: dateOnly(v.effectiveFrom), salaryMode: v.salaryMode ?? null, incrementNotes: v.incrementNotes ?? null,
        fixedAllowance: v.fixedAllowance ?? null,
        committedIncrementDate: v.committedIncrementDate ? dateOnly(v.committedIncrementDate) : null,
        committedIncrementPercent: v.committedIncrementPercent ?? null,
        committedIncrementAmount: v.committedIncrementAmount ?? null,
      },
    });
    await audit(tx, ctx, "payroll.salary_corrected", "employee", r.employeeId, { salaryRecordId: r.id });
  });
}

/** Remove a salary entry made by mistake. Earlier entries apply again. */
export async function deleteSalary(ctx: AppContext, recordId: string) {
  const r = await prisma.employeeSalaryRecord.findFirst({ where: { id: recordId, employee: { organizationId: ctx.organization.id } } });
  if (!r) throw new BusinessRuleError("Salary entry not found.");
  await assertSalaryAccess(ctx, r.employeeId);
  await prisma.$transaction(async (tx) => {
    await tx.employeeSalaryRecord.delete({ where: { id: r.id } });
    await audit(tx, ctx, "payroll.salary_removed", "employee", r.employeeId, { salaryRecordId: r.id });
  });
}

export const todayInFirm = (ctx: AppContext) => isoDateInTz(new Date(), ctx.organization.timezone);
