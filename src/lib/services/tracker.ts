import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zIsoDate, zOptionalText } from "@/lib/actions";
import { dateOnly } from "@/lib/dates";
import { NO_EMPLOYEE } from "@/lib/ids";
import {
  BRANCHES, CHECKER_STATUSES, ISSUE_LEVELS, ISSUE_STATUSES, PENDING_STATUSES, PRIORITIES, STATUSES_OF_WORK, needsBankName, refPrefix,
} from "@/lib/domain/tracker";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { notifyEmployees } from "./notifications";

// Accounting Workflow Tracker: lines defined by the managers (Admin, Manager, Senior), linked
// to the Team Daily Work Log by Tracker Ref No. A line given a Maker shows up in that person's
// timesheet; what they log updates the line; work logged without a Ref No. arrives as a new line.

type Tx = Prisma.TransactionClient;

const opt = <T extends readonly [string, ...string[]]>(values: T) => z.enum(values).optional();

/** Issue and the two pending points: the same columns in the log and the tracker. */
export const pendingAndIssueFields = {
  issueLevel: opt(ISSUE_LEVELS),
  issueDetails: zOptionalText(2000),
  issueStatus: opt(ISSUE_STATUSES),
  clientPendingItem: zOptionalText(2000),
  clientRaisedOn: zIsoDate.optional(),
  clientDueBy: zIsoDate.optional(),
  clientPendingStatus: opt(PENDING_STATUSES),
  teamPendingItem: zOptionalText(2000),
  teamRaisedOn: zIsoDate.optional(),
  teamDueBy: zIsoDate.optional(),
  teamPendingStatus: opt(PENDING_STATUSES),
};
type PendingAndIssue = { [K in keyof typeof pendingAndIssueFields]?: string };

export function checkPendingDates(v: PendingAndIssue) {
  if (v.clientRaisedOn && v.clientDueBy && v.clientDueBy < v.clientRaisedOn) throw new BusinessRuleError("Due By – Client is before Raised On – Client.");
  if (v.teamRaisedOn && v.teamDueBy && v.teamDueBy < v.teamRaisedOn) throw new BusinessRuleError("Due By – Team is before Raised On – Team.");
  if ((v.clientRaisedOn || v.clientDueBy) && !v.clientPendingItem) throw new BusinessRuleError("Write the pending item for the client, or clear its dates.");
  if ((v.teamRaisedOn || v.teamDueBy) && !v.teamPendingItem) throw new BusinessRuleError("Write the pending item for the team, or clear its dates.");
}

const d = (x?: string) => (x ? dateOnly(x) : null);
export function pendingAndIssueData(v: PendingAndIssue) {
  return {
    issueLevel: v.issueLevel ?? null,
    issueDetails: v.issueDetails ?? null,
    // An issue that is written down is open until someone marks it resolved.
    issueStatus: v.issueStatus ?? (v.issueLevel || v.issueDetails ? "Open" : null),
    clientPendingItem: v.clientPendingItem ?? null,
    clientRaisedOn: d(v.clientRaisedOn),
    clientDueBy: d(v.clientDueBy),
    clientPendingStatus: v.clientPendingItem ? (v.clientPendingStatus ?? "Open") : null,
    teamPendingItem: v.teamPendingItem ?? null,
    teamRaisedOn: d(v.teamRaisedOn),
    teamDueBy: d(v.teamDueBy),
    teamPendingStatus: v.teamPendingItem ? (v.teamPendingStatus ?? "Open") : null,
  };
}

export const trackerLineSchema = z.object({
  refNo: z.string().trim().max(30).regex(/^[A-Za-z0-9][A-Za-z0-9/_-]*$/, "Use letters, numbers and dashes, e.g. RDK-001").optional(),
  clientId: z.uuid().optional(),
  clientNameText: zOptionalText(200),
  branch: opt(BRANCHES),
  typeOfWork: z.string({ error: "Choose the type of work" }).min(1, "Choose the type of work").max(200),
  bankName: zOptionalText(120),
  periodFrom: zIsoDate.optional(),
  periodTo: zIsoDate.optional(),
  statusOfWork: z.enum(STATUSES_OF_WORK).default("NOT_STARTED"),
  ...pendingAndIssueFields,
  getFrom: zOptionalText(200),
  dateReceived: zIsoDate.optional(),
  makerEmployeeId: z.uuid().optional(),
  checkerEmployeeId: z.uuid().optional(),
  checkerStatus: opt(CHECKER_STATUSES),
  workStartDate: zIsoDate.optional(),
  priority: opt(PRIORITIES),
  nextFollowUpOn: zIsoDate.optional(),
  remarks: zOptionalText(2000),
});
export type TrackerLineInput = z.infer<typeof trackerLineSchema>;

/** Next free Ref No. for a client: RDK-001, RDK-002 … */
export async function nextRefNo(tx: Tx, organizationId: string, clientName: string) {
  const prefix = refPrefix(clientName);
  const rows = await tx.trackerLine.findMany({ where: { organizationId, refNo: { startsWith: `${prefix}-` } }, select: { refNo: true } });
  const max = rows.reduce((m, r) => {
    const n = Number(r.refNo.slice(prefix.length + 1));
    return Number.isInteger(n) && n > m ? n : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

async function resolveLinks(ctx: AppContext, v: TrackerLineInput) {
  const organizationId = ctx.organization.id;
  const client = v.clientId ? await prisma.client.findFirst({ where: { id: v.clientId, organizationId }, select: { id: true, tradeName: true } }) : null;
  if (v.clientId && !client) throw new BusinessRuleError("Client not found.");
  const clientName = client?.tradeName ?? v.clientNameText;
  if (!clientName) throw new BusinessRuleError("Select a client or type the client name.");
  for (const id of [v.makerEmployeeId, v.checkerEmployeeId]) {
    if (id && !(await prisma.employee.findFirst({ where: { id, organizationId }, select: { id: true } }))) throw new BusinessRuleError("Select a valid team member.");
  }
  if (v.periodFrom && v.periodTo && v.periodTo < v.periodFrom) throw new BusinessRuleError("Period To is before Period From.");
  if (needsBankName(v.typeOfWork) && !v.bankName) throw new BusinessRuleError("Bank Name is required for bank and card work.");
  checkPendingDates(v);
  return { clientId: client?.id ?? null, clientName };
}

function lineData(v: TrackerLineInput, links: { clientId: string | null; clientName: string }) {
  return {
    ...links,
    branch: v.branch ?? null,
    typeOfWork: v.typeOfWork,
    bankName: v.bankName ?? null,
    periodFrom: d(v.periodFrom),
    periodTo: d(v.periodTo),
    statusOfWork: v.statusOfWork,
    ...pendingAndIssueData(v),
    getFrom: v.getFrom ?? null,
    // Date Received is when the client's data came in: entering it clears the client item.
    dateReceived: d(v.dateReceived),
    ...(v.dateReceived && v.clientPendingItem && !v.clientPendingStatus ? { clientPendingStatus: "Cleared" } : {}),
    makerEmployeeId: v.makerEmployeeId ?? null,
    checkerEmployeeId: v.checkerEmployeeId ?? null,
    checkerStatus: v.checkerStatus ?? null,
    workStartDate: d(v.workStartDate),
    priority: v.priority ?? null,
    nextFollowUpOn: d(v.nextFollowUpOn),
    remarks: v.remarks ?? null,
  };
}

const assignNotice = (refNo: string, clientName: string, typeOfWork: string) => ({
  type: "tracker.assigned",
  title: `New work for you: ${refNo} · ${clientName}`,
  body: typeOfWork,
  link: "/app/timesheet",
});

export async function createTrackerLine(ctx: AppContext, v: TrackerLineInput) {
  const organizationId = ctx.organization.id;
  const links = await resolveLinks(ctx, v);
  return prisma.$transaction(async (tx) => {
    const refNo = v.refNo?.toUpperCase() ?? (await nextRefNo(tx, organizationId, links.clientName));
    if (await tx.trackerLine.findFirst({ where: { organizationId, refNo }, select: { id: true } })) throw new BusinessRuleError(`Ref No. ${refNo} is already used. Leave it blank for the next free number.`);
    const line = await tx.trackerLine.create({
      data: { ...lineData(v, links), organizationId, refNo, source: "MANAGER", reviewedAt: new Date(), createdById: ctx.user.id },
    });
    await audit(tx, ctx, "tracker.created", "tracker_line", line.id, { refNo });
    const people = [line.makerEmployeeId, line.checkerEmployeeId].filter((x): x is string => !!x && x !== ctx.employee?.id);
    if (people.length) await notifyEmployees(tx, organizationId, [...new Set(people)], assignNotice(refNo, line.clientName, line.typeOfWork));
    return line;
  });
}

export async function updateTrackerLine(ctx: AppContext, id: string, v: TrackerLineInput) {
  const organizationId = ctx.organization.id;
  const existing = await prisma.trackerLine.findFirst({ where: { id, organizationId } });
  if (!existing) throw new BusinessRuleError("This tracker line was not found.");
  const links = await resolveLinks(ctx, v);
  const refNo = v.refNo?.toUpperCase() ?? existing.refNo;
  if (refNo !== existing.refNo && (await prisma.trackerLine.findFirst({ where: { organizationId, refNo }, select: { id: true } }))) {
    throw new BusinessRuleError(`Ref No. ${refNo} is already used.`);
  }
  await prisma.$transaction(async (tx) => {
    const data = lineData(v, links);
    await tx.trackerLine.update({ where: { id }, data: { ...data, refNo, reviewedAt: existing.reviewedAt ?? new Date() } });
    await audit(tx, ctx, "tracker.updated", "tracker_line", id, { refNo });
    if (data.makerEmployeeId && data.makerEmployeeId !== existing.makerEmployeeId && data.makerEmployeeId !== ctx.employee?.id) {
      await notifyEmployees(tx, organizationId, [data.makerEmployeeId], assignNotice(refNo, data.clientName, data.typeOfWork));
    }
  });
}

/** A senior has looked at a line that came in from a daily log. */
export async function markTrackerLineReviewed(ctx: AppContext, id: string) {
  const res = await prisma.trackerLine.updateMany({ where: { id, organizationId: ctx.organization.id, reviewedAt: null }, data: { reviewedAt: new Date() } });
  if (res.count === 1) await prisma.$transaction((tx) => audit(tx, ctx, "tracker.reviewed", "tracker_line", id));
}

/** Open lines a team member works on (as Maker or Checker): they appear in their timesheet. */
export function myOpenLines(ctx: AppContext) {
  const me = ctx.employee?.id ?? NO_EMPLOYEE;
  return prisma.trackerLine.findMany({
    where: { organizationId: ctx.organization.id, AND: [{ OR: [{ makerEmployeeId: me }, { checkerEmployeeId: me }] }, { OR: [{ checkerStatus: null }, { checkerStatus: { not: "Approved" } }] }] },
    orderBy: [{ priority: "asc" }, { refNo: "asc" }],
    take: 200,
  });
}

export type LoggedWork = {
  employeeId: string;
  workDate: Date;
  clientId: string | null;
  clientNameText: string | null;
  branch: string | null;
  typeOfWork: string | null;
  bankName: string | null;
  periodFrom: Date | null;
  periodTo: Date | null;
  workStatus: string | null;
} & ReturnType<typeof pendingAndIssueData>;

/** Adds a pending point to a cell unless it is already there. */
const addPoint = (cell: string, point: string) => (cell.toLowerCase().includes(point.trim().toLowerCase()) ? cell : `${cell}
${point.trim()}`).slice(0, 4000);

const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : (a ?? null) === (b ?? null));

/**
 * Log → Tracker, inside the entry's transaction. The line is the one picked by Ref No.; or
 * the fallback key (Client + Branch + Type of Work + Bank + Period); or a new line from the log.
 * Returns the line id the entry belongs to.
 */
export async function syncTrackerFromLog(tx: Tx, organizationId: string, w: LoggedWork, trackerLineId?: string | null) {
  const clientName = w.clientNameText ?? "";
  if (!clientName || !w.typeOfWork) return null;
  let line = trackerLineId ? await tx.trackerLine.findFirst({ where: { id: trackerLineId, organizationId } }) : null;
  if (!line) {
    const candidates = await tx.trackerLine.findMany({
      where: { organizationId, clientName: { equals: clientName, mode: "insensitive" }, typeOfWork: w.typeOfWork },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    line = candidates.find((l) => same(l.branch, w.branch) && same((l.bankName ?? "").toLowerCase(), (w.bankName ?? "").toLowerCase()) && same(l.periodFrom, w.periodFrom) && same(l.periodTo, w.periodTo)) ?? null;
  }
  const status = w.workStatus === "PENDING" ? "IN_PROGRESS" : w.workStatus;
  if (!line) {
    const refNo = await nextRefNo(tx, organizationId, clientName);
    const created = await tx.trackerLine.create({
      data: {
        organizationId, refNo, clientId: w.clientId, clientName, branch: w.branch, typeOfWork: w.typeOfWork, bankName: w.bankName,
        periodFrom: w.periodFrom, periodTo: w.periodTo, statusOfWork: (status as never) ?? "IN_PROGRESS",
        issueLevel: w.issueLevel, issueDetails: w.issueDetails, issueStatus: w.issueStatus,
        clientPendingItem: w.clientPendingItem, clientRaisedOn: w.clientRaisedOn, clientDueBy: w.clientDueBy, clientPendingStatus: w.clientPendingStatus,
        teamPendingItem: w.teamPendingItem, teamRaisedOn: w.teamRaisedOn, teamDueBy: w.teamDueBy, teamPendingStatus: w.teamPendingStatus,
        makerEmployeeId: w.employeeId, workStartDate: w.workDate, source: "LOG", reviewedAt: null,
      },
    });
    return created.id;
  }
  const data: Prisma.TrackerLineUpdateInput = {};
  // The latest Status of Work for the Ref No. updates the tracker.
  if (status) data.statusOfWork = status as never;
  if (!line.workStartDate) data.workStartDate = w.workDate;
  if (!line.makerEmployeeId) data.maker = { connect: { id: w.employeeId } };
  if (w.clientPendingItem) {
    if (!line.clientPendingItem || line.clientPendingStatus === "Cleared") {
      Object.assign(data, { clientPendingItem: w.clientPendingItem, clientRaisedOn: w.clientRaisedOn, clientDueBy: w.clientDueBy, clientPendingStatus: w.clientPendingStatus, dateReceived: null });
    } else {
      // Several pending points can sit in one cell: a new point is added below the open ones.
      const merged = addPoint(line.clientPendingItem, w.clientPendingItem);
      if (merged !== line.clientPendingItem) Object.assign(data, { clientPendingItem: merged, clientPendingStatus: "Open" });
      else if (w.clientPendingStatus) data.clientPendingStatus = w.clientPendingStatus;
    }
    // Status – Client = Cleared in the log marks the item received.
    if (w.clientPendingStatus === "Cleared" && !line.dateReceived) data.dateReceived = w.workDate;
  }
  if (w.teamPendingItem) {
    if (!line.teamPendingItem || line.teamPendingStatus === "Cleared") {
      Object.assign(data, { teamPendingItem: w.teamPendingItem, teamRaisedOn: w.teamRaisedOn, teamDueBy: w.teamDueBy, teamPendingStatus: w.teamPendingStatus });
    } else {
      const merged = addPoint(line.teamPendingItem, w.teamPendingItem);
      if (merged !== line.teamPendingItem) Object.assign(data, { teamPendingItem: merged, teamPendingStatus: "Open" });
      else if (w.teamPendingStatus) data.teamPendingStatus = w.teamPendingStatus;
    }
  }
  // Issue Level / Details / Status entered in the log show on the tracker's dashboard.
  if (w.issueLevel || w.issueDetails) Object.assign(data, { issueLevel: w.issueLevel ?? line.issueLevel, issueDetails: w.issueDetails ?? line.issueDetails, issueStatus: w.issueStatus ?? "Open" });
  else if (w.issueStatus && line.issueStatus) data.issueStatus = w.issueStatus;
  if (Object.keys(data).length) await tx.trackerLine.update({ where: { id: line.id }, data });
  return line.id;
}

export type PendingPoint = { key: string; clientName: string; refNo: string | null; workDate: Date | null; item: string; raisedOn: Date | null; dueBy: Date | null; status: string };

/**
 * A team member's open pending points, as the Pending Tracker sheet lists them: from their own
 * log (the latest entry for each point wins, so re-logging a point does not repeat it), plus
 * pending lines of the tracker they are Maker on. Cleared items drop out.
 */
export async function pendingPointsFor(organizationId: string, employeeId: string) {
  const [entries, lines] = await Promise.all([
    prisma.timesheetEntry.findMany({
      where: { organizationId, employeeId, OR: [{ clientPendingItem: { not: null } }, { teamPendingItem: { not: null } }] },
      orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
      take: 3000,
      select: {
        workDate: true, clientNameText: true, trackerLineId: true, trackerLine: { select: { refNo: true } },
        clientPendingItem: true, clientRaisedOn: true, clientDueBy: true, clientPendingStatus: true,
        teamPendingItem: true, teamRaisedOn: true, teamDueBy: true, teamPendingStatus: true,
      },
    }),
    prisma.trackerLine.findMany({
      where: { organizationId, makerEmployeeId: employeeId, reviewedAt: { not: null }, OR: [{ clientPendingItem: { not: null } }, { teamPendingItem: { not: null } }] },
      take: 1000,
    }),
  ]);
  const seen = new Set<string>();
  // Lines whose points this person already logged: their own log is the source for those.
  const logged = new Set<string>();
  const out = { client: [] as PendingPoint[], team: [] as PendingPoint[] };
  const add = (side: "client" | "team", owner: string, p: Omit<PendingPoint, "key">) => {
    const key = `${side}|${owner}|${p.item.trim().toLowerCase()}`;
    if (seen.has(key) || (p.workDate === null && logged.has(`${side}|${owner}`))) return;
    if (p.workDate !== null) logged.add(`${side}|${owner}`);
    seen.add(key);
    if (p.status !== "Cleared") out[side].push({ ...p, key });
  };
  for (const e of entries) {
    const owner = e.trackerLineId ?? (e.clientNameText ?? "").toLowerCase();
    const base = { clientName: e.clientNameText ?? "—", refNo: e.trackerLine?.refNo ?? null, workDate: e.workDate };
    if (e.clientPendingItem) add("client", owner, { ...base, item: e.clientPendingItem, raisedOn: e.clientRaisedOn, dueBy: e.clientDueBy, status: e.clientPendingStatus ?? "Open" });
    if (e.teamPendingItem) add("team", owner, { ...base, item: e.teamPendingItem, raisedOn: e.teamRaisedOn, dueBy: e.teamDueBy, status: e.teamPendingStatus ?? "Open" });
  }
  // Tracker → Log: pending lines the senior reviewed appear for the team.
  for (const l of lines) {
    const base = { clientName: l.clientName, refNo: l.refNo, workDate: null };
    if (l.clientPendingItem) add("client", l.id, { ...base, item: l.clientPendingItem, raisedOn: l.clientRaisedOn, dueBy: l.clientDueBy, status: l.clientPendingStatus ?? "Open" });
    if (l.teamPendingItem) add("team", l.id, { ...base, item: l.teamPendingItem, raisedOn: l.teamRaisedOn, dueBy: l.teamDueBy, status: l.teamPendingStatus ?? "Open" });
  }
  const byDue = (a: PendingPoint, b: PendingPoint) => (a.dueBy?.getTime() ?? Infinity) - (b.dueBy?.getTime() ?? Infinity) || a.clientName.localeCompare(b.clientName);
  out.client.sort(byDue);
  out.team.sort(byDue);
  return out;
}
