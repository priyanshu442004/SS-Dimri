import "server-only";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { addDays, dateOnly, formatTime, isoDateInTz, toIsoDate } from "@/lib/dates";
import { getPolicy } from "@/lib/services/office-rules";
import { MAX_RANGE_DAYS, teamAttendanceRows, type AttendanceFilter } from "@/lib/services/attendance";
import { payrollForMonth, salaryOverview } from "@/lib/services/payroll";
import { blockSchema, type Block } from "./blocks";
import { QueryError, runDbQuery, type DbQueryInput } from "./db-query";
import { describeSheet, readSheet } from "./sheet";
import { sheetFor } from "./config";

// Tools the model can call. Data tools return JSON for the model; presentation tools return a
// block for the browser (KPI cards, charts, tables) or the one follow-up question.

export type ToolSpec = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type ToolOutcome = { result: unknown; block?: Block; followUp?: string; label: string; failed?: boolean };

const ISO = { type: "string", description: "Date YYYY-MM-DD" };

const VIS = {
  show_kpis: {
    description: "Show headline numbers as KPI cards above the answer. Use whenever the answer has one or more key numbers (counts, totals, averages, %). 1–6 cards.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array", minItems: 1, maxItems: 6,
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short label, e.g. 'Late yesterday'" },
              value: { type: ["number", "string"], description: "The number (preferred) or a short value like '09:52'" },
              format: { type: "string", enum: ["count", "inr", "percent", "minutes", "decimal"] },
              hint: { type: "string", description: "Tiny context line, e.g. 'of 31 present' or '16 Nov 2026'" },
              tone: { type: "string", enum: ["neutral", "good", "bad", "warn"] },
              change: { type: "string", description: "Optional change vs earlier period, e.g. '+2 vs last week'" },
            },
            required: ["label", "value"],
          },
        },
      },
      required: ["items"],
    },
  },
  show_chart: {
    description:
      "Draw a chart when there are several numbers to compare or a trend. bar = ranking of categories (horizontal, long names); column = categories with up to 6 series side by side; line/area = trend over dates; pie/donut = parts of a whole (≤ 8 slices); stacked = composition per date/category. labels and every series' values must have the same length.",
    parameters: {
      type: "object",
      properties: {
        chart: { type: "string", enum: ["bar", "column", "line", "area", "pie", "donut", "stacked"] },
        title: { type: "string" },
        subtitle: { type: "string" },
        labels: { type: "array", items: { type: "string" }, description: "Category names or dates (YYYY-MM-DD)" },
        series: { type: "array", items: { type: "object", properties: { name: { type: "string" }, values: { type: "array", items: { type: "number" } } }, required: ["name", "values"] } },
        format: { type: "string", enum: ["count", "inr", "percent", "minutes", "decimal"] },
      },
      required: ["chart", "title", "labels", "series"],
    },
  },
  show_table: {
    description: "Show a compact table when the user needs a list with several attributes per row (e.g. who was late, with time and reason). Max 12 columns, 100 rows.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        columns: { type: "array", items: { type: "string" } },
        rows: { type: "array", items: { type: "array", items: { type: ["string", "number", "null"] } } },
      },
      required: ["columns", "rows"],
    },
  },
  suggest_follow_up: {
    description: "Offer exactly ONE short, natural follow-up question the user is likely to ask next (max 12 words, phrased as the user would type it). Call once per answer.",
    parameters: { type: "object", properties: { question: { type: "string" } }, required: ["question"] },
  },
} as const;

export function toolSpecs(ctx: AppContext): ToolSpec[] {
  const specs: ToolSpec[] = [];
  const add = (name: string, description: string, parameters: Record<string, unknown>) => specs.push({ type: "function", function: { name, description, parameters } });

  add(
    "query_database",
    "Read the firm's ERP database (read-only, already limited to this firm). Prisma-style JSON. operations: findMany (rows), count, aggregate (_count/_sum/_avg/_min/_max), groupBy (by + aggregates). Filters: equals, in, notIn, lt, lte, gt, gte, contains, startsWith, not; relations: some/every/none for lists, plain object or is/isNot for single. Dates as YYYY-MM-DD. Select only the fields you need and nested relations for names (e.g. select: { employee: { select: { firstName: true, lastName: true } } }). Batch independent queries in parallel calls.",
    {
      type: "object",
      properties: {
        model: { type: "string", description: "Model name from the schema, e.g. Task, Employee, LeaveRequest" },
        operation: { type: "string", enum: ["findMany", "count", "aggregate", "groupBy"] },
        args: { type: "object", description: "where / select / orderBy / take / skip / distinct / by / _count / _sum / _avg / _min / _max" },
      },
      required: ["model", "operation"],
    },
  );

  if (can(ctx, "attendance.view_all")) {
    add(
      "attendance_report",
      "Attendance for a date or range (max 92 days) scored with the firm's office rules. Returns totals with attendance % and on-time %, per-day counts, per-person counts sorted best to weakest (attendance %, late days, minutes late, absent, leave, not marked, auto-absent = forgot to mark), lateness per role/designation, timesheet time logged on days attendance was not marked, and rows with time in/out, minutes late, late reason and leave details (type, dates, return date). Use this, not raw queries, for any present / late / absent / leave / not-marked / attendance-percentage question.",
      {
        type: "object",
        properties: {
          from: ISO,
          to: ISO,
          status: { type: "string", enum: ["PRESENT", "ABSENT", "HALF_DAY", "LEAVE", "NOT_MARKED", "LATE", "NO_OUT"], description: "Only rows in this state (LATE = arrived after grace)." },
          employee: { type: "string", description: "Part of a person's name or code to limit to them" },
        },
        required: ["from", "to"],
      },
    );
  }
  if (can(ctx, "payroll.manage")) {
    add(
      "payroll_month",
      "Payroll for a month under the office rules: monthly salary, payable days, worked days, absences, late arrivals, half days, leave, overtime, fines and net pay per person plus totals. Use for salary payout / deduction / net pay questions.",
      { type: "object", properties: { month: { type: "string", description: "YYYY-MM" }, employee: { type: "string", description: "Optional name filter" } }, required: ["month"] },
    );
  }
  if (can(ctx, "payroll.salaries")) {
    add(
      "salary_overview",
      "Current monthly salary of every person this user may see (administrators: everyone; managers: their team), with scheduled raises and committed increments.",
      { type: "object", properties: { employee: { type: "string", description: "Optional name filter" } } },
    );
  }
  if (sheetFor(ctx)) {
    add(
      "sheet_overview",
      "List every tab of the firm's live Google Sheet (accounting work-flow tracker, revenue/profit dashboard, client & team profit, retainers, service fees, staff rates, timesheet hours, client pending report…) with its columns and row count. Call this first when a question may be answered from the sheet and you do not yet know its tabs/columns.",
      { type: "object", properties: { refresh: { type: "boolean", description: "true = skip the short cache (user asked for the very latest)" } } },
    );
    add(
      "read_sheet",
      "Read rows of one tab of the live Google Sheet (tab names / columns come from sheet_overview), optionally filtered by search words and limited to some columns; or omit tab and give search words to search all tabs.",
      {
        type: "object",
        properties: {
          tab: { type: "string" },
          search: { type: "string", description: "Words that must all appear in the row (case-insensitive)" },
          columns: { type: "array", items: { type: "string" }, description: "Only these columns (partial names OK)" },
          offset: { type: "integer" },
          limit: { type: "integer", description: "Rows to return (default 80, max 300)" },
          refresh: { type: "boolean" },
        },
      },
    );
  }
  for (const [name, def] of Object.entries(VIS)) add(name, def.description, def.parameters as unknown as Record<string, unknown>);
  return specs;
}

// ---------------------------------------------------------------- labels for the UI

export function toolLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "query_database": {
      const m = String(args.model ?? "records").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
      return args.operation === "count" ? `Counting ${m}s` : args.operation === "groupBy" || args.operation === "aggregate" ? `Summarising ${m}s` : `Reading ${m}s`;
    }
    case "attendance_report": return args.from === args.to ? `Checking attendance for ${args.from}` : `Checking attendance ${args.from} → ${args.to}`;
    case "payroll_month": return `Calculating payroll for ${args.month}`;
    case "salary_overview": return "Reading salaries";
    case "sheet_overview": return "Opening the Google Sheet";
    case "read_sheet": return args.tab ? `Reading sheet tab “${args.tab}”` : `Searching the Google Sheet`;
    case "show_kpis": return "Preparing KPI cards";
    case "show_chart": return "Drawing a chart";
    case "show_table": return "Building a table";
    case "suggest_follow_up": return "Suggesting a follow-up";
    default: return "Working";
  }
}

// ---------------------------------------------------------------- executors

const fullName = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();

async function attendanceReport(ctx: AppContext, args: Record<string, unknown>) {
  const tz = ctx.organization.timezone;
  const today = isoDateInTz(new Date(), tz);
  const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  let to = iso(args.to) ?? today;
  let from = iso(args.from) ?? to;
  if (to > today) to = today;
  if (from > to) from = to;
  const earliest = toIsoDate(addDays(dateOnly(to), -(MAX_RANGE_DAYS - 1)));
  const clipped = from < earliest;
  if (clipped) from = earliest;
  const status = typeof args.status === "string" ? (args.status.toUpperCase() as AttendanceFilter) : "";
  const policy = await getPolicy(ctx.organization.id);
  const q = typeof args.employee === "string" ? args.employee.trim().slice(0, 80) : "";
  const { rows: all, counts, employeeCount } = await teamAttendanceRows(ctx, policy, { from, to, q, status: "", departmentId: "", employeeId: "" });

  const multiDay = from !== to;
  const ids = [...new Set(all.map((r) => r.employee.id))];
  const fromD = dateOnly(from);
  const toD = dateOnly(to);
  // Leave covering the period (to say who is on leave and when they return), and timesheet
  // time logged per person per day (to spot work logged on a day attendance was not marked).
  const [leaves, logged] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { organizationId: ctx.organization.id, employeeId: { in: ids }, status: { in: ["APPROVED", "PENDING"] }, fromDate: { lte: addDays(toD, 31) }, toDate: { gte: fromD } },
      select: { employeeId: true, fromDate: true, toDate: true, leaveType: true, status: true, isHalfDay: true, reason: true },
    }),
    prisma.timesheetEntry.groupBy({ by: ["employeeId", "workDate"], where: { organizationId: ctx.organization.id, workDate: { gte: fromD, lte: toD } }, _sum: { approxMinutes: true }, _count: { _all: true } }),
  ]);
  const leaveOn = (employeeId: string, d: Date) => leaves.find((l) => l.employeeId === employeeId && l.fromDate <= d && l.toDate >= d) ?? null;
  const loggedOn = new Map(logged.map((t) => [`${t.employeeId}|${toIsoDate(t.workDate)}`, { entries: t._count._all, minutes: t._sum.approxMinutes ?? 0 }]));
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

  type Person = { name: string; code: string; role: string | null; department: string | null; workingDays: number; present: number; late: number; lateMinutes: number; absent: number; leave: number; halfDay: number; notMarked: number; autoAbsent: number };
  const byDay = new Map<string, { date: string; present: number; late: number; absent: number; leave: number; halfDay: number; notMarked: number }>();
  const byPerson = new Map<string, Person>();
  const unmarkedButLogged: { date: string; name: string; state: string; timesheetEntries: number; minutesLogged: number }[] = [];
  for (const r of all) {
    const d = toIsoDate(r.date);
    const day = byDay.get(d) ?? { date: d, present: 0, late: 0, absent: 0, leave: 0, halfDay: 0, notMarked: 0 };
    const person = byPerson.get(r.employee.id) ?? { name: fullName(r.employee), code: r.employee.permanentEmployeeCode ?? r.employee.temporaryEmployeeCode, role: r.employee.designation?.name ?? null, department: r.employee.department?.name ?? null, workingDays: 0, present: 0, late: 0, lateMinutes: 0, absent: 0, leave: 0, halfDay: 0, notMarked: 0, autoAbsent: 0 };
    person.workingDays++;
    if (r.state === "PRESENT" || r.state === "HALF_DAY") { day.present++; person.present++; }
    if (r.state === "HALF_DAY") { day.halfDay++; person.halfDay++; }
    if (r.state === "ABSENT") { day.absent++; person.absent++; if (r.record?.autoAbsentAt) person.autoAbsent++; }
    if (r.state === "LEAVE") { day.leave++; person.leave++; }
    if (r.state === "NOT_MARKED") { day.notMarked++; person.notMarked++; }
    if (r.isLate) { day.late++; person.late++; person.lateMinutes += r.lateMinutes; }
    if (r.state === "ABSENT" || r.state === "NOT_MARKED") {
      const t = loggedOn.get(`${r.employee.id}|${d}`);
      if (t) unmarkedButLogged.push({ date: d, name: person.name, state: r.state, timesheetEntries: t.entries, minutesLogged: t.minutes });
    }
    byDay.set(d, day);
    byPerson.set(r.employee.id, person);
  }
  const people = [...byPerson.values()].map((x) => ({ ...x, attendancePercent: pct(x.present, x.workingDays - x.notMarked), onTimePercent: pct(x.present - x.late, x.present) }));
  const roles = new Map<string, { role: string; people: number; presentDays: number; lateDays: number }>();
  for (const x of people) {
    const k = x.role ?? "No designation";
    const g = roles.get(k) ?? { role: k, people: 0, presentDays: 0, lateDays: 0 };
    g.people++;
    g.presentDays += x.present;
    g.lateDays += x.late;
    roles.set(k, g);
  }

  const matches = all.filter((r) => {
    if (!status) return true;
    if (status === "LATE") return r.isLate;
    if (status === "NO_OUT") return r.missingTimeOut;
    if (status === "PRESENT") return r.state === "PRESENT" || r.state === "HALF_DAY";
    return r.state === status;
  });
  // Without a status filter on a long range, list only the exceptions (late / absent / half day / leave).
  const listed = !status && multiDay ? matches.filter((r) => r.isLate || r.state !== "PRESENT") : matches;
  const rows = listed.slice(0, 250).map((r) => {
    const leave = r.state === "LEAVE" || r.state === "NOT_MARKED" || r.state === "ABSENT" ? leaveOn(r.employee.id, r.date) : null;
    return {
      date: toIsoDate(r.date),
      name: fullName(r.employee),
      code: r.employee.permanentEmployeeCode ?? r.employee.temporaryEmployeeCode,
      designation: r.employee.designation?.name ?? null,
      state: r.state,
      timeIn: r.record?.timeIn ? formatTime(r.record.timeIn, tz) : null,
      timeOut: r.record?.timeOut ? formatTime(r.record.timeOut, tz) : null,
      late: r.isLate ? { minutes: r.lateMinutes, band: r.lateBand } : r.lateBand === "GRACE" ? { minutes: r.lateMinutes, band: "GRACE (not counted late)" } : null,
      lateReason: r.record?.lateReason ?? r.lateIntimation?.reason ?? null,
      lateIntimatedInAdvance: r.lateIntimation ? r.lateIntimation.inAdvance : null,
      workedMinutes: r.workedMinutes,
      leftEarly: r.leftEarly || null,
      missingMarkOut: r.missingTimeOut || null,
      autoMarkedAbsent: r.record?.autoAbsentAt ? true : null,
      leave: leave ? { type: leave.leaveType, status: leave.status, from: toIsoDate(leave.fromDate), to: toIsoDate(leave.toDate), returns: toIsoDate(addDays(leave.toDate, 1)), halfDay: leave.isHalfDay, reason: leave.reason } : null,
      location: r.record?.workLocation ?? null,
      remarks: r.record?.remarks ?? null,
    };
  });
  const p = policy.row;
  const markedPersonDays = counts.total - counts.NOT_MARKED;
  return {
    period: { from, to, ...(clipped ? { note: `Range shortened to the last ${MAX_RANGE_DAYS} days.` } : {}) },
    rules: `Office ${p.officeStart}–${p.officeEnd}; arriving after ${p.reportingGraceUntil} (grace) is LATE; over ${p.veryLateAfterMinutes} min late is VERY_LATE. Not marked in by ${p.autoAbsentAt} = absent. Sundays and holidays are off.`,
    states: "NOT_MARKED = no attendance entry for that day (today: not marked in yet; past days: nothing was recorded, e.g. before staff started marking in the ERP). ABSENT with autoMarkedAbsent = never marked, so the ERP marked them absent. LEAVE = approved leave. A NOT_MARKED / ABSENT row with `leave` set is on (pending or approved) leave; without it they simply did not mark.",
    employeesCovered: employeeCount,
    totals: {
      personDays: counts.total, present: counts.PRESENT, late: counts.LATE, onTime: counts.PRESENT - counts.LATE, absent: counts.ABSENT, leave: counts.LEAVE, halfDay: counts.HALF_DAY, notMarked: counts.NOT_MARKED, missingMarkOut: counts.NO_OUT,
      attendancePercent: pct(counts.PRESENT, markedPersonDays), onTimePercentOfPresent: pct(counts.PRESENT - counts.LATE, counts.PRESENT),
      presentPercentOfAllWorkingDays: pct(counts.PRESENT, counts.total),
    },
    percentBasis: "attendancePercent = present ÷ days that have an attendance entry (present / absent / leave). presentPercentOfAllWorkingDays also counts days with no entry. When notMarked is large, say how many days had no entry and quote both figures.",
    ...(multiDay ? { perDay: [...byDay.values()].sort((x, y) => x.date.localeCompare(y.date)) } : {}),
    perPerson: people.sort((x, y) => (y.attendancePercent ?? 0) - (x.attendancePercent ?? 0) || x.late - y.late),
    perRole: [...roles.values()].map((g) => ({ ...g, latePercentOfPresent: pct(g.lateDays, g.presentDays) })).sort((x, y) => (y.latePercentOfPresent ?? 0) - (x.latePercentOfPresent ?? 0)),
    ...(unmarkedButLogged.length ? { timesheetOnUnmarkedDays: unmarkedButLogged.slice(0, 100) } : {}),
    rowsShown: rows.length,
    rowsMatching: listed.length,
    rowsNote: !status && multiDay ? "Rows list only exceptions (late, absent, leave, half day, not marked)." : undefined,
    rows,
  };
}

async function payrollMonth(ctx: AppContext, args: Record<string, unknown>) {
  const month = typeof args.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(args.month) ? args.month : isoDateInTz(new Date(), ctx.organization.timezone).slice(0, 7);
  const r = await payrollForMonth(ctx, month);
  const q = typeof args.employee === "string" ? args.employee.toLowerCase().trim() : "";
  const rows = r.rows.filter((x) => !q || x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q));
  const sum = (f: (x: (typeof rows)[number]) => number | null) => Math.round(rows.reduce((s, x) => s + (f(x) ?? 0), 0));
  return {
    month,
    monthComplete: r.complete,
    note: r.complete ? undefined : "The month is still running: figures cover the days so far.",
    totals: { people: rows.length, monthlySalaries: sum((x) => x.monthlySalary), netPay: sum((x) => x.pay.net), fines: sum((x) => x.pay.fines), overtimePay: sum((x) => x.pay.overtimePay), bonus: sum((x) => x.pay.bonus) },
    rows: rows.map((x) => ({
      name: x.name, code: x.code, designation: x.designation, department: x.department,
      monthlySalary: x.monthlySalary, payableDays: x.score.payableDays, workedDays: x.score.worked, absent: x.score.absent, absentUnrequested: x.score.absentUnrequested,
      lateArrivals: x.score.lateArrivals, veryLateArrivals: x.score.veryLateArrivals, lateHalfDays: x.score.lateHalfDays, halfDays: x.score.halfDays,
      paidLeave: x.score.paidLeave, unpaidLeave: x.score.unpaidLeave, unpaidDays: x.score.unpaidDays, overtimeMinutes: x.score.overtimeMinutes,
      fines: x.pay.fines, overtimePay: x.pay.overtimePay, bonus: x.pay.bonus, netPay: x.pay.net,
    })),
  };
}

async function salaries(ctx: AppContext, args: Record<string, unknown>) {
  const q = typeof args.employee === "string" ? args.employee.toLowerCase().trim() : "";
  const rows = (await salaryOverview(ctx)).filter((x) => !q || x.name.toLowerCase().includes(q) || x.code.toLowerCase().includes(q));
  return {
    people: rows.length,
    totalMonthly: Math.round(rows.reduce((s, x) => s + (x.current?.monthly ?? 0), 0)),
    rows: rows.map((x) => ({
      name: x.name, code: x.code, designation: x.designation,
      monthlySalary: x.current?.monthly ?? null, agreed: x.current ? `${x.current.amount} per ${x.current.period.toLowerCase()}` : null, since: x.current ? toIsoDate(x.current.from) : null, mode: x.current?.mode ?? null,
      upcoming: x.upcoming ? { monthly: x.upcoming.monthly, from: toIsoDate(x.upcoming.from) } : null,
      committedIncrement: x.committed ? { date: x.committed.date ? toIsoDate(x.committed.date) : null, amount: x.committed.amount, percent: x.committed.percent } : null,
      salaryChanges: x.changes,
    })),
  };
}

function parseBlock(name: string, args: Record<string, unknown>): Block {
  const raw = name === "show_kpis" ? { type: "kpis", ...args } : name === "show_chart" ? { type: "chart", ...args } : { type: "table", ...args };
  const parsed = blockSchema.safeParse(raw);
  if (!parsed.success) throw new QueryError(`Invalid ${name} input: ${parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. Fix and call again.`);
  return parsed.data;
}

export async function runTool(ctx: AppContext, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  const label = toolLabel(name, args);
  try {
    switch (name) {
      case "query_database":
        return { label, result: await runDbQuery(ctx, args as unknown as DbQueryInput) };
      case "attendance_report":
        if (!can(ctx, "attendance.view_all")) throw new QueryError("No access to team attendance.");
        return { label, result: await attendanceReport(ctx, args) };
      case "payroll_month":
        if (!can(ctx, "payroll.manage")) throw new QueryError("No access to payroll.");
        return { label, result: await payrollMonth(ctx, args) };
      case "salary_overview":
        if (!can(ctx, "payroll.salaries")) throw new QueryError("No access to salaries.");
        return { label, result: await salaries(ctx, args) };
      case "sheet_overview":
      case "read_sheet": {
        const cfg = sheetFor(ctx);
        if (!cfg?.sheetId) throw new QueryError("The Google Sheet is not available to this user.");
        const result = name === "sheet_overview" ? await describeSheet(cfg.sheetId, cfg.freshSeconds, !!args.refresh) : await readSheet(cfg.sheetId, cfg.freshSeconds, args as Parameters<typeof readSheet>[2]);
        return { label, result };
      }
      case "show_kpis":
      case "show_chart":
      case "show_table":
        return { label, result: "Shown to the user.", block: parseBlock(name, args) };
      case "suggest_follow_up": {
        const q = typeof args.question === "string" ? args.question.trim().slice(0, 160) : "";
        if (!q) throw new QueryError("question is required");
        return { label, result: "Shown to the user.", followUp: q };
      }
      default:
        throw new QueryError(`Unknown tool ${name}.`);
    }
  } catch (e) {
    const message = e instanceof QueryError || (e instanceof Error && e.name === "SheetError") ? e.message : "The tool failed unexpectedly.";
    if (!(e instanceof QueryError)) console.error("assistant tool failed", name, e instanceof Error ? e.message : e);
    return { label, failed: true, result: { error: message } };
  }
}
