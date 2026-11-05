// Monthly pay from attendance (pure). The firm's two policy versions conflict, so the
// result stays "provisional" until the policy is confirmed in Settings. Sundays are paid;
// every other working day needs attendance or leave. Paid leave beyond the monthly
// allowance, unpaid leave, absences and half days reduce the payable days.

export type PayrollInput = {
  monthlySalary: number | null;
  /** Calendar days in the month. */
  daysInMonth: number;
  /** Days of the month that have passed (equals daysInMonth for a finished month). */
  elapsedDays: number;
  /** Sundays among the elapsed days. */
  sundays: number;
  present: number;
  halfDays: number;
  /** Leave days covered by an approved paid request or marked L. */
  paidLeave: number;
  unpaidLeave: number;
  absent: number;
  paidLeaveAllowance: number;
};

export type PayrollResult = {
  /** Working days passed with no attendance and no leave at all. */
  unmarked: number;
  /** Paid leave taken beyond the allowance. */
  excessLeave: number;
  unpaidDays: number;
  payableDays: number;
  perDay: number | null;
  gross: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computePayroll(p: PayrollInput): PayrollResult {
  const accounted = p.present + p.halfDays + p.paidLeave + p.unpaidLeave + p.absent;
  const unmarked = Math.max(0, p.elapsedDays - p.sundays - accounted);
  const excessLeave = Math.max(0, p.paidLeave - p.paidLeaveAllowance);
  const unpaidDays = p.absent + unmarked + p.unpaidLeave + excessLeave + p.halfDays * 0.5;
  const payableDays = Math.max(0, p.elapsedDays - unpaidDays);
  if (p.monthlySalary === null) return { unmarked, excessLeave, unpaidDays, payableDays, perDay: null, gross: null };
  const perDay = p.monthlySalary / p.daysInMonth;
  return { unmarked, excessLeave, unpaidDays, payableDays, perDay: round2(perDay), gross: round2(perDay * payableDays) };
}

/** Annual salary records are converted to a monthly figure. */
export function monthlyAmount(amount: number, period: "MONTHLY" | "ANNUAL") {
  return period === "ANNUAL" ? round2(amount / 12) : amount;
}
