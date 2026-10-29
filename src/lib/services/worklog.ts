import "server-only";
import { NO_EMPLOYEE } from "@/lib/ids";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zIsoDate, zOptionalText } from "@/lib/actions";
import { dateOnly } from "@/lib/dates";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { notifyClientUsers, notifyEmployees } from "./notifications";

function requireEmployee(ctx: AppContext) {
  if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
  return ctx.employee.id;
}

// ============================================================ Timesheet (10A)

export const timesheetSchema = z.object({
  workDate: zIsoDate,
  serialNumber: z.coerce.number().int().min(1).max(999).optional(),
  clientId: z.uuid().optional(),
  clientNameText: zOptionalText(200),
  taskId: z.uuid().optional(),
  placeOfWork: zOptionalText(120),
  workTypeId: z.uuid().optional(),
  typeOfWork: zOptionalText(200),
  bankName: zOptionalText(120),
  periodFrom: zIsoDate.optional(),
  periodTo: zIsoDate.optional(),
  transactionCount: z.coerce.number().int().min(0).max(1_000_000).optional(),
  hours: z.coerce.number().int().min(0).max(24).optional(),
  minutes: z.coerce.number().int().min(0).max(59).optional(),
  workDetails: zOptionalText(4000),
  workStatus: z.enum(["COMPLETED", "IN_PROGRESS", "PENDING"]).optional(),
  whatsappMessage: zOptionalText(2000),
});

export async function addTimesheetEntry(ctx: AppContext, v: z.infer<typeof timesheetSchema>) {
  const employeeId = requireEmployee(ctx);
  if (!v.clientId && !v.clientNameText) throw new BusinessRuleError("Select a client or type the client name.");
  if (v.periodFrom && v.periodTo && v.periodTo < v.periodFrom) throw new BusinessRuleError("Period to is before period from.");
  const client = v.clientId ? await prisma.client.findFirst({ where: { id: v.clientId, organizationId: ctx.organization.id }, select: { id: true, tradeName: true } }) : null;
  if (v.clientId && !client) throw new BusinessRuleError("Client not found.");
  const workType = v.workTypeId ? await prisma.workType.findFirst({ where: { id: v.workTypeId, organizationId: ctx.organization.id } }) : null;
  const day = dateOnly(v.workDate);
  // Link the entry to the active allocation for this client, if any ("connection with timesheet").
  const allocation = client
    ? await prisma.teamAllocation.findFirst({
        where: { clientId: client.id, employeeId, status: { in: ["ACTIVE", "PLANNED"] }, startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] },
        select: { id: true },
      })
    : null;
  const serial = v.serialNumber ?? (await prisma.timesheetEntry.count({ where: { employeeId, workDate: day } })) + 1;
  const minutes = (v.hours ?? 0) * 60 + (v.minutes ?? 0);
  return prisma.timesheetEntry.create({
    data: {
      organizationId: ctx.organization.id,
      employeeId,
      serialNumber: serial,
      workDate: day,
      clientId: client?.id,
      // Keep the client's display name at the time of entry for audit/reporting.
      clientNameText: client?.tradeName ?? v.clientNameText,
      taskId: v.taskId,
      teamAllocationId: allocation?.id,
      placeOfWork: v.placeOfWork,
      workTypeId: workType?.id,
      typeOfWork: workType?.name ?? v.typeOfWork,
      bankName: v.bankName,
      periodFrom: v.periodFrom ? dateOnly(v.periodFrom) : null,
      periodTo: v.periodTo ? dateOnly(v.periodTo) : null,
      transactionCount: v.transactionCount,
      approxMinutes: minutes || null,
      workDetails: v.workDetails,
      workStatus: v.workStatus,
      whatsappMessage: v.whatsappMessage,
      status: "SUBMITTED",
    },
  });
}

export async function deleteOwnTimesheetEntry(ctx: AppContext, entryId: string) {
  const employeeId = requireEmployee(ctx);
  const e = await prisma.timesheetEntry.findFirst({ where: { id: entryId, employeeId, status: { not: "REVIEWED" } } });
  if (!e) throw new BusinessRuleError("Only your own entries that have not been reviewed can be removed.");
  await prisma.timesheetEntry.delete({ where: { id: e.id } });
}

/** Bulk review from the collective view. Nobody reviews their own entries. */
export async function reviewTimesheet(ctx: AppContext, entryIds: string[], note?: string) {
  return prisma.$transaction(async (tx) => {
    const entries = await tx.timesheetEntry.findMany({
      where: { id: { in: entryIds }, organizationId: ctx.organization.id, status: "SUBMITTED", employeeId: { not: ctx.employee?.id ?? NO_EMPLOYEE } },
      select: { id: true, employeeId: true },
    });
    await tx.timesheetEntry.updateMany({
      where: { id: { in: entries.map((e) => e.id) } },
      data: { status: "REVIEWED", reviewedById: ctx.user.id, reviewedAt: new Date(), reviewNote: note },
    });
    for (const e of entries) await audit(tx, ctx, "timesheet.reviewed", "timesheet_entry", e.id, { note: note ?? null });
    return entries.length;
  });
}

/** Load one entry the caller may see: their own, or any for timesheet reviewers. */
export async function loadTimesheetEntryForCtx(ctx: AppContext, entryId: string) {
  return prisma.timesheetEntry.findFirst({
    where: {
      id: entryId,
      organizationId: ctx.organization.id,
      ...(can(ctx.role, "timesheet.view_all") ? {} : { employeeId: ctx.employee?.id ?? NO_EMPLOYEE }),
    },
  });
}

export const entryReviewSchema = z.object({ decision: z.enum(["REVIEWED", "RETURNED"]), note: zOptionalText(1000) });

/** Single-entry review: mark reviewed, or return to the employee for correction (a reason is required). */
export async function reviewTimesheetEntry(ctx: AppContext, entryId: string, decision: "REVIEWED" | "RETURNED", note?: string) {
  const e = await loadTimesheetEntryForCtx(ctx, entryId);
  if (!e) throw new BusinessRuleError("Entry not found.");
  if (e.employeeId === ctx.employee?.id) throw new BusinessRuleError("You cannot review your own timesheet entry.");
  if (e.status !== "SUBMITTED") throw new BusinessRuleError("Only submitted entries can be reviewed.");
  if (decision === "RETURNED" && !note) throw new BusinessRuleError("Explain what needs to be corrected.");
  await prisma.$transaction(async (tx) => {
    const res = await tx.timesheetEntry.updateMany({
      where: { id: e.id, status: "SUBMITTED" },
      data: { status: decision, reviewedById: ctx.user.id, reviewedAt: new Date(), reviewNote: note },
    });
    if (res.count !== 1) throw new BusinessRuleError("The entry was changed by someone else. Refresh and try again.");
    await audit(tx, ctx, decision === "REVIEWED" ? "timesheet.reviewed" : "timesheet.returned", "timesheet_entry", e.id, { note: note ?? null });
    await notifyEmployees(tx, ctx.organization.id, [e.employeeId], {
      type: "timesheet.review",
      title: decision === "REVIEWED" ? "Your timesheet entry was reviewed" : "Your timesheet entry needs correction",
      body: note,
      link: `/app/timesheet/${e.id}`,
    });
  });
}

export const entryCorrectionSchema = timesheetSchema.extend({ reason: zOptionalText(500) });

const AUDITED_FIELDS = ["workDate", "clientNameText", "placeOfWork", "typeOfWork", "bankName", "periodFrom", "periodTo", "transactionCount", "approxMinutes", "workDetails", "workStatus", "whatsappMessage"] as const;

/**
 * Correct an entry. The employee may correct their own entry until it is
 * reviewed (a returned entry is resubmitted); administrators may correct any
 * entry but must give a reason. Original and new values go to the audit log.
 */
export async function correctTimesheetEntry(ctx: AppContext, entryId: string, v: z.infer<typeof entryCorrectionSchema>) {
  const e = await loadTimesheetEntryForCtx(ctx, entryId);
  if (!e) throw new BusinessRuleError("Entry not found.");
  const own = e.employeeId === ctx.employee?.id;
  const admin = can(ctx.role, "org.manage");
  if (!own && !admin) throw new BusinessRuleError("You can only correct your own entries.");
  if (!admin && e.status === "REVIEWED") throw new BusinessRuleError("Reviewed entries can only be corrected by an administrator.");
  if (!own && !v.reason) throw new BusinessRuleError("Give a reason for correcting another person's entry.");
  if (v.periodFrom && v.periodTo && v.periodTo < v.periodFrom) throw new BusinessRuleError("Period to is before period from.");
  const client = v.clientId ? await prisma.client.findFirst({ where: { id: v.clientId, organizationId: ctx.organization.id }, select: { id: true, tradeName: true } }) : null;
  if (v.clientId && !client) throw new BusinessRuleError("Client not found.");
  if (!client && !v.clientNameText) throw new BusinessRuleError("Select a client or type the client name.");
  const workType = v.workTypeId ? await prisma.workType.findFirst({ where: { id: v.workTypeId, organizationId: ctx.organization.id } }) : null;
  const minutes = (v.hours ?? 0) * 60 + (v.minutes ?? 0);
  const next = {
    workDate: dateOnly(v.workDate),
    clientId: client?.id ?? null,
    clientNameText: client?.tradeName ?? v.clientNameText ?? null,
    placeOfWork: v.placeOfWork ?? null,
    workTypeId: workType?.id ?? null,
    typeOfWork: workType?.name ?? v.typeOfWork ?? null,
    bankName: v.bankName ?? null,
    periodFrom: v.periodFrom ? dateOnly(v.periodFrom) : null,
    periodTo: v.periodTo ? dateOnly(v.periodTo) : null,
    transactionCount: v.transactionCount ?? null,
    approxMinutes: minutes || null,
    workDetails: v.workDetails ?? null,
    workStatus: v.workStatus ?? null,
    whatsappMessage: v.whatsappMessage ?? null,
  };
  const fmt = (x: unknown) => (x instanceof Date ? x.toISOString().slice(0, 10) : x ?? null);
  const changes = AUDITED_FIELDS.filter((k) => String(fmt(e[k])) !== String(fmt(next[k]))).map((k) => ({ field: k, from: fmt(e[k]), to: fmt(next[k]) }));
  if (changes.length === 0) throw new BusinessRuleError("Nothing was changed.");
  await prisma.$transaction(async (tx) => {
    await tx.timesheetEntry.update({
      where: { id: e.id },
      // An employee's correction (re)submits the entry for review.
      data: { ...next, ...(own && e.status !== "REVIEWED" ? { status: "SUBMITTED" as const } : {}) },
    });
    await audit(tx, ctx, "timesheet.corrected", "timesheet_entry", e.id, { reason: v.reason ?? null, changes } as Prisma.InputJsonValue);
  });
}

// ============================================================ Pending items (10B / 12A / 12B)

export function pendingScope(ctx: AppContext): Prisma.PendingItemWhereInput {
  if (can(ctx.role, "pending.view_all")) return { organizationId: ctx.organization.id };
  const me = ctx.employee?.id ?? NO_EMPLOYEE;
  return { organizationId: ctx.organization.id, OR: [{ raisedByEmployeeId: me }, { pendingWithEmployeeId: me }] };
}

export const pendingSchema = z.object({
  category: z.enum(["DAILY", "COMMUNICATION"]),
  pendingWith: z.enum(["CLIENT", "TEAM_MEMBER"]),
  clientId: z.uuid().optional(),
  taskId: z.uuid().optional(),
  /** The timesheet entry (work record) this follow-up relates to (Flow F). */
  timesheetEntryId: z.uuid().optional(),
  pendingWithEmployeeId: z.uuid().optional(),
  requestDescription: z.string().min(3, "Describe what is pending").max(2000),
  requestedOn: zIsoDate,
  dueBy: zIsoDate.optional(),
  remark: zOptionalText(1000),
  clientVisible: zCheckbox.optional(),
});

export async function createPendingItem(ctx: AppContext, v: z.infer<typeof pendingSchema>) {
  if (v.pendingWith === "CLIENT" && !v.clientId) throw new BusinessRuleError("Select the client this is pending with.");
  if (v.pendingWith === "TEAM_MEMBER" && !v.pendingWithEmployeeId && !ctx.employee) throw new BusinessRuleError("Select the team member.");
  if (v.dueBy && v.dueBy < v.requestedOn) throw new BusinessRuleError("Due date is before the request date.");
  if (v.clientId && !(await prisma.client.findFirst({ where: { id: v.clientId, organizationId: ctx.organization.id }, select: { id: true } }))) {
    throw new BusinessRuleError("Client not found.");
  }
  // Linked records must belong to this organization (and staff may only link their own work entries).
  if (v.taskId && !(await prisma.task.findFirst({ where: { id: v.taskId, organizationId: ctx.organization.id }, select: { id: true } }))) {
    throw new BusinessRuleError("Task not found.");
  }
  if (v.timesheetEntryId) {
    const entry = await prisma.timesheetEntry.findFirst({
      where: {
        id: v.timesheetEntryId,
        organizationId: ctx.organization.id,
        ...(can(ctx.role, "timesheet.view_all") ? {} : { employeeId: ctx.employee?.id ?? NO_EMPLOYEE }),
      },
      select: { id: true },
    });
    if (!entry) throw new BusinessRuleError("Timesheet entry not found.");
  }
  const withEmployee = v.pendingWith === "TEAM_MEMBER" ? (v.pendingWithEmployeeId ?? ctx.employee!.id) : null;
  if (withEmployee && !(await prisma.employee.findFirst({ where: { id: withEmployee, organizationId: ctx.organization.id }, select: { id: true } }))) {
    throw new BusinessRuleError("Team member not found.");
  }
  return prisma.$transaction(async (tx) => {
    const item = await tx.pendingItem.create({
      data: {
        organizationId: ctx.organization.id,
        category: v.category,
        pendingWith: v.pendingWith,
        clientId: v.clientId,
        taskId: v.taskId,
        timesheetEntryId: v.timesheetEntryId,
        pendingWithEmployeeId: withEmployee,
        raisedByEmployeeId: ctx.employee?.id,
        requestDescription: v.requestDescription,
        requestedOn: dateOnly(v.requestedOn),
        dueBy: v.dueBy ? dateOnly(v.dueBy) : null,
        remark: v.remark,
        // Only requests pending with the client can be shown in the client portal.
        clientVisible: v.pendingWith === "CLIENT" && !!v.clientVisible,
        createdById: ctx.user.id,
      },
    });
    if (item.clientVisible && item.clientId) {
      await notifyClientUsers(tx, ctx.organization.id, item.clientId, { type: "request.new", title: `New request from ${ctx.organization.tradeName}`, body: v.requestDescription.slice(0, 140), link: `/client/requests/${item.id}` });
    }
    if (withEmployee && withEmployee !== ctx.employee?.id) {
      await notifyEmployees(tx, ctx.organization.id, [withEmployee], { type: "pending.assigned", title: "New pending item for you", body: v.requestDescription.slice(0, 140), link: "/app/pending" });
    }
    return item;
  });
}

export const pendingUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "AWAITING_RESPONSE", "CLOSED"]),
  note: zOptionalText(1000),
  nextFollowUpOn: zIsoDate.optional(),
  shareWithClient: zCheckbox.optional(),
});

export async function updatePendingItem(ctx: AppContext, itemId: string, v: z.infer<typeof pendingUpdateSchema>) {
  const item = await prisma.pendingItem.findFirst({ where: { AND: [pendingScope(ctx), { id: itemId }] } });
  if (!item) throw new BusinessRuleError("Pending item not found.");
  await prisma.$transaction(async (tx) => {
    await tx.pendingItem.update({
      where: { id: item.id },
      data: { status: v.status, closedAt: v.status === "CLOSED" ? (item.closedAt ?? new Date()) : null },
    });
    if (v.note || v.status !== item.status) {
      await tx.followUp.create({
        data: {
          organizationId: ctx.organization.id,
          pendingItemId: item.id,
          note: v.note ?? `Status changed to ${v.status.toLowerCase().replaceAll("_", " ")}`,
          nextFollowUpOn: v.nextFollowUpOn ? dateOnly(v.nextFollowUpOn) : null,
          actorUserId: ctx.user.id,
          clientVisible: !!v.shareWithClient && item.clientVisible && !!v.note,
        },
      });
      if (v.shareWithClient && item.clientVisible && v.note && item.clientId) {
        await notifyClientUsers(tx, ctx.organization.id, item.clientId, { type: "request.update", title: "Update on a request", body: v.note.slice(0, 140), link: `/client/requests/${item.id}` });
      }
    }
  });
}

// ============================================================ Day reports (11)

export const dayReportSchema = z.object({
  reportDate: zIsoDate,
  workPlan: zOptionalText(4000),
  completedWork: zOptionalText(4000),
  newAssignments: zOptionalText(4000),
  pendingWork: zOptionalText(4000),
  blockers: zOptionalText(4000),
  summary: zOptionalText(4000),
  "recipientIds[]": z.array(z.uuid()).default([]),
  submit: z.enum(["draft", "send"]),
});

export async function saveDayReport(ctx: AppContext, v: z.infer<typeof dayReportSchema>) {
  const employeeId = requireEmployee(ctx);
  const recipients = v["recipientIds[]"].filter((r) => r !== employeeId);
  if (v.submit === "send" && recipients.length === 0) throw new BusinessRuleError("Choose the manager(s) to send the report to.");
  const valid = await prisma.employee.count({ where: { id: { in: recipients }, organizationId: ctx.organization.id } });
  if (valid !== recipients.length) throw new BusinessRuleError("Invalid recipient.");
  const day = dateOnly(v.reportDate);
  return prisma.$transaction(async (tx) => {
    const existing = await tx.dayReport.findFirst({ where: { reportingEmployeeId: employeeId, reportDate: day } });
    if (existing && existing.status !== "DRAFT") throw new BusinessRuleError("The report for this date has already been sent.");
    const data = {
      workPlan: v.workPlan, completedWork: v.completedWork, newAssignments: v.newAssignments, pendingWork: v.pendingWork,
      blockers: v.blockers, summary: v.summary,
      status: v.submit === "send" ? ("SUBMITTED" as const) : ("DRAFT" as const),
      submittedAt: v.submit === "send" ? new Date() : null,
    };
    const report = existing
      ? await tx.dayReport.update({ where: { id: existing.id }, data })
      : await tx.dayReport.create({ data: { ...data, organizationId: ctx.organization.id, reportingEmployeeId: employeeId, reportDate: day } });
    await tx.dayReportRecipient.deleteMany({ where: { dayReportId: report.id } });
    await tx.dayReportRecipient.createMany({
      data: recipients.map((r) => ({ dayReportId: report.id, recipientEmployeeId: r, sentAt: v.submit === "send" ? new Date() : null })),
    });
    await audit(tx, ctx, v.submit === "send" ? "day_report.submitted" : "day_report.draft_saved", "day_report", report.id, { recipients: recipients.length });
    if (v.submit === "send") {
      await notifyEmployees(tx, ctx.organization.id, recipients, {
        type: "dayreport.received",
        title: `Day report from ${ctx.employee!.firstName} (${v.reportDate})`,
        link: `/app/day-reports/${report.id}`,
      });
    }
    return report;
  });
}

/** A recipient manager reviews (acknowledges) a day report, optionally with a remark. */
export async function acknowledgeDayReport(ctx: AppContext, reportId: string, remark?: string) {
  const me = requireEmployee(ctx);
  const rec = await prisma.dayReportRecipient.findFirst({
    where: { dayReportId: reportId, recipientEmployeeId: me, dayReport: { organizationId: ctx.organization.id } },
    include: { dayReport: { select: { reportingEmployeeId: true, reportDate: true } } },
  });
  if (!rec) throw new BusinessRuleError("This report was not sent to you.");
  await prisma.$transaction(async (tx) => {
    await tx.dayReportRecipient.update({ where: { id: rec.id }, data: { acknowledgedAt: new Date(), readAt: rec.readAt ?? new Date(), reviewRemark: remark } });
    await tx.dayReport.update({ where: { id: reportId }, data: { status: "ACKNOWLEDGED" } });
    await audit(tx, ctx, "day_report.reviewed", "day_report", reportId, { remark: remark ?? null });
    await notifyEmployees(tx, ctx.organization.id, [rec.dayReport.reportingEmployeeId], {
      type: "dayreport.reviewed",
      title: `${ctx.employee!.firstName} reviewed your day report`,
      body: remark,
      link: `/app/day-reports/${reportId}`,
    });
  });
}

/** Suggested day-report text built from the day's timesheet, tasks and pending items (no retyping). */
export async function dayReportSuggestion(ctx: AppContext, iso: string) {
  const employeeId = requireEmployee(ctx);
  const day = dateOnly(iso);
  const start = new Date(`${iso}T00:00:00+05:30`);
  const end = new Date(start.getTime() + 86_400_000);
  const [entries, completed, assigned, pending] = await Promise.all([
    prisma.timesheetEntry.findMany({ where: { employeeId, workDate: day }, orderBy: { serialNumber: "asc" } }),
    prisma.taskActivity.findMany({
      where: { type: "STATUS_CHANGED", toValue: { in: ["COMPLETED", "PENDING_REVIEW"] }, createdAt: { gte: start, lt: end }, actorUserId: ctx.user.id },
      select: { task: { select: { title: true } }, toValue: true },
    }),
    prisma.taskAssignment.findMany({ where: { employeeId, assignedAt: { gte: start, lt: end } }, select: { task: { select: { title: true } } } }),
    prisma.pendingItem.findMany({
      where: { status: { not: "CLOSED" }, OR: [{ raisedByEmployeeId: employeeId }, { pendingWithEmployeeId: employeeId }] },
      select: { requestDescription: true, pendingWith: true, client: { select: { tradeName: true } } },
      take: 20,
    }),
  ]);
  const lines = (xs: string[]) => xs.map((x) => `• ${x}`).join("\n");
  return {
    completedWork: lines([
      ...entries.map((e) => `${e.clientNameText ?? "Internal"} — ${e.typeOfWork ?? "work"}${e.workDetails ? `: ${e.workDetails}` : ""}${e.approxMinutes ? ` (${Math.round(e.approxMinutes / 6) / 10}h)` : ""}`),
      ...completed.map((c) => `${c.task.title} — ${c.toValue === "COMPLETED" ? "completed" : "submitted for review"}`),
    ]),
    newAssignments: lines(assigned.map((a) => a.task.title)),
    pendingWork: lines(pending.map((p) => `${p.client?.tradeName ? `${p.client.tradeName}: ` : ""}${p.requestDescription} (${p.pendingWith === "CLIENT" ? "with client" : "with team"})`)),
  };
}

export async function auditWorklog(ctx: AppContext, action: string, id: string) {
  await prisma.$transaction((tx) => audit(tx, ctx, action, "worklog", id));
}
