// Team-allocation hours (pure). People are allocated in hours per half of the working day
// rather than a percentage, so a lead can place someone at one client for the first half
// and another for the second (client feedback, 5 Nov 2026). An allocation without hours is
// a full day. A conflict exists when, on any day, a half is booked beyond its capacity.

export type DayCapacity = { first: number; second: number };

const hhmm = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};

/** Hours available in each half, from the firm's timing policy (start → lunch, lunch → end). */
export function capacityFromPolicy(p: { officeStart: string; lunchStart: string; lunchEnd: string; officeEnd: string }): DayCapacity {
  const hours = (from: string, to: string) => Math.max(0, hhmm(to) - hhmm(from)) / 60;
  return { first: hours(p.officeStart, p.lunchStart), second: hours(p.lunchEnd, p.officeEnd) };
}

export type AllocationSpan = {
  id?: string;
  clientName?: string;
  startDate: Date;
  endDate: Date | null; // null = open-ended
  firstHalfHours: number | null;
  secondHalfHours: number | null;
};

/** Hours a span books in each half; no hours recorded = the whole day. */
export function spanHours(s: Pick<AllocationSpan, "firstHalfHours" | "secondHalfHours">, cap: DayCapacity): DayCapacity {
  if (s.firstHalfHours === null && s.secondHalfHours === null) return { ...cap };
  return { first: s.firstHalfHours ?? 0, second: s.secondHalfHours ?? 0 };
}

export function overlaps(a: Pick<AllocationSpan, "startDate" | "endDate">, b: Pick<AllocationSpan, "startDate" | "endDate">): boolean {
  const aEnd = a.endDate?.getTime() ?? Infinity;
  const bEnd = b.endDate?.getTime() ?? Infinity;
  return a.startDate.getTime() <= bEnd && b.startDate.getTime() <= aEnd;
}

const activeOn = (s: AllocationSpan, t: number) => s.startDate.getTime() <= t && (s.endDate?.getTime() ?? Infinity) >= t;

export function bookedOn(day: Date, spans: AllocationSpan[], cap: DayCapacity): DayCapacity {
  const t = day.getTime();
  return spans
    .filter((s) => activeOn(s, t))
    .map((s) => spanHours(s, cap))
    .reduce((sum, h) => ({ first: sum.first + h.first, second: sum.second + h.second }), { first: 0, second: 0 });
}

/**
 * Checks a new allocation against the person's others. Totals only change on a day some
 * allocation starts, so those days are enough to find the busiest point of the period.
 */
export function findConflicts(candidate: AllocationSpan, existing: AllocationSpan[], cap: DayCapacity) {
  const overlapping = existing.filter((e) => (candidate.id === undefined || e.id !== candidate.id) && overlaps(candidate, e));
  const all = [candidate, ...overlapping];
  const days = [candidate.startDate, ...overlapping.map((o) => o.startDate).filter((d) => activeOn(candidate, d.getTime()))];
  let peak: DayCapacity = { first: 0, second: 0 };
  for (const d of days) {
    const b = bookedOn(d, all, cap);
    peak = { first: Math.max(peak.first, b.first), second: Math.max(peak.second, b.second) };
  }
  return { overlapping, firstHours: peak.first, secondHours: peak.second, isConflict: peak.first > cap.first || peak.second > cap.second };
}

export type Availability = DayCapacity & { level: "free" | "partial" | "busy" };

/** Availability for a day: free (nothing booked), partial (some hours left), busy (both halves full). */
export function availabilityOn(day: Date, spans: AllocationSpan[], cap: DayCapacity): Availability {
  const b = bookedOn(day, spans, cap);
  const full = b.first >= cap.first && b.second >= cap.second;
  return { ...b, level: b.first === 0 && b.second === 0 ? "free" : full ? "busy" : "partial" };
}

/** "3.5" not "3.50"; used wherever hours are shown. */
export const formatHours = (h: number) => String(Math.round(h * 100) / 100);

/** Plain description of what a span books, e.g. "First half 3.5 h · Second half 2 h" or "Full day". */
export function describeHours(s: Pick<AllocationSpan, "firstHalfHours" | "secondHalfHours">, cap: DayCapacity): string {
  if (s.firstHalfHours === null && s.secondHalfHours === null) return "Full day";
  const h = spanHours(s, cap);
  if (h.first >= cap.first && h.second >= cap.second) return "Full day";
  const parts = [h.first > 0 && `First half ${formatHours(h.first)} h`, h.second > 0 && `Second half ${formatHours(h.second)} h`].filter(Boolean);
  return parts.join(" · ") || "No hours";
}
