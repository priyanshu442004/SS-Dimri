import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zIsoDate, zOptionalText } from "@/lib/actions";
import { addDays, dateOnly, todayDateOnly } from "@/lib/dates";
import { COMPLIANCE_FREQUENCIES, complianceStatus, daysRemaining, ESCALATION_DAYS, nextDueDate } from "@/lib/domain/compliance";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { notifyEmployees, notifyRoles } from "./notifications";

/** Rows the caller may see: leads see all, others what they are responsible for. */
export function complianceScope(ctx: AppContext): Prisma.ComplianceEntryWhereInput {
  if (can(ctx, "compliance.manage")) return { organizationId: ctx.organization.id };
  return { organizationId: ctx.organization.id, responsibleEmployeeId: ctx.employee?.id ?? "00000000-0000-0000-0000-000000000000" };
}

export const complianceEntrySchema = z.object({
  department: z.string({ error: "Select a module" }).min(1, "Select a module").max(60),
  complianceItemId: z.uuid().optional(),
  complianceType: z.string({ error: "Select or type the compliance" }).min(2, "Select or type the compliance").max(200),
  clientId: z.uuid().optional(),
  issuingAuthority: zOptionalText(120),
  registrationNumber: zOptionalText(60),
  dueDate: zIsoDate,
  frequency: z.enum(COMPLIANCE_FREQUENCIES).optional(),
  responsibleEmployeeId: z.uuid().optional(),
  reminderLeadDays: z.coerce.number().int().min(0).max(365).default(7),
  actionTaken: zCheckbox.optional(),
  actionTakenOn: zIsoDate.optional(),
  remarks: zOptionalText(1000),
});
type EntryInput = z.infer<typeof complianceEntrySchema>;

/** Values of the firm's own columns are posted as custom:<columnId>. */
async function readCustomValues(organizationId: string, fd: FormData) {
  const columns = await prisma.complianceColumn.findMany({ where: { organizationId }, select: { id: true } });
  const out: Record<string, string> = {};
  for (const c of columns) {
    const v = fd.get(`custom:${c.id}`);
    if (typeof v === "string" && v.trim()) out[c.id] = v.trim().slice(0, 500);
  }
  return out;
}

async function assertLinks(ctx: AppContext, v: EntryInput) {
  const organizationId = ctx.organization.id;
  if (v.clientId && !(await prisma.client.findFirst({ where: { id: v.clientId, organizationId }, select: { id: true } }))) throw new BusinessRuleError("Client not found.");
  if (v.responsibleEmployeeId && !(await prisma.employee.findFirst({ where: { id: v.responsibleEmployeeId, organizationId }, select: { id: true } }))) throw new BusinessRuleError("Select a valid responsible person.");
  if (v.complianceItemId && !(await prisma.complianceItem.findUnique({ where: { id: v.complianceItemId }, select: { id: true } }))) throw new BusinessRuleError("Select a valid compliance.");
}

function entryData(v: EntryInput) {
  return {
    department: v.department,
    complianceItemId: v.complianceItemId ?? null,
    complianceType: v.complianceType,
    clientId: v.clientId ?? null,
    issuingAuthority: v.issuingAuthority ?? null,
    registrationNumber: v.registrationNumber ?? null,
    dueDate: dateOnly(v.dueDate),
    frequency: v.frequency ?? null,
    responsibleEmployeeId: v.responsibleEmployeeId ?? null,
    reminderLeadDays: v.reminderLeadDays,
    actionTaken: !!v.actionTaken,
    actionTakenOn: v.actionTaken ? dateOnly(v.actionTakenOn ?? new Date().toISOString().slice(0, 10)) : null,
    remarks: v.remarks ?? null,
  };
}

export async function createComplianceEntry(ctx: AppContext, v: EntryInput, fd: FormData) {
  await assertLinks(ctx, v);
  const customValues = await readCustomValues(ctx.organization.id, fd);
  return prisma.$transaction(async (tx) => {
    const e = await tx.complianceEntry.create({ data: { ...entryData(v), organizationId: ctx.organization.id, customValues, createdById: ctx.user.id } });
    await audit(tx, ctx, "compliance.created", "compliance_entry", e.id);
    return e;
  });
}

export async function updateComplianceEntry(ctx: AppContext, id: string, v: EntryInput, fd: FormData) {
  const existing = await prisma.complianceEntry.findFirst({ where: { id, organizationId: ctx.organization.id }, select: { id: true, dueDate: true } });
  if (!existing) throw new BusinessRuleError("This row was not found.");
  await assertLinks(ctx, v);
  const customValues = await readCustomValues(ctx.organization.id, fd);
  const data = entryData(v);
  const dueChanged = data.dueDate.getTime() !== existing.dueDate.getTime();
  await prisma.$transaction(async (tx) => {
    // A new due date earns new reminders.
    await tx.complianceEntry.update({ where: { id }, data: { ...data, customValues, ...(dueChanged ? { reminderSentAt: null, escalatedAt: null } : {}) } });
    await audit(tx, ctx, "compliance.updated", "compliance_entry", id);
  });
}

/**
 * Mark a filing done (the person responsible, or a lead). A recurring filing gets its
 * next row automatically, so nobody has to remember to add next month's return.
 */
export async function completeComplianceEntry(ctx: AppContext, id: string) {
  const e = await prisma.complianceEntry.findFirst({ where: { AND: [complianceScope(ctx), { id }] } });
  if (!e) throw new BusinessRuleError("This row was not found.");
  if (e.actionTaken) throw new BusinessRuleError("This is already marked as done.");
  const today = todayDateOnly(ctx.organization.timezone);
  const next = nextDueDate(e.dueDate, e.frequency);
  return prisma.$transaction(async (tx) => {
    await tx.complianceEntry.update({ where: { id }, data: { actionTaken: true, actionTakenOn: today } });
    let nextDue: Date | null = null;
    if (next) {
      // The next period's row, unless someone already added it.
      const exists = await tx.complianceEntry.findFirst({ where: { organizationId: e.organizationId, clientId: e.clientId, department: e.department, complianceItemId: e.complianceItemId, complianceType: e.complianceType, dueDate: next }, select: { id: true } });
      if (!exists) {
        await tx.complianceEntry.create({
          data: {
            organizationId: e.organizationId, clientId: e.clientId, department: e.department, complianceItemId: e.complianceItemId, complianceType: e.complianceType,
            issuingAuthority: e.issuingAuthority, registrationNumber: e.registrationNumber, dueDate: next, frequency: e.frequency,
            responsibleEmployeeId: e.responsibleEmployeeId, reminderLeadDays: e.reminderLeadDays, customValues: e.customValues as Prisma.InputJsonValue, createdById: ctx.user.id,
          },
        });
        nextDue = next;
      }
    }
    await audit(tx, ctx, "compliance.completed", "compliance_entry", id);
    return { nextDue };
  });
}

export const complianceColumnSchema = z.object({ label: z.string({ error: "Name the column" }).trim().min(2, "Name the column").max(60) });

export async function addComplianceColumn(ctx: AppContext, label: string) {
  const count = await prisma.complianceColumn.count({ where: { organizationId: ctx.organization.id } });
  if (count >= 12) throw new BusinessRuleError("A tracker can have at most 12 extra columns.");
  await prisma.$transaction(async (tx) => {
    const c = await tx.complianceColumn.create({ data: { organizationId: ctx.organization.id, label, sortOrder: count + 1 } });
    await audit(tx, ctx, "compliance.column_added", "compliance_column", c.id, { label });
  });
}

/** Removing a column hides its values; rows keep them should the column come back under the same id. */
export async function removeComplianceColumn(ctx: AppContext, id: string) {
  const c = await prisma.complianceColumn.findFirst({ where: { id, organizationId: ctx.organization.id } });
  if (!c) throw new BusinessRuleError("This column was not found.");
  await prisma.$transaction(async (tx) => {
    await tx.complianceColumn.delete({ where: { id } });
    await audit(tx, ctx, "compliance.column_removed", "compliance_column", id, { label: c.label });
  });
}

/** The firm's own Yes/No for "Applies to the firm itself?" on a compliance. */
export async function setAppliesToFirm(ctx: AppContext, complianceItemId: string, appliesToFirm: boolean) {
  await prisma.organizationComplianceSetting.upsert({
    where: { organizationId_complianceItemId: { organizationId: ctx.organization.id, complianceItemId } },
    update: { appliesToFirm },
    create: { organizationId: ctx.organization.id, complianceItemId, appliesToFirm },
  });
}

/** "Remark (If Date Extend)": the extended due date the department notified, in the firm's words. */
export async function setExtendedDateRemark(ctx: AppContext, complianceItemId: string, remark: string | undefined) {
  if (!(await prisma.complianceItem.findUnique({ where: { id: complianceItemId }, select: { id: true } }))) throw new BusinessRuleError("Select a valid compliance.");
  await prisma.$transaction(async (tx) => {
    await tx.organizationComplianceSetting.upsert({
      where: { organizationId_complianceItemId: { organizationId: ctx.organization.id, complianceItemId } },
      update: { extendedDateRemark: remark ?? null },
      create: { organizationId: ctx.organization.id, complianceItemId, extendedDateRemark: remark ?? null },
    });
    await audit(tx, ctx, "compliance.date_extended", "compliance_item", complianceItemId, { remark: remark ?? null });
  });
}

/**
 * One-time reminder when a row comes within its lead days, and one-time escalation to the
 * owner and administrators when it is within 7 days and not done (the workbook's
 * "ESCALATE TO SUNIL"). Runs on page load, like task reminders; claims via a timestamp
 * so concurrent page loads never notify twice.
 */
export async function deliverComplianceNotices(organizationId: string) {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { timezone: true } });
  if (!org) return;
  const today = todayDateOnly(org.timezone);
  const horizon = addDays(today, 370);
  const open = await prisma.complianceEntry.findMany({
    where: { organizationId, actionTaken: false, dueDate: { lte: horizon }, OR: [{ reminderSentAt: null }, { escalatedAt: null }] },
    take: 100,
    include: { client: { select: { tradeName: true } } },
  });
  for (const e of open) {
    const days = daysRemaining(e.dueDate, today);
    const who = e.client?.tradeName ?? "the firm";
    const when = days < 0 ? `overdue by ${-days} ${days === -1 ? "day" : "days"}` : days === 0 ? "due today" : `due in ${days} ${days === 1 ? "day" : "days"}`;
    if (!e.reminderSentAt && days <= e.reminderLeadDays) {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.complianceEntry.updateMany({ where: { id: e.id, reminderSentAt: null }, data: { reminderSentAt: new Date() } });
        if (claimed.count !== 1 || !e.responsibleEmployeeId) return;
        await notifyEmployees(tx, organizationId, [e.responsibleEmployeeId], { type: "compliance.reminder", title: `${e.complianceType} for ${who}: ${when}`, link: `/app/compliances?tab=tracker&dept=${encodeURIComponent(e.department)}` });
      });
    }
    if (!e.escalatedAt && days <= ESCALATION_DAYS && complianceStatus(e, today) !== "COMPLETED") {
      await prisma.$transaction(async (tx) => {
        const claimed = await tx.complianceEntry.updateMany({ where: { id: e.id, escalatedAt: null }, data: { escalatedAt: new Date() } });
        if (claimed.count !== 1) return;
        await notifyRoles(tx, organizationId, ["OWNER", "ADMIN"], { type: "compliance.escalated", title: `Escalated: ${e.complianceType} for ${who}, ${when}`, link: `/app/compliances?tab=tracker&dept=${encodeURIComponent(e.department)}` });
      });
    }
  }
}
