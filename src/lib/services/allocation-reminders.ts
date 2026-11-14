import "server-only";
import { prisma } from "@/lib/db";
import { addDays, dateOnly, formatDate, isoDateInTz, minutesOfDayInTz } from "@/lib/dates";
import { isPlannedOn } from "@/lib/domain/allocation-schedule";
import { refreshAllocationStatuses } from "./allocations";
import { notifyEmployees } from "./notifications";

// Daily housekeeping for team allocation, run by the scheduled sweep:
// - allocations past their To date end by themselves (sheet rule), planned ones start;
// - a team member is reminded the day before a planned visit (sheet rule: "reminds the team
//   member a day before"). Daily allocations are left out, so nobody gets a notice every day.

const REMINDER_FROM_MINUTES = 9 * 60; // not before 9 am in the firm's timezone
const TYPE = "allocation.visit_reminder";

export async function sweepAllocations(organizationId: string, timezone: string, now = new Date()) {
  const todayIso = isoDateInTz(now, timezone);
  const statuses = await refreshAllocationStatuses(organizationId, todayIso);
  if (minutesOfDayInTz(now, timezone) < REMINDER_FROM_MINUTES) return { ...statuses, reminders: 0 };

  const tomorrow = addDays(dateOnly(todayIso), 1);
  const rows = await prisma.teamAllocation.findMany({
    where: {
      organizationId,
      status: { in: ["ACTIVE", "PLANNED"] },
      frequency: { in: ["THREE_A_WEEK", "TWICE_A_WEEK", "ONCE_A_WEEK", "TWICE_A_MONTH", "MONTHLY"] },
      startDate: { lte: tomorrow },
      OR: [{ endDate: null }, { endDate: { gte: tomorrow } }],
    },
    select: { employeeId: true, weekDays: true, frequency: true, visitDays: true, client: { select: { tradeName: true } } },
  });
  const due = rows.filter((r) => isPlannedOn(r, tomorrow));
  if (!due.length) return { ...statuses, reminders: 0 };

  // Once a day per person: one notice listing tomorrow's clients.
  const byPerson = new Map<string, string[]>();
  for (const r of due) byPerson.set(r.employeeId, [...(byPerson.get(r.employeeId) ?? []), r.client.tradeName]);
  const members = await prisma.organizationMembership.findMany({ where: { organizationId, status: "ACTIVE", employeeId: { in: [...byPerson.keys()] } }, select: { userId: true, employeeId: true } });
  const since = new Date(now.getTime() - 20 * 3600_000);
  const already = new Set(
    (await prisma.notification.findMany({ where: { organizationId, type: TYPE, createdAt: { gte: since }, userId: { in: members.map((m) => m.userId) } }, select: { userId: true } })).map((n) => n.userId),
  );
  const toSend = members.filter((m) => m.employeeId && !already.has(m.userId));
  if (!toSend.length) return { ...statuses, reminders: 0 };
  await prisma.$transaction(async (tx) => {
    for (const m of toSend) {
      const names = byPerson.get(m.employeeId!)!;
      await notifyEmployees(tx, organizationId, [m.employeeId!], {
        type: TYPE,
        title: `Tomorrow (${formatDate(tomorrow)}) you are planned at ${names.join(", ")}`,
        link: "/app/allocations",
      });
    }
  });
  return { ...statuses, reminders: toSend.length };
}
