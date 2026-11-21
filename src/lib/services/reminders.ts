import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zIsoDate, zOptionalText } from "@/lib/actions";
import { addDays, dateOnly, formatDate, todayDateOnly, toIsoDate } from "@/lib/dates";
import { daysRemaining } from "@/lib/domain/compliance";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { clientScope } from "./clients";
import { complianceScope } from "./compliance";
import { notifyEmployees } from "./notifications";

// Reminders (tracker S.No. 86 and 87, 21 Nov 2026):
//   Due dates — compliance filings not yet done and notices not yet replied to, by due date
//               (overdue first), for the next 7 / 15 / 30 / 60 days.
//   Pending compliance — client-wise: what is not filed yet, overdue and due soon.
// Compliance rows come from the compliance tracker; notices are recorded here.

export const NOTICE_DEPARTMENTS = ["GST", "Income Tax", "TDS", "ROC", "EPF / ESI", "Other"] as const;
export const WINDOWS = [7, 15, 30, 60] as const;

export type ReminderFilters = { tab: "due" | "pending" | "notices"; days: number; dept: string; q: string; status: string };
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function parseReminderFilters(sp: Record<string, unknown>): ReminderFilters {
  const days = Number(str(sp.days));
  const tab = str(sp.tab);
  return {
    tab: tab === "pending" || tab === "notices" ? tab : "due",
    days: (WINDOWS as readonly number[]).includes(days) ? days : 15,
    dept: str(sp.dept).slice(0, 40),
    q: str(sp.q).slice(0, 80),
    status: ["OPEN", "REPLIED", "CLOSED", "all"].includes(str(sp.status)) ? str(sp.status) : "OPEN",
  };
}

export function reminderQuery(f: ReminderFilters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams({ tab: f.tab, ...(f.days !== 15 && { days: String(f.days) }), ...(f.dept && { dept: f.dept }), ...(f.q && { q: f.q }), ...(f.status !== "OPEN" && { status: f.status }), ...extra });
  return `?${p}`;
}

/** Notices the caller may see: leads all; others the ones they handle or for their clients. */
function noticeScope(ctx: AppContext): Prisma.ClientNoticeWhereInput {
  if (can(ctx, "compliance.manage")) return { organizationId: ctx.organization.id };
  return { organizationId: ctx.organization.id, OR: [{ responsibleEmployeeId: ctx.employee?.id ?? "00000000-0000-0000-0000-000000000000" }, { client: clientScope(ctx) }] };
}

const person = (e: { firstName: string; lastName: string | null } | null) => (e ? `${e.firstName} ${e.lastName ?? ""}`.trim() : "—");
const clientText = (q: string): Prisma.ClientWhereInput => ({ OR: [{ tradeName: { contains: q, mode: "insensitive" } }, { clientCode: { contains: q, mode: "insensitive" } }] });

export type DueRow = { kind: "Compliance" | "Notice reply"; id: string; due: Date; daysLeft: number; client: string; clientId: string | null; item: string; department: string; responsible: string; href: string };

/** Due-date report: compliance not done and open notices, overdue first, then within `days`. */
export async function dueDateReport(ctx: AppContext, f: ReminderFilters) {
  const today = todayDateOnly(ctx.organization.timezone);
  const until = addDays(today, f.days);
  const [entries, notices] = await Promise.all([
    prisma.complianceEntry.findMany({
      where: { AND: [complianceScope(ctx), { actionTaken: false, dueDate: { lte: until } }, f.dept ? { department: f.dept } : {}, f.q ? { client: clientText(f.q) } : {}] },
      orderBy: { dueDate: "asc" },
      take: 2000,
      select: { id: true, dueDate: true, complianceType: true, department: true, clientId: true, client: { select: { tradeName: true } }, responsible: { select: { firstName: true, lastName: true } } },
    }),
    prisma.clientNotice.findMany({
      where: { AND: [noticeScope(ctx), { status: "OPEN", replyDueDate: { lte: until } }, f.dept ? { department: f.dept } : {}, f.q ? { client: clientText(f.q) } : {}] },
      orderBy: { replyDueDate: "asc" },
      take: 1000,
      select: { id: true, replyDueDate: true, department: true, section: true, reference: true, clientId: true, client: { select: { tradeName: true } }, responsible: { select: { firstName: true, lastName: true } } },
    }),
  ]);
  const rows: DueRow[] = [
    ...entries.map((e) => ({ kind: "Compliance" as const, id: e.id, due: e.dueDate, daysLeft: daysRemaining(e.dueDate, today), client: e.client?.tradeName ?? "Firm (own)", clientId: e.clientId, item: e.complianceType, department: e.department, responsible: person(e.responsible), href: `/app/compliances?dept=${encodeURIComponent(e.department)}` })),
    ...notices.map((n) => ({ kind: "Notice reply" as const, id: n.id, due: n.replyDueDate, daysLeft: daysRemaining(n.replyDueDate, today), client: n.client.tradeName, clientId: n.clientId, item: `Reply to notice${n.section ? ` ${n.section}` : ""}${n.reference ? ` (${n.reference})` : ""}`, department: n.department, responsible: person(n.responsible), href: "/app/reminders?tab=notices" })),
  ].sort((a, b) => a.due.getTime() - b.due.getTime());
  return { rows, overdue: rows.filter((r) => r.daysLeft < 0).length, dueToday: rows.filter((r) => r.daysLeft === 0).length, upcoming: rows.filter((r) => r.daysLeft > 0).length };
}

/** Pending compliance report: per client, filings not done — overdue and due within `days`. */
export async function pendingComplianceReport(ctx: AppContext, f: ReminderFilters) {
  const today = todayDateOnly(ctx.organization.timezone);
  const until = addDays(today, f.days);
  const entries = await prisma.complianceEntry.findMany({
    where: { AND: [complianceScope(ctx), { actionTaken: false, dueDate: { lte: until } }, f.dept ? { department: f.dept } : {}, f.q ? { client: clientText(f.q) } : {}] },
    orderBy: { dueDate: "asc" },
    take: 5000,
    select: { id: true, dueDate: true, complianceType: true, department: true, clientId: true, client: { select: { tradeName: true, clientCode: true } }, responsible: { select: { firstName: true, lastName: true } } },
  });
  const groups = new Map<string, { client: string; code: string; clientId: string | null; overdue: number; dueSoon: number; items: { type: string; department: string; due: Date; daysLeft: number; responsible: string }[] }>();
  for (const e of entries) {
    const key = e.clientId ?? "firm";
    const g = groups.get(key) ?? { client: e.client?.tradeName ?? "Firm (own)", code: e.client?.clientCode ?? "", clientId: e.clientId, overdue: 0, dueSoon: 0, items: [] };
    const d = daysRemaining(e.dueDate, today);
    if (d < 0) g.overdue++; else g.dueSoon++;
    g.items.push({ type: e.complianceType, department: e.department, due: e.dueDate, daysLeft: d, responsible: person(e.responsible) });
    groups.set(key, g);
  }
  const clients = [...groups.values()].sort((a, b) => b.overdue - a.overdue || b.items.length - a.items.length || a.client.localeCompare(b.client));
  return { clients, totalOverdue: entries.filter((e) => e.dueDate < today).length, total: entries.length };
}

export async function noticeList(ctx: AppContext, f: ReminderFilters) {
  return prisma.clientNotice.findMany({
    where: { AND: [noticeScope(ctx), f.status === "all" ? {} : { status: f.status }, f.dept ? { department: f.dept } : {}, f.q ? { client: clientText(f.q) } : {}] },
    orderBy: [{ status: "asc" }, { replyDueDate: "asc" }],
    take: 500,
    include: { client: { select: { id: true, tradeName: true } }, responsible: { select: { firstName: true, lastName: true } } },
  });
}

export const noticeSchema = z.object({
  clientId: z.uuid("Select the client"),
  department: z.enum(NOTICE_DEPARTMENTS),
  section: zOptionalText(120),
  reference: zOptionalText(120),
  receivedOn: zIsoDate.optional(),
  replyDueDate: zIsoDate,
  responsibleEmployeeId: z.uuid().optional(),
  remarks: zOptionalText(1000),
});

export async function addNotice(ctx: AppContext, v: z.infer<typeof noticeSchema>) {
  if (!can(ctx, "compliance.manage")) throw new BusinessRuleError("Only team leads and administrators record notices.");
  const client = await prisma.client.findFirst({ where: { id: v.clientId, organizationId: ctx.organization.id }, select: { id: true, tradeName: true } });
  if (!client) throw new BusinessRuleError("Client not found.");
  if (v.receivedOn && v.receivedOn > v.replyDueDate) throw new BusinessRuleError("The reply due date is before the date received.");
  if (v.responsibleEmployeeId && !(await prisma.employee.findFirst({ where: { id: v.responsibleEmployeeId, organizationId: ctx.organization.id }, select: { id: true } }))) throw new BusinessRuleError("Team member not found.");
  await prisma.$transaction(async (tx) => {
    const n = await tx.clientNotice.create({
      data: {
        organizationId: ctx.organization.id, clientId: client.id, department: v.department, section: v.section, reference: v.reference,
        receivedOn: v.receivedOn ? dateOnly(v.receivedOn) : null, replyDueDate: dateOnly(v.replyDueDate), responsibleEmployeeId: v.responsibleEmployeeId, remarks: v.remarks, createdById: ctx.user.id,
      },
    });
    await audit(tx, ctx, "notice.recorded", "client", client.id, { noticeId: n.id });
    if (v.responsibleEmployeeId) {
      await notifyEmployees(tx, ctx.organization.id, [v.responsibleEmployeeId], {
        type: "notice.assigned",
        title: `${v.department} notice for ${client.tradeName}: reply due ${formatDate(dateOnly(v.replyDueDate))}`,
        body: [v.section, v.reference].filter(Boolean).join(" · ") || undefined,
        link: "/app/reminders?tab=notices",
      });
    }
  });
}

/** Mark a notice replied (the person handling it, or a lead) or closed / reopened (a lead). */
export async function setNoticeStatus(ctx: AppContext, id: string, status: "OPEN" | "REPLIED" | "CLOSED") {
  const n = await prisma.clientNotice.findFirst({ where: { AND: [noticeScope(ctx), { id }] } });
  if (!n) throw new BusinessRuleError("Notice not found.");
  const mine = n.responsibleEmployeeId === ctx.employee?.id;
  if (!can(ctx, "compliance.manage") && !(mine && status === "REPLIED")) throw new BusinessRuleError("You can only mark your own notices as replied.");
  const today = toIsoDate(todayDateOnly(ctx.organization.timezone));
  await prisma.$transaction(async (tx) => {
    await tx.clientNotice.update({ where: { id }, data: { status, repliedOn: status === "REPLIED" ? dateOnly(today) : status === "OPEN" ? null : n.repliedOn } });
    await audit(tx, ctx, `notice.${status.toLowerCase()}`, "client", n.clientId, { noticeId: id });
  });
}
