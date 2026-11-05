import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zIsoDate, zOptionalText } from "@/lib/actions";
import { addDays, dateOnly, monthRange, toIsoDate, todayDateOnly } from "@/lib/dates";
import { computePayroll, monthlyAmount, type PayrollResult } from "@/lib/domain/payroll";
import type { AppContext } from "@/lib/session";
import { getPolicy } from "./attendance";
import { audit } from "./audit";

export type PayrollRow = PayrollResult & {
  employeeId: string;
  name: string;
  code: string;
  designation: string | null;
  department: string | null;
  monthlySalary: number | null;
  salaryMode: string | null;
  present: number;
  halfDays: number;
  paidLeave: number;
  unpaidLeave: number;
  absent: number;
};

export function validMonth(v: unknown, today: string) {
  return typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : today.slice(0, 7);
}

/**
 * Pay for a month, worked out from attendance and approved leave. Limited to one person
 * for a personal statement. The month's latest salary record applies. Leave that is
 * approved but has no attendance mark counts as leave; a mark on the day takes precedence.
 */
export async function payrollForMonth(ctx: AppContext, month: string, onlyEmployeeId?: string) {
  const organizationId = ctx.organization.id;
  const { start, end } = monthRange(`${month}-01`);
  const today = todayDateOnly(ctx.organization.timezone);
  const lastCounted = end < today ? end : today;
  const { row: policy } = await getPolicy(organizationId);
  const notStarted = start > today;

  const [employees, records, leaves] = await Promise.all([
    prisma.employee.findMany({
      where: {
        organizationId,
        approvalStatus: "APPROVED",
        ...(onlyEmployeeId ? { id: onlyEmployeeId } : { employmentStatus: { not: "EXITED" } }),
      },
      orderBy: { firstName: "asc" },
      select: {
        id: true, firstName: true, lastName: true, permanentEmployeeCode: true, temporaryEmployeeCode: true, dateOfJoining: true,
        designation: { select: { name: true } }, department: { select: { name: true } },
        salaryRecords: { where: { effectiveFrom: { lte: end } }, orderBy: { effectiveFrom: "desc" }, take: 1, select: { agreedSalary: true, salaryPeriod: true, salaryMode: true } },
      },
    }),
    prisma.attendanceRecord.findMany({ where: { organizationId, attendanceDate: { gte: start, lte: end } }, select: { employeeId: true, attendanceDate: true, status: true } }),
    prisma.leaveRequest.findMany({ where: { organizationId, status: "APPROVED", fromDate: { lte: end }, toDate: { gte: start } }, select: { employeeId: true, fromDate: true, toDate: true, isPaid: true, isHalfDay: true } }),
  ]);

  const daysInMonth = end.getUTCDate();
  const elapsedDays = notStarted ? 0 : lastCounted.getUTCDate();
  let sundays = 0;
  if (!notStarted) for (let d = start; d <= lastCounted; d = addDays(d, 1)) if (d.getUTCDay() === 0) sundays++;

  const rows: PayrollRow[] = employees.map((e) => {
    const mine = records.filter((r) => r.employeeId === e.id && r.attendanceDate <= lastCounted);
    const marked = new Set(mine.map((r) => toIsoDate(r.attendanceDate)));
    const present = mine.filter((r) => r.status === "PRESENT" && r.attendanceDate.getUTCDay() !== 0).length;
    const halfDays = mine.filter((r) => r.status === "HALF_DAY").length;
    const absent = mine.filter((r) => r.status === "ABSENT").length;
    let paidLeave = mine.filter((r) => r.status === "LEAVE").length;
    let unpaidLeave = 0;
    for (const l of leaves.filter((x) => x.employeeId === e.id)) {
      for (let d = l.fromDate < start ? start : l.fromDate; d <= l.toDate && d <= lastCounted; d = addDays(d, 1)) {
        if (d.getUTCDay() === 0 || marked.has(toIsoDate(d))) continue;
        const days = l.isHalfDay ? 0.5 : 1;
        if (l.isPaid) paidLeave += days;
        else unpaidLeave += days;
      }
    }
    const salary = e.salaryRecords[0];
    const monthlySalary = salary ? monthlyAmount(Number(salary.agreedSalary), salary.salaryPeriod) : null;
    const result = computePayroll({ monthlySalary, daysInMonth, elapsedDays, sundays, present, halfDays, paidLeave, unpaidLeave, absent, paidLeaveAllowance: Number(policy.paidLeavesPerMonth) });
    return {
      ...result,
      employeeId: e.id,
      name: `${e.firstName} ${e.lastName ?? ""}`.trim(),
      code: e.permanentEmployeeCode ?? e.temporaryEmployeeCode,
      designation: e.designation?.name ?? null,
      department: e.department?.name ?? null,
      monthlySalary,
      salaryMode: salary?.salaryMode ?? null,
      present,
      halfDays,
      paidLeave,
      unpaidLeave,
      absent,
    };
  });

  return { rows, daysInMonth, elapsedDays, complete: elapsedDays === daysInMonth, notStarted, policyConfirmed: policy.policyConfirmed, paidLeaveAllowance: Number(policy.paidLeavesPerMonth) };
}

export const salarySchema = z.object({
  employeeId: z.uuid("Select a team member"),
  agreedSalary: z.coerce.number("Enter the salary").positive("Enter the salary").max(100_000_000),
  salaryPeriod: z.enum(["MONTHLY", "ANNUAL"]).default("MONTHLY"),
  effectiveFrom: zIsoDate,
  salaryMode: z.enum(["TRANSFER", "CASH"]).optional(),
  incrementNotes: zOptionalText(500),
});

export async function setSalary(ctx: AppContext, v: z.infer<typeof salarySchema>) {
  const emp = await prisma.employee.findFirst({ where: { id: v.employeeId, organizationId: ctx.organization.id }, select: { id: true } });
  if (!emp) throw new BusinessRuleError("Employee not found.");
  await prisma.$transaction(async (tx) => {
    const r = await tx.employeeSalaryRecord.create({
      data: { employeeId: emp.id, agreedSalary: v.agreedSalary, salaryPeriod: v.salaryPeriod, effectiveFrom: dateOnly(v.effectiveFrom), salaryMode: v.salaryMode, incrementNotes: v.incrementNotes, createdById: ctx.user.id },
    });
    // Amounts are kept out of the audit log; who changed it and when is what matters there.
    await audit(tx, ctx, "payroll.salary_set", "employee", emp.id, { salaryRecordId: r.id });
  });
}
