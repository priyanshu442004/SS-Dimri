import "server-only";
import { prisma } from "@/lib/db";
import { addDays, dateOnly, isoDateInTz, toIsoDate, zonedDateTime } from "@/lib/dates";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { workStatusOf } from "@/lib/domain/tracker";
import type { AppContext } from "@/lib/session";
import { teamAttendanceRows } from "./attendance";
import { getPolicy } from "./office-rules";

// The management summary (client format "Daily AI Summary Report", 17 Nov 2026): work given and done,
// overdue, what waits on clients and on the team, attendance, late arrivals, offsite visits, urgent
// cases and estimated late fees — for any period, each figure against the previous period.
// Everything comes from the ERP (tasks, the Accounting Workflow Tracker, attendance, client visits).
// The dashboard shows it with period filters; AI Reporting adds the AI-written summary on top.

export const PERIODS = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Last 7 days",
  month: "This month",
  last_month: "Last month",
  year: "This year",
} as const;
export type PeriodKey = keyof typeof PERIODS;
export const isPeriod = (v: unknown): v is PeriodKey => typeof v === "string" && v in PERIODS;

type Range = { from: string; to: string };
type Delta = number | null;

export type Kpi = { key: string; label: string; value: number; display: string; delta: Delta; deltaDisplay: string; better: "up" | "down" | "none"; hint: string; spark: number[]; tone: "ink" | "ok" | "danger" | "warn" | "info" | "stamp" };
export type OpsSummary = {
  period: PeriodKey;
  periodLabel: string;
  rangeLabel: string;
  compareLabel: string;
  singleDay: boolean;
  /** Last day of the period, YYYY-MM-DD. */
  asOfDate: string;
  generatedAt: string;
  dateLabel: string;
  firm: string;
  counts: { clients: number; members: number; items: number };
  kpis: Kpi[];
  summary: { label: string; text: string }[];
  attendanceByRole: { role: string; staff: string; onTime: number; late: number; leave: number; offsite: number }[];
  attendanceTotal: { staff: number; onTime: number; late: number; leave: number; offsite: number; dLate: Delta; dLeave: Delta; dOffsite: Delta; dOnTime: Delta };
  workload: { member: string; role: string; status: string; statusTone: "ok" | "warn" | "danger" | "muted"; assigned: number; done: number; open: number; overdue: number; delta: Delta }[];
  workloadTotal: { assigned: number; done: number; open: number; overdue: number; delta: Delta };
  urgent: { priority: "CRITICAL" | "HIGH" | "MEDIUM"; client: string; item: string; due: string; owner: string; issue: string; href: string }[];
  pendingClient: { client: string; items: number; delta: Delta; age: number; awaited: string }[];
  pendingClientTotal: { items: number; delta: Delta; note: string };
  late: { member: string; role: string; date: string; inTime: string; lateBy: number; reason: string }[];
  lateByRole: string;
  offsite: { member: string; client: string; purpose: string; date: string; time: string }[];
  offsiteTotal: string;
  penalties: { item: string; client: string; late: string; penalty: number; delta: Delta; borneBy: string }[];
  penaltyTotal: { penalty: number; delta: Delta; note: string };
  priorities: string[];
};

// ---------------------------------------------------------------- periods

const DAY_MS = 86_400_000;
const shift = (iso: string, days: number) => toIsoDate(addDays(dateOnly(iso), days));
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const lastOfMonth = (iso: string) => shift(monthStart(shift(monthStart(iso), 32)), -1);
const prevMonthSameDay = (iso: string) => {
  const start = monthStart(shift(monthStart(iso), -1));
  const end = lastOfMonth(start);
  const day = `${start.slice(0, 8)}${iso.slice(8)}`;
  return day > end ? end : day;
};
/** Indian financial year start (1 April) for a date. */
const fyStart = (iso: string) => (Number(iso.slice(5, 7)) >= 4 ? `${iso.slice(0, 4)}-04-01` : `${Number(iso.slice(0, 4)) - 1}-04-01`);
const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });
const longDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export function periodRanges(period: PeriodKey, today: string): { cur: Range; prev: Range; compare: string } {
  switch (period) {
    case "today": return { cur: { from: today, to: today }, prev: { from: shift(today, -1), to: shift(today, -1) }, compare: "vs yday" };
    case "yesterday": { const y = shift(today, -1); return { cur: { from: y, to: y }, prev: { from: shift(y, -1), to: shift(y, -1) }, compare: "vs day before" }; }
    case "week": return { cur: { from: shift(today, -6), to: today }, prev: { from: shift(today, -13), to: shift(today, -7) }, compare: "vs prev 7 days" };
    case "month": return { cur: { from: monthStart(today), to: today }, prev: { from: monthStart(shift(monthStart(today), -1)), to: prevMonthSameDay(today) }, compare: "vs last month" };
    case "last_month": { const s = monthStart(shift(monthStart(today), -1)); const ps = monthStart(shift(s, -1)); return { cur: { from: s, to: lastOfMonth(s) }, prev: { from: ps, to: lastOfMonth(ps) }, compare: "vs month before" }; }
    case "year": { const s = fyStart(today); const ps = `${Number(s.slice(0, 4)) - 1}-04-01`; return { cur: { from: s, to: today }, prev: { from: ps, to: shift(today, -365) < ps ? ps : shift(today, -365) }, compare: "vs last year" }; }
  }
}

/** Seven sparkline buckets: the last 7 days for a one-day period, else the period cut in 7. */
function buckets(cur: Range, single: boolean): Range[] {
  if (single) return Array.from({ length: 7 }, (_, i) => ({ from: shift(cur.to, i - 6), to: shift(cur.to, i - 6) }));
  const days = Math.round((dateOnly(cur.to).getTime() - dateOnly(cur.from).getTime()) / DAY_MS) + 1;
  const n = Math.min(7, days);
  return Array.from({ length: n }, (_, i) => ({ from: shift(cur.from, Math.floor((i * days) / n)), to: shift(cur.from, Math.floor(((i + 1) * days) / n) - 1) }));
}

// ---------------------------------------------------------------- statutory late fees (estimate)

/** Estimated late fee for a filing overdue by `days` (client-borne). Not a filing → 0. */
export function lateFee(text: string, days: number): number {
  if (days <= 0) return 0;
  const t = text.toUpperCase();
  if (/GSTR-?9C?\b|ANNUAL RETURN/.test(t)) return Math.min(200 * days, 10_000);
  if (/GSTR|GST RETURN|\b3B\b|GSTR-?1\b|CMP-?08/.test(t)) return Math.min(50 * days, 10_000);
  if (/\bTDS\b|\bTCS\b|24Q|26Q|27Q|234E/.test(t)) return 200 * days;
  if (/\bITR\b|INCOME TAX RETURN/.test(t)) return 5_000;
  if (/AOC-?4|MGT-?7|\bROC\b|DIR-?3/.test(t)) return 100 * days;
  return 0;
}

// ---------------------------------------------------------------- the summary

type Item = {
  kind: "task" | "tracker";
  id: string;
  title: string;
  client: string;
  clientId: string | null;
  owner: string | null;
  ownerId: string | null;
  people: string[];
  createdAt: Date;
  assignedAt: Date | null;
  doneAt: Date | null;
  cancelled: boolean;
  due: Date | null;
  priority: number; // 3 = ASAP / critical, 2 = high, 1 = medium, 0 = low
  issue: string | null;
  clientWait: { item: string; raised: Date; clearedAt: Date | null; cleared: boolean } | null;
  teamWait: boolean;
  href: string;
};

/** Free text as one short line for a table cell. */
const oneLine = (s: string, max = 90) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t; };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const fmtDelta = (d: Delta, unit = "") => (d === null ? "–" : d === 0 ? "no change" : `${d > 0 ? "▲" : "▼"} ${Math.abs(d).toLocaleString("en-IN")}${unit}`);
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export async function opsSummary(ctx: AppContext, period: PeriodKey): Promise<OpsSummary> {
  const org = ctx.organization.id;
  const tz = ctx.organization.timezone;
  const now = new Date();
  const today = isoDateInTz(now, tz);
  const { cur, prev, compare } = periodRanges(period, today);
  const single = cur.from === cur.to;
  const endOf = (iso: string) => (iso >= today ? now : new Date(zonedDateTime(shift(iso, 1), 0, tz).getTime() - 1));
  const startOf = (iso: string) => zonedDateTime(iso, 0, tz);
  const asOf = endOf(cur.to);
  const prevAsOf = endOf(prev.to);
  const spark = buckets(cur, single);

  const [policy, employees, tasks, lines, firstRecord, visits] = await Promise.all([
    getPolicy(org),
    prisma.employee.findMany({
      where: { organizationId: org, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } },
      select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } }, membership: { select: { role: true } } },
    }),
    prisma.task.findMany({
      where: { organizationId: org },
      take: 5000,
      orderBy: { createdAt: "desc" },
      select: {
        id: true, title: true, description: true, status: true, priority: true, isAsap: true, dueAt: true, createdAt: true, completedAt: true, updatedAt: true,
        makerEmployeeId: true, client: { select: { id: true, tradeName: true } },
        assignments: { where: { removedAt: null }, select: { employeeId: true, assignedAt: true } },
      },
    }),
    prisma.trackerLine.findMany({
      where: { organizationId: org },
      take: 10000,
      select: {
        id: true, refNo: true, clientId: true, clientName: true, typeOfWork: true, periodFrom: true, periodTo: true, statusOfWork: true, checkerStatus: true,
        clientPendingItem: true, clientRaisedOn: true, clientDueBy: true, clientPendingStatus: true, dateReceived: true,
        teamPendingItem: true, teamRaisedOn: true, teamDueBy: true, teamPendingStatus: true, nextFollowUpOn: true,
        issueLevel: true, issueDetails: true, issueStatus: true, priority: true, makerEmployeeId: true, checkerEmployeeId: true, createdAt: true, updatedAt: true, workStartDate: true, source: true,
      },
    }),
    // Attendance counts from the first day the firm really used it (a quarter of the staff marked).
    prisma.attendanceRecord.groupBy({ by: ["attendanceDate"], where: { organizationId: org }, _count: { _all: true }, orderBy: { attendanceDate: "asc" } }),
    prisma.clientVisit.findMany({
      where: { organizationId: org, visitDate: { gte: dateOnly(cur.from), lte: dateOnly(cur.to) } },
      orderBy: { startedAt: "desc" },
      take: 200,
      select: { employeeId: true, placeName: true, purpose: true, visitDate: true, startedAt: true, endedAt: true },
    }),
  ]);

  const emp = new Map(employees.map((e) => [e.id, e]));
  const nameOf = (id: string | null | undefined) => (id && emp.get(id) ? emp.get(id)!.firstName : null);
  const roleOf = (id: string) => {
    const e = emp.get(id);
    return e?.designation?.name ?? (e?.membership?.role ? ROLE_LABELS[e.membership.role as Role] : "Team member");
  };

  // ------------------------------------------------ work items (tasks + tracker lines)
  const items: Item[] = [];
  for (const t of tasks) {
    const people = [...new Set([...t.assignments.map((a) => a.employeeId), ...(t.makerEmployeeId ? [t.makerEmployeeId] : [])])];
    const owner = t.makerEmployeeId ?? t.assignments[0]?.employeeId ?? null;
    items.push({
      kind: "task", id: t.id, title: t.title, client: t.client?.tradeName ?? "Internal", clientId: t.client?.id ?? null,
      owner: nameOf(owner), ownerId: owner, people, createdAt: t.createdAt,
      assignedAt: people.length ? (t.assignments.map((a) => a.assignedAt).sort((a, b) => a.getTime() - b.getTime())[0] ?? t.createdAt) : null,
      doneAt: t.status === "COMPLETED" ? t.completedAt ?? t.updatedAt : null, cancelled: t.status === "CANCELLED",
      due: t.dueAt, priority: t.isAsap ? 3 : t.priority === "HIGH" ? 2 : t.priority === "MEDIUM" ? 1 : 0,
      issue: t.description ? oneLine(t.description) : null,
      clientWait: t.status === "AWAITING_CLIENT" ? { item: t.title, raised: t.updatedAt, clearedAt: null, cleared: false } : null,
      teamWait: ["PENDING_REVIEW", "CHANGES_REQUESTED", "ON_HOLD", "AWAITING_TEAM_MEMBER"].includes(t.status),
      href: `/app/tasks/${t.id}`,
    });
  }
  for (const l of lines) {
    const ws = workStatusOf(l);
    const period = l.periodFrom ? ` (${l.periodFrom.toLocaleDateString("en-IN", { month: "short", year: "2-digit", timeZone: "UTC" })})` : "";
    const people = [...new Set([l.makerEmployeeId, l.checkerEmployeeId].filter((x): x is string => !!x))];
    const issueOpen = l.issueStatus === "Open" && (l.issueLevel || l.issueDetails);
    items.push({
      kind: "tracker", id: l.id, title: `${l.typeOfWork}${period}`, client: l.clientName, clientId: l.clientId,
      owner: nameOf(l.makerEmployeeId), ownerId: l.makerEmployeeId, people, createdAt: l.createdAt,
      // Work given by a senior counts as assigned; lines a person logged themselves do not.
      assignedAt: l.makerEmployeeId && l.source !== "LOG" ? l.workStartDate ?? l.createdAt : null,
      doneAt: ws === "Completed" ? l.updatedAt : null, cancelled: false,
      due: l.teamDueBy && l.teamPendingStatus !== "Cleared" ? l.teamDueBy : null,
      priority: l.issueLevel === "Critical" ? 3 : l.priority === "High" || l.issueLevel === "High" ? 2 : l.priority === "Medium" ? 1 : 0,
      issue: issueOpen ? (l.issueDetails ? oneLine(l.issueDetails) : `${l.issueLevel} issue`) : l.clientPendingItem && l.clientPendingStatus !== "Cleared" ? `${l.clientPendingItem} awaited from client` : l.teamPendingItem && l.teamPendingStatus !== "Cleared" ? l.teamPendingItem : null,
      clientWait: l.clientPendingItem ? { item: l.clientPendingItem, raised: l.clientRaisedOn ?? l.createdAt, clearedAt: l.dateReceived, cleared: l.clientPendingStatus === "Cleared" } : null,
      teamWait: ["Ready for Check", "Under Check", "Rework", "On Hold"].includes(ws) || (!!l.teamPendingItem && l.teamPendingStatus !== "Cleared"),
      href: `/app/timesheet?tab=tracker&q=${encodeURIComponent(l.refNo)}`,
    });
  }

  // State of an item at a moment (status history is not stored; completion and receipt dates are).
  const openAt = (i: Item, at: Date) => i.createdAt <= at && !i.cancelled && !(i.doneAt && i.doneAt <= at);
  const overdueAt = (i: Item, at: Date) => openAt(i, at) && !!i.due && (i.kind === "task" ? i.due < at : toIsoDate(i.due) < isoDateInTz(at, tz));
  const clientWaitAt = (i: Item, at: Date) => {
    const w = i.clientWait;
    if (!w || !openAt(i, at) || w.raised > at) return false;
    if (!w.cleared) return true;
    return !!w.clearedAt && w.clearedAt > at;
  };
  const teamWaitAt = (i: Item, at: Date) => openAt(i, at) && i.teamWait && !clientWaitAt(i, at);
  const inRange = (d: Date | null, r: Range) => !!d && d >= startOf(r.from) && d <= endOf(r.to);
  const daysLate = (i: Item, at: Date) => (i.due ? Math.floor((dateOnly(isoDateInTz(at, tz)).getTime() - dateOnly(isoDateInTz(i.due, tz)).getTime()) / DAY_MS) : 0);
  const feeAt = (i: Item, at: Date) => (overdueAt(i, at) ? lateFee(`${i.title} ${i.issue ?? ""}`, daysLate(i, at)) : 0);

  const count = (f: (i: Item) => boolean) => items.filter(f).length;
  const work = (r: Range, at: Date) => {
    const open = count((i) => openAt(i, at));
    return {
      assigned: count((i) => inRange(i.assignedAt, r)),
      completed: count((i) => inRange(i.doneAt, r)),
      open,
      overdue: count((i) => overdueAt(i, at)),
      pendingClient: count((i) => clientWaitAt(i, at)),
      pendingTeam: count((i) => teamWaitAt(i, at)),
      penalty: items.reduce((s, i) => s + feeAt(i, at), 0),
    };
  };
  const w = work(cur, asOf);
  const wp = work(prev, prevAsOf);

  // ------------------------------------------------ attendance
  const usedFrom = firstRecord.find((d) => d._count._all >= Math.max(3, employees.length / 4));
  const dataStart = usedFrom ? toIsoDate(usedFrom.attendanceDate) : today;
  const clampFrom = (r: Range) => (r.from < dataStart ? dataStart : r.from);
  const winFrom = [clampFrom(prev), clampFrom(spark[0]), clampFrom(cur)].sort()[0];
  const att = winFrom <= cur.to
    ? (await teamAttendanceRows(ctx, policy, { from: winFrom, to: cur.to, q: "", status: "", departmentId: "", employeeId: "" })).rows
    : [];
  type AttRow = (typeof att)[number];
  const rowsIn = (r: Range) => att.filter((x) => { const d = toIsoDate(x.date); return d >= r.from && d <= r.to && d >= dataStart; });
  const isPresent = (x: AttRow) => x.state === "PRESENT" || x.state === "HALF_DAY";
  const isLeave = (x: AttRow) => x.state === "LEAVE" || x.approvedLeave;
  const isOffsite = (x: AttRow) => isPresent(x) && !!x.record?.workLocation && x.record.workLocation !== "OFFICE";
  const attStats = (r: Range) => {
    const rows = rowsIn(r);
    const days = new Set(rows.map((x) => toIsoDate(x.date))).size;
    const present = rows.filter(isPresent).length;
    return { rows: rows.length, days, present, late: rows.filter((x) => x.isLate).length, leave: rows.filter(isLeave).length, offsite: rows.filter(isOffsite).length, onTime: rows.filter((x) => isPresent(x) && !x.isLate).length };
  };
  const a = attStats(cur);
  const ap = attStats(prev);
  const hasPrevAtt = prev.to >= dataStart;
  const dAtt = (x: number, y: number): Delta => (hasPrevAtt ? x - y : null);

  // ------------------------------------------------ KPIs with sparklines
  const sparkWork = spark.map((b) => work(b, endOf(b.to)));
  const sparkAtt = spark.map((b) => attStats(b));
  const presentPct = pct(a.present, a.rows);
  const kpis: Kpi[] = [
    { key: "assigned", label: single ? `Tasks assigned ${period === "today" ? "today" : "yesterday"}` : "Tasks assigned", value: w.assigned, display: String(w.assigned), delta: w.assigned - wp.assigned, deltaDisplay: "", better: "up", hint: "Items allotted to team", spark: sparkWork.map((s) => s.assigned), tone: "ink" },
    { key: "completed", label: single ? `Completed ${period === "today" ? "today" : "yesterday"}` : "Completed", value: w.completed, display: String(w.completed), delta: w.completed - wp.completed, deltaDisplay: "", better: "up", hint: `Open items now ${w.open}`, spark: sparkWork.map((s) => s.completed), tone: "ok" },
    { key: "overdue", label: "Overdue items", value: w.overdue, display: String(w.overdue), delta: w.overdue - wp.overdue, deltaDisplay: "", better: "down", hint: `${pct(w.overdue, w.open)}% of open items`, spark: sparkWork.map((s) => s.overdue), tone: "danger" },
    { key: "pendingClient", label: "Pending: client side", value: w.pendingClient, display: String(w.pendingClient), delta: w.pendingClient - wp.pendingClient, deltaDisplay: "", better: "down", hint: `${pct(w.pendingClient, w.open)}% of open items`, spark: sparkWork.map((s) => s.pendingClient), tone: "danger" },
    { key: "pendingTeam", label: "Pending: team side", value: w.pendingTeam, display: String(w.pendingTeam), delta: w.pendingTeam - wp.pendingTeam, deltaDisplay: "", better: "down", hint: "Maker / check / rework / hold", spark: sparkWork.map((s) => s.pendingTeam), tone: "warn" },
    single
      ? { key: "present", label: `Present ${period === "today" ? "today" : "yesterday"}`, value: a.present, display: `${a.present} / ${a.rows}`, delta: dAtt(a.present, ap.present), deltaDisplay: "", better: "up", hint: `${a.present - a.offsite} office · ${a.offsite} offsite`, spark: sparkAtt.map((s) => s.present), tone: "info" }
      : { key: "present", label: "Attendance", value: presentPct, display: `${presentPct}%`, delta: hasPrevAtt ? presentPct - pct(ap.present, ap.rows) : null, deltaDisplay: "", better: "up", hint: `${a.days ? (a.present / a.days).toFixed(1) : 0} present a day · ${a.offsite} offsite days`, spark: sparkAtt.map((s) => pct(s.present, s.rows)), tone: "info" },
    { key: "lateLeave", label: "Late · on leave", value: a.late, display: `${a.late} · ${a.leave}`, delta: dAtt(a.late, ap.late), deltaDisplay: "", better: "down", hint: "", spark: sparkAtt.map((s) => s.late + s.leave), tone: "warn" },
    { key: "penalty", label: "Penalty exposure", value: w.penalty, display: inr(w.penalty), delta: w.penalty - wp.penalty, deltaDisplay: "", better: "down", hint: `Est. late fees on ${count((i) => feeAt(i, asOf) > 0)} overdue filings`, spark: sparkWork.map((s) => s.penalty), tone: "stamp" },
  ];
  for (const k of kpis) k.deltaDisplay = k.key === "penalty" ? (k.delta === null ? "–" : k.delta === 0 ? "no change" : `${k.delta > 0 ? "▲" : "▼"} ${inr(Math.abs(k.delta))}`) : k.key === "present" && !single ? fmtDelta(k.delta, " pts") : fmtDelta(k.delta);
  const lateNames = (rows: AttRow[]) => [...new Set(rows.map((x) => x.employee.firstName))];
  const curRows = rowsIn(cur);
  const lateKpi = kpis.find((k) => k.key === "lateLeave")!;
  lateKpi.deltaDisplay = hasPrevAtt ? `Late ${fmtDelta(a.late - ap.late)} · Leave ${fmtDelta(a.leave - ap.leave)}` : "–";
  lateKpi.hint = single ? [...lateNames(curRows.filter((x) => x.isLate)), ...lateNames(curRows.filter(isLeave))].slice(0, 4).join(", ") || "Nobody late or on leave" : `${a.late} late arrivals · ${a.leave} leave days`;

  // ------------------------------------------------ attendance by role
  const roles = new Map<string, { staff: Set<string>; onTime: number; late: number; leave: number; offsite: number }>();
  for (const e of employees) roles.set(roleOf(e.id), roles.get(roleOf(e.id)) ?? { staff: new Set(), onTime: 0, late: 0, leave: 0, offsite: 0 });
  for (const e of employees) roles.get(roleOf(e.id))!.staff.add(e.firstName);
  for (const x of curRows) {
    const g = roles.get(roleOf(x.employee.id));
    if (!g) continue;
    if (isPresent(x) && !x.isLate) g.onTime++;
    if (x.isLate) g.late++;
    if (isLeave(x)) g.leave++;
    if (isOffsite(x)) g.offsite++;
  }
  const attendanceByRole = [...roles.entries()]
    .map(([role, g]) => ({ role, staff: [...g.staff].slice(0, 3).join(", ") + (g.staff.size > 3 ? ` +${g.staff.size - 3}` : ""), onTime: g.onTime, late: g.late, leave: g.leave, offsite: g.offsite, n: g.staff.size }))
    .sort((x, y) => y.n - x.n || x.role.localeCompare(y.role))
    .map(({ n: _n, ...r }) => r);

  // ------------------------------------------------ team workload
  const attToday = new Map(curRows.filter((x) => toIsoDate(x.date) === cur.to).map((x) => [x.employee.id, x]));
  const workload = employees.map((e) => {
    const mine = items.filter((i) => i.people.includes(e.id));
    const overdueNow = mine.filter((i) => overdueAt(i, asOf)).length;
    const overduePrev = mine.filter((i) => overdueAt(i, prevAsOf)).length;
    let status = "—";
    let statusTone: "ok" | "warn" | "danger" | "muted" = "muted";
    if (single) {
      const x = attToday.get(e.id);
      if (!x) status = "Off";
      else if (isLeave(x)) { status = "On leave"; statusTone = "danger"; }
      else if (x.state === "ABSENT") { status = "Absent"; statusTone = "danger"; }
      else if (x.state === "NOT_MARKED") { status = "Not marked"; statusTone = "muted"; }
      else { status = `${isOffsite(x) ? "Offsite" : "Office"}${x.isLate ? " · late" : ""}`; statusTone = x.isLate ? "warn" : "ok"; }
    } else {
      const mineRows = curRows.filter((x) => x.employee.id === e.id);
      const p = pct(mineRows.filter(isPresent).length, mineRows.length);
      status = mineRows.length ? `${p}% present` : "—";
      statusTone = !mineRows.length ? "muted" : p >= 90 ? "ok" : p >= 70 ? "warn" : "danger";
    }
    return {
      member: `${e.firstName} ${e.lastName ?? ""}`.trim(), role: roleOf(e.id), status, statusTone,
      assigned: mine.filter((i) => inRange(i.assignedAt, cur)).length,
      done: mine.filter((i) => inRange(i.doneAt, cur)).length,
      open: mine.filter((i) => openAt(i, asOf)).length,
      overdue: overdueNow,
      delta: overdueNow - overduePrev,
    };
  }).filter((r) => r.assigned || r.done || r.open).sort((x, y) => y.open - x.open || y.overdue - x.overdue || x.member.localeCompare(y.member));
  const workloadTotal = {
    assigned: workload.reduce((s, r) => s + r.assigned, 0), done: workload.reduce((s, r) => s + r.done, 0),
    open: workload.reduce((s, r) => s + r.open, 0), overdue: workload.reduce((s, r) => s + r.overdue, 0), delta: workload.reduce((s, r) => s + (r.delta ?? 0), 0),
  };

  // ------------------------------------------------ urgent & flagged
  const asOfIso = isoDateInTz(asOf, tz);
  const tomorrow = shift(asOfIso, 1);
  const urgent = items
    .filter((i) => openAt(i, asOf))
    .map((i) => {
      const late = overdueAt(i, asOf) ? daysLate(i, asOf) : 0;
      const dueIso = i.due ? isoDateInTz(i.due, tz) : null;
      const soon = !!dueIso && dueIso <= tomorrow;
      const fee = feeAt(i, asOf);
      const score = (late > 0 ? 40 + Math.min(late, 30) : 0) + (soon ? 25 : 0) + i.priority * 12 + (fee ? 15 : 0) + (clientWaitAt(i, asOf) ? 4 : 0);
      const priority: "CRITICAL" | "HIGH" | "MEDIUM" = (late > 3 && (fee > 0 || i.priority >= 2)) || i.priority === 3 || (soon && fee > 0) ? "CRITICAL" : late > 0 || (soon && i.priority >= 2) ? "HIGH" : "MEDIUM";
      const due = !dueIso ? "No due date" : late > 0 ? `Overdue ${late} day${late === 1 ? "" : "s"}` : dueIso === asOfIso ? "Today" : dueIso === tomorrow ? `Tomorrow ${shortDate(dueIso)}` : shortDate(dueIso);
      const rank = priority === "CRITICAL" ? 2 : priority === "HIGH" ? 1 : 0;
      return { score, rank, row: { priority, client: i.client, item: i.title, due, owner: i.owner ?? "Unassigned", issue: i.issue ?? (late > 0 ? "Past due: finish or re-baseline the date" : "Due soon: confirm on track"), href: i.href } };
    })
    .filter((x) => x.score >= 25)
    .sort((x, y) => y.rank - x.rank || y.score - x.score)
    .slice(0, 8)
    .map((x) => x.row);

  // ------------------------------------------------ pending from client side
  const byClient = new Map<string, { items: Item[]; prev: number }>();
  for (const i of items) {
    if (clientWaitAt(i, asOf)) { const g = byClient.get(i.client) ?? { items: [], prev: 0 }; g.items.push(i); byClient.set(i.client, g); }
  }
  for (const i of items) if (clientWaitAt(i, prevAsOf)) { const g = byClient.get(i.client); if (g) g.prev++; }
  const pcRows = [...byClient.entries()].map(([client, g]) => ({
    client, items: g.items.length, delta: g.items.length - g.prev,
    age: Math.max(...g.items.map((i) => Math.floor((asOf.getTime() - i.clientWait!.raised.getTime()) / DAY_MS))),
    awaited: [...new Set(g.items.map((i) => i.clientWait!.item))].slice(0, 3).join(", "),
  })).sort((x, y) => y.items - x.items || y.age - x.age);
  const pendingClient = pcRows.slice(0, 6);
  const noneWaiting = [...new Set(items.filter((i) => openAt(i, asOf) && i.clientId).map((i) => i.client))].filter((c) => !byClient.has(c));

  // ------------------------------------------------ late arrivals
  const lateRows = curRows.filter((x) => x.isLate).sort((x, y) => y.date.getTime() - x.date.getTime() || y.lateMinutes - x.lateMinutes);
  const late = lateRows.slice(0, 8).map((x) => ({
    member: x.employee.firstName, role: roleOf(x.employee.id), date: shortDate(toIsoDate(x.date)),
    inTime: x.record?.timeIn ? x.record.timeIn.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }) : "—",
    lateBy: x.lateMinutes, reason: x.record?.lateReason ?? x.lateIntimation?.reason ?? "No reason given",
  }));
  const lateRole = new Map<string, number>();
  for (const x of lateRows) lateRole.set(roleOf(x.employee.id), (lateRole.get(roleOf(x.employee.id)) ?? 0) + 1);
  const lostHours = lateRows.reduce((s, x) => s + x.lateMinutes, 0) / 60;
  const lateByRole = lateRows.length
    ? `${[...lateRole.entries()].map(([r, n]) => `${r} ${n}`).join(" · ")}. ≈${lostHours.toFixed(1)} hrs of working time lost.`
    : "Nobody was late.";

  // ------------------------------------------------ offsite visits
  const offRows = curRows.filter(isOffsite);
  const offsite = [
    ...visits.map((v) => ({
      member: nameOf(v.employeeId) ?? "—", client: v.placeName, purpose: v.purpose ?? "Client visit", date: shortDate(toIsoDate(v.visitDate)),
      time: v.endedAt ? `${Math.round((v.endedAt.getTime() - v.startedAt.getTime()) / 60_000)} min` : "On site",
    })),
    ...offRows.filter((x) => !visits.some((v) => v.employeeId === x.employee.id && toIsoDate(v.visitDate) === toIsoDate(x.date))).map((x) => ({
      member: x.employee.firstName, client: x.record?.workPlace ?? "Client site", purpose: x.record?.workLocation === "CLIENT_OFFICE" ? "On-site posting" : "Client visit",
      date: shortDate(toIsoDate(x.date)), time: x.workedMinutes ? `${Math.floor(x.workedMinutes / 60)}h ${x.workedMinutes % 60}m` : "Full day",
    })),
  ];
  const offMembers = new Set(offsite.map((o) => o.member)).size;
  const offClients = new Set(offsite.map((o) => o.client)).size;

  // ------------------------------------------------ overdue penalties
  const feeItems = items.filter((i) => feeAt(i, asOf) > 0).map((i) => ({ i, fee: feeAt(i, asOf), prevFee: feeAt(i, prevAsOf), late: daysLate(i, asOf) })).sort((x, y) => y.fee - x.fee);
  const penalties = feeItems.slice(0, 4).map(({ i, fee, prevFee, late }) => ({ item: i.title, client: i.client, late: `${late} d`, penalty: fee, delta: fee - prevFee, borneBy: "Client" }));
  if (feeItems.length > 4) {
    const rest = feeItems.slice(4);
    penalties.push({ item: `${rest.length} other overdue filings`, client: "Mixed", late: "varies", penalty: rest.reduce((s, x) => s + x.fee, 0), delta: rest.reduce((s, x) => s + x.fee - x.prevFee, 0), borneBy: "Client" });
  }

  // ------------------------------------------------ summary lines and next steps (worked out, not AI)
  const when = period === "today" ? "today" : period === "yesterday" ? "yesterday" : `in ${PERIODS[period].toLowerCase()}`;
  const topOverdueClient = [...items.filter((i) => overdueAt(i, asOf)).reduce((m, i) => m.set(i.client, (m.get(i.client) ?? 0) + 1), new Map<string, number>()).entries()].sort((x, y) => y[1] - x[1])[0];
  const leaveNames = lateNames(curRows.filter(isLeave));
  const summary = [
    { label: "Delivery", text: `${w.assigned} items assigned, ${w.completed} completed ${when}. ${w.overdue} of ${w.open} open items overdue (${fmtDelta(w.overdue - wp.overdue)} ${compare})${topOverdueClient ? `; most at ${topOverdueClient[0]} (${topOverdueClient[1]})` : ""}.` },
    { label: "Emergency", text: urgent[0] ? `${urgent[0].client}: ${urgent[0].item} — ${urgent[0].due.toLowerCase()}; ${urgent[0].issue.replace(/[.…]$/, "")}.` : "Nothing critical right now." },
    { label: "Blockers", text: `${w.pendingClient} items wait on client documents (${fmtDelta(w.pendingClient - wp.pendingClient)}) vs ${w.pendingTeam} on the team (${fmtDelta(w.pendingTeam - wp.pendingTeam)})${w.overdue ? `: overdue is mainly a ${w.pendingClient >= w.pendingTeam ? "client-data" : "team-capacity"} problem` : ""}.` },
    { label: "People", text: single ? `${a.present} of ${a.rows} present; ${a.late} late, ${a.leave} on leave${leaveNames.length ? ` (${leaveNames.slice(0, 3).join(", ")})` : ""}; ${a.offsite} offsite.` : `Attendance ${presentPct}% across ${a.days} working days; ${a.late} late arrivals, ${a.leave} leave days, ${a.offsite} offsite days.` },
    { label: "Cost", text: w.penalty ? `Estimated statutory late-fee exposure ${inr(w.penalty)} on ${feeItems.length} overdue filing${feeItems.length === 1 ? "" : "s"} (${w.penalty - wp.penalty >= 0 ? "▲" : "▼"} ${inr(Math.abs(w.penalty - wp.penalty))} ${compare}), rising daily until filed.` : "No late-fee exposure on overdue filings." },
  ];
  const priorities: string[] = [];
  for (const u of urgent.slice(0, 3)) priorities.push(`${u.owner}: ${u.issue.replace(/\.$/, "")} — ${u.client}, ${u.item} (${u.due.toLowerCase()}).`);
  if (pcRows[0]) priorities.push(`Send the Client Pending Report to ${pcRows[0].client} (${pcRows[0].items} item${pcRows[0].items === 1 ? "" : "s"}, oldest ${pcRows[0].age} days)${pcRows[0].age > 14 ? "; escalate to the partner" : ""}.`);
  if (feeItems[0]) priorities.push(`File ${feeItems[0].i.title} for ${feeItems[0].i.client} first: ${inr(feeItems[0].fee)} late fee and rising.`);
  if (w.overdue > 5) priorities.push(`Re-baseline due dates for the ${w.overdue} overdue items and give each one daily owner.`);
  if (a.late > 2) priorities.push(`Speak to the ${a.late} late arrivals: ≈${lostHours.toFixed(1)} hrs lost ${when}.`);

  const clientsOpen = new Set(items.filter((i) => openAt(i, asOf) && i.clientId).map((i) => i.client)).size;
  return {
    period, periodLabel: PERIODS[period], compareLabel: compare, singleDay: single, asOfDate: cur.to,
    rangeLabel: single ? longDate(cur.from) : `${shortDate(cur.from)} – ${shortDate(cur.to)} ${cur.to.slice(0, 4)}`,
    dateLabel: longDate(cur.to), generatedAt: now.toISOString(), firm: ctx.organization.tradeName,
    counts: { clients: clientsOpen, members: employees.length, items: count((i) => openAt(i, asOf)) },
    kpis, summary, attendanceByRole,
    attendanceTotal: { staff: employees.length, onTime: a.onTime, late: a.late, leave: a.leave, offsite: a.offsite, dLate: dAtt(a.late, ap.late), dLeave: dAtt(a.leave, ap.leave), dOffsite: dAtt(a.offsite, ap.offsite), dOnTime: dAtt(a.onTime, ap.onTime) },
    workload: workload.slice(0, 14), workloadTotal, urgent,
    pendingClient, pendingClientTotal: { items: w.pendingClient, delta: w.pendingClient - wp.pendingClient, note: pcRows.length > 6 ? `+${pcRows.length - 6} more clients` : noneWaiting.length ? `${noneWaiting.slice(0, 2).join(", ")}${noneWaiting.length > 2 ? ` +${noneWaiting.length - 2}` : ""}: nothing pending` : "" },
    late, lateByRole,
    offsite: offsite.slice(0, 8), offsiteTotal: offsite.length ? `${offMembers} member${offMembers === 1 ? "" : "s"} · ${offClients} client${offClients === 1 ? "" : "s"}` : "No offsite work",
    penalties, penaltyTotal: { penalty: w.penalty, delta: w.penalty - wp.penalty, note: `${feeItems.length} overdue filing${feeItems.length === 1 ? "" : "s"}` },
    priorities: priorities.slice(0, 6),
  };
}
