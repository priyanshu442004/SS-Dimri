// Time a team member spent on a task, worked out from its history (tracker, 14 Nov 2026): from
// each "Start / resume work" to the next change of status (hold, waiting, submit for review). When
// the task is sent for review, this time goes to the person's timesheet automatically.
// Pure: no database access.

import { addDays, dateOnly, hhmmToMinutes, isoDateInTz, minutesOfDayInTz, toIsoDate } from "@/lib/dates";

export type StatusChange = { toValue: string | null; actorUserId: string | null; createdAt: Date };
export type WorkSegment = { date: string; start: string; end: string; minutes: number };

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Work segments of `userId` since the task was last sent for review, one per day per session.
 * A session running past a day's office end stops there; on later days it counts from office start,
 * so a task left "in progress" overnight does not count the night.
 */
export function taskWorkSegments(changes: StatusChange[], userId: string, submittedAt: Date, office: { start: string; end: string }, tz: string): WorkSegment[] {
  const sorted = [...changes].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  // Only the time since the previous submission counts (earlier rounds were logged then).
  let from = 0;
  sorted.forEach((c, i) => { if (c.toValue === "PENDING_REVIEW" && c.createdAt < submittedAt) from = i + 1; });
  const recent = sorted.slice(from).filter((c) => c.createdAt <= submittedAt);
  const sessions: [Date, Date][] = [];
  recent.forEach((c, i) => {
    if (c.toValue !== "IN_PROGRESS" || c.actorUserId !== userId) return;
    const end = recent[i + 1]?.createdAt ?? submittedAt;
    if (end > c.createdAt) sessions.push([c.createdAt, end]);
  });
  const officeStart = hhmmToMinutes(office.start);
  const officeEnd = hhmmToMinutes(office.end);
  const out: WorkSegment[] = [];
  for (const [s, e] of sessions) {
    const firstDay = isoDateInTz(s, tz);
    const lastDay = isoDateInTz(e, tz);
    for (let d = dateOnly(firstDay); toIsoDate(d) <= lastDay; d = addDays(d, 1)) {
      const day = toIsoDate(d);
      const first = day === firstDay;
      const last = day === lastDay;
      if (!first && !last && d.getUTCDay() === 0) continue; // a Sunday in between is not worked
      const startMin = first ? minutesOfDayInTz(s, tz) : officeStart;
      const endMin = last ? minutesOfDayInTz(e, tz) : first ? Math.max(startMin, officeEnd) : officeEnd;
      const minutes = endMin - startMin;
      if (minutes >= 1) out.push({ date: day, start: hhmm(startMin), end: hhmm(endMin), minutes });
      if (out.length > 60) return out; // a task left open for months: stop
    }
  }
  return out;
}
