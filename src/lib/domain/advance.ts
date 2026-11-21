// Salary advance recovery (tracker S.No. 85): pure, no database access.

export type AdvanceTerms = { amount: number; monthlyDeduction: number; startMonth: string; closedMonth: string | null };
const nextMonth = (m: string) => { const [y, mo] = m.split("-").map(Number); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`; };

/**
 * One advance in a month: the deduction (EMI, or the rest if less) and the balance before and after.
 * Deducted every month from `startMonth` until recovered; nothing from `closedMonth` on.
 */
export function advanceInMonth(a: AdvanceTerms, month: string): { deduction: number; before: number; after: number } {
  let balance = a.amount;
  for (let m = a.startMonth; m < month; m = nextMonth(m)) {
    if (a.closedMonth && m >= a.closedMonth) return { deduction: 0, before: balance, after: balance };
    balance = Math.max(0, Math.round((balance - Math.min(a.monthlyDeduction, balance)) * 100) / 100);
    if (balance <= 0) return { deduction: 0, before: 0, after: 0 };
  }
  if (month < a.startMonth || (a.closedMonth && month >= a.closedMonth)) return { deduction: 0, before: balance, after: balance };
  const deduction = Math.min(a.monthlyDeduction, balance);
  return { deduction, before: balance, after: Math.round((balance - deduction) * 100) / 100 };
}

