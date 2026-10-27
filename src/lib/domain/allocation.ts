// Team-allocation conflict detection (pure). An allocation without a
// percentage is treated as full-time (100%). A conflict exists on any day where
// an employee's combined allocation exceeds 100%.

export type AllocationSpan = {
  id?: string;
  clientName?: string;
  startDate: Date;
  endDate: Date | null; // null = open-ended
  allocationPercent: number | null;
};

export function overlaps(a: AllocationSpan, b: AllocationSpan): boolean {
  const aEnd = a.endDate?.getTime() ?? Infinity;
  const bEnd = b.endDate?.getTime() ?? Infinity;
  return a.startDate.getTime() <= bEnd && b.startDate.getTime() <= aEnd;
}

export function findConflicts(candidate: AllocationSpan, existing: AllocationSpan[]) {
  const overlapping = existing.filter(
    (e) => (candidate.id === undefined || e.id !== candidate.id) && overlaps(candidate, e),
  );
  const pct = (x: AllocationSpan) => x.allocationPercent ?? 100;
  const total = pct(candidate) + overlapping.reduce((s, e) => s + pct(e), 0);
  return { overlapping, totalPercent: total, isConflict: total > 100 };
}

/** Availability for a day: free (no allocation), partial (<100%), busy (≥100%). */
export function availabilityOn(day: Date, spans: AllocationSpan[]): { percent: number; level: "free" | "partial" | "busy" } {
  const t = day.getTime();
  const percent = spans
    .filter((s) => s.startDate.getTime() <= t && (s.endDate?.getTime() ?? Infinity) >= t)
    .reduce((sum, s) => sum + (s.allocationPercent ?? 100), 0);
  return { percent, level: percent === 0 ? "free" : percent < 100 ? "partial" : "busy" };
}
