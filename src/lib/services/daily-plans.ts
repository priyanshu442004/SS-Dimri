import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zIsoDate } from "@/lib/actions";
import { addDays, dateOnly, formatDate, hhmmToMinutes, monthRange, toIsoDate, todayDateOnly, zonedDateTime } from "@/lib/dates";
import { carriesOver, eodDeadlines, eodProblems, eodRuleApplies, eodState, leadFined, needsEscalation, personFined, planIsLate, planRuleApplies, type EodState } from "@/lib/domain/daily-plan";
import type { AppContext } from "@/lib/session";
import { NO_EMPLOYEE } from "@/lib/ids";
import { audit } from "./audit";
import { notifyEmployees, notifyRoles } from "./notifications";
import { actsAsLeadFor, getPolicy, holidaySet, isOffDay, leadScopeIds, leadsOf, plansApplyTo, ruleSubjects, scheduleOf, type Policy } from "./office-rules";

// Morning plan → Team Lead approves or edits → EOD report (the timesheet) with every line Done /
// Pending / Carried Forward → unfinished lines come back the next morning as old work.
// Fines (₹100 person, ₹200 Team Lead) are worked out from these rows, never stored.

const nameOf = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();

const lineSchema = z.object({
  id: z.uuid().optional(),
  clientId: z.uuid().optional().nullable(),
  clientName: z.string().trim().max(200).optional().nullable(),
  task: z.string().trim().min(2, "Describe each task").max(1000),
  expectedBy: zIsoDate.optional().nullable(),
  origin: z.enum(["PLANNED", "CARRIED", "NEW"]).default("PLANNED"),
  carriedFromId: z.uuid().optional().nullable(),
  status: z.enum(["DONE", "PENDING", "CARRIED_FORWARD"]).optional().nullable(),
  reason: z.string().trim().max(1000).optional().nullable(),
});
export type PlanLine = z.infer<typeof lineSchema>;

/** The form posts its lines as JSON in one hidden field. */
export function parseLines(raw: FormDataEntryValue | null): PlanLine[] {
  let data: unknown;
  try {
    data = JSON.parse(typeof raw === "string" && raw ? raw : "[]");
  } catch {
    throw new BusinessRuleError("The list could not be read. Reload the page and try again.");
  }
  const parsed = z.array(lineSchema).max(60, "At most 60 lines a day").safeParse(data);
  if (!parsed.success) throw new BusinessRuleError(parsed.error.issues[0]?.message ?? "Check the lines.");
  return parsed.data;
}

// ---------------------------------------------------------------- reading a day

const include = { items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }, approvedBy: { select: { name: true } }, escalatedBy: { select: { name: true } } } satisfies Prisma.DailyPlanInclude;
export type PlanWithItems = Prisma.DailyPlanGetPayload<{ include: typeof include }>;

/** Lines not finished on the person's last plan before this day: they start the new plan as old work. */
async function carryCandidates(employeeId: string, day: Date) {
  const last = await prisma.dailyPlan.findFirst({
    where: { employeeId, planDate: { lt: day, gte: addDays(day, -14) }, items: { some: {} } },
    orderBy: { planDate: "desc" },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!last) return [];
  return last.items.filter((i) => i.status === null || carriesOver(i.status)).map((i) => ({
    clientId: i.clientId, clientName: i.clientName, task: i.task, expectedBy: i.expectedBy ? toIsoDate(i.expectedBy) : null,
    origin: "CARRIED" as const, carriedFromId: i.id, from: toIsoDate(last.planDate), lastStatus: i.status, lastReason: i.reason,
  }));
}

export type DayView = Awaited<ReturnType<typeof dayView>>;

/** Everything one person's plan page needs for a day. */
export async function dayView(ctx: AppContext, employeeId: string, iso: string) {
  const tz = ctx.organization.timezone;
  const day = dateOnly(iso);
  const [policy, emp, plan, record, holidays] = await Promise.all([
    getPolicy(ctx.organization.id),
    prisma.employee.findUniqueOrThrow({ where: { id: employeeId }, select: { id: true, firstName: true, lastName: true, attendanceProfile: true, siteReportingTime: true } }),
    prisma.dailyPlan.findUnique({ where: { employeeId_planDate: { employeeId, planDate: day } }, include }),
    prisma.attendanceRecord.findFirst({ where: { employeeId, attendanceDate: day }, select: { status: true, timeIn: true, timeOut: true, scheduledStart: true, scheduledEnd: true } }),
    holidaySet(ctx.organization.id, day, addDays(day, 14)),
  ]);
  const schedule = scheduleOf(policy, emp, record);
  const deadlines = eodDeadlines(iso, holidays, schedule.start, hhmmToMinutes(policy.row.officeEnd), tz);
  const planDueBy = zonedDateTime(iso, hhmmToMinutes(policy.row.morningPlanBy), tz);
  const worked = !!record && (record.status === "PRESENT" || record.status === "HALF_DAY");
  const now = new Date();
  const state = eodState({ day: iso, worked: worked || !!plan?.items.length, submittedAt: plan?.eodSubmittedAt ?? null, fileBy: deadlines.fileBy, now });
  const carry = plan?.planSubmittedAt ? [] : (await carryCandidates(employeeId, day)).filter((c) => !plan?.items.some((i) => i.carriedFromId === c.carriedFromId));
  return {
    employee: emp, plan, record, worked, carry, deadlines, planDueBy, state, off: isOffDay(iso, holidays),
    planLate: planIsLate(iso, plan?.planSubmittedAt ?? null, planDueBy),
    fined: personFined(state), penalty: policy.row.eodPenaltyRupees, leadPenalty: policy.row.leadPenaltyRupees,
    morningPlanBy: policy.row.morningPlanBy,
  };
}

// ---------------------------------------------------------------- writing

async function writeLines(tx: Prisma.TransactionClient, planId: string, lines: PlanLine[], clients: Map<string, string>, mode: "plan" | "eod") {
  const existing = await tx.dailyPlanItem.findMany({ where: { planId }, select: { id: true } });
  const keep = new Set(lines.map((l) => l.id).filter(Boolean));
  const gone = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
  if (gone.length) await tx.dailyPlanItem.deleteMany({ where: { id: { in: gone }, planId } });
  for (const [i, l] of lines.entries()) {
    const clientName = l.clientId ? (clients.get(l.clientId) ?? l.clientName ?? null) : l.clientName?.trim() || null;
    const base = {
      clientId: l.clientId && clients.has(l.clientId) ? l.clientId : null,
      clientName,
      task: l.task,
      expectedBy: l.expectedBy ? dateOnly(l.expectedBy) : null,
      sortOrder: i,
      ...(mode === "eod" ? { status: l.status ?? null, reason: l.status && l.status !== "DONE" ? l.reason?.trim() || null : null } : {}),
    };
    if (l.id && existing.some((e) => e.id === l.id)) await tx.dailyPlanItem.update({ where: { id: l.id }, data: base });
    else await tx.dailyPlanItem.create({ data: { ...base, planId, origin: mode === "eod" && l.origin !== "CARRIED" ? "NEW" : l.origin, carriedFromId: l.carriedFromId ?? null } });
  }
}

async function clientNames(organizationId: string, lines: PlanLine[]) {
  const ids = [...new Set(lines.map((l) => l.clientId).filter((x): x is string => !!x))];
  if (!ids.length) return new Map<string, string>();
  const rows = await prisma.client.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, tradeName: true } });
  return new Map(rows.map((c) => [c.id, c.tradeName]));
}

async function notifyMyLeads(tx: Prisma.TransactionClient, ctx: AppContext, employeeId: string, note: { type: string; title: string; body?: string; link: string }) {
  const managers = await tx.employeeReportingRelationship.findMany({ where: { employeeId }, select: { managerId: true } });
  if (managers.length) await notifyEmployees(tx, ctx.organization.id, managers.map((m) => m.managerId), note);
  else await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], note, ctx.user.id);
}

export const planDaySchema = z.object({ date: zIsoDate, intent: z.enum(["save", "submit"]).default("submit") });

/** The person's own morning plan for today (or the next working day, planned ahead). */
export async function saveMyPlan(ctx: AppContext, iso: string, lines: PlanLine[], submit: boolean) {
  if (!ctx.employee || !plansApplyTo(ctx)) throw new BusinessRuleError("The morning plan is for staff who fill the timesheet.");
  const today = todayDateOnly(ctx.organization.timezone);
  const day = dateOnly(iso);
  if (day < today || day > addDays(today, 7)) throw new BusinessRuleError("Plan today or a day in the coming week.");
  if (submit && !lines.length) throw new BusinessRuleError("Add at least one task to your plan.");
  const clients = await clientNames(ctx.organization.id, lines);
  const employeeId = ctx.employee.id;
  return prisma.$transaction(async (tx) => {
    const plan = await tx.dailyPlan.upsert({
      where: { employeeId_planDate: { employeeId, planDate: day } },
      update: {},
      create: { organizationId: ctx.organization.id, employeeId, planDate: day },
    });
    if (plan.eodSubmittedAt) throw new BusinessRuleError("The EOD report for this day is already filed.");
    await writeLines(tx, plan.id, lines, clients, "plan");
    const first = submit && !plan.planSubmittedAt;
    await tx.dailyPlan.update({
      where: { id: plan.id },
      // A change after approval goes back to the Team Lead.
      data: { ...(first ? { planSubmittedAt: new Date() } : {}), ...(plan.approvedAt && submit ? { approvedAt: null, approvedById: null } : {}) },
    });
    await audit(tx, ctx, first ? "daily_plan.submitted" : "daily_plan.saved", "daily_plan", plan.id);
    if (submit) {
      await notifyMyLeads(tx, ctx, employeeId, {
        type: "daily_plan.submitted",
        title: `${first ? "Morning plan" : "Updated plan"} from ${ctx.employee!.firstName} (${formatDate(day)})`,
        body: lines.slice(0, 4).map((l) => `${l.clientName || clients.get(l.clientId ?? "") || "Internal"}: ${l.task}`).join(" · ") + (lines.length > 4 ? ` · +${lines.length - 4} more` : ""),
        link: `/app/timesheet?tab=team-plans&date=${iso}`,
      });
    }
    return { first, approvedReset: !!plan.approvedAt && submit };
  });
}

/** The Team Lead edits a plan and/or approves it (§2). */
export async function leadReviewPlan(ctx: AppContext, planId: string, lines: PlanLine[] | null, approve: boolean) {
  const plan = await prisma.dailyPlan.findFirst({ where: { id: planId, organizationId: ctx.organization.id }, include: { employee: { select: { firstName: true } } } });
  if (!plan) throw new BusinessRuleError("Plan not found.");
  if (!(await actsAsLeadFor(ctx, plan.employeeId))) throw new BusinessRuleError("You can approve or edit plans only for people who report to you.");
  if (!plan.planSubmittedAt) throw new BusinessRuleError("This plan has not been submitted yet.");
  if (plan.eodSubmittedAt && lines) throw new BusinessRuleError("The EOD report for this day is already filed; the plan can no longer be changed.");
  if (lines && !lines.length) throw new BusinessRuleError("A plan needs at least one task.");
  const clients = lines ? await clientNames(ctx.organization.id, lines) : new Map<string, string>();
  await prisma.$transaction(async (tx) => {
    if (lines) await writeLines(tx, plan.id, lines, clients, "plan");
    await tx.dailyPlan.update({
      where: { id: plan.id },
      data: { ...(lines ? { leadEditedAt: new Date() } : {}), ...(approve ? { approvedAt: new Date(), approvedById: ctx.user.id } : {}) },
    });
    await audit(tx, ctx, approve ? "daily_plan.approved" : "daily_plan.edited_by_lead", "daily_plan", plan.id);
    await notifyEmployees(tx, ctx.organization.id, [plan.employeeId], {
      type: "daily_plan.reviewed",
      title: `${ctx.user.name} ${lines && approve ? "edited and approved" : approve ? "approved" : "edited"} your plan for ${formatDate(plan.planDate)}`,
      link: `/app/timesheet?tab=plan&date=${toIsoDate(plan.planDate)}`,
    });
  });
  return plan.employee.firstName;
}

/** The EOD report (§2): every line Done / Pending / Carried Forward, a reason for unfinished ones, and new work. */
export async function saveMyEod(ctx: AppContext, iso: string, lines: PlanLine[], submit: boolean, note?: string) {
  if (!ctx.employee || !plansApplyTo(ctx)) throw new BusinessRuleError("The EOD report is for staff who fill the timesheet.");
  const today = todayDateOnly(ctx.organization.timezone);
  const day = dateOnly(iso);
  if (day > today) throw new BusinessRuleError("The EOD report is filed at the end of the day, not ahead.");
  if (day < addDays(today, -31)) throw new BusinessRuleError("That day is too far back.");
  if (submit) {
    const problems = eodProblems(lines.map((l) => ({ task: l.task, status: l.status ?? null, reason: l.reason ?? null })));
    if (problems.length) throw new BusinessRuleError(problems[0]);
  }
  const clients = await clientNames(ctx.organization.id, lines);
  const employeeId = ctx.employee.id;
  const view = await dayView(ctx, employeeId, iso);
  return prisma.$transaction(async (tx) => {
    const plan = await tx.dailyPlan.upsert({
      where: { employeeId_planDate: { employeeId, planDate: day } },
      update: {},
      create: { organizationId: ctx.organization.id, employeeId, planDate: day },
    });
    if (plan.eodSubmittedAt) throw new BusinessRuleError("The EOD report for this day is already filed.");
    await writeLines(tx, plan.id, lines, clients, "eod");
    const now = new Date();
    await tx.dailyPlan.update({ where: { id: plan.id }, data: { eodNote: note || null, ...(submit ? { eodSubmittedAt: now } : {}) } });
    await audit(tx, ctx, submit ? "daily_plan.eod_filed" : "daily_plan.eod_saved", "daily_plan", plan.id);
    const late = submit && eodRuleApplies(iso) && now > view.deadlines.fileBy;
    if (submit) {
      const done = lines.filter((l) => l.status === "DONE").length;
      await notifyMyLeads(tx, ctx, employeeId, {
        type: "daily_plan.eod",
        title: `EOD report from ${ctx.employee!.firstName} (${formatDate(day)})${late ? " — filed late" : ""}`,
        body: `${done} done · ${lines.length - done} pending / carried forward`,
        link: `/app/timesheet?tab=team-plans&date=${iso}`,
      });
    }
    return { late };
  });
}

/** The Team Lead escalates a missing EOD (§2): the person is told to update it, the administrators are informed. */
export async function escalateEod(ctx: AppContext, employeeId: string, iso: string) {
  if (!(await actsAsLeadFor(ctx, employeeId))) throw new BusinessRuleError("You can escalate only for people who report to you.");
  const view = await dayView(ctx, employeeId, iso);
  if (!needsEscalation({ state: view.state, escalatedAt: view.plan?.escalatedAt ?? null })) {
    throw new BusinessRuleError(view.plan?.escalatedAt ? "Already escalated." : view.state === "DUE" ? `The EOD can still be filed until ${formatDate(dateOnly(view.deadlines.nextDay))}'s reporting time.` : "There is nothing to escalate: the EOD is filed or not needed.");
  }
  const name = nameOf(view.employee);
  await prisma.$transaction(async (tx) => {
    const plan = await tx.dailyPlan.upsert({
      where: { employeeId_planDate: { employeeId, planDate: dateOnly(iso) } },
      update: { escalatedAt: new Date(), escalatedById: ctx.user.id },
      create: { organizationId: ctx.organization.id, employeeId, planDate: dateOnly(iso), escalatedAt: new Date(), escalatedById: ctx.user.id },
    });
    await audit(tx, ctx, "daily_plan.escalated", "daily_plan", plan.id);
    await notifyEmployees(tx, ctx.organization.id, [employeeId], {
      type: "daily_plan.escalated",
      title: `Update your timesheet for ${formatDate(dateOnly(iso))}`,
      body: `${ctx.user.name} escalated your missing EOD report. A fine of ₹${view.penalty} applies for not filing it in time.`,
      link: `/app/timesheet?tab=plan&date=${iso}`,
    });
    await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], {
      type: "daily_plan.escalated",
      title: `EOD not filed: ${name} (${formatDate(dateOnly(iso))})`,
      body: `Escalated by ${ctx.user.name}.`,
      link: `/app/timesheet?tab=team-plans&date=${iso}`,
    }, ctx.user.id);
  });
  return name;
}

// ---------------------------------------------------------------- the Team Lead's view

export type TeamPlanRow = {
  employee: { id: string; firstName: string; lastName: string | null };
  plan: PlanWithItems | null;
  attendance: string | null;
  worked: boolean;
  planLate: boolean;
  state: EodState;
  escalate: boolean;
  fileBy: Date;
  escalateBy: Date;
};

/** One row per person in scope for a day: plan, approval, EOD state. */
export async function teamPlans(ctx: AppContext, iso: string, onlyMine: boolean): Promise<TeamPlanRow[]> {
  const scope = onlyMine ? await (async () => (ctx.employee ? (await prisma.employeeReportingRelationship.findMany({ where: { managerId: ctx.employee.id }, select: { employeeId: true } })).map((r) => r.employeeId) : []))() : await leadScopeIds(ctx);
  const subjects = await ruleSubjects(ctx.organization.id);
  const ids = [...subjects.values()].filter((s) => s.plans && (scope === "ALL" || scope.includes(s.employeeId)) && s.employeeId !== ctx.employee?.id).map((s) => s.employeeId);
  if (!ids.length) return [];
  return plansFor(ctx.organization.id, ctx.organization.timezone, ids, iso);
}

async function plansFor(organizationId: string, tz: string, ids: string[], iso: string): Promise<TeamPlanRow[]> {
  const day = dateOnly(iso);
  const [policy, employees, plans, records, holidays] = await Promise.all([
    getPolicy(organizationId),
    prisma.employee.findMany({ where: { id: { in: ids }, OR: [{ dateOfJoining: null }, { dateOfJoining: { lte: day } }] }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true, attendanceProfile: true, siteReportingTime: true } }),
    prisma.dailyPlan.findMany({ where: { employeeId: { in: ids }, planDate: day }, include }),
    prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, attendanceDate: day }, select: { employeeId: true, status: true, scheduledStart: true, scheduledEnd: true } }),
    holidaySet(organizationId, day, addDays(day, 14)),
  ]);
  const now = new Date();
  const planDueBy = zonedDateTime(iso, hhmmToMinutes(policy.row.morningPlanBy), tz);
  return employees.map((e) => {
    const plan = plans.find((p) => p.employeeId === e.id) ?? null;
    const rec = records.find((r) => r.employeeId === e.id) ?? null;
    const worked = !!rec && (rec.status === "PRESENT" || rec.status === "HALF_DAY");
    const d = eodDeadlines(iso, holidays, scheduleOf(policy, e, rec).start, hhmmToMinutes(policy.row.officeEnd), tz);
    const state = eodState({ day: iso, worked: worked || !!plan?.items.length, submittedAt: plan?.eodSubmittedAt ?? null, fileBy: d.fileBy, now });
    return {
      employee: { id: e.id, firstName: e.firstName, lastName: e.lastName }, plan, attendance: rec?.status ?? null, worked,
      planLate: planIsLate(iso, plan?.planSubmittedAt ?? null, planDueBy), state,
      escalate: needsEscalation({ state, escalatedAt: plan?.escalatedAt ?? null }), fileBy: d.fileBy, escalateBy: d.escalateBy,
    };
  });
}

/** Missing EODs in the last week that the member (as Team Lead) has not escalated yet. */
export async function toEscalate(ctx: AppContext) {
  const scope = await leadScopeIds(ctx);
  if (scope !== "ALL" && !scope.length) return [];
  const today = todayDateOnly(ctx.organization.timezone);
  const subjects = await ruleSubjects(ctx.organization.id);
  const ids = [...subjects.values()].filter((s) => s.plans && (scope === "ALL" || scope.includes(s.employeeId)) && s.employeeId !== ctx.employee?.id).map((s) => s.employeeId);
  if (!ids.length) return [];
  const worked = await prisma.attendanceRecord.findMany({
    where: { employeeId: { in: ids }, attendanceDate: { gte: addDays(today, -7), lt: today }, status: { in: ["PRESENT", "HALF_DAY"] } },
    select: { employeeId: true, attendanceDate: true },
  });
  const days = [...new Set(worked.map((w) => toIsoDate(w.attendanceDate)))].sort();
  const out: (TeamPlanRow & { date: string })[] = [];
  for (const iso of days) {
    const who = worked.filter((w) => toIsoDate(w.attendanceDate) === iso).map((w) => w.employeeId);
    for (const r of await plansFor(ctx.organization.id, ctx.organization.timezone, who, iso)) if (r.escalate) out.push({ ...r, date: iso });
  }
  return out;
}

// ---------------------------------------------------------------- fines (§2)

export type Fines = { eodMissed: string[]; leadMissed: { employee: string; date: string }[]; amount: number };

/**
 * Fines for days worked in a month: ₹100 for each EOD not filed by the next day's reporting time,
 * and ₹200 to the Team Lead (the first person someone reports to) for each one still missing and
 * not escalated by the end of that next day.
 */
export async function finesForMonth(organizationId: string, tz: string, month: string, policy?: Policy): Promise<Map<string, Fines>> {
  const p = policy ?? (await getPolicy(organizationId));
  const { start, end } = monthRange(`${month}-01`);
  const subjects = await ruleSubjects(organizationId);
  const ids = [...subjects.values()].filter((s) => s.plans).map((s) => s.employeeId);
  const out = new Map<string, Fines>();
  const get = (id: string) => out.get(id) ?? out.set(id, { eodMissed: [], leadMissed: [], amount: 0 }).get(id)!;
  if (!ids.length) return out;
  const [records, plans, holidays, employees, leads] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, attendanceDate: { gte: start, lte: end }, status: { in: ["PRESENT", "HALF_DAY"] } }, select: { employeeId: true, attendanceDate: true, scheduledStart: true, scheduledEnd: true } }),
    prisma.dailyPlan.findMany({ where: { employeeId: { in: ids }, planDate: { gte: start, lte: end } }, select: { employeeId: true, planDate: true, eodSubmittedAt: true, escalatedAt: true } }),
    holidaySet(organizationId, start, addDays(end, 14)),
    prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, attendanceProfile: true, siteReportingTime: true } }),
    leadsOf(ids),
  ]);
  const now = new Date();
  const empBy = new Map(employees.map((e) => [e.id, e]));
  const planBy = new Map(plans.map((x) => [`${x.employeeId}|${toIsoDate(x.planDate)}`, x]));
  for (const r of records) {
    const e = empBy.get(r.employeeId);
    if (!e) continue;
    const iso = toIsoDate(r.attendanceDate);
    const plan = planBy.get(`${r.employeeId}|${iso}`);
    const d = eodDeadlines(iso, holidays, scheduleOf(p, e, r).start, hhmmToMinutes(p.row.officeEnd), tz);
    const state = eodState({ day: iso, worked: true, submittedAt: plan?.eodSubmittedAt ?? null, fileBy: d.fileBy, now });
    if (!personFined(state)) continue;
    const f = get(r.employeeId);
    f.eodMissed.push(iso);
    f.amount += p.row.eodPenaltyRupees;
    const lead = leads.get(r.employeeId)?.[0];
    if (lead && leadFined({ state, submittedAt: plan?.eodSubmittedAt ?? null, escalatedAt: plan?.escalatedAt ?? null, escalateBy: d.escalateBy, now })) {
      const lf = get(lead);
      lf.leadMissed.push({ employee: nameOf(e), date: iso });
      lf.amount += p.row.leadPenaltyRupees;
    }
  }
  return out;
}

// ---------------------------------------------------------------- automatic flags (§2)

/**
 * From the scheduled call: (1) after 10:30, people at work without a morning plan are flagged to
 * them and their Team Lead; (2) once the EOD deadline has passed, a missing EOD is flagged to the
 * person (fine) and their Team Lead (escalate today). Each flag is sent once (claimed on the row).
 */
export async function sweepPlanFlags(organizationId: string, tz: string) {
  const now = new Date();
  const today = todayDateOnly(tz);
  const iso = toIsoDate(today);
  const [policy, subjects, holidays] = await Promise.all([getPolicy(organizationId), ruleSubjects(organizationId), holidaySet(organizationId, addDays(today, -10), addDays(today, 7))]);
  const ids = [...subjects.values()].filter((s) => s.plans).map((s) => s.employeeId);
  if (!ids.length) return { plans: 0, eods: 0 };
  const names = new Map((await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } })).map((e) => [e.id, nameOf(e)]));
  const leads = await leadsOf(ids);
  const byLead = new Map<string, { plans: string[]; eods: string[] }>();
  const orphan = { plans: [] as string[], eods: [] as string[] };
  const tell = (empId: string, key: "plans" | "eods", text: string) => {
    const l = leads.get(empId);
    if (!l?.length) orphan[key].push(text);
    for (const m of l ?? []) {
      const b = byLead.get(m) ?? { plans: [], eods: [] };
      b[key].push(text);
      byLead.set(m, b);
    }
  };
  let plansFlagged = 0;
  let eodsFlagged = 0;

  // 1. Morning plan missing at 10:30.
  if (planRuleApplies(iso) && !isOffDay(iso, holidays) && now >= zonedDateTime(iso, hhmmToMinutes(policy.row.morningPlanBy), tz)) {
    const present = await prisma.attendanceRecord.findMany({ where: { employeeId: { in: ids }, attendanceDate: today, timeIn: { not: null } }, select: { employeeId: true } });
    for (const { employeeId } of present) {
      const plan = await prisma.dailyPlan.upsert({ where: { employeeId_planDate: { employeeId, planDate: today } }, update: {}, create: { organizationId, employeeId, planDate: today } });
      if (plan.planSubmittedAt || plan.planFlaggedAt) continue;
      const claimed = await prisma.dailyPlan.updateMany({ where: { id: plan.id, planFlaggedAt: null, planSubmittedAt: null }, data: { planFlaggedAt: now } });
      if (claimed.count !== 1) continue;
      plansFlagged++;
      await prisma.$transaction((tx) => notifyEmployees(tx, organizationId, [employeeId], {
        type: "daily_plan.missing", title: `Your morning plan was due by ${policy.row.morningPlanBy}`, body: "Enter today's tasks now; your Team Lead has been told it is missing.", link: "/app/timesheet?tab=plan",
      }));
      tell(employeeId, "plans", names.get(employeeId) ?? "—");
    }
  }

  // 2. EOD not filed by the next working day's reporting time (last 7 days).
  const worked = await prisma.attendanceRecord.findMany({
    where: { employeeId: { in: ids }, attendanceDate: { gte: addDays(today, -7), lt: today }, status: { in: ["PRESENT", "HALF_DAY"] } },
    select: { employeeId: true, attendanceDate: true, scheduledStart: true, scheduledEnd: true, employee: { select: { attendanceProfile: true, siteReportingTime: true } } },
  });
  for (const r of worked) {
    const day = toIsoDate(r.attendanceDate);
    if (!eodRuleApplies(day)) continue;
    const d = eodDeadlines(day, holidays, scheduleOf(policy, r.employee, r).start, hhmmToMinutes(policy.row.officeEnd), tz);
    if (now <= d.fileBy) continue;
    const plan = await prisma.dailyPlan.upsert({ where: { employeeId_planDate: { employeeId: r.employeeId, planDate: r.attendanceDate } }, update: {}, create: { organizationId, employeeId: r.employeeId, planDate: r.attendanceDate } });
    if (plan.eodSubmittedAt || plan.eodFlaggedAt) continue;
    const claimed = await prisma.dailyPlan.updateMany({ where: { id: plan.id, eodFlaggedAt: null, eodSubmittedAt: null }, data: { eodFlaggedAt: now } });
    if (claimed.count !== 1) continue;
    eodsFlagged++;
    await prisma.$transaction((tx) => notifyEmployees(tx, organizationId, [r.employeeId], {
      type: "daily_plan.eod_missing",
      title: `EOD report for ${formatDate(r.attendanceDate)} not filed`,
      body: `It was due by the reporting time today. A fine of ₹${policy.row.eodPenaltyRupees} applies. File it now.`,
      link: `/app/timesheet?tab=plan&date=${day}`,
    }));
    tell(r.employeeId, "eods", `${names.get(r.employeeId) ?? "—"} (${formatDate(r.attendanceDate)})`);
  }

  if (plansFlagged || eodsFlagged) {
    await prisma.$transaction(async (tx) => {
      const send = async (lead: string | null, b: { plans: string[]; eods: string[] }) => {
        const notes = [
          b.plans.length && { type: "daily_plan.missing_team", title: b.plans.length === 1 ? `No morning plan yet: ${b.plans[0]}` : `${b.plans.length} people have no morning plan yet`, body: b.plans.join(", "), link: `/app/timesheet?tab=team-plans&date=${iso}` },
          b.eods.length && { type: "daily_plan.eod_missing_team", title: b.eods.length === 1 ? `EOD not filed: ${b.eods[0]}` : `${b.eods.length} EOD reports not filed`, body: `Tell them to update it and escalate today, or a ₹${policy.row.leadPenaltyRupees} fine applies to you. ${b.eods.join(", ")}`, link: "/app/timesheet?tab=team-plans" },
        ].filter((x): x is { type: string; title: string; body: string; link: string } => !!x);
        for (const n of notes) {
          if (lead) await notifyEmployees(tx, organizationId, [lead], n);
          else await notifyRoles(tx, organizationId, ["OWNER", "ADMIN"], n);
        }
      };
      for (const [lead, b] of byLead) await send(lead, b);
      if (orphan.plans.length || orphan.eods.length) await send(null, orphan);
    });
  }
  return { plans: plansFlagged, eods: eodsFlagged };
}

/** The member's own plan state today (dashboard, attendance page). */
export async function myPlanStatus(ctx: AppContext) {
  if (!plansApplyTo(ctx)) return null;
  const tz = ctx.organization.timezone;
  const today = todayDateOnly(tz);
  const me = ctx.employee?.id ?? NO_EMPLOYEE;
  const [todayView, lastWorked] = await Promise.all([
    dayView(ctx, me, toIsoDate(today)),
    prisma.attendanceRecord.findFirst({ where: { employeeId: me, attendanceDate: { lt: today, gte: addDays(today, -7) }, status: { in: ["PRESENT", "HALF_DAY"] } }, orderBy: { attendanceDate: "desc" }, select: { attendanceDate: true } }),
  ]);
  const previous = lastWorked ? await dayView(ctx, me, toIsoDate(lastWorked.attendanceDate)) : null;
  return { today: todayView, previous: previous && (previous.state === "DUE" || previous.state === "MISSED") ? { iso: toIsoDate(lastWorked!.attendanceDate), view: previous } : null };
}
