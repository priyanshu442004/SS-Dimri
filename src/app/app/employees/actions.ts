"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, parseForm, safeAction, type ActionState } from "@/lib/actions";
import { actionContext } from "@/lib/session";
import { audit } from "@/lib/services/audit";
import {
  createEmployeeLogin,
  createEmployeeSchema,
  decideOnboarding,
  decisionSchema,
  onboardingSchema,
  issueEmployeePasswordLink,
  resendInvitation,
  saveOnboarding,
} from "@/lib/services/employees";
import type { MailResult } from "@/lib/services/mailer";

const mailNote = (m: MailResult, to: string) =>
  m.status === "SENT" ? `An email was sent to ${to}.` : m.status === "SKIPPED" ? `No email sent to ${to} (test address).` : `The email to ${to} could NOT be sent (${m.error}). Use “Resend invitation” once email works.`;

export async function createEmployeeAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(createEmployeeSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("employees.manage");
    const r = await createEmployeeLogin(ctx, parsed.data);
    revalidatePath("/app/employees");
    return { ok: r.mail.status !== "FAILED", message: `Invitation created. ${mailNote(r.mail, r.email)}` };
  });
}

/** Self-service onboarding (the signed-in employee) — no capability needed. */
export async function saveMyOnboardingAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(onboardingSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext();
    if (!ctx.employee) throw new BusinessRuleError("Your login is not linked to a staff record.");
    await saveOnboarding(ctx, ctx.employee.id, parsed.data, fd);
    revalidatePath("/app/onboarding");
    return { ok: true, message: parsed.data.submit ? "Submitted for approval." : "Saved." };
  });
}

export async function saveEmployeeDetailsAction(employeeId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(onboardingSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("employees.manage");
    await saveOnboarding(ctx, employeeId, { ...parsed.data, submit: false }, fd);
    revalidatePath(`/app/employees/${employeeId}`);
    return { ok: true, message: "Saved." };
  });
}

export async function decideOnboardingAction(employeeId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(decisionSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("employees.manage");
    const mail = await decideOnboarding(ctx, employeeId, parsed.data);
    revalidatePath(`/app/employees/${employeeId}`);
    revalidatePath("/app/employees");
    const what = { APPROVE: "Approved", REJECT: "Rejected", HOLD: "Put on hold" }[parsed.data.decision];
    return { ok: true, message: `${what}. ${mail.status === "SENT" ? "The staff member was emailed." : mail.status === "FAILED" ? `The email could not be sent (${mail.error}).` : "No email sent (test address)."}` };
  });
}

export async function resetPasswordAction(employeeId: string, _p: ActionState): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("employees.manage");
    const r = await issueEmployeePasswordLink(ctx, employeeId);
    return { ok: true, message: `Reset link for ${r.loginId} (single use, valid ${r.expiresInHours} hours — share privately): ${r.url}` };
  });
}

export async function resendInvitationAction(employeeId: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("employees.manage");
    const mail = await resendInvitation(ctx, employeeId);
    revalidatePath(`/app/employees/${employeeId}`);
    if (mail.status === "FAILED") return { ok: false, message: `The email could not be sent: ${mail.error}` };
    return { ok: true, message: mail.status === "SENT" ? "A new temporary password was emailed." : "New temporary password created (test address: not emailed)." };
  });
}

const accessSchema = z.object({
  role: z.enum(["STAFF", "SENIOR", "MANAGER", "ADMIN"]),
  status: z.enum(["ACTIVE", "DISABLED"]),
  designationId: z.uuid().optional(),
  departmentId: z.uuid().optional(),
  employmentStatus: z.enum(["PROBATION", "ACTIVE", "EXITED"]),
  attendanceProfile: z.enum(["STANDARD", "ONSITE", "FAR_CLIENT", "REDUCED_HOURS"]),
  "managerIds[]": z.array(z.uuid()).default([]),
});

export async function updateAccessAction(employeeId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(accessSchema, fd);
  if (!parsed.success) return parsed.state;
  const v = parsed.data;
  return safeAction(async () => {
    const ctx = await actionContext("employees.manage");
    const emp = await prisma.employee.findFirst({ where: { id: employeeId, organizationId: ctx.organization.id }, select: { id: true } });
    if (!emp) throw new BusinessRuleError("Employee not found.");
    const managers = v["managerIds[]"].filter((m) => m !== employeeId);
    const valid = await prisma.employee.count({ where: { id: { in: managers }, organizationId: ctx.organization.id } });
    if (valid !== managers.length) throw new BusinessRuleError("Invalid manager selection.");
    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: emp.id },
        data: {
          designationId: v.designationId ?? null,
          departmentId: v.departmentId ?? null,
          employmentStatus: v.employmentStatus,
          attendanceProfile: v.attendanceProfile,
        },
      });
      const m = await tx.organizationMembership.findFirst({ where: { employeeId: emp.id, organizationId: ctx.organization.id } });
      if (m) {
        if (m.role === "OWNER") throw new BusinessRuleError("The owner's role cannot be changed here.");
        // No self-escalation or self-lockout: another administrator must change your own role or status.
        if (m.userId === ctx.user.id && (m.role !== v.role || m.status !== v.status)) {
          throw new BusinessRuleError("You cannot change your own role or access status. Ask another administrator.");
        }
        await tx.organizationMembership.update({ where: { id: m.id }, data: { role: v.role, status: v.status } });
        if (v.status === "DISABLED") await tx.session.deleteMany({ where: { userId: m.userId } });
      }
      // "Whom to report" — multi-select; replace the set.
      await tx.employeeReportingRelationship.deleteMany({ where: { employeeId: emp.id, managerId: { notIn: managers } } });
      for (const [i, managerId] of managers.entries()) {
        await tx.employeeReportingRelationship.upsert({
          where: { employeeId_managerId: { employeeId: emp.id, managerId } },
          update: { isPrimary: i === 0 },
          create: { employeeId: emp.id, managerId, isPrimary: i === 0 },
        });
      }
      await audit(tx, ctx, "employee.access_updated", "employee", emp.id, { role: v.role, status: v.status });
    });
    revalidatePath(`/app/employees/${employeeId}`);
    return { ok: true, message: "Saved." };
  });
}
