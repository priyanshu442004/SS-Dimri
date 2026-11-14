// Salary helpers (pure). Monthly pay itself is worked out under the Leave, Timing and Office
// Decorum rules in lib/domain/attendance-policy.ts (scoreMonth + computePay).

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Annual salary records are converted to a monthly figure. */
export function monthlyAmount(amount: number, period: "MONTHLY" | "ANNUAL") {
  return period === "ANNUAL" ? round2(amount / 12) : amount;
}
