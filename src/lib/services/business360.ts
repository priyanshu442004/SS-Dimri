import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { addDays, dateOnly, hhmmToMinutes, isoDateInTz, toIsoDate, zonedDateTime } from "@/lib/dates";
import { upcomingDeadlines } from "@/lib/deadlines";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { OPEN_STATUSES } from "@/lib/domain/task-workflow";
import { workStatusOf } from "@/lib/domain/tracker";
import type { AppContext } from "@/lib/session";
import { TASK_STATUS_LABELS } from "./analytics";
import { teamAttendanceRows } from "./attendance";
import { toEscalate } from "./daily-plans";
import { getPolicy, ruleSubjects } from "./office-rules";
import { teamToday } from "./team-today";

// The Business 360° dashboard (client format, 20 Nov 2026): financials, clients and team on the first
// page; operations, tasks and compliance on the second. Every figure is worked out from the ERP's own
// records — engagements and their agreed fees, dues, salaries, timesheets, attendance, tasks, the
// Accounting Workflow Tracker, allocations and plans — for the chosen period, against the previous one,
// and narrowed by client, staff member, activity (type of work) and service.
//
// Money:
//   Revenue        = retainer fees accrued day by day (monthly fee ÷ days in that month, from the
//                    engagement's start to its end) + one-time fees of engagements completed in the period.
//   Staff cost     = each person's monthly salary ÷ days in the month, for every employed day.
//   Hourly cost    = monthly salary ÷ standard hours a month (26 working days × the office day less lunch).
//   Client profit  = client revenue − hours logged on the client × the hourly cost of whoever logged them.
//   Net profit     = revenue − staff cost (the firm), or − the cost of the hours in a slice (a filter).
//   Member revenue = Σ client revenue × the member's share of the hours logged on that client.

// ---------------------------------------------------------------- periods

export const BIZ_PERIODS = { today: "Today", yesterday: "Yesterday", "7d": "7 Days", month: "Month", quarter: "Quarter", year: "Year", custom: "Custom range" } as const;
export type BizPeriod = keyof typeof BIZ_PERIODS;
export type BizFilters = { period: BizPeriod; from: string; to: string; client: string; staff: string; activity: string; service: string };
type Range = { from: string; to: string };

const UUID = /^[0-9a-f-]{36}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const str = (v: unknown) => (typeof one(v) === "string" ? (one(v) as string).trim() : "");

/** Filters from the address (or the dashboard's own requests). Anything invalid falls back to "All" / Today. */
export function parseBizFilters(sp: Record<string, unknown>): BizFilters {
  const period = str(sp.period);
  const from = str(sp.from);
  const to = str(sp.to);
  return {
    period: period in BIZ_PERIODS ? (period as BizPeriod) : "today",
    from: ISO.test(from) ? from : "",
    to: ISO.test(to) ? to : "",
    client: UUID.test(str(sp.client)) ? str(sp.client) : "",
    staff: UUID.test(str(sp.staff)) ? str(sp.staff) : "",
    activity: str(sp.activity).slice(0, 80),
    service: UUID.test(str(sp.service)) ? str(sp.service) : "",
  };
}

export function bizQuery(f: BizFilters) {
  const p = new URLSearchParams();
  if (f.period !== "today") p.set("period", f.period);
  if (f.period === "custom") { if (f.from) p.set("from", f.from); if (f.to) p.set("to", f.to); }
  for (const k of ["client", "staff", "activity", "service"] as const) if (f[k]) p.set(k, f[k]);
  return p.toString();
}

const DAY_MS = 86_400_000;
const shift = (iso: string, days: number) => toIsoDate(addDays(dateOnly(iso), days));
const daysBetween = (a: string, b: string) => Math.round((dateOnly(b).getTime() - dateOnly(a).getTime()) / DAY_MS);
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const daysInMonth = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).getUTCDate();
const addMonths = (iso: string, n: number) => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7)) - 1 + n;
  const ym = new Date(Date.UTC(y, m, 1));
  const d = Math.min(Number(iso.slice(8, 10)), new Date(Date.UTC(ym.getUTCFullYear(), ym.getUTCMonth() + 1, 0)).getUTCDate());
  return `${ym.getUTCFullYear()}-${String(ym.getUTCMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};
/** Indian financial year quarter start (Apr, Jul, Oct, Jan). */
const quarterStart = (iso: string) => {
  const m = Number(iso.slice(5, 7));
  const qm = m >= 4 ? 4 + Math.floor((m - 4) / 3) * 3 : 1;
  return `${iso.slice(0, 4)}-${String(qm).padStart(2, "0")}-01`;
};
const fyStart = (iso: string) => (Number(iso.slice(5, 7)) >= 4 ? `${iso.slice(0, 4)}-04-01` : `${Number(iso.slice(0, 4)) - 1}-04-01`);
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" }).replace(" ", "-");
const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).replace(/,/g, "");
const rangeText = (r: Range) => (r.from === r.to ? short(r.from) : `${short(r.from)} – ${short(r.to)}`);

/**
 * The period and the one it is compared with (the client's rule): Today → yesterday, Yesterday → the day
 * before, 7 Days → the 7 days before, Month → the previous month, Quarter → the previous quarter, Year →
 * the previous year (the same span so far), Custom → the equal-length range just before it.
 */
export function bizRanges(f: BizFilters, today: string): { cur: Range; prev: Range; compare: string; prevShort: string } {
  switch (f.period) {
    case "yesterday": { const y = shift(today, -1); return { cur: { from: y, to: y }, prev: { from: shift(y, -1), to: shift(y, -1) }, compare: "vs day before", prevShort: "Prev." }; }
    case "7d": return { cur: { from: shift(today, -6), to: today }, prev: { from: shift(today, -13), to: shift(today, -7) }, compare: "vs prior 7 days", prevShort: "Prev." };
    case "month": {
      const s = monthStart(today);
      const ps = addMonths(s, -1);
      const pe = addMonths(today, -1) < ps ? ps : addMonths(today, -1);
      return { cur: { from: s, to: today }, prev: { from: ps, to: pe >= s ? shift(s, -1) : pe }, compare: "vs previous month", prevShort: "Prev." };
    }
    case "quarter": {
      const s = quarterStart(today);
      const ps = addMonths(s, -3);
      const pe = shift(ps, daysBetween(s, today));
      return { cur: { from: s, to: today }, prev: { from: ps, to: pe >= s ? shift(s, -1) : pe }, compare: "vs previous quarter", prevShort: "Prev." };
    }
    case "year": {
      const s = fyStart(today);
      const ps = addMonths(s, -12);
      const pe = addMonths(today, -12);
      return { cur: { from: s, to: today }, prev: { from: ps, to: pe >= s ? shift(s, -1) : pe }, compare: "vs previous year", prevShort: "Prev." };
    }
    case "custom": {
      let from = f.from || today;
      let to = f.to || from;
      if (to > today) to = today;
      if (from > to) from = to;
      if (daysBetween(from, to) > 730) from = shift(to, -730);
      const n = daysBetween(from, to) + 1;
      return { cur: { from, to }, prev: { from: shift(from, -n), to: shift(from, -1) }, compare: "vs preceding equal range", prevShort: "Prev." };
    }
    default: return { cur: { from: today, to: today }, prev: { from: shift(today, -1), to: shift(today, -1) }, compare: "vs yesterday", prevShort: "Yest." };
  }
}

// ---------------------------------------------------------------- formatting

/** ₹8.84L / ₹1.2Cr / ₹24k / ₹619 — the dashboard's compact Indian money format. */
export function inrShort(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${s}₹${Math.round(a)}`;
}
export const inrFull = (n: number) => `${n < 0 ? "-" : ""}₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const hoursText = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(1, "0")}m`;

export type Tone = "ok" | "warn" | "danger" | "info" | "ink" | "violet";
export type BizKpi = {
  key: string; label: string; display: string; prevDisplay: string; deltaDisplay: string;
  /** null = no comparison (no earlier data). */
  delta: number | null; better: "up" | "down" | "none"; hint: string; tone: Tone; href?: string; empty?: boolean;
};

function kpi(o: { key: string; label: string; value: number | null; prev: number | null; fmt: (n: number) => string; better: "up" | "down" | "none"; hint: string; tone: Tone; unit?: "pt" | "money" | "count" | "min"; href?: string; emptyText?: string }): BizKpi {
  if (o.value === null) return { key: o.key, label: o.label, display: o.emptyText ?? "No data", prevDisplay: "—", deltaDisplay: "no data", delta: null, better: o.better, hint: o.hint, tone: o.tone, href: o.href, empty: true };
  const prevDisplay = o.prev === null ? "—" : o.fmt(o.prev);
  let deltaDisplay = "no earlier data";
  let delta: number | null = null;
  if (o.prev !== null) {
    delta = o.value - o.prev;
    if (Math.abs(delta) < 1e-9) deltaDisplay = "no change";
    else {
      const sign = delta > 0 ? "+" : "-";
      const abs = Math.abs(delta);
      const amount = o.unit === "count" && abs < 10 && !Number.isInteger(Math.round(abs * 10) / 10) ? `${sign}${(Math.round(abs * 10) / 10).toFixed(1)}` : o.unit === "pt" ? `${sign}${Math.round(abs)} pt` : o.unit === "money" ? `${sign}${inrShort(abs).replace("₹", "")}` : o.unit === "min" ? `${sign}${hoursText(abs).replace("0h ", "")}` : `${sign}${Math.round(abs).toLocaleString("en-IN")}`;
      const rel = o.unit !== "pt" && o.prev !== 0 ? ` · ${Math.round((abs / Math.abs(o.prev)) * 100)}%` : "";
      deltaDisplay = `${amount}${rel}`;
    }
  }
  return { key: o.key, label: o.label, display: o.fmt(o.value), prevDisplay, deltaDisplay, delta, better: o.better, hint: o.hint, tone: o.tone, href: o.href };
}

// ---------------------------------------------------------------- the data

export type BizData = {
  filters: BizFilters;
  periodLabel: string;
  rangeLabel: string;
  prevRangeLabel: string;
  compare: string;
  prevShort: string;
  singleDay: boolean;
  /** First and last day of the period, YYYY-MM-DD. */
  fromDate: string;
  asOfDate: string;
  reportDate: string;
  generatedAt: string;
  firm: string;
  filterText: string;
  options: { clients: { value: string; label: string }[]; staff: { value: string; label: string }[]; activities: string[]; services: { value: string; label: string }[] };
  kpis: BizKpi[];
  health: { label: string; text: string; tone: "ok" | "warn" | "danger" | "muted" }[];
  finance: { feesRecorded: number; engagements: number; salaryStaff: number; staff: number; revenue: number; cost: number | null; retainer: number; oneTime: number };
  clientScore: { client: string; code: string; nature: string; revenue: number; profit: number | null; margin: number | null; hours: number }[];
  clientTotal: { revenue: number; profit: number | null; margin: number | null };
  teamScore: { member: string; role: string; revenue: number; profit: number | null; margin: number | null; late: number; leave: number; hours: number }[];
  teamTotal: { profit: number | null; margin: number | null; late: number; leave: number };
  attendance: { label: string; members: { member: string; onTime: number; late: number; leave: number; absent: number }[] };
  punctuality: { label: string; weeks: { label: string; late: number; leave: number; onTimePct: number | null }[] };
  insights: string[];
  risks: { label: string; text: string }[];
  questions: string[];
  // page 2
  opsKpis: BizKpi[];
  actionKpis: BizKpi[];
  alerts: string[];
  tasksByStatus: { label: string; value: number; status: string }[];
  tasksCreated: number;
  tasksCompleted: number;
  hoursByClient: { client: string; minutes: number }[];
  hoursTotal: number;
  openPerMember: { member: string; open: number }[];
  deadlines: { title: string; client: string; due: string; overdue: boolean; href: string }[];
  review: { title: string; client: string; due: string | null; by: string; href: string }[];
  reviewTotal: number;
  statutory: { day: string; month: string; title: string; form: string; department: string; daysLeft: number }[];
  recent: { action: string; actor: string; at: string }[];
  /** Ids the operations-detail report is narrowed to (null = everyone / every client). */
  scope: { clientIds: string[] | null; staffIds: string[] | null };
};

const TASK_ORDER = ["PENDING", "ASSIGNED", "IN_PROGRESS", "ON_HOLD", "AWAITING_CLIENT", "AWAITING_TEAM_MEMBER", "PENDING_REVIEW", "CHANGES_REQUESTED", "COMPLETED"];
const OPEN = new Set<string>(OPEN_STATUSES);

/** `range`: an explicit period instead of the filter's (the weekly report: Monday to Sunday vs the week before). */
export async function business360(ctx: AppContext, f: BizFilters, range?: { cur: Range; prev: Range; compare: string; label: string }): Promise<BizData> {
  const org = ctx.organization.id;
  const tz = ctx.organization.timezone;
  const now = new Date();
  const today = isoDateInTz(now, tz);
  const { cur, prev, compare, prevShort } = range ? { ...range, prevShort: "Prev wk" } : bizRanges(f, today);
  const single = cur.from === cur.to;
  const startOf = (iso: string) => zonedDateTime(iso, 0, tz);
  const endOf = (iso: string) => (iso >= today ? now : new Date(zonedDateTime(shift(iso, 1), 0, tz).getTime() - 1));
  const asOf = endOf(cur.to);
  const prevAsOf = endOf(prev.to);
  // Window for history-based figures: the previous period's start (and the month for single-day charts).
  // One day is too little for the attendance charts: they show the last 4 weeks then.
  const chartRange: Range = single ? { from: shift(cur.to, -27), to: cur.to } : cur;
  const winFrom = [prev.from, chartRange.from, cur.from].sort()[0];

  // ------------------------------------------------ every independent read starts at once (one round trip)
  const yIso = shift(today, -1);
  const entriesP = prisma.timesheetEntry.findMany({
    where: { organizationId: org, workDate: { gte: dateOnly(winFrom), lte: dateOnly(cur.to) } },
    select: { employeeId: true, clientId: true, workDate: true, approxMinutes: true, typeOfWork: true, taskId: true, clientService: { select: { serviceId: true } }, workType: { select: { name: true } } },
  });
  const duesP = prisma.clientDue.findMany({
    where: { organizationId: org, createdAt: { lte: asOf } },
    select: { clientId: true, amount: true, status: true, settledAt: true, createdAt: true, clientServiceId: true, clientService: { select: { serviceId: true } } },
  });
  const tasksP = prisma.task.findMany({
    where: { organizationId: org, createdAt: { lte: asOf } },
    take: 6000,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, title: true, status: true, dueAt: true, createdAt: true, completedAt: true, clientId: true, makerEmployeeId: true, checkerEmployeeId: true,
      client: { select: { tradeName: true } }, clientService: { select: { serviceId: true } },
      assignments: { where: { removedAt: null }, select: { employeeId: true } },
      activities: { where: { type: "STATUS_CHANGED" }, orderBy: { createdAt: "asc" }, select: { fromValue: true, toValue: true, createdAt: true } },
    },
  });
  const linesP = prisma.trackerLine.findMany({
    where: { organizationId: org, clientPendingItem: { not: null } },
    select: { clientId: true, clientPendingStatus: true, clientRaisedOn: true, createdAt: true, dateReceived: true, typeOfWork: true, makerEmployeeId: true, checkerEmployeeId: true, statusOfWork: true, checkerStatus: true, updatedAt: true },
  });
  const onboardingP = prisma.employee.findMany({ where: { organizationId: org, onboardingSubmittedAt: { not: null } }, select: { onboardingSubmittedAt: true, approvedAt: true, approvalStatus: true } });
  const firstsP = Promise.all([
    prisma.timesheetEntry.aggregate({ where: { organizationId: org }, _min: { workDate: true } }),
    // Attendance counts from the first day the firm really used it (at least 3 people, or a quarter of the staff, marked).
    prisma.attendanceRecord.groupBy({ by: ["attendanceDate"], where: { organizationId: org }, _count: { _all: true }, orderBy: { attendanceDate: "asc" } }),
    prisma.task.aggregate({ where: { organizationId: org }, _min: { createdAt: true } }),
  ]);
  const todayP = Promise.all([teamToday(ctx), ruleSubjects(org), toEscalate(ctx)]);
  const queuesP = Promise.all([
    prisma.dailyPlan.findMany({ where: { organizationId: org, planDate: { in: [dateOnly(yIso), dateOnly(today)] } }, select: { employeeId: true, planDate: true, planSubmittedAt: true, approvedAt: true } }),
    prisma.attendanceRequest.findMany({ where: { organizationId: org, kind: { in: ["OVERTIME", "EARLY_LEAVE"] }, createdAt: { lte: now }, OR: [{ status: "PENDING" }, { decidedAt: { gte: startOf(yIso) } }] }, select: { employeeId: true, status: true, createdAt: true, decidedAt: true } }),
    prisma.leaveRequest.findMany({ where: { organizationId: org, OR: [{ status: "PENDING" }, { decidedAt: { gte: startOf(yIso) } }] }, select: { employeeId: true, status: true, createdAt: true, decidedAt: true } }),
    prisma.pendingItem.findMany({ where: { organizationId: org, OR: [{ status: { not: "CLOSED" } }, { closedAt: { gte: startOf(yIso) } }] }, select: { clientId: true, createdAt: true, requestedOn: true, closedAt: true, status: true, pendingWithEmployeeId: true, raisedByEmployeeId: true } }),
  ]);
  for (const p of [entriesP, duesP, tasksP, linesP, onboardingP, firstsP, todayP, queuesP]) p.catch(() => undefined); // awaited below

  // ------------------------------------------------ master data and options
  const [policy, employees, clients, services, workTypes, engagements, allocations] = await Promise.all([
    getPolicy(org),
    prisma.employee.findMany({
      where: { organizationId: org, approvalStatus: "APPROVED" },
      select: {
        id: true, firstName: true, lastName: true, employmentStatus: true, dateOfJoining: true, exitDate: true,
        designation: { select: { name: true } }, membership: { select: { role: true, userId: true } },
        salaryRecords: { orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }], select: { effectiveFrom: true, agreedSalary: true, salaryPeriod: true } },
      },
    }),
    prisma.client.findMany({ where: { organizationId: org }, select: { id: true, tradeName: true, clientCode: true, status: true, natureOfClient: true, approvedAt: true, createdAt: true, rejectedAt: true } }),
    prisma.service.findMany({ where: { organizationId: org }, orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
    prisma.workType.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
    prisma.clientService.findMany({
      where: { organizationId: org },
      select: { id: true, clientId: true, serviceId: true, agreedFee: true, engagementNature: true, startDate: true, retainerStartDate: true, retainerEndDate: true, status: true, completedAt: true, createdAt: true, updatedAt: true },
    }),
    prisma.teamAllocation.findMany({ where: { organizationId: org }, select: { clientId: true, employeeId: true, status: true, startDate: true, endDate: true, clientServiceId: true } }),
  ]);
  const active = employees.filter((e) => e.employmentStatus !== "EXITED");
  const empById = new Map(employees.map((e) => [e.id, e]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const fullName = (id: string) => { const e = empById.get(id); return e ? `${e.firstName} ${e.lastName ?? ""}`.trim() : "—"; };
  const firstName = (id: string | null | undefined) => (id && empById.get(id)?.firstName) || "—";
  const roleOf = (id: string) => { const e = empById.get(id); return e?.designation?.name ?? (e?.membership?.role ? ROLE_LABELS[e.membership.role as Role] : "Team member"); };

  // ------------------------------------------------ the slice (dimension filters)
  const svcClients = f.service ? new Set(engagements.filter((x) => x.serviceId === f.service && x.status !== "CANCELLED").map((x) => x.clientId)) : null;
  const staffClients = f.staff ? new Set(allocations.filter((a) => a.employeeId === f.staff && a.status !== "CANCELLED").map((a) => a.clientId)) : null;
  const allocOverlap = (a: (typeof allocations)[number], r: Range) => a.status !== "CANCELLED" && toIsoDate(a.startDate) <= r.to && (!a.endDate || toIsoDate(a.endDate) >= r.from);

  // Timesheet over the whole window (filtered later by slice).
  const entries = await entriesP;
  const [firstEntry, attDays, firstTask] = await firstsP;
  const usedFrom = attDays.find((d) => d._count._all >= Math.max(3, employees.length / 4));
  const attStart = usedFrom ? toIsoDate(usedFrom.attendanceDate) : today;
  const timeStart = firstEntry._min.workDate ? toIsoDate(firstEntry._min.workDate) : today;
  const taskStart = firstTask._min.createdAt ?? now;
  const typeOf = (e: (typeof entries)[number]) => e.workType?.name ?? e.typeOfWork ?? "";
  const activityTasks = f.activity ? new Set(entries.filter((e) => typeOf(e) === f.activity && e.taskId).map((e) => e.taskId!)) : null;

  // Which clients and staff the slice covers (null = all).
  let clientIds: Set<string> | null = null;
  if (f.client) clientIds = new Set([f.client]);
  if (svcClients) clientIds = clientIds ? new Set([...clientIds].filter((c) => svcClients.has(c))) : svcClients;
  let staffIds: Set<string> | null = f.staff ? new Set([f.staff]) : null;
  if (!f.staff && (f.client || f.service)) {
    // Staff of a client / service slice: allocated to it in the period, or who logged time on it.
    const s = new Set<string>();
    for (const a of allocations) if (clientIds!.has(a.clientId) && allocOverlap(a, { from: winFrom, to: cur.to })) s.add(a.employeeId);
    for (const e of entries) if (e.clientId && clientIds!.has(e.clientId)) s.add(e.employeeId);
    staffIds = s;
  }
  if (f.activity) {
    const s = new Set(entries.filter((e) => typeOf(e) === f.activity).map((e) => e.employeeId));
    staffIds = staffIds ? new Set([...staffIds].filter((x) => s.has(x))) : s;
  }
  const inClients = (id: string | null | undefined) => !clientIds || (!!id && clientIds.has(id));
  const inStaff = (id: string | null | undefined) => !staffIds || (!!id && staffIds.has(id));
  const entryIn = (e: (typeof entries)[number]) =>
    inStaff(e.employeeId) && (!clientIds || inClients(e.clientId)) && (!f.activity || typeOf(e) === f.activity)
    && (!f.service || e.clientService?.serviceId === f.service || (!!e.clientId && !!svcClients?.has(e.clientId)));
  const sliceEntries = entries.filter(entryIn);
  const entriesIn = (r: Range) => sliceEntries.filter((e) => { const d = toIsoDate(e.workDate); return d >= r.from && d <= r.to; });

  // ------------------------------------------------ revenue
  const natureOf = (x: (typeof engagements)[number]) => x.engagementNature ?? clientById.get(x.clientId)?.natureOfClient ?? "ONE_TIME";
  const feeEngagements = engagements.filter((x) => x.agreedFee !== null && Number(x.agreedFee) > 0 && (!f.service || x.serviceId === f.service) && inClients(x.clientId));
  /** Revenue per client in a range: { retainer, oneTime }. */
  const revenueIn = (r: Range) => {
    const m = new Map<string, { retainer: number; oneTime: number }>();
    const add = (c: string, k: "retainer" | "oneTime", v: number) => { const g = m.get(c) ?? { retainer: 0, oneTime: 0 }; g[k] += v; m.set(c, g); };
    for (const x of feeEngagements) {
      const fee = Number(x.agreedFee);
      if (natureOf(x) === "RETAINER") {
        const start = toIsoDate(x.retainerStartDate ?? x.startDate ?? dateOnly(isoDateInTz(x.createdAt, tz)));
        const ended = x.status === "COMPLETED" || x.status === "CANCELLED" || x.status === "ON_HOLD" ? isoDateInTz(x.completedAt ?? x.updatedAt, tz) : null;
        const end = [x.retainerEndDate ? toIsoDate(x.retainerEndDate) : null, ended].filter((v): v is string => !!v).sort()[0] ?? null;
        const a = start > r.from ? start : r.from;
        const b = end && end < r.to ? end : r.to;
        let v = 0;
        for (let d = a; d <= b; d = shift(d, 1)) v += fee / daysInMonth(d);
        if (v > 0) add(x.clientId, "retainer", v);
      } else if (x.status === "COMPLETED" && x.completedAt) {
        const d = isoDateInTz(x.completedAt, tz);
        if (d >= r.from && d <= r.to) add(x.clientId, "oneTime", fee);
      }
    }
    return m;
  };

  // ------------------------------------------------ staff cost
  const officeDay = hhmmToMinutes(policy.row.officeEnd) - hhmmToMinutes(policy.row.officeStart)
    - Math.max(0, hhmmToMinutes(policy.row.lunchEnd) - hhmmToMinutes(policy.row.lunchStart));
  const stdMonthHours = (26 * Math.max(240, officeDay)) / 60;
  const monthlyOn = (id: string, d: string) => {
    const recs = empById.get(id)?.salaryRecords ?? [];
    let hit: (typeof recs)[number] | null = null;
    for (const r of recs) if (toIsoDate(r.effectiveFrom) <= d) hit = r;
    hit ??= recs[0] ?? null; // a salary entered with a later date still prices earlier work
    if (!hit) return null;
    const amt = Number(hit.agreedSalary);
    return hit.salaryPeriod === "ANNUAL" ? amt / 12 : amt;
  };
  const hasSalary = (id: string) => (empById.get(id)?.salaryRecords.length ?? 0) > 0;
  const hourlyCost = (id: string, d: string) => { const m = monthlyOn(id, d); return m === null ? null : m / stdMonthHours; };
  const salaryCost = (id: string, r: Range) => {
    const e = empById.get(id);
    if (!e || !hasSalary(id)) return 0;
    // From the day the first recorded salary takes effect (or joining, if later); never before.
    const firstPay = toIsoDate(e.salaryRecords[0].effectiveFrom);
    const joined = e.dateOfJoining ? toIsoDate(e.dateOfJoining) : null;
    const join = joined && joined > firstPay ? joined : firstPay;
    const exit = e.exitDate ? toIsoDate(e.exitDate) : null;
    let v = 0;
    for (let d = r.from; d <= r.to; d = shift(d, 1)) {
      if ((join && d < join) || (exit && d > exit)) continue;
      v += (monthlyOn(id, d) ?? 0) / daysInMonth(d);
    }
    return v;
  };

  // ------------------------------------------------ finance per range
  const financeIn = (r: Range) => {
    const rev = revenueIn(r);
    const ents = entriesIn(r);
    // Hours per client and per (client, member) — the basis of attribution and client cost.
    const clientMin = new Map<string, number>();
    const memberClientMin = new Map<string, number>();
    const allClientMin = new Map<string, number>(); // every member's hours on the client, for shares
    for (const e of entries) {
      const d = toIsoDate(e.workDate);
      if (d < r.from || d > r.to || !e.clientId) continue;
      if (f.service && !(e.clientService?.serviceId === f.service || svcClients?.has(e.clientId))) continue;
      allClientMin.set(e.clientId, (allClientMin.get(e.clientId) ?? 0) + (e.approxMinutes ?? 0));
    }
    const clientCost = new Map<string, number>();
    let costedMin = 0;
    for (const e of ents) {
      const m = e.approxMinutes ?? 0;
      if (!e.clientId) continue;
      clientMin.set(e.clientId, (clientMin.get(e.clientId) ?? 0) + m);
      const k = `${e.clientId}|${e.employeeId}`;
      memberClientMin.set(k, (memberClientMin.get(k) ?? 0) + m);
      const hc = hourlyCost(e.employeeId, toIsoDate(e.workDate));
      if (hc !== null) { clientCost.set(e.clientId, (clientCost.get(e.clientId) ?? 0) + (hc * m) / 60); costedMin += m; }
    }
    // Revenue counted for the slice: a staff / activity slice gets the clients' revenue in proportion
    // to its share of the hours on each client.
    const shareOf = (clientId: string) => {
      if (!f.staff && !f.activity) return 1;
      const all = allClientMin.get(clientId) ?? 0;
      return all > 0 ? (clientMin.get(clientId) ?? 0) / all : 0;
    };
    const perClient = new Map<string, { retainer: number; oneTime: number; revenue: number; cost: number; minutes: number }>();
    for (const [c, v] of rev) {
      const s = shareOf(c);
      perClient.set(c, { retainer: v.retainer * s, oneTime: v.oneTime * s, revenue: (v.retainer + v.oneTime) * s, cost: 0, minutes: 0 });
    }
    for (const [c, m] of clientMin) {
      const g = perClient.get(c) ?? { retainer: 0, oneTime: 0, revenue: 0, cost: 0, minutes: 0 };
      g.minutes = m;
      g.cost = clientCost.get(c) ?? 0;
      perClient.set(c, g);
    }
    let revenue = 0, retainer = 0, oneTime = 0;
    for (const g of perClient.values()) { revenue += g.revenue; retainer += g.retainer; oneTime += g.oneTime; }
    const totalMin = ents.reduce((s, e) => s + (e.approxMinutes ?? 0), 0);
    const billableMin = ents.filter((e) => e.clientId).reduce((s, e) => s + (e.approxMinutes ?? 0), 0);
    // Cost: the whole firm (or one person) = salaries for the days; a client / service / activity slice = its hours.
    const salaried = [...(staffIds ?? new Set(active.map((e) => e.id)))].filter(hasSalary);
    const anySalary = salaried.length > 0;
    const sliceByHours = !!(f.client || f.service || f.activity);
    let cost: number | null;
    if (!anySalary) cost = null;
    else if (sliceByHours) cost = ents.reduce((s, e) => { const hc = hourlyCost(e.employeeId, toIsoDate(e.workDate)); return s + (hc === null ? 0 : (hc * (e.approxMinutes ?? 0)) / 60); }, 0);
    else cost = salaried.reduce((s, id) => s + salaryCost(id, r), 0);
    // Member revenue (attribution by hours).
    const memberRev = new Map<string, number>();
    for (const [k, m] of memberClientMin) {
      const [c, emp] = k.split("|");
      const all = allClientMin.get(c) ?? 0;
      const g = rev.get(c);
      if (!g || !all) continue;
      memberRev.set(emp, (memberRev.get(emp) ?? 0) + ((g.retainer + g.oneTime) * m) / all);
    }
    return { perClient, revenue, retainer, oneTime, cost, totalMin, billableMin, costedMin, memberRev };
  };
  const fin = financeIn(cur);
  const finP = financeIn(prev);
  const profit = fin.cost === null ? null : fin.revenue - fin.cost;
  const profitP = finP.cost === null ? null : finP.revenue - finP.cost;

  // ------------------------------------------------ clients, dues
  const clientsAt = (at: Date, status: "ACTIVE" | "PENDING") => clients.filter((c) => {
    if (!inClients(c.id) || (staffClients && !staffClients.has(c.id))) return false;
    if (status === "ACTIVE") return c.status === "ACTIVE" && (!c.approvedAt || c.approvedAt <= at) && c.createdAt <= at;
    return c.createdAt <= at && (c.status === "PENDING_APPROVAL" ? true : !!c.approvedAt && c.approvedAt > at) && !(c.rejectedAt && c.rejectedAt <= at);
  }).length;
  const scopedClients = clients.filter((c) => inClients(c.id) && (!staffClients || staffClients.has(c.id)));
  const byStatus = (s: string) => scopedClients.filter((c) => c.status === s).length;
  const activeNow = clientsAt(asOf, "ACTIVE");
  const activeBefore = clientsAt(prevAsOf, "ACTIVE");

  const dues = await duesP;
  const duesAt = (at: Date) => dues.filter((d) => inClients(d.clientId) && (!staffClients || staffClients.has(d.clientId)) && (!f.service || d.clientService?.serviceId === f.service || svcClients?.has(d.clientId)) && d.createdAt <= at && (d.status === "OPEN" || (!!d.settledAt && d.settledAt > at)));
  const duesNow = duesAt(asOf);
  const duesPrev = duesAt(prevAsOf);
  const duesSum = (l: typeof dues) => l.reduce((s, d) => s + Number(d.amount), 0);
  const duesByClient = new Map<string, number>();
  for (const d of duesNow) duesByClient.set(d.clientId, (duesByClient.get(d.clientId) ?? 0) + Number(d.amount));
  const topDue = [...duesByClient.entries()].sort((a, b) => b[1] - a[1])[0];

  // ------------------------------------------------ attendance
  const attFrom = winFrom < attStart ? attStart : winFrom;
  const att = attFrom <= cur.to
    ? (await teamAttendanceRows(ctx, policy, { from: attFrom, to: cur.to, q: "", status: "", departmentId: "", employeeId: "" })).rows
      .filter((x) => inStaff(x.employee.id) && empById.get(x.employee.id)?.employmentStatus !== "EXITED")
    : [];
  type AttRow = (typeof att)[number];
  const isPresent = (x: AttRow) => x.state === "PRESENT" || x.state === "HALF_DAY";
  const isLeave = (x: AttRow) => x.state === "LEAVE" || x.approvedLeave;
  const isAbsent = (x: AttRow) => x.state === "ABSENT" || (x.state === "NOT_MARKED" && toIsoDate(x.date) < today);
  const attIn = (r: Range) => att.filter((x) => { const d = toIsoDate(x.date); return d >= r.from && d <= r.to; });
  const attStats = (rows: AttRow[]) => {
    const present = rows.filter(isPresent).length;
    const late = rows.filter((x) => x.isLate).length;
    return { rows: rows.length, present, late, onTime: present - late, leave: rows.filter(isLeave).length, absent: rows.filter(isAbsent).length, lateMin: rows.reduce((s, x) => s + (x.isLate ? x.lateMinutes : 0), 0), days: new Set(rows.map((x) => toIsoDate(x.date))).size };
  };
  const aCur = attStats(attIn(cur));
  const aPrev = attStats(attIn(prev));
  const onTimePct = aCur.present ? pct(aCur.onTime, aCur.present) : null;
  const onTimePrev = aPrev.present && prev.to >= attStart ? pct(aPrev.onTime, aPrev.present) : null;

  // ------------------------------------------------ client & team scorecards
  const codeOf = (id: string) => { const c = clientById.get(id); return c?.clientCode || (c?.tradeName ?? "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 3).toUpperCase(); };
  const clientRows = [...fin.perClient.entries()].filter(([, g]) => g.revenue > 0).map(([c, g]) => {
    const p = fin.cost === null ? null : g.revenue - g.cost;
    return { client: clientById.get(c)?.tradeName ?? "—", code: codeOf(c), nature: g.retainer > 0 ? "Retainer" : "One-time", revenue: g.revenue, profit: p, margin: p === null || !g.revenue ? null : Math.round((p / g.revenue) * 100), hours: g.minutes / 60 };
  }).sort((a, b) => b.revenue - a.revenue);
  const crRev = clientRows.reduce((s, r) => s + r.revenue, 0);
  const crProfit = fin.cost === null ? null : clientRows.reduce((s, r) => s + (r.profit ?? 0), 0);
  const topClient = clientRows[0];
  const topShare = topClient && fin.revenue > 0 ? pct(topClient.revenue, fin.revenue) : null;
  const finPRows = [...finP.perClient.entries()].map(([c, g]) => ({ c, rev: g.revenue })).sort((a, b) => b.rev - a.rev);
  const topShareP = finPRows[0] && finP.revenue > 0 ? pct(finPRows[0].rev, finP.revenue) : null;

  const curAtt = attIn(cur);
  const memberIds = [...new Set([...(staffIds ?? new Set(active.map((e) => e.id)))])].filter((id) => empById.get(id)?.employmentStatus !== "EXITED");
  const memberMin = new Map<string, number>();
  for (const e of entriesIn(cur)) memberMin.set(e.employeeId, (memberMin.get(e.employeeId) ?? 0) + (e.approxMinutes ?? 0));
  const teamRows = memberIds.map((id) => {
    const rev = fin.memberRev.get(id) ?? 0;
    const cost = hasSalary(id) ? salaryCost(id, cur) : null;
    const p = cost === null ? null : rev - cost;
    const rows = curAtt.filter((x) => x.employee.id === id);
    return { id, member: fullName(id), role: roleOf(id), revenue: rev, profit: p, margin: p === null || !rev ? null : Math.round((p / rev) * 100), late: rows.filter((x) => x.isLate).length, leave: rows.filter(isLeave).length, hours: (memberMin.get(id) ?? 0) / 60 };
  }).filter((r) => r.hours > 0 || r.late || r.leave || r.revenue > 0 || r.profit !== null)
    .sort((a, b) => b.hours - a.hours || b.revenue - a.revenue || a.member.localeCompare(b.member));
  const teamProfit = profit;

  // ------------------------------------------------ attendance chart & punctuality
  const chartRows = attIn(chartRange);
  const attMembers = memberIds.map((id) => {
    const rows = chartRows.filter((x) => x.employee.id === id);
    const late = rows.filter((x) => x.isLate).length;
    return { member: empById.get(id)?.firstName ?? "—", onTime: rows.filter(isPresent).length - late, late, leave: rows.filter(isLeave).length, absent: rows.filter(isAbsent).length };
  }).filter((m) => m.onTime + m.late + m.leave + m.absent > 0).sort((a, b) => a.member.localeCompare(b.member));
  const workDays = new Set(chartRows.map((x) => toIsoDate(x.date))).size;
  // Weeks (Monday to Sunday) across the chart range — at least the last 4 weeks.
  const pStart = daysBetween(chartRange.from, chartRange.to) < 27 ? shift(chartRange.to, -27) : chartRange.from;
  const mondayOf = (iso: string) => shift(iso, -((dateOnly(iso).getUTCDay() + 6) % 7));
  const pRows = att.filter((x) => toIsoDate(x.date) >= pStart && toIsoDate(x.date) <= chartRange.to);
  const pFrom = pStart < attStart ? attStart : pStart;
  const pFallback = pFrom < attFrom
    ? (await teamAttendanceRows(ctx, policy, { from: pFrom, to: shift(attFrom, -1), q: "", status: "", departmentId: "", employeeId: "" })).rows.filter((x) => inStaff(x.employee.id))
    : [];
  const weekRows = [...pRows, ...pFallback];
  const weeks: { label: string; late: number; leave: number; onTimePct: number | null }[] = [];
  for (let w = mondayOf(pStart < attStart ? attStart : pStart), i = 1; w <= chartRange.to; w = shift(w, 7), i++) {
    const rows = weekRows.filter((x) => { const d = toIsoDate(x.date); return d >= w && d <= shift(w, 6); });
    const s = attStats(rows);
    weeks.push({ label: `Wk ${i} · ${short(w)}`, late: s.late, leave: s.leave, onTimePct: s.present ? pct(s.onTime, s.present) : null });
  }
  const weeksShown = weeks.slice(-8);

  // ------------------------------------------------ tasks (status as it was at a moment)
  const tasks = await tasksP;
  const taskIn = (t: (typeof tasks)[number]) =>
    (!clientIds || inClients(t.clientId)) && (!f.service || t.clientService?.serviceId === f.service || (!!t.clientId && !!svcClients?.has(t.clientId)))
    && (!f.staff || t.makerEmployeeId === f.staff || t.checkerEmployeeId === f.staff || t.assignments.some((a) => a.employeeId === f.staff))
    && (!activityTasks || activityTasks.has(t.id));
  const sliceTasks = tasks.filter(taskIn);
  const statusAt = (t: (typeof tasks)[number], at: Date) => {
    if (t.createdAt > at) return null;
    if (at >= now) return t.status;
    let s: string | null = null;
    for (const a of t.activities) { if (a.createdAt <= at) s = a.toValue; else break; }
    return s ?? t.activities[0]?.fromValue ?? t.status;
  };
  const taskCount = (at: Date, test: (s: string, t: (typeof tasks)[number]) => boolean) => sliceTasks.filter((t) => { const s = statusAt(t, at); return !!s && test(s, t); }).length;
  const openNow = taskCount(asOf, (s) => OPEN.has(s));
  const openPrev = taskCount(prevAsOf, (s) => OPEN.has(s));
  const overdueAt = (at: Date) => taskCount(at, (s, t) => OPEN.has(s) && !!t.dueAt && t.dueAt < at);
  const overdueNow = overdueAt(asOf);
  const overduePrev = overdueAt(prevAsOf);
  const reviewNow = taskCount(asOf, (s) => s === "PENDING_REVIEW");
  const reviewPrev = taskCount(prevAsOf, (s) => s === "PENDING_REVIEW");
  const waitingClientNow = taskCount(asOf, (s) => s === "AWAITING_CLIENT");
  const inRange = (d: Date | null, r: Range) => !!d && d >= startOf(r.from) && d <= endOf(r.to);
  const statusCounts = TASK_ORDER.map((s) => ({ status: s, label: TASK_STATUS_LABELS[s] ?? s, value: s === "COMPLETED" ? sliceTasks.filter((t) => statusAt(t, asOf) === "COMPLETED" && inRange(t.completedAt, cur)).length : taskCount(asOf, (x) => x === s) }));
  const created = sliceTasks.filter((t) => inRange(t.createdAt, cur)).length;
  const completed = sliceTasks.filter((t) => inRange(t.completedAt, cur)).length;

  // Tracker items waiting on the client (the client-data flow), as of the period end.
  const lines = await linesP;
  const linesWaiting = lines.filter((l) => (!clientIds || inClients(l.clientId)) && (!f.staff || l.makerEmployeeId === f.staff || l.checkerEmployeeId === f.staff) && (!f.activity || l.typeOfWork === f.activity)
    && workStatusOf(l) !== "Completed" && (l.clientRaisedOn ?? l.createdAt) <= asOf && (l.clientPendingStatus !== "Cleared" || (!!l.dateReceived && l.dateReceived > asOf))).length;

  // ------------------------------------------------ open tasks per member, deadlines, review
  const openPer = new Map<string, number>();
  for (const t of sliceTasks) {
    if (!OPEN.has(statusAt(t, asOf) ?? "")) continue;
    for (const id of new Set(t.assignments.map((a) => a.employeeId))) if (inStaff(id)) openPer.set(id, (openPer.get(id) ?? 0) + 1);
  }
  const openPerMember = [...openPer.entries()].map(([id, n]) => ({ member: fullName(id), open: n })).sort((a, b) => b.open - a.open || a.member.localeCompare(b.member)).slice(0, 10);
  const week = new Date(asOf.getTime() + 7 * DAY_MS);
  const dueTime = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz });
  const deadlines = sliceTasks.filter((t) => OPEN.has(statusAt(t, asOf) ?? "") && t.dueAt && t.dueAt <= week)
    .sort((a, b) => a.dueAt!.getTime() - b.dueAt!.getTime())
    .sort((a, b) => Number(b.dueAt! < asOf) - Number(a.dueAt! < asOf))
    .slice(0, 10)
    .map((t) => ({ title: t.title, client: t.client?.tradeName ?? "Internal", due: t.dueAt! < asOf ? "Overdue" : dueTime(t.dueAt!), overdue: t.dueAt! < asOf, href: `/app/tasks/${t.id}` }));
  const reviewList = sliceTasks.filter((t) => statusAt(t, asOf) === "PENDING_REVIEW").sort((a, b) => (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  const review = reviewList.slice(0, 5).map((t) => ({ title: t.title, client: t.client?.tradeName ?? "Internal", due: t.dueAt ? t.dueAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: tz }) : null, by: firstName(t.makerEmployeeId ?? t.assignments[0]?.employeeId), href: `/app/tasks/${t.id}` }));

  // ------------------------------------------------ hours by client
  const hoursMap = new Map<string, number>();
  let hoursTotal = 0;
  for (const e of entriesIn(cur)) {
    hoursTotal += e.approxMinutes ?? 0;
    if (e.clientId) hoursMap.set(e.clientId, (hoursMap.get(e.clientId) ?? 0) + (e.approxMinutes ?? 0));
  }
  const hoursByClient = [...hoursMap.entries()].map(([c, m]) => ({ client: clientById.get(c)?.tradeName ?? "—", minutes: m })).sort((a, b) => b.minutes - a.minutes).slice(0, 8);
  const prevMinutes = entriesIn(prev).reduce((s, e) => s + (e.approxMinutes ?? 0), 0);

  // ------------------------------------------------ allocations, approvals
  const allocsAt = (iso: string) => allocations.filter((a) => inClients(a.clientId) && inStaff(a.employeeId) && (a.status === "ACTIVE" || a.status === "PLANNED" || a.status === "ENDED") && toIsoDate(a.startDate) <= iso && (!a.endDate || toIsoDate(a.endDate) >= iso) && (a.status !== "ENDED" || !!a.endDate)).length;
  const allocNow = allocsAt(cur.to);
  const allocPrev = allocsAt(prev.to);
  const teamless = scopedClients.filter((c) => c.status === "ACTIVE" && !allocations.some((a) => a.clientId === c.id && (a.status === "ACTIVE" || a.status === "PLANNED"))).length;
  const pendingNow = clientsAt(asOf, "PENDING");
  const pendingPrev = clientsAt(prevAsOf, "PENDING");
  const onboarding = await onboardingP;
  const onboardAt = (at: Date) => onboarding.filter((e) => e.onboardingSubmittedAt! <= at && (e.approvalStatus === "PENDING" || e.approvalStatus === "UNDER_REVIEW" ? true : !!e.approvedAt && e.approvedAt > at)).length;

  // ------------------------------------------------ today's action items (office rules)
  const [tt, subjects, escalate] = await todayP;
  const yEnd = endOf(yIso);
  const subjectIds = [...subjects.keys()].filter((id) => inStaff(id));
  const subjectSet = new Set(subjectIds);
  const [allPlans, reqs, leaves, pendingItems] = await queuesP;
  const yPlans = allPlans.filter((p) => subjectSet.has(p.employeeId));
  const yAtt = attStats(att.filter((x) => toIsoDate(x.date) === yIso));
  const tAttRows = att.filter((x) => toIsoDate(x.date) === today);
  const tAtt = attStats(tAttRows);
  const planSubjects = subjectIds.filter((id) => subjects.get(id)?.plans);
  const plansMissing = (iso: string) => planSubjects.filter((id) => {
    const rows = att.filter((x) => x.employee.id === id && toIsoDate(x.date) === iso);
    return rows.some(isPresent) && !yPlans.some((p) => p.employeeId === id && toIsoDate(p.planDate) === iso && p.planSubmittedAt);
  }).length;
  const toApprove = (iso: string, at: Date) => yPlans.filter((p) => toIsoDate(p.planDate) === iso && p.planSubmittedAt && p.planSubmittedAt <= at && (!p.approvedAt || p.approvedAt > at)).length;
  const waitingAt = <T extends { employeeId: string; status: string; createdAt: Date; decidedAt: Date | null }>(l: T[], at: Date) => l.filter((r) => inStaff(r.employeeId) && r.createdAt <= at && (r.status === "PENDING" || (!!r.decidedAt && r.decidedAt > at))).length;
  const pendAt = (at: Date) => pendingItems.filter((p) => inClients(p.clientId) && (!staffIds || inStaff(p.pendingWithEmployeeId) || inStaff(p.raisedByEmployeeId)) && p.createdAt <= at && (p.status !== "CLOSED" || (!!p.closedAt && p.closedAt > at)));
  const pendNow = pendAt(now);
  const oldest = pendNow.reduce((m, p) => Math.max(m, Math.floor((now.getTime() - p.requestedOn.getTime()) / DAY_MS)), 0);
  const notInNow = tt ? (staffIds ? tAttRows.filter((x) => x.state === "NOT_MARKED" || x.state === "ABSENT").length : tt.notIn + tt.absent) : 0;
  const notInPrev = yAtt.absent;

  // ------------------------------------------------ KPIs
  const finHasData = fin.revenue > 0 || finP.revenue > 0;
  const recurring = fin.revenue > 0 ? pct(fin.retainer, fin.revenue) : null;
  const recurringP = finP.revenue > 0 ? pct(finP.retainer, finP.revenue) : null;
  const revHr = fin.billableMin > 0 && fin.revenue > 0 ? fin.revenue / (fin.billableMin / 60) : null;
  const revHrP = finP.billableMin > 0 && finP.revenue > 0 ? finP.revenue / (finP.billableMin / 60) : null;
  const util = fin.totalMin ? pct(fin.billableMin, fin.totalMin) : null;
  const retainerClients = clientRows.filter((r) => r.nature === "Retainer").length;
  const salaryStaff = memberIds.filter(hasSalary).length;
  const engagementsActive = engagements.filter((x) => x.status === "ACTIVE" && inClients(x.clientId) && (!f.service || x.serviceId === f.service)).length;
  const engagementsFee = engagements.filter((x) => x.status === "ACTIVE" && x.agreedFee !== null && Number(x.agreedFee) > 0 && inClients(x.clientId) && (!f.service || x.serviceId === f.service)).length;
  const periodWord = single ? (cur.to === today ? "today" : short(cur.to)) : rangeText(cur);
  const marginPct = profit !== null && fin.revenue > 0 ? Math.round((profit / fin.revenue) * 100) : null;

  const kpis: BizKpi[] = [
    kpi({ key: "revenue", label: `Revenue (${single ? periodWord : rangeText(cur)})`, value: finHasData ? fin.revenue : null, prev: finHasData ? finP.revenue : null, fmt: inrShort, better: "up", unit: "money", tone: "ink",
      hint: fin.revenue > 0 ? `${inrShort(fin.retainer)} retainer · ${inrShort(fin.oneTime)} one-time` : `Agreed fee on ${engagementsFee} of ${engagementsActive} active services`, href: "/app/clients", emptyText: "No fees" }),
    kpi({ key: "profit", label: "Net profit", value: finHasData && profit !== null ? profit : null, prev: finHasData ? profitP : null, fmt: inrShort, better: "up", unit: "money", tone: "ok",
      hint: (marginPct !== null ? `${marginPct}% margin after staff cost` : fin.cost === null ? "No salary on record" : "No revenue in this period") + (fin.cost !== null && salaryStaff < memberIds.length ? ` · salaries of ${salaryStaff}/${memberIds.length} staff` : ""), emptyText: "No data" }),
    kpi({ key: "recurring", label: "Recurring share", value: recurring, prev: recurringP, fmt: (n) => `${n}%`, better: "up", unit: "pt", tone: "info",
      hint: fin.revenue > 0 ? `${retainerClients} retainer · ${clientRows.length - retainerClients} one-time` : "Retainer fees ÷ revenue", emptyText: "No data" }),
    kpi({ key: "revhr", label: "Rev / billable hr", value: revHr, prev: revHrP, fmt: (n) => inrFull(n), better: "up", unit: "money", tone: "violet",
      hint: util !== null ? `Utilisation ${util}% (${Math.round(fin.billableMin / 60)} of ${Math.round(fin.totalMin / 60)} h on clients)` : "No time logged", emptyText: "No data" }),
    kpi({ key: "clients", label: "Active clients", value: activeNow, prev: activeBefore, fmt: (n) => n.toLocaleString("en-IN"), better: "up", unit: "count", tone: "ink",
      hint: `${pct(byStatus("ACTIVE"), Math.max(1, byStatus("ACTIVE") + byStatus("ON_HOLD") + byStatus("INACTIVE")))}% active · ${byStatus("ON_HOLD")} hold · ${byStatus("INACTIVE")} discontinued`, href: "/app/clients?status=ACTIVE" }),
    kpi({ key: "dues", label: "Outstanding dues", value: duesSum(duesNow), prev: duesSum(duesPrev), fmt: inrShort, better: "down", unit: "money", tone: "ink",
      hint: duesNow.length ? `${duesNow.length} open · most: ${clientById.get(topDue![0])?.tradeName ?? "—"}` : "0 open · no dues by client", href: "/app/dues" }),
    kpi({ key: "ontime", label: "On-time attendance", value: onTimePct, prev: onTimePrev, fmt: (n) => `${n}%`, better: "up", unit: "pt", tone: "warn",
      hint: `${aCur.late} late · ${aCur.leave} leave day${aCur.leave === 1 ? "" : "s"}${aCur.absent ? ` · ${aCur.absent} absent` : ""}`, href: "/app/attendance?tab=team", emptyText: "No data" }),
    kpi({ key: "topshare", label: "Top-client share", value: topShare, prev: topShareP, fmt: (n) => `${n}%`, better: "down", unit: "pt", tone: "danger",
      hint: topClient ? topClient.client : "Top client's share of revenue", emptyText: "No data" }),
  ];

  const opsKpis: BizKpi[] = [
    single
      ? kpi({ key: "present", label: cur.to === today ? "Present today" : `Present ${short(cur.to)}`, value: aCur.present, prev: aPrev.rows && prev.to >= attStart ? aPrev.present : null, fmt: (n) => `${n} / ${staffIds ? memberIds.length : active.length}`, better: "up", unit: "count", tone: "ok", hint: `${aCur.leave} on leave`, href: "/app/attendance?tab=team" })
      : kpi({ key: "present", label: "Present a day (avg)", value: aCur.days ? Math.round((aCur.present / aCur.days) * 10) / 10 : null, prev: aPrev.days && prev.to >= attStart ? Math.round((aPrev.present / aPrev.days) * 10) / 10 : null, fmt: (n) => `${n} / ${staffIds ? memberIds.length : active.length}`, better: "up", unit: "count", tone: "ok", hint: `${aCur.days} working days · ${aCur.leave} leave days`, href: "/app/attendance?tab=team", emptyText: "No data" }),
    kpi({ key: "time", label: single ? (cur.to === today ? "Time logged today" : "Time logged") : "Time logged", value: hoursTotal, prev: prev.to >= timeStart ? prevMinutes : null, fmt: hoursText, better: "up", unit: "min", tone: "violet", hint: `${entriesIn(cur).length} timesheet entr${entriesIn(cur).length === 1 ? "y" : "ies"}`, href: "/app/timesheet?tab=log" }),
    kpi({ key: "open", label: "Open tasks", value: openNow, prev: prevAsOf >= taskStart ? openPrev : null, fmt: String, better: "none", unit: "count", tone: "ink", hint: `${waitingClientNow} waiting on clients`, href: "/app/tasks?scope=all" }),
    kpi({ key: "overdue", label: "Overdue tasks", value: overdueNow, prev: prevAsOf >= taskStart ? overduePrev : null, fmt: String, better: "down", unit: "count", tone: "danger", hint: overdueNow ? "Needs attention" : "Nothing overdue", href: "/app/tasks?scope=all&state=overdue" }),
    kpi({ key: "review", label: "Tasks awaiting review", value: reviewNow, prev: prevAsOf >= taskStart ? reviewPrev : null, fmt: String, better: "down", unit: "count", tone: "warn", hint: "In review queue", href: "/app/tasks?scope=review&state=all" }),
    kpi({ key: "alloc", label: "Active allocations", value: allocNow, prev: allocPrev, fmt: String, better: "up", unit: "count", tone: "ok", hint: teamless ? `${teamless} active client${teamless === 1 ? " has" : "s have"} no team` : "Every active client has a team", href: teamless ? "/app/clients?status=ACTIVE&team=none" : "/app/allocations" }),
    kpi({ key: "pending", label: "Clients pending approval", value: pendingNow, prev: pendingPrev, fmt: String, better: "down", unit: "count", tone: "ink", hint: pendingNow ? "Waiting for an administrator" : "Nothing waiting", href: "/app/clients?status=PENDING_APPROVAL" }),
    kpi({ key: "onboard", label: "Onboarding to approve", value: onboardAt(asOf), prev: onboardAt(prevAsOf), fmt: String, better: "down", unit: "count", tone: "warn", hint: "New staff onboarding", href: "/app/employees?status=pending" }),
  ];

  const actionKpis: BizKpi[] = [
    kpi({ key: "notin", label: `Not in yet (absent at ${policy.row.autoAbsentAt})`, value: notInNow, prev: notInPrev, fmt: String, better: "down", unit: "count", tone: "warn", hint: "", href: "/app/attendance?tab=team" }),
    kpi({ key: "late", label: "Late today", value: tAtt.late, prev: yAtt.rows ? yAtt.late : null, fmt: String, better: "down", unit: "count", tone: "warn", hint: "", href: "/app/attendance?tab=team" }),
    kpi({ key: "plans", label: "Morning plans missing", value: plansMissing(today), prev: plansMissing(yIso), fmt: String, better: "down", unit: "count", tone: "danger", hint: `Due ${policy.row.morningPlanBy}`, href: "/app/timesheet?tab=team" }),
    kpi({ key: "approve", label: "Plans to approve", value: toApprove(today, now), prev: toApprove(yIso, yEnd), fmt: String, better: "down", unit: "count", tone: "violet", hint: "", href: "/app/timesheet?tab=team" }),
    kpi({ key: "ot", label: "OT / early-leave req.", value: waitingAt(reqs, now), prev: waitingAt(reqs, yEnd), fmt: String, better: "down", unit: "count", tone: "ink", hint: "", href: "/app/attendance?tab=requests" }),
    kpi({ key: "leave", label: "Leave requests", value: waitingAt(leaves, now), prev: waitingAt(leaves, yEnd), fmt: String, better: "down", unit: "count", tone: "ink", hint: "", href: "/app/attendance?tab=leave" }),
    kpi({ key: "eod", label: "EOD to escalate", value: escalate.filter((x) => inStaff(x.employee.id)).length, prev: null, fmt: String, better: "down", unit: "count", tone: "danger", hint: `₹${policy.row.leadPenaltyRupees} fine if not escalated`, href: "/app/timesheet?tab=team" }),
    kpi({ key: "pitems", label: "Pending items", value: pendNow.length, prev: pendAt(yEnd).length, fmt: String, better: "down", unit: "count", tone: "warn", hint: pendNow.length ? `Oldest ${oldest} d` : "Nothing pending", href: "/app/pending" }),
  ];
  for (const k of actionKpis) if (!k.hint) k.hint = "";

  // ------------------------------------------------ alerts
  const dueToday = upcomingDeadlines(8).filter((d) => d.daysLeft === 0);
  const eodCount = actionKpis.find((k) => k.key === "eod")!.display;
  const alerts = [
    Number(eodCount) > 0 ? `${eodCount} EOD report${eodCount === "1" ? "" : "s"} not filed — escalate today, or a ₹${policy.row.leadPenaltyRupees} fine applies to the Team Lead` : "",
    plansMissing(today) ? `${plansMissing(today)} morning plan${plansMissing(today) === 1 ? "" : "s"} missing (${tt?.planDue === false ? "due" : "were due"} ${policy.row.morningPlanBy})` : "",
    ...dueToday.map((d) => `${d.form} due today`),
  ].filter(Boolean);

  // ------------------------------------------------ health check, insights, risks
  const overloaded = openPerMember[0];
  const negative = teamRows.filter((r) => r.profit !== null && r.profit < 0 && r.revenue >= 0);
  const health: BizData["health"] = [
    { label: "Financial", text: fin.revenue > 0 ? `${marginPct !== null ? `${marginPct}% net margin` : "Margin needs salaries"}; ${recurring ?? 0}% recurring` : `No fee earned ${single ? "on this day" : "in this period"}`, tone: fin.revenue <= 0 ? "muted" : marginPct === null ? "warn" : marginPct >= 30 ? "ok" : marginPct >= 10 ? "warn" : "danger" },
    { label: "Client mix", text: topClient && topShare !== null ? `${topClient.client} = ${topShare}% of revenue` : `${activeNow} active clients`, tone: topShare === null ? "muted" : topShare > 50 ? "danger" : topShare > 30 ? "warn" : "ok" },
    { label: "Delivery", text: `${overdueNow} overdue task${overdueNow === 1 ? "" : "s"} · ${reviewNow} in review`, tone: overdueNow > 5 ? "danger" : overdueNow > 0 || reviewNow > 10 ? "warn" : "ok" },
    { label: "Client data flow", text: `${waitingClientNow + linesWaiting} item${waitingClientNow + linesWaiting === 1 ? "" : "s"} waiting for client`, tone: waitingClientNow + linesWaiting > 10 ? "danger" : waitingClientNow + linesWaiting > 0 ? "warn" : "ok" },
    { label: "People", text: onTimePct !== null ? `${onTimePct}% on time; ${aCur.leave} leave day${aCur.leave === 1 ? "" : "s"}` : "No attendance in this period", tone: onTimePct === null ? "muted" : onTimePct >= 90 ? "ok" : onTimePct >= 75 ? "warn" : "danger" },
    { label: "Team economics", text: salaryStaff === 0 ? "Salaries not on record" : negative.length ? `${negative.slice(0, 2).map((r) => r.member.split(" ")[0]).join(" & ")} below cost` : `Salary on record for ${salaryStaff} of ${memberIds.length}`, tone: salaryStaff === 0 ? "muted" : negative.length ? "warn" : salaryStaff < memberIds.length ? "warn" : "ok" },
  ];

  const lateBy = new Map<string, number>();
  for (const x of attIn(chartRange)) if (x.isLate) lateBy.set(x.employee.firstName, (lateBy.get(x.employee.firstName) ?? 0) + 1);
  const lateTop = [...lateBy.entries()].sort((a, b) => b[1] - a[1]);
  const chartStats = attStats(attIn(chartRange));
  const peak = [...weeksShown].sort((a, b) => b.late + b.leave - (a.late + a.leave))[0];
  const absentNames = [...new Set(attIn(chartRange).filter((x) => x.state === "ABSENT").map((x) => x.employee.firstName))];
  const offsiteDays = attIn(chartRange).filter((x) => isPresent(x) && x.record?.workLocation && x.record.workLocation !== "OFFICE");
  const offsiteNames = [...new Set(offsiteDays.map((x) => x.employee.firstName))];
  const chartLabel = `${single ? "Last 4 weeks" : BIZ_PERIODS[f.period] === "Custom range" ? "Selected range" : range?.label ?? BIZ_PERIODS[f.period]} (${rangeText(chartRange.from < attStart ? { from: attStart, to: chartRange.to } : chartRange)}) · days out of ${workDays}`;
  const insights = [
    lateTop.length ? (lateTop.length > 1 && lateTop[0][1] === lateTop[1][1] ? `${lateTop[0][0]} and ${lateTop[1][0]} are late most often (${lateTop[0][1]} day${lateTop[0][1] === 1 ? "" : "s"} each).` : `${lateTop[0][0]} is late most often (${lateTop[0][1]} day${lateTop[0][1] === 1 ? "" : "s"}).`) : "Nobody was late in this period.",
    peak && peak.late + peak.leave > 0 ? `Late + leave peaks in ${peak.label.split(" · ")[0]} (${peak.late + peak.leave} person-days)${peak.onTimePct !== null ? `; on-time ${peak.onTimePct}%` : ""}.` : "",
    offsiteDays.length ? `Client-site work: ${offsiteNames.slice(0, 3).join(", ")}${offsiteNames.length > 3 ? ` +${offsiteNames.length - 3}` : ""} — ${offsiteDays.length} day${offsiteDays.length === 1 ? "" : "s"} at clients.` : "",
    absentNames.length ? `Absent without leave: ${absentNames.slice(0, 3).join(", ")}${absentNames.length > 3 ? ` +${absentNames.length - 3}` : ""}.` : "",
    chartStats.late || chartStats.leave ? `Late arrivals cost ≈${(chartStats.lateMin / 60).toFixed(1)} hrs; leave ≈${Math.round((chartStats.leave * officeDay) / 60)} hrs.` : "",
  ].filter(Boolean);

  const oneTimeRows = clientRows.filter((r) => r.nature === "One-time" && r.margin !== null);
  const retainerRows = clientRows.filter((r) => r.nature === "Retainer" && r.margin !== null);
  const marginSpan = (rows: typeof clientRows) => { const m = rows.map((r) => r.margin!); return Math.min(...m) === Math.max(...m) ? `${m[0]}%` : `${Math.min(...m)}–${Math.max(...m)}%`; };
  const risks: BizData["risks"] = [];
  if (engagementsActive && engagementsFee < engagementsActive) risks.push({ label: "Fees", text: `Only ${engagementsFee} of ${engagementsActive} active services carry an agreed fee — add the fee on each client's Services tab so revenue and profit are complete.` });
  if (salaryStaff < memberIds.length) risks.push({ label: "Salaries", text: `Salary is on record for ${salaryStaff} of ${memberIds.length} team members — add salaries under Payroll so staff cost and net profit are complete.` });
  if (topClient && topShare !== null && topShare >= 30) risks.push({ label: "Concentration", text: `${topClient.client} is ${topShare}% of revenue – build the pipeline of other clients.` });
  if (oneTimeRows.length && retainerRows.length) risks.push({ label: "Pricing", text: `One-time clients earn ${marginSpan(oneTimeRows)} margin vs ${marginSpan(retainerRows)} for retainers – review minimum fees.` });
  if (negative.length) risks.push({ label: "Team economics", text: `${negative.slice(0, 3).map((r) => r.member.split(" ")[0]).join(", ")} show negative net profit after salary – review time allocation.` });
  if (overdueNow || reviewNow) risks.push({ label: "Delivery", text: `${overdueNow} overdue task${overdueNow === 1 ? "" : "s"}, ${reviewNow} awaiting review – clear the review queue and give each overdue task one owner.` });
  if (aCur.late || aCur.leave) risks.push({ label: "People", text: `${aCur.late} late day${aCur.late === 1 ? "" : "s"} and ${aCur.leave} leave day${aCur.leave === 1 ? "" : "s"} – plan checker cover for heavy-leave days.` });
  if (teamless) risks.push({ label: "Capacity", text: `${teamless} active client${teamless === 1 ? " has" : "s have"} no team allocated${overloaded ? `; ${overloaded.member.split(" ")[0]} carries the most open tasks (${overloaded.open})` : ""}.` });
  if (waitingClientNow + linesWaiting > 0) risks.push({ label: "Client data", text: `${waitingClientNow + linesWaiting} item${waitingClientNow + linesWaiting === 1 ? "" : "s"} wait on client documents – send the Client Pending Report.` });

  const questions = [
    topClient ? `What if ${topClient.client} leaves – impact on profit?` : "Which clients bring the most revenue this year?",
    oneTimeRows.length ? "Which one-time clients should I reprice, and to what fee?" : "Which active services have no agreed fee yet?",
    lateTop[0] ? `Which client work is affected by ${lateTop[0][0]}'s late arrivals?` : "Who has the most open tasks right now?",
    `What changed ${compare.replace(/^vs (yesterday)?/, (_m, y) => (y ? "compared with yesterday" : "compared with the "))}?`,
    overdueNow ? `Which of the ${overdueNow} overdue tasks should be finished first?` : "Which deadlines fall in the next 7 days?",
  ];

  // ------------------------------------------------ recent activity, options
  const actorUsers = staffIds ? [...staffIds].map((id) => empById.get(id)?.membership?.userId).filter((x): x is string => !!x) : null;
  const recentRows = await prisma.auditLog.findMany({
    where: { organizationId: org, createdAt: { gte: startOf(cur.from), lte: asOf }, ...(actorUsers ? { actorUserId: { in: actorUsers } } : {}), ...(f.client ? { entityId: f.client } : {}) } as Prisma.AuditLogWhereInput,
    orderBy: { createdAt: "desc" }, take: 8, select: { action: true, createdAt: true, actor: { select: { name: true } } },
  });
  const recent = recentRows.map((r) => ({ action: r.action.replace(/[._]/g, " "), actor: r.actor?.name ?? "System", at: r.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: tz }) }));
  const statutory = upcomingDeadlines(5).map((d) => {
    const iso = isoDateInTz(d.date, "Asia/Kolkata");
    return { day: String(Number(iso.slice(8, 10))), month: new Date(`${iso}T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" }).toUpperCase(), title: d.title, form: d.form, department: d.department, daysLeft: d.daysLeft };
  });

  const activities = [...new Set([...workTypes.map((w) => w.name), ...entries.map(typeOf).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
  const activeClients = clients.filter((c) => c.status === "ACTIVE" || c.id === f.client).sort((a, b) => a.tradeName.localeCompare(b.tradeName));
  const label = (k: "client" | "staff" | "service") => k === "client" ? clientById.get(f.client)?.tradeName : k === "staff" ? (f.staff ? fullName(f.staff) : undefined) : services.find((s) => s.id === f.service)?.name;
  const filterText = [`Period: ${range?.label ?? BIZ_PERIODS[f.period]} (${rangeText(cur)})`, `Client: ${label("client") ?? "All"}`, `Staff: ${label("staff") ?? "All"}`, `Activity: ${f.activity || "All"}`, `Service: ${label("service") ?? "All"}`].join(" · ");

  return {
    filters: f, periodLabel: range?.label ?? BIZ_PERIODS[f.period], rangeLabel: rangeText(cur), prevRangeLabel: rangeText(prev), compare, prevShort, singleDay: single,
    fromDate: cur.from, asOfDate: cur.to, reportDate: long(today), generatedAt: now.toISOString(), firm: ctx.organization.tradeName, filterText,
    options: {
      clients: activeClients.map((c) => ({ value: c.id, label: c.tradeName })),
      staff: active.sort((a, b) => a.firstName.localeCompare(b.firstName)).map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName ?? ""}`.trim() })),
      activities,
      services: services.filter((s) => s.isActive || s.id === f.service).map((s) => ({ value: s.id, label: s.name })),
    },
    kpis, health,
    finance: { feesRecorded: engagementsFee, engagements: engagementsActive, salaryStaff, staff: memberIds.length, revenue: fin.revenue, cost: fin.cost, retainer: fin.retainer, oneTime: fin.oneTime },
    clientScore: clientRows.slice(0, 8),
    clientTotal: { revenue: crRev, profit: crProfit, margin: crProfit !== null && crRev ? Math.round((crProfit / crRev) * 100) : null },
    teamScore: teamRows.slice(0, 10).map(({ id: _id, ...r }) => r),
    teamTotal: { profit: teamProfit, margin: marginPct, late: teamRows.reduce((s, r) => s + r.late, 0), leave: teamRows.reduce((s, r) => s + r.leave, 0) },
    attendance: { label: chartLabel, members: attMembers },
    punctuality: { label: "Late + leave person-days · on-time % of present", weeks: weeksShown },
    insights, risks: risks.slice(0, 6), questions,
    opsKpis, actionKpis, alerts,
    tasksByStatus: statusCounts, tasksCreated: created, tasksCompleted: completed,
    hoursByClient, hoursTotal,
    openPerMember, deadlines, review, reviewTotal: reviewList.length, statutory, recent,
    scope: { clientIds: clientIds ? [...clientIds] : null, staffIds: staffIds ? [...staffIds] : null },
  };
}

// ---------------------------------------------------------------- the dashboard: both pages + the operations detail

/** Everything the dashboard shows for one set of filters. */
export async function dashboardBundle(ctx: AppContext, f: BizFilters) {
  const { opsSummary } = await import("./ops-summary");
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const r = bizRanges(f, today);
  const period = { cur: r.cur, prev: r.prev, label: BIZ_PERIODS[f.period], compare: r.compare };
  // No dimension chosen: both at once. Otherwise the operations detail needs the slice's clients and staff.
  if (!f.client && !f.staff && !f.activity && !f.service) {
    const [biz, ops] = await Promise.all([business360(ctx, f), opsSummary(ctx, period)]);
    return { biz, ops };
  }
  const biz = await business360(ctx, f);
  const ops = await opsSummary(ctx, period, biz.scope);
  return { biz, ops };
}
export type DashboardBundle = Awaited<ReturnType<typeof dashboardBundle>>;

/** Monday to Sunday of the week holding `iso`. */
export function weekOf(iso: string): Range {
  const from = shift(iso, -((dateOnly(iso).getUTCDay() + 6) % 7));
  return { from, to: shift(from, 6) };
}
export const shiftRange = (r: Range, days: number): Range => ({ from: shift(r.from, days), to: shift(r.to, days) });
export const weekLabel = (r: Range) => `${long(r.from).split(" ").slice(0, 3).join(" ")} – ${long(r.to)}`;
