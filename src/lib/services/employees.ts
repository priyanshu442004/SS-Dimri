import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zIsoDate, zOptionalText } from "@/lib/actions";
import { dateOnly, formatDateTime } from "@/lib/dates";
import { serverEnv } from "@/lib/env";
import { encryptWithLast4 } from "@/lib/security/encryption";
import { aadhaarSchema, ifscSchema, mobileSchema, panSchema } from "@/lib/validation/identifiers";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { createCredentialUser, generateTemporaryPassword, resetCredentialPassword } from "./accounts";
import { decisionEmail, invitationEmail, sendMail, type MailResult } from "./mailer";
import { createPasswordLink } from "./password-links";
import { hasFile, storeUpload } from "./files";
import { notifyEmployees, notifyRoles } from "./notifications";

// ------------------------------------------------------------- admin: invite staff

/**
 * Staff invitation (owner decision, 27 Oct 2026): the administrator enters only
 * name, email, mobile and role. The person gets an email with their email and a
 * temporary password (valid 7 days); at first sign-in they must set their own
 * password, then complete their details for review. No access until approved.
 */
export const createEmployeeSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the full name").max(120),
  email: z.email("Enter a valid email").transform((v) => v.trim().toLowerCase()),
  mobile: mobileSchema,
  role: z.enum(["STAFF", "SENIOR", "MANAGER", "ADMIN"]),
});

export const INVITATION_VALID_DAYS = 7;

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.length > 1 ? parts.slice(1).join(" ") : null };
}

async function sendInvitation(ctx: AppContext, u: { userId: string; name: string; email: string; tempPassword: string; expiresAt: Date }) {
  const mail = invitationEmail({
    name: u.name,
    firm: ctx.organization.tradeName,
    email: u.email,
    tempPassword: u.tempPassword,
    loginUrl: `${serverEnv().BETTER_AUTH_URL}/login`,
    expiresAt: formatDateTime(u.expiresAt),
  });
  return sendMail({ organizationId: ctx.organization.id, to: u.email, template: "staff.invitation", relatedUserId: u.userId, ...mail });
}

export async function createEmployeeLogin(ctx: AppContext, v: z.infer<typeof createEmployeeSchema>): Promise<{ employeeId: string; email: string; mail: MailResult }> {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { accessMode: true, licensedUserLimit: true } });
  if (org.accessMode === "SINGLE_USER") throw new BusinessRuleError("This organization is set to single-user access. Switch to multi-user in Settings to add staff.");
  const active = await prisma.organizationMembership.count({ where: { organizationId: ctx.organization.id, status: { not: "DISABLED" } } });
  if (active >= org.licensedUserLimit) {
    throw new BusinessRuleError(`All ${org.licensedUserLimit} user licences are in use. Increase the licence limit in Settings first.`);
  }
  if (await prisma.user.findUnique({ where: { email: v.email }, select: { id: true } })) {
    throw new BusinessRuleError("An account with this email already exists.");
  }
  const tempPassword = generateTemporaryPassword();
  const expiresAt = new Date(Date.now() + INVITATION_VALID_DAYS * 86_400_000);
  const { firstName, lastName } = splitName(v.fullName);
  const count = await prisma.employee.count({ where: { organizationId: ctx.organization.id } });

  const created = await prisma.$transaction(async (tx) => {
    const user = await createCredentialUser(tx, { name: v.fullName, email: v.email, password: tempPassword });
    const emp = await tx.employee.create({
      data: {
        organizationId: ctx.organization.id,
        temporaryEmployeeCode: `TMP-${String(count + 1).padStart(3, "0")}`,
        firstName,
        lastName,
        email: v.email,
        officialEmail: v.email,
        mobile: v.mobile,
      },
    });
    await tx.organizationMembership.create({
      data: { organizationId: ctx.organization.id, userId: user.id, employeeId: emp.id, role: v.role, mustChangePassword: true, tempPasswordExpiresAt: expiresAt },
    });
    await audit(tx, ctx, "employee.invited", "employee", emp.id, { role: v.role });
    return { employeeId: emp.id, userId: user.id };
  });
  // After the commit: an email failure is recorded and can be retried, never undoes the invitation.
  const mail = await sendInvitation(ctx, { userId: created.userId, name: firstName, email: v.email, tempPassword, expiresAt });
  return { employeeId: created.employeeId, email: v.email, mail };
}

/** New temporary password by email, only while the person has not set their own yet. */
export async function resendInvitation(ctx: AppContext, employeeId: string) {
  const m = await prisma.organizationMembership.findFirst({
    where: { organizationId: ctx.organization.id, employeeId },
    select: { id: true, userId: true, role: true, mustChangePassword: true, user: { select: { email: true } }, employee: { select: { firstName: true } } },
  });
  if (!m) throw new BusinessRuleError("This staff member has no login.");
  if (m.role === "OWNER") throw new BusinessRuleError("The owner manages their own password.");
  if (!m.mustChangePassword) throw new BusinessRuleError("This person has already set their password. Use “Issue reset link” instead.");
  const tempPassword = generateTemporaryPassword();
  const expiresAt = new Date(Date.now() + INVITATION_VALID_DAYS * 86_400_000);
  await prisma.$transaction(async (tx) => {
    await resetCredentialPassword(tx, m.userId, tempPassword); // also ends any session
    await tx.organizationMembership.update({ where: { id: m.id }, data: { tempPasswordExpiresAt: expiresAt } });
    await audit(tx, ctx, "employee.invitation_resent", "employee", employeeId);
  });
  return sendInvitation(ctx, { userId: m.userId, name: m.employee?.firstName ?? "", email: m.user.email, tempPassword, expiresAt });
}

// ------------------------------------------------------------- onboarding details

export const onboardingSchema = z.object({
  firstName: z.string().min(1, "Required").max(80),
  lastName: zOptionalText(80),
  gender: z.enum(["MALE", "FEMALE", "OTHER", "PREFER_NOT_TO_SAY"]).optional(),
  dateOfBirth: zIsoDate.optional(),
  maritalStatus: z.enum(["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "OTHER"]).optional(),
  fatherName: zOptionalText(120),
  motherName: zOptionalText(120),
  mobile: mobileSchema.optional(),
  email: z.email("Enter a valid email").optional(),
  panNumber: panSchema.optional(),
  aadhaar: aadhaarSchema.optional(),
  voterIdNumber: zOptionalText(30),
  uanNumber: zOptionalText(30),
  esiIpNumber: zOptionalText(30),
  currentAddress: zOptionalText(500),
  permanentAddress: zOptionalText(500),
  emergencyContactName: zOptionalText(120),
  emergencyContactRelation: zOptionalText(60),
  emergencyContactPhone: mobileSchema.optional(),
  bankAccountHolder: zOptionalText(120),
  bankAccountNumber: z.string().regex(/^\d{6,20}$/, "Digits only (6–20)").optional(),
  ifscCode: ifscSchema.optional(),
  bankName: zOptionalText(120),
  branch: zOptionalText(120),
  qualification: zOptionalText(200),
  institution: zOptionalText(200),
  yearOfPassing: z.coerce.number().int().min(1950).max(2100).optional(),
  previousEmployer: zOptionalText(200),
  previousEmployerAddress: zOptionalText(500),
  previousDesignation: zOptionalText(120),
  previousEmployerContact: zOptionalText(20),
  previousFrom: zIsoDate.optional(),
  previousTo: zIsoDate.optional(),
  remarks: zOptionalText(2000),
  submit: zCheckbox.optional(),
});

/** Document kinds an employee or administrator can upload (matches the EmployeeDocumentType enum). */
export const EMPLOYEE_DOCUMENT_TYPES = [
  "MARKSHEET_10", "MARKSHEET_12", "DEGREE", "PROFESSIONAL_CERTIFICATE", "ADDRESS_PROOF", "OFFER_LETTER", "APPOINTMENT_LETTER",
  "JOINING_LETTER", "JOINING_FORM", "RELIEVING_LETTER", "EXPERIENCE_CERTIFICATE", "SALARY_SLIP", "CANCELLED_CHEQUE", "POLICY_ACKNOWLEDGEMENT", "OTHER",
] as const;

const UPLOAD_FIELDS = ["profilePicture", "panDocument", "aadhaarDocument", "qualificationCertificate", "experienceCertificate", "bankBook"] as const;

export async function saveOnboarding(ctx: AppContext, employeeId: string, v: z.infer<typeof onboardingSchema>, fd: FormData) {
  const emp = await prisma.employee.findFirst({ where: { id: employeeId, organizationId: ctx.organization.id }, select: { id: true, approvalStatus: true } });
  if (!emp) throw new BusinessRuleError("Employee not found.");
  const self = ctx.employee?.id === emp.id;
  if (self && (emp.approvalStatus === "UNDER_REVIEW" || emp.approvalStatus === "ON_HOLD")) {
    throw new BusinessRuleError("Your details are under review and cannot be changed now.");
  }
  if (v.submit) {
    // Provisional minimum for review (see business-rules.md); everything else stays optional.
    const missing = [!v.mobile && "mobile", !v.panNumber && "PAN", !v.aadhaar && !(await hasAadhaar(emp.id)) && "Aadhaar", !v.currentAddress && "current address"].filter(Boolean);
    if (missing.length) throw new BusinessRuleError(`Fill in your ${missing.join(", ")} before submitting.`);
  }

  // Upload files first (outside the transaction); orphaned files are harmless and traceable.
  const uploads: Partial<Record<(typeof UPLOAD_FIELDS)[number], string>> = {};
  for (const f of UPLOAD_FIELDS) {
    const file = fd.get(f);
    if (hasFile(file)) {
      const stored = await storeUpload(ctx, file, { area: "employees", ownerId: emp.id, imagesOnly: f === "profilePicture" });
      uploads[f] = stored.id;
    }
  }

  // Additional documents (10th / 12th marksheets, degree, letters…): up to 3 per save.
  const extraDocs: { type: (typeof EMPLOYEE_DOCUMENT_TYPES)[number]; fileId: string; title: string }[] = [];
  for (const i of [1, 2, 3]) {
    const file = fd.get(`docFile${i}`);
    const type = String(fd.get(`docType${i}`) ?? "");
    if (!hasFile(file)) continue;
    if (!(EMPLOYEE_DOCUMENT_TYPES as readonly string[]).includes(type)) throw new BusinessRuleError(`Choose what document ${i} is.`);
    const stored = await storeUpload(ctx, file, { area: "employees", ownerId: emp.id });
    extraDocs.push({ type: type as (typeof EMPLOYEE_DOCUMENT_TYPES)[number], fileId: stored.id, title: file.name.slice(0, 200) });
  }

  await prisma.$transaction(async (tx) => {
    for (const d of extraDocs) await tx.employeeDocument.create({ data: { employeeId: emp.id, type: d.type, fileId: d.fileId, title: d.title } });
    const aadhaar = v.aadhaar ? encryptWithLast4(v.aadhaar) : null;
    await tx.employee.update({
      where: { id: emp.id },
      data: {
        firstName: v.firstName,
        lastName: v.lastName ?? null,
        gender: v.gender,
        dateOfBirth: v.dateOfBirth ? dateOnly(v.dateOfBirth) : undefined,
        maritalStatus: v.maritalStatus,
        fatherName: v.fatherName,
        motherName: v.motherName,
        mobile: v.mobile,
        email: v.email,
        panNumber: v.panNumber,
        ...(aadhaar ? { aadhaarEncrypted: aadhaar.encrypted, aadhaarLast4: aadhaar.last4 } : {}),
        voterIdNumber: v.voterIdNumber,
        uanNumber: v.uanNumber,
        esiIpNumber: v.esiIpNumber,
        emergencyContactName: v.emergencyContactName,
        emergencyContactRelation: v.emergencyContactRelation,
        emergencyContactPhone: v.emergencyContactPhone,
        remarks: v.remarks,
        ...(uploads.profilePicture ? { profilePictureFileId: uploads.profilePicture } : {}),
        ...(uploads.panDocument ? { panDocumentFileId: uploads.panDocument } : {}),
        ...(uploads.aadhaarDocument ? { aadhaarDocumentFileId: uploads.aadhaarDocument } : {}),
        ...(v.submit && emp.approvalStatus !== "APPROVED" ? { onboardingSubmittedAt: new Date(), approvalStatus: "UNDER_REVIEW" as const } : {}),
      },
    });

    for (const [type, line1] of [["CURRENT", v.currentAddress], ["PERMANENT", v.permanentAddress]] as const) {
      if (!line1) continue;
      const existing = await tx.employeeAddress.findFirst({ where: { employeeId: emp.id, type } });
      if (existing) await tx.employeeAddress.update({ where: { id: existing.id }, data: { line1 } });
      else await tx.employeeAddress.create({ data: { employeeId: emp.id, type, line1 } });
    }

    if (v.bankAccountNumber && v.ifscCode) {
      const acc = encryptWithLast4(v.bankAccountNumber);
      const existing = await tx.employeeBankAccount.findFirst({ where: { employeeId: emp.id, isPrimary: true } });
      const data = {
        accountHolderName: v.bankAccountHolder,
        accountNumberEncrypted: acc.encrypted,
        accountNumberLast4: acc.last4,
        ifscCode: v.ifscCode,
        bankName: v.bankName,
        branch: v.branch,
        ...(uploads.bankBook ? { bankBookFileId: uploads.bankBook } : {}),
      };
      if (existing) await tx.employeeBankAccount.update({ where: { id: existing.id }, data });
      else await tx.employeeBankAccount.create({ data: { employeeId: emp.id, ...data } });
    }

    if (v.qualification) {
      const existing = await tx.employeeQualification.findFirst({ where: { employeeId: emp.id }, orderBy: { createdAt: "asc" } });
      const data = {
        qualification: v.qualification,
        institution: v.institution,
        yearOfPassing: v.yearOfPassing,
        ...(uploads.qualificationCertificate ? { certificateFileId: uploads.qualificationCertificate } : {}),
      };
      if (existing) await tx.employeeQualification.update({ where: { id: existing.id }, data });
      else await tx.employeeQualification.create({ data: { employeeId: emp.id, ...data } });
    }

    if (v.previousEmployer) {
      const existing = await tx.employeePreviousEmployment.findFirst({ where: { employeeId: emp.id }, orderBy: { createdAt: "asc" } });
      const data = {
        employerName: v.previousEmployer,
        employerAddress: v.previousEmployerAddress,
        designation: v.previousDesignation,
        contactNumber: v.previousEmployerContact,
        fromDate: v.previousFrom ? dateOnly(v.previousFrom) : null,
        toDate: v.previousTo ? dateOnly(v.previousTo) : null,
        ...(uploads.experienceCertificate ? { experienceCertificateFileId: uploads.experienceCertificate } : {}),
      };
      if (existing) await tx.employeePreviousEmployment.update({ where: { id: existing.id }, data });
      else await tx.employeePreviousEmployment.create({ data: { employeeId: emp.id, ...data } });
    }

    await audit(tx, ctx, v.submit ? "employee.onboarding_submitted" : "employee.onboarding_saved", "employee", emp.id);
    if (v.submit) {
      await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], {
        type: "employee.onboarding_submitted",
        title: `${v.firstName} ${v.lastName ?? ""} submitted onboarding details`.trim(),
        link: `/app/employees/${emp.id}`,
      }, ctx.user.id);
    }
  });
}

// ------------------------------------------------------------- approval

export const decisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT", "HOLD"]),
  permanentEmployeeCode: z.string().trim().max(30).optional(),
  note: zOptionalText(1000),
});

const DECIDABLE = ["UNDER_REVIEW", "ON_HOLD", "PENDING"];

/** Approve, hold or reject submitted details. The person is emailed and notified in the app. */
export async function decideOnboarding(ctx: AppContext, employeeId: string, v: z.infer<typeof decisionSchema>) {
  const emp = await prisma.employee.findFirst({
    where: { id: employeeId, organizationId: ctx.organization.id },
    include: { membership: { select: { userId: true, user: { select: { email: true } } } } },
  });
  if (!emp) throw new BusinessRuleError("Employee not found.");
  if (emp.id === ctx.employee?.id) throw new BusinessRuleError("You cannot decide your own onboarding.");
  if (!DECIDABLE.includes(emp.approvalStatus)) throw new BusinessRuleError(`This person is already ${emp.approvalStatus === "APPROVED" ? "approved" : "rejected"}.`);
  if (!emp.onboardingSubmittedAt) throw new BusinessRuleError("This person has not submitted their details yet.");
  if (v.decision === "HOLD" && emp.approvalStatus === "ON_HOLD") throw new BusinessRuleError("Already on hold.");
  if (v.decision === "APPROVE" && !v.permanentEmployeeCode) throw new BusinessRuleError("Enter the permanent employee ID to approve.");
  if (v.decision === "REJECT" && !v.note) throw new BusinessRuleError("Give a reason for rejection.");
  if (v.decision === "APPROVE") {
    const taken = await prisma.employee.findFirst({ where: { organizationId: ctx.organization.id, permanentEmployeeCode: v.permanentEmployeeCode, id: { not: emp.id } }, select: { id: true } });
    if (taken) throw new BusinessRuleError("That employee ID is already in use.");
  }
  const to = v.decision === "APPROVE" ? "APPROVED" : v.decision === "REJECT" ? "REJECTED" : "ON_HOLD";
  await prisma.$transaction(async (tx) => {
    const res = await tx.employee.updateMany({
      where: { id: emp.id, approvalStatus: emp.approvalStatus },
      data:
        to === "APPROVED"
          ? { approvalStatus: to, approvedAt: new Date(), approvedById: ctx.user.id, idType: "PERMANENT", permanentEmployeeCode: v.permanentEmployeeCode, permanentIdAssignedAt: new Date(), reviewNotes: v.note ?? emp.reviewNotes }
          : { approvalStatus: to, rejectedAt: to === "REJECTED" ? new Date() : null, rejectedById: to === "REJECTED" ? ctx.user.id : null, reviewNotes: v.note ?? null },
    });
    if (res.count !== 1) throw new BusinessRuleError("Someone else just decided this. Refresh the page.");
    await audit(tx, ctx, `employee.${v.decision.toLowerCase()}`, "employee", emp.id, { note: v.note ?? null });
    await notifyEmployees(tx, ctx.organization.id, [emp.id], {
      type: "employee.decision",
      title: to === "APPROVED" ? "Your account is approved" : to === "REJECTED" ? "Your details need corrections" : "Your details are on hold",
      body: v.note,
      link: "/app/onboarding",
    });
  });
  const email = emp.membership?.user.email;
  if (!email) return { status: "SKIPPED" as const };
  const mail = decisionEmail({ name: emp.firstName, firm: ctx.organization.tradeName, email, loginUrl: `${serverEnv().BETTER_AUTH_URL}/login`, decision: to, note: v.note });
  return sendMail({ organizationId: ctx.organization.id, to: email, template: `staff.${to.toLowerCase()}`, relatedUserId: emp.membership!.userId, ...mail });
}

async function hasAadhaar(employeeId: string) {
  const e = await prisma.employee.findUnique({ where: { id: employeeId }, select: { aadhaarLast4: true } });
  return !!e?.aadhaarLast4;
}

/** Issue a single-use password reset link (existing sessions stay until the password is changed). */
export async function issueEmployeePasswordLink(ctx: AppContext, employeeId: string) {
  const m = await prisma.organizationMembership.findFirst({
    where: { organizationId: ctx.organization.id, employeeId },
    select: { userId: true, role: true, user: { select: { username: true, email: true } } },
  });
  if (!m) throw new BusinessRuleError("This employee has no login.");
  if (m.role === "OWNER") throw new BusinessRuleError("The owner manages their own password.");
  const link = await createPasswordLink(m.userId, "reset");
  await prisma.$transaction((tx) => audit(tx, ctx, "employee.password_link_issued", "employee", employeeId));
  return { ...link, loginId: m.user.username ?? m.user.email };
}
