import "server-only";
import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { addDays, formatDate, formatTime, toIsoDate, todayDateOnly } from "@/lib/dates";
import { markOutReminderDue } from "@/lib/domain/attendance-extras";
import { getPolicy } from "./attendance";
import { sendMail } from "./mailer";
import { notifyUsers } from "./notifications";

// Mark-out reminders (client feedback 12 Nov 2026: if someone forgets to mark out, salary
// cannot be worked out exactly). Two one-time notices per attendance record, each claimed
// with a conditional update so concurrent page loads or the scheduled call never send twice:
//   1. from the policy's reminder time, the person still marked in is reminded (in the app and by email);
//   2. on a later day, a missed time out is reported to the person and to whoever can correct it.
// It runs from the scheduled /api/cron/attendance call (server crontab, every 15 minutes),
// never inside a page request, so page loads are not slowed down by it.

const THROTTLE_MS = 5 * 60_000;
const lastRun = new Map<string, number>();
const LOOK_BACK_DAYS = 7;

type Mail = { organizationId: string; to: string; userId: string; name: string; firm: string; time: string; url: string };

/** Sends any reminders that are due for one firm. Returns the emails to send (the caller decides when). */
export async function sweepAttendanceReminders(organizationId: string, opts: { force?: boolean } = {}): Promise<Mail[]> {
  const now = Date.now();
  if (!opts.force && now - (lastRun.get(organizationId) ?? 0) < THROTTLE_MS) return [];
  lastRun.set(organizationId, now);

  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true, tradeName: true, status: true } });
  if (!org || org.status !== "ACTIVE") return [];
  const tz = org.timezone;
  const { row } = await getPolicy(organizationId);
  const today = todayDateOnly(tz);
  const mails: Mail[] = [];
  const base = baseUrl();

  // 1. Still marked in after the reminder time.
  if (markOutReminderDue(new Date(), row.markOutReminderAt, tz)) {
    const open = await prisma.attendanceRecord.findMany({
      where: { organizationId, attendanceDate: today, timeIn: { not: null }, timeOut: null, markOutReminderSentAt: null, status: { in: ["PRESENT", "HALF_DAY"] } },
      take: 200,
      select: { id: true, timeIn: true, employeeId: true, employee: { select: { firstName: true } } },
    });
    for (const r of open) {
      const claimed = await prisma.attendanceRecord.updateMany({ where: { id: r.id, markOutReminderSentAt: null }, data: { markOutReminderSentAt: new Date() } });
      if (claimed.count !== 1) continue;
      const member = await prisma.organizationMembership.findFirst({
        where: { organizationId, employeeId: r.employeeId, status: "ACTIVE" },
        select: { userId: true, user: { select: { email: true } } },
      });
      if (!member) continue;
      const time = formatTime(r.timeIn, tz);
      await prisma.$transaction((tx) =>
        notifyUsers(tx, organizationId, [member.userId], {
          type: "attendance.mark_out_reminder",
          title: "You have not marked out yet",
          body: `You marked in at ${time}. Mark out when you leave, so your hours and salary are worked out correctly.`,
          link: "/app/attendance",
        }),
      );
      if (member.user.email) mails.push({ organizationId, to: member.user.email, userId: member.userId, name: r.employee.firstName, firm: org.tradeName, time, url: `${base}/app/attendance` });
    }
  }

  // 2. Missed time outs on earlier days.
  const missed = await prisma.attendanceRecord.findMany({
    where: {
      organizationId,
      attendanceDate: { lt: today, gte: addDays(today, -LOOK_BACK_DAYS) },
      timeIn: { not: null },
      timeOut: null,
      missedMarkOutNotifiedAt: null,
      status: { in: ["PRESENT", "HALF_DAY"] },
    },
    take: 200,
    orderBy: { attendanceDate: "asc" },
    select: { id: true, attendanceDate: true, employeeId: true, employee: { select: { firstName: true, lastName: true, reportsTo: { select: { managerId: true } } } } },
  });
  const claimedMissed: typeof missed = [];
  for (const r of missed) {
    const c = await prisma.attendanceRecord.updateMany({ where: { id: r.id, missedMarkOutNotifiedAt: null }, data: { missedMarkOutNotifiedAt: new Date() } });
    if (c.count === 1) claimedMissed.push(r);
  }
  if (claimedMissed.length) {
    const memberships = await prisma.organizationMembership.findMany({
      where: { organizationId, status: "ACTIVE" },
      select: { userId: true, role: true, employeeId: true, grantedCapabilities: true, moduleRestricted: true, allowedModules: true },
    });
    const userOf = new Map(memberships.filter((m) => m.employeeId).map((m) => [m.employeeId!, m.userId]));
    // Who can put the time out in: owners, administrators and anyone given the correction right.
    const correctors = memberships
      .filter((m) => m.role === "OWNER" || m.role === "ADMIN" || m.grantedCapabilities.includes("attendance.correct"))
      .map((m) => m.userId);
    const first = toIsoDate(claimedMissed[0].attendanceDate);
    const last = toIsoDate(claimedMissed[claimedMissed.length - 1].attendanceDate);
    const link = `/app/attendance?tab=team&status=NO_OUT&from=${first}&to=${last}`;
    const label = (r: (typeof claimedMissed)[number]) => `${r.employee.firstName} ${r.employee.lastName ?? ""}`.trim() + ` (${formatDate(r.attendanceDate)})`;
    // One notice per person who missed, and one summary per person who can fix it (their seniors and the administrators).
    const perReviewer = new Map<string, string[]>();
    for (const r of claimedMissed) {
      const self = userOf.get(r.employeeId);
      if (self) {
        await prisma.$transaction((tx) =>
          notifyUsers(tx, organizationId, [self], {
            type: "attendance.missed_mark_out",
            title: `You did not mark out on ${formatDate(r.attendanceDate)}`,
            body: "Your hours for that day cannot be counted. Ask your senior or administrator to enter your time out.",
            link: "/app/attendance",
          }),
        );
      }
      const managers = r.employee.reportsTo.map((m) => userOf.get(m.managerId)).filter((u): u is string => !!u);
      for (const u of new Set([...correctors, ...managers])) {
        if (u === self) continue;
        perReviewer.set(u, [...(perReviewer.get(u) ?? []), label(r)]);
      }
    }
    for (const [userId, names] of perReviewer) {
      await prisma.$transaction((tx) =>
        notifyUsers(tx, organizationId, [userId], {
          type: "attendance.missed_mark_out",
          title: names.length === 1 ? `No time out: ${names[0]}` : `${names.length} attendance days without a time out`,
          body: names.length === 1 ? "Enter the time out so the hours and salary are right." : names.slice(0, 8).join(", ") + (names.length > 8 ? "…" : ""),
          link,
        }),
      );
    }
  }
  return mails;
}

/** Email the "still marked in" reminders. Failures are recorded in the email log, never thrown. */
export async function sendReminderMails(mails: Mail[]) {
  for (const m of mails) {
    const subject = `Reminder: mark out for today – ${m.firm}`;
    const text = `Hello ${m.name},\n\nYou marked in at ${m.time} today and have not marked out yet. Please mark out when you leave, so your hours and salary are worked out correctly.\n\nMark out: ${m.url}`;
    const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#1b1f24;font-size:15px;line-height:1.55">
<p>Hello ${esc(m.name)},</p><p>You marked in at <strong>${esc(m.time)}</strong> today and have not marked out yet. Please mark out when you leave, so your hours and salary are worked out correctly.</p>
<p><a href="${esc(m.url)}" style="background:#1e3a5f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">Mark out</a></p>
<p style="font-size:12px;color:#5d6470">Automated reminder from the ${esc(m.firm)} portal.</p></body></html>`;
    await sendMail({ organizationId: m.organizationId, to: m.to, template: "attendance-mark-out", subject, text, html, relatedUserId: m.userId }).catch(() => undefined);
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function baseUrl() {
  try {
    return serverEnv().BETTER_AUTH_URL.replace(/\/$/, "");
  } catch {
    return "";
  }
}

/** Every active firm (the scheduled call). */
export async function sweepAllFirms() {
  const orgs = await prisma.organization.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  let mails = 0;
  for (const o of orgs) {
    const m = await sweepAttendanceReminders(o.id, { force: true }).catch(() => [] as Mail[]);
    await sendReminderMails(m);
    mails += m.length;
  }
  return { firms: orgs.length, mails };
}
