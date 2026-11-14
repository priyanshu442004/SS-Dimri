import "server-only";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError } from "@/lib/actions";
import { serverEnv } from "@/lib/env";
import { can, type Capability } from "@/lib/permissions";
import type { DeletionEntity, DeletionPreview } from "@/lib/deletion-types";
import type { AppContext } from "@/lib/session";
import { s3 } from "@/lib/storage/s3";
import { audit } from "./audit";

// Deleting is a right on its own (employees.delete, clients.delete, tasks.delete,
// records.delete): held by the owner and administrators, and grantable person by person.
// Each deletion runs in one transaction, removes what only makes sense with the record,
// unlinks what must survive, and leaves an audit entry. Stored files go last.

const TX = { timeout: 60_000, maxWait: 15_000 } as const;
type Tx = Prisma.TransactionClient;

const RIGHT: Record<DeletionEntity, Capability> = {
  client: "clients.delete",
  employee: "employees.delete",
  task: "tasks.delete",
  allocation: "records.delete",
  timesheet: "records.delete",
  attendance: "records.delete",
  leave: "records.delete",
  pending: "records.delete",
  observation: "records.delete",
  due: "records.delete",
  dayreport: "records.delete",
  compliance: "records.delete",
  trackerline: "records.delete",
};

export const canDelete = (ctx: AppContext, entity: DeletionEntity) => entity !== "attendance" && can(ctx, RIGHT[entity]);

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const nameOf = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();

/** Best effort: the rows are already gone, and an object left in private storage harms nothing. */
async function purgeFiles(fileIds: (string | null | undefined)[]) {
  const ids = [...new Set(fileIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  const files = await prisma.storedFile.findMany({ where: { id: { in: ids } }, select: { id: true, objectKey: true, bucket: true } });
  await prisma.storedFile.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
  await Promise.allSettled(files.map((f) => s3().send(new DeleteObjectCommand({ Bucket: f.bucket || serverEnv().AWS_BUCKET_NAME, Key: f.objectKey }))));
}

/** Removes a login; the user account too, unless it belongs to another firm as well. */
async function removeLogin(tx: Tx, membership: { id: string; userId: string }) {
  await tx.organizationMembership.delete({ where: { id: membership.id } });
  const others = await tx.organizationMembership.count({ where: { userId: membership.userId } });
  if (others === 0) await tx.user.delete({ where: { id: membership.userId } });
  else await tx.session.deleteMany({ where: { userId: membership.userId } });
}

async function taskFileIds(tx: Tx, where: Prisma.TaskWhereInput) {
  const rows = await tx.taskAttachment.findMany({ where: { task: where }, select: { fileId: true } });
  return rows.map((r) => r.fileId);
}

// ---------------------------------------------------------------- clients

async function previewClient(ctx: AppContext, id: string): Promise<DeletionPreview> {
  const organizationId = ctx.organization.id;
  const c = await prisma.client.findFirst({
    where: { id, organizationId },
    select: {
      tradeName: true,
      status: true,
      _count: { select: { tasks: true, teamAllocations: true, timesheetEntries: true, pendingItems: true, dues: true, reports: true, observations: true, documents: true, portalMemberships: true, complianceEntries: true } },
    },
  });
  if (!c) throw new BusinessRuleError("Client not found.");
  const n = c._count;
  const lines = [
    n.tasks && `${plural(n.tasks, "task")} with their remarks and attachments are deleted`,
    n.teamAllocations && `${plural(n.teamAllocations, "team allocation")} deleted`,
    n.pendingItems && `${plural(n.pendingItems, "pending item")} deleted`,
    n.dues && `${plural(n.dues, "fee / due entry", "fee / due entries")} deleted`,
    n.reports && `${plural(n.reports, "client report")} deleted`,
    n.observations && `${plural(n.observations, "observation")} deleted`,
    n.complianceEntries && `${plural(n.complianceEntries, "compliance row")} deleted`,
    n.documents && `${plural(n.documents, "document")} deleted`,
    n.portalMemberships && `${plural(n.portalMemberships, "client portal login")} removed`,
    n.timesheetEntries && `${plural(n.timesheetEntries, "timesheet entry", "timesheet entries")} stay on the team's records, with the client's name kept as text`,
  ].filter((x): x is string => !!x);
  const hasHistory = n.tasks + n.timesheetEntries + n.dues + n.reports > 0;
  return {
    title: `Delete client “${c.tradeName}”?`,
    lines: lines.length ? lines : ["This client has no linked work."],
    advice: hasHistory && c.status !== "INACTIVE" ? "To stop work but keep the history, use “Discontinue” on the client's page instead." : undefined,
    confirmText: c.tradeName,
  };
}

async function deleteClient(ctx: AppContext, id: string) {
  const organizationId = ctx.organization.id;
  const c = await prisma.client.findFirst({
    where: { id, organizationId },
    select: {
      id: true, tradeName: true, clientCode: true, profilePictureFileId: true, msmeCertificateFileId: true, esiCertificateFileId: true, pfCertificateFileId: true,
      documents: { select: { fileId: true } },
      constitutionMembers: { select: { profilePictureFileId: true } },
      reports: { select: { exportFileId: true } },
    },
  });
  if (!c) throw new BusinessRuleError("Client not found.");
  const files: (string | null | undefined)[] = [
    c.profilePictureFileId, c.msmeCertificateFileId, c.esiCertificateFileId, c.pfCertificateFileId,
    ...c.documents.map((d) => d.fileId), ...c.constitutionMembers.map((m) => m.profilePictureFileId), ...c.reports.map((r) => r.exportFileId),
  ];
  await prisma.$transaction(async (tx) => {
    for (const m of await tx.organizationMembership.findMany({ where: { clientId: id, organizationId }, select: { id: true, userId: true } })) {
      await removeLogin(tx, m);
    }
    files.push(...(await taskFileIds(tx, { clientId: id, organizationId })));
    await tx.task.deleteMany({ where: { clientId: id, organizationId } });
    await tx.teamAllocation.deleteMany({ where: { clientId: id, organizationId } });
    // Hours belong to the people who worked them: keep the entry, with the name as text.
    await tx.timesheetEntry.updateMany({ where: { clientId: id, clientNameText: null }, data: { clientNameText: c.tradeName } });
    await tx.timesheetEntry.updateMany({ where: { clientId: id }, data: { clientId: null } });
    await tx.pendingItem.deleteMany({ where: { clientId: id } });
    await tx.clientDue.deleteMany({ where: { clientId: id } });
    await tx.clientReport.deleteMany({ where: { clientId: id } });
    await tx.clientObservation.deleteMany({ where: { clientId: id } });
    await tx.client.delete({ where: { id } });
    await audit(tx, ctx, "client.deleted", "client", id, { name: c.tradeName, code: c.clientCode });
  }, TX);
  await purgeFiles(files);
  return c.tradeName;
}

// ---------------------------------------------------------------- staff

async function loadEmployee(ctx: AppContext, id: string) {
  const e = await prisma.employee.findFirst({
    where: { id, organizationId: ctx.organization.id },
    select: {
      id: true, firstName: true, lastName: true, permanentEmployeeCode: true,
      membership: { select: { id: true, userId: true, role: true } },
      _count: { select: { attendanceRecords: true, timesheetEntries: true, taskAssignments: true, makerTasks: true, checkerTasks: true, teamAllocations: true, leaveRequests: true, dayReports: true, salaryRecords: true, documents: true, letters: true, memos: true } },
    },
  });
  if (!e) throw new BusinessRuleError("Employee not found.");
  return e;
}

function employeeBlock(ctx: AppContext, e: Awaited<ReturnType<typeof loadEmployee>>) {
  if (e.id === ctx.employee?.id || e.membership?.userId === ctx.user.id) return "You cannot delete your own record.";
  if (e.membership?.role === "OWNER") return "The firm's owner cannot be deleted.";
  if (e.membership?.role === "ADMIN" && !can(ctx, "org.manage")) return "Only an administrator can delete another administrator.";
  return undefined;
}

async function previewEmployee(ctx: AppContext, id: string): Promise<DeletionPreview> {
  const e = await loadEmployee(ctx, id);
  const n = e._count;
  const lines = [
    e.membership && "Their login is removed and they are signed out at once",
    n.attendanceRecords && `${plural(n.attendanceRecords, "attendance record")} deleted`,
    n.timesheetEntries && `${plural(n.timesheetEntries, "timesheet entry", "timesheet entries")} deleted`,
    n.leaveRequests && `${plural(n.leaveRequests, "leave request")} deleted`,
    n.dayReports && `${plural(n.dayReports, "day report")} deleted`,
    n.teamAllocations && `${plural(n.teamAllocations, "team allocation")} deleted`,
    n.salaryRecords && `${plural(n.salaryRecords, "salary record")} deleted`,
    n.documents + n.letters + n.memos > 0 && `${plural(n.documents + n.letters + n.memos, "document, letter or memo", "documents, letters and memos")} deleted`,
    n.taskAssignments + n.makerTasks + n.checkerTasks > 0 && "They are taken off their tasks; the tasks themselves stay",
  ].filter((x): x is string => !!x);
  const hasHistory = n.attendanceRecords + n.timesheetEntries + n.salaryRecords > 0;
  return {
    title: `Delete ${nameOf(e)}?`,
    lines: lines.length ? lines : ["This person has no linked records."],
    advice: hasHistory ? "For someone who has left, set the employment status to “Exited” instead: attendance and payroll history is kept and the login can be disabled." : undefined,
    confirmText: nameOf(e),
    blocked: employeeBlock(ctx, e),
  };
}

async function deleteEmployee(ctx: AppContext, id: string) {
  const e = await loadEmployee(ctx, id);
  const blocked = employeeBlock(ctx, e);
  if (blocked) throw new BusinessRuleError(blocked);
  const files: (string | null | undefined)[] = [];
  await prisma.$transaction(async (tx) => {
    const own = await tx.employee.findUniqueOrThrow({
      where: { id },
      select: {
        profilePictureFileId: true, aadhaarDocumentFileId: true, panDocumentFileId: true,
        documents: { select: { fileId: true } },
        bankAccounts: { select: { bankBookFileId: true } },
        qualifications: { select: { certificateFileId: true } },
        previousEmployments: { select: { experienceCertificateFileId: true } },
        memos: { select: { fileId: true } },
        letters: { select: { fileId: true } },
        attendanceRecords: { select: { timeInPhotoFileId: true, timeOutPhotoFileId: true } },
      },
    });
    files.push(
      own.profilePictureFileId, own.aadhaarDocumentFileId, own.panDocumentFileId,
      ...own.documents.map((d) => d.fileId), ...own.bankAccounts.map((b) => b.bankBookFileId), ...own.qualifications.map((q) => q.certificateFileId),
      ...own.previousEmployments.map((p) => p.experienceCertificateFileId), ...own.memos.map((m) => m.fileId), ...own.letters.map((l) => l.fileId),
      ...own.attendanceRecords.flatMap((a) => [a.timeInPhotoFileId, a.timeOutPhotoFileId]),
    );
    if (e.membership) await removeLogin(tx, e.membership);
    // Tasks outlive the person; only their part in them is removed.
    await tx.task.updateMany({ where: { makerEmployeeId: id }, data: { makerEmployeeId: null } });
    await tx.task.updateMany({ where: { checkerEmployeeId: id }, data: { checkerEmployeeId: null } });
    await tx.taskAssignment.deleteMany({ where: { employeeId: id } });
    await tx.taskReview.deleteMany({ where: { reviewerEmployeeId: id } });
    await tx.teamAllocation.deleteMany({ where: { employeeId: id } });
    await tx.attendanceCorrection.deleteMany({ where: { attendanceRecord: { employeeId: id } } });
    await tx.attendanceRecord.deleteMany({ where: { employeeId: id } });
    await tx.leaveRequest.deleteMany({ where: { employeeId: id } });
    await tx.timesheetEntry.deleteMany({ where: { employeeId: id } });
    await tx.pendingItem.updateMany({ where: { pendingWithEmployeeId: id }, data: { pendingWithEmployeeId: null } });
    await tx.dayReportRecipient.deleteMany({ where: { recipientEmployeeId: id } });
    await tx.dayReport.deleteMany({ where: { reportingEmployeeId: id } });
    await tx.workCommitment.deleteMany({ where: { employeeId: id } });
    await tx.employee.delete({ where: { id } });
    await audit(tx, ctx, "employee.deleted", "employee", id, { name: nameOf(e), code: e.permanentEmployeeCode });
  }, TX);
  await purgeFiles(files);
  return nameOf(e);
}

// ---------------------------------------------------------------- tasks

async function previewTask(ctx: AppContext, id: string): Promise<DeletionPreview> {
  const t = await prisma.task.findFirst({
    where: { id, organizationId: ctx.organization.id },
    select: { title: true, _count: { select: { attachments: true, activities: true, reminders: true, timesheetEntries: true, pendingItems: true } } },
  });
  if (!t) throw new BusinessRuleError("Task not found.");
  const n = t._count;
  return {
    title: `Delete task “${t.title}”?`,
    lines: [
      n.attachments ? `${plural(n.attachments, "attachment or voice note", "attachments and voice notes")} deleted` : null,
      `Its history${n.reminders ? " and reminders" : ""} deleted`,
      n.timesheetEntries || n.pendingItems ? "Linked timesheet entries and pending items stay, without the link" : null,
    ].filter((x): x is string => !!x),
    advice: "If the work was simply dropped, “Cancel task” keeps it in the history.",
  };
}

async function deleteTask(ctx: AppContext, id: string) {
  const t = await prisma.task.findFirst({ where: { id, organizationId: ctx.organization.id }, select: { id: true, title: true } });
  if (!t) throw new BusinessRuleError("Task not found.");
  const files = await prisma.$transaction(async (tx) => {
    const ids = await taskFileIds(tx, { id });
    await tx.task.delete({ where: { id } });
    await audit(tx, ctx, "task.deleted", "task", id, { title: t.title });
    return ids;
  }, TX);
  await purgeFiles(files);
  return t.title;
}

// ---------------------------------------------------------------- simple entries

type Simple = { title: string; lines?: string[]; remove: (tx: Tx) => Promise<unknown>; files?: (string | null | undefined)[] };

async function simpleEntry(ctx: AppContext, entity: DeletionEntity, id: string): Promise<Simple> {
  const organizationId = ctx.organization.id;
  switch (entity) {
    case "allocation": {
      const a = await prisma.teamAllocation.findFirst({ where: { id, organizationId }, select: { client: { select: { tradeName: true } }, employee: { select: { firstName: true, lastName: true } } } });
      if (!a) break;
      return {
        title: `Delete ${nameOf(a.employee)}'s allocation to ${a.client.tradeName}?`,
        lines: ["Use this for an allocation made by mistake. “End allocation” keeps the history."],
        remove: (tx) => tx.teamAllocation.delete({ where: { id } }),
      };
    }
    case "timesheet": {
      const e = await prisma.timesheetEntry.findFirst({ where: { id, organizationId }, select: { clientNameText: true, employee: { select: { firstName: true, lastName: true } }, _count: { select: { pendingItems: true } } } });
      if (!e) break;
      return {
        title: `Delete ${nameOf(e.employee)}'s timesheet entry${e.clientNameText ? ` for ${e.clientNameText}` : ""}?`,
        lines: e._count.pendingItems ? ["Linked pending items stay, without the link."] : [],
        remove: (tx) => tx.timesheetEntry.delete({ where: { id } }),
      };
    }
    case "attendance":
      // Attendance is system-driven: nobody marks or changes it by hand (office rule 1), so a
      // single day cannot be deleted either. Removing a whole employee still removes their history.
      break;
    case "leave": {
      const l = await prisma.leaveRequest.findFirst({ where: { id, organizationId }, select: { employee: { select: { firstName: true, lastName: true } } } });
      if (!l) break;
      return { title: `Delete this leave request of ${nameOf(l.employee)}?`, remove: (tx) => tx.leaveRequest.delete({ where: { id } }) };
    }
    case "pending": {
      const p = await prisma.pendingItem.findFirst({ where: { id, organizationId }, select: { requestDescription: true } });
      if (!p) break;
      return { title: "Delete this pending item?", lines: [p.requestDescription.slice(0, 160), "Its follow-up history is deleted."], remove: (tx) => tx.pendingItem.delete({ where: { id } }) };
    }
    case "observation": {
      const o = await prisma.clientObservation.findFirst({ where: { id, organizationId }, select: { details: true } });
      if (!o) break;
      return { title: "Delete this client observation?", lines: [o.details.slice(0, 160), "Its follow-up history is deleted."], remove: (tx) => tx.clientObservation.delete({ where: { id } }) };
    }
    case "due": {
      const d = await prisma.clientDue.findFirst({ where: { id, organizationId }, select: { description: true } });
      if (!d) break;
      return { title: `Delete the due “${d.description}”?`, lines: ["Its follow-up history is deleted."], remove: (tx) => tx.clientDue.delete({ where: { id } }) };
    }
    case "dayreport": {
      const d = await prisma.dayReport.findFirst({ where: { id, organizationId }, select: { reportingEmployee: { select: { firstName: true, lastName: true } } } });
      if (!d) break;
      return { title: `Delete this day report of ${nameOf(d.reportingEmployee)}?`, remove: (tx) => tx.dayReport.delete({ where: { id } }) };
    }
    case "compliance": {
      const c = await prisma.complianceEntry.findFirst({ where: { id, organizationId }, select: { complianceType: true } });
      if (!c) break;
      return { title: `Delete “${c.complianceType}” from the tracker?`, remove: (tx) => tx.complianceEntry.delete({ where: { id } }) };
    }
    case "trackerline": {
      const l = await prisma.trackerLine.findFirst({ where: { id, organizationId }, select: { refNo: true, clientName: true, _count: { select: { entries: true } } } });
      if (!l) break;
      return {
        title: `Delete tracker line ${l.refNo} (${l.clientName})?`,
        lines: l._count.entries ? [`${l._count.entries} timesheet entries logged against it stay, without the Ref No.`] : [],
        remove: (tx) => tx.trackerLine.delete({ where: { id } }),
      };
    }
  }
  throw new BusinessRuleError("This record was not found. It may already have been deleted.");
}

// ---------------------------------------------------------------- entry points

export async function previewDeletion(ctx: AppContext, entity: DeletionEntity, id: string): Promise<DeletionPreview> {
  if (entity === "client") return previewClient(ctx, id);
  if (entity === "employee") return previewEmployee(ctx, id);
  if (entity === "task") return previewTask(ctx, id);
  const s = await simpleEntry(ctx, entity, id);
  return { title: s.title, lines: s.lines ?? [] };
}

export async function deleteRecord(ctx: AppContext, entity: DeletionEntity, id: string, typed: string): Promise<string> {
  if (entity === "client" || entity === "employee") {
    const expected = (await previewDeletion(ctx, entity, id)).confirmText ?? "";
    if (typed.trim().toLowerCase() !== expected.trim().toLowerCase()) throw new BusinessRuleError("The name you typed does not match.");
    return entity === "client" ? deleteClient(ctx, id) : deleteEmployee(ctx, id);
  }
  if (entity === "task") return deleteTask(ctx, id);
  const s = await simpleEntry(ctx, entity, id);
  await prisma.$transaction(async (tx) => {
    await s.remove(tx);
    await audit(tx, ctx, `${entity}.deleted`, entity, id, { title: s.title });
  }, TX);
  await purgeFiles(s.files ?? []);
  return s.title;
}
