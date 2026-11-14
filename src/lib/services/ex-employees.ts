import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zIsoDate, zOptionalText } from "@/lib/actions";
import { dateOnly, formatDate } from "@/lib/dates";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";

// Ex-Employee (tracker, 3 Nov 2026): a resigned or terminated person leaves every active list,
// cannot sign in, and their client allocations end on the last working day. Their record,
// attendance, payroll and letters stay as history, and they can be brought back.

export const EXIT_TYPES = { RESIGNED: "Resigned", TERMINATED: "Terminated", OTHER: "Other" } as const;

export const exitSchema = z.object({
  exitType: z.enum(Object.keys(EXIT_TYPES) as [keyof typeof EXIT_TYPES, ...(keyof typeof EXIT_TYPES)[]], "Choose why the person is leaving"),
  exitDate: zIsoDate,
  exitReason: zOptionalText(1000),
});

async function loadForExit(ctx: AppContext, employeeId: string) {
  const e = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId: ctx.organization.id },
    select: { id: true, firstName: true, lastName: true, employmentStatus: true, dateOfJoining: true, membership: { select: { id: true, role: true, userId: true } } },
  });
  if (!e) throw new BusinessRuleError("Employee not found.");
  if (e.membership?.role === "OWNER") throw new BusinessRuleError("The owner cannot be moved to Ex-Employee.");
  if (e.membership?.userId === ctx.user.id) throw new BusinessRuleError("You cannot move yourself to Ex-Employee. Ask another administrator.");
  return e;
}

export async function moveToExEmployee(ctx: AppContext, employeeId: string, v: z.infer<typeof exitSchema>) {
  const e = await loadForExit(ctx, employeeId);
  if (e.employmentStatus === "EXITED") throw new BusinessRuleError("This person is already an Ex-Employee.");
  const last = dateOnly(v.exitDate);
  if (e.dateOfJoining && last < e.dateOfJoining) throw new BusinessRuleError(`The last working day cannot be before the date of joining (${formatDate(e.dateOfJoining)}).`);
  const ended = await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: e.id }, data: { employmentStatus: "EXITED", exitDate: last, exitType: v.exitType, exitReason: v.exitReason ?? null } });
    if (e.membership) {
      await tx.organizationMembership.update({ where: { id: e.membership.id }, data: { status: "DISABLED" } });
      await tx.session.deleteMany({ where: { userId: e.membership.userId } });
    }
    // Allocations: those that started end on the last working day, those planned for later are cancelled.
    const open = await tx.teamAllocation.findMany({
      where: { employeeId: e.id, status: { in: ["ACTIVE", "PLANNED"] }, OR: [{ endDate: null }, { endDate: { gt: last } }] },
      select: { id: true, startDate: true },
    });
    for (const a of open) {
      await tx.teamAllocation.update({
        where: { id: a.id },
        data: a.startDate > last
          ? { status: "CANCELLED", changeReason: "Person left the firm" }
          : { endDate: last, status: "ENDED", changeReason: "Person left the firm" },
      });
    }
    await audit(tx, ctx, "employee.exited", "employee", e.id, { exitType: v.exitType, exitDate: v.exitDate, allocationsEnded: open.length });
    return open.length;
  });
  return { name: `${e.firstName} ${e.lastName ?? ""}`.trim(), allocationsEnded: ended };
}

/** Undo: back to Active with sign-in allowed. Ended allocations are not reopened (allocate again if needed). */
export async function restoreEmployee(ctx: AppContext, employeeId: string) {
  const e = await loadForExit(ctx, employeeId);
  if (e.employmentStatus !== "EXITED") throw new BusinessRuleError("This person is not an Ex-Employee.");
  await prisma.$transaction(async (tx) => {
    await tx.employee.update({ where: { id: e.id }, data: { employmentStatus: "ACTIVE", exitDate: null, exitType: null, exitReason: null } });
    if (e.membership) await tx.organizationMembership.update({ where: { id: e.membership.id }, data: { status: "ACTIVE" } });
    await audit(tx, ctx, "employee.restored", "employee", e.id);
  });
}
