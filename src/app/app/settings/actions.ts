"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseForm, safeAction, zCheckbox, zInt, zIsoDate, zOptionalText, zRequiredText, type ActionState } from "@/lib/actions";
import { dateOnly } from "@/lib/dates";
import { actionContext } from "@/lib/session";
import { audit } from "@/lib/services/audit";
import { hasFile, storeUpload } from "@/lib/services/files";
import { gstinSchema, intlMobileSchema, panSchema, tanSchema } from "@/lib/validation/identifiers";

const orgSchema = z.object({
  tradeName: zRequiredText(200),
  legalName: zOptionalText(200),
  address: zOptionalText(1000),
  pan: panSchema.optional(),
  gstin: gstinSchema.optional(),
  tan: tanSchema.optional(),
  contactPersonName: zOptionalText(120),
  contactMobile: intlMobileSchema.optional(), // the firm may be registered with a foreign number
  contactEmail: z.email().optional(),
  contactPhone: zOptionalText(20),
  accessMode: z.enum(["SINGLE_USER", "MULTI_USER"]),
  licensedUserLimit: zInt(1, 10000),
  declaredEmployeeCount: zInt(0, 100000).optional(),
  declaredClientCount: zInt(0, 1000000).optional(),
  defaultProbationDays: zInt(0, 365),
});

export async function saveOrganizationAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(orgSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("org.manage");
    const pic = fd.get("profilePicture");
    const picId = hasFile(pic) ? (await storeUpload(ctx, pic, { area: "organizations", ownerId: ctx.organization.id, imagesOnly: true })).id : undefined;
    await prisma.$transaction(async (tx) => {
      const before = await tx.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { gstin: true } });
      await tx.organization.update({
        where: { id: ctx.organization.id },
        data: {
          ...parsed.data,
          ...(picId ? { profilePictureFileId: picId } : {}),
          // A changed GSTIN needs re-verification.
          ...(before.gstin !== (parsed.data.gstin ?? null) ? { gstVerificationStatus: "NOT_VERIFIED", gstVerifiedAt: null } : {}),
        },
      });
      await audit(tx, ctx, "organization.updated", "organization", ctx.organization.id);
    });
    revalidatePath("/app", "layout");
    return { ok: true, message: "Saved." };
  });
}

const certSchema = z.object({
  certificateName: zOptionalText(200),
  certificateNumber: zOptionalText(100),
  issuedOn: zIsoDate.optional(),
  expiresOn: zIsoDate.optional(),
});

/** One certificate per organization: uploading again replaces the current one. */
export async function saveCertificateAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(certSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("org.manage");
    const file = fd.get("file");
    const existing = await prisma.organizationCertificate.findUnique({ where: { organizationId: ctx.organization.id } });
    if (!hasFile(file) && !existing) return { ok: false, fieldErrors: { file: ["Choose the certificate file"] }, message: "Choose the certificate file." };
    const stored = hasFile(file) ? await storeUpload(ctx, file, { area: "organizations", ownerId: ctx.organization.id }) : null;
    const v = parsed.data;
    const data = {
      certificateName: v.certificateName,
      certificateNumber: v.certificateNumber,
      issuedOn: v.issuedOn ? dateOnly(v.issuedOn) : null,
      expiresOn: v.expiresOn ? dateOnly(v.expiresOn) : null,
      ...(stored ? { fileId: stored.id } : {}),
    };
    await prisma.$transaction(async (tx) => {
      if (existing) await tx.organizationCertificate.update({ where: { id: existing.id }, data });
      else await tx.organizationCertificate.create({ data: { ...data, organizationId: ctx.organization.id, fileId: stored!.id } });
      await audit(tx, ctx, existing ? "organization.certificate_replaced" : "organization.certificate_added", "organization", ctx.organization.id);
    });
    revalidatePath("/app/settings");
    return { ok: true, message: "Certificate saved." };
  });
}

export async function uploadLeavePolicyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("org.manage");
    const file = fd.get("file");
    if (!hasFile(file)) return { ok: false, fieldErrors: { file: ["Choose a file"] }, message: "Choose a file." };
    const stored = await storeUpload(ctx, file, { area: "organizations", ownerId: ctx.organization.id });
    const effective = String(fd.get("effectiveFrom") ?? "");
    await prisma.organizationDocument.create({
      data: {
        organizationId: ctx.organization.id,
        type: "LEAVE_POLICY",
        title: String(fd.get("title") || "Leave & Timing Policy").slice(0, 200),
        fileId: stored.id,
        effectiveFrom: /^\d{4}-\d{2}-\d{2}$/.test(effective) ? dateOnly(effective) : null,
      },
    });
    revalidatePath("/app/settings");
    return { ok: true, message: "Uploaded." };
  });
}

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "HH:MM");
const policySchema = z.object({
  officeStart: hhmm, reportingGraceUntil: hhmm, lunchStart: hhmm, lunchEnd: hhmm, officeEnd: hhmm, leavingGraceUntil: hhmm, halfDayIfLeavingBefore: hhmm,
  requiredMinutes: zInt(60, 1440), onsiteRequiredMinutes: zInt(60, 1440), reducedRequiredMinutes: zInt(60, 1440),
  farClientEarlyMonthMinutes: zInt(60, 1440), farClientEarlyMonthUntilDay: zInt(1, 31),
  lateArrivalsPerHalfDay: zInt(1, 31), lateGracePerMonth: zInt(0, 31),
  overtimeMode: z.enum(["ACTUAL_MINUTES", "SLABS"]), overtimeMinutesPerDay: zInt(60, 1440),
  paidLeavesPerMonth: z.coerce.number().min(0).max(31), plannedLeaveNoticeDays: zInt(0, 365),
  policyConfirmed: zCheckbox.optional(),
});

export async function savePolicyAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(policySchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("org.manage");
    await prisma.$transaction(async (tx) => {
      await tx.attendancePolicy.upsert({
        where: { organizationId: ctx.organization.id },
        update: { ...parsed.data, policyConfirmed: !!parsed.data.policyConfirmed },
        create: { ...parsed.data, policyConfirmed: !!parsed.data.policyConfirmed, organizationId: ctx.organization.id },
      });
      await audit(tx, ctx, "attendance_policy.updated", "organization", ctx.organization.id, { overtimeMode: parsed.data.overtimeMode, confirmed: !!parsed.data.policyConfirmed });
    });
    revalidatePath("/app/settings");
    return { ok: true, message: "Policy saved." };
  });
}

const listItemSchema = z.object({ name: zRequiredText(120), seniorityLevel: z.enum(["JUNIOR", "MID_LEVEL", "SENIOR"]).optional() });

/** Adds a designation or work type. Names are unique per organization. */
export async function addListItemAction(kind: "designation" | "work_type", _p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(listItemSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("org.manage");
    const organizationId = ctx.organization.id;
    const name = parsed.data.name.trim();
    const exists = kind === "designation"
      ? await prisma.designation.findFirst({ where: { organizationId, name: { equals: name, mode: "insensitive" } }, select: { id: true } })
      : await prisma.workType.findFirst({ where: { organizationId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (exists) return { ok: false, fieldErrors: { name: ["This name already exists"] } };
    await prisma.$transaction(async (tx) => {
      const row = kind === "designation"
        ? await tx.designation.create({ data: { organizationId, name, seniorityLevel: parsed.data.seniorityLevel, sortOrder: await tx.designation.count({ where: { organizationId } }) } })
        : await tx.workType.create({ data: { organizationId, name, sortOrder: await tx.workType.count({ where: { organizationId } }) } });
      await audit(tx, ctx, `${kind}.created`, kind, row.id, { name });
    });
    revalidatePath("/app/settings");
    return { ok: true, message: "Added." };
  });
}

/** Deactivating keeps history intact: existing records keep their value, new forms stop offering it. */
export async function toggleListItemAction(kind: "designation" | "work_type", id: string): Promise<ActionState> {
  return safeAction(async () => {
    const ctx = await actionContext("org.manage");
    const where = { id, organizationId: ctx.organization.id };
    const row = kind === "designation"
      ? await prisma.designation.findFirst({ where, select: { id: true, isActive: true } })
      : await prisma.workType.findFirst({ where, select: { id: true, isActive: true } });
    if (!row) return { ok: false, message: "Not found." };
    await prisma.$transaction(async (tx) => {
      if (kind === "designation") await tx.designation.update({ where: { id: row.id }, data: { isActive: !row.isActive } });
      else await tx.workType.update({ where: { id: row.id }, data: { isActive: !row.isActive } });
      await audit(tx, ctx, `${kind}.${row.isActive ? "deactivated" : "activated"}`, kind, row.id);
    });
    revalidatePath("/app/settings");
  });
}

const preferencesSchema = z.object({ pendingDaysBasis: z.enum(["CALENDAR", "BUSINESS"]), approvalGraceDays: zInt(0, 90) });

export async function savePreferencesAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = parseForm(preferencesSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("org.manage");
    await prisma.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: ctx.organization.id }, data: { pendingDaysBasis: parsed.data.pendingDaysBasis, approvalGraceDays: parsed.data.approvalGraceDays } });
      await audit(tx, ctx, "organization.preferences_updated", "organization", ctx.organization.id, parsed.data);
    });
    revalidatePath("/app", "layout");
    return { ok: true, message: "Preferences saved." };
  });
}
