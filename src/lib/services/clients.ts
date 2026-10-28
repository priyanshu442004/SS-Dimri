import "server-only";
import { exceedsSingleHolder, isRepresentativeRoleAllowed } from "@/lib/domain/constitution";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zIsoDate, zMoney, zOptionalText, zRequiredText } from "@/lib/actions";
import { dateOnly } from "@/lib/dates";
import { clientTransition, type ClientAction, type ClientStatus } from "@/lib/domain/client-workflow";
import { can } from "@/lib/permissions";
import { encryptWithLast4 } from "@/lib/security/encryption";
import { aadhaarSchema, gstinSchema, intlMobileSchema, mobileSchema, panSchema, tanSchema } from "@/lib/validation/identifiers";
import type { AppContext } from "@/lib/session";
import { createCredentialUser } from "./accounts";
import { audit } from "./audit";
import { hasFile, storeUpload } from "./files";
import { notifyClientUsers, notifyRoles } from "./notifications";
import { createPasswordLink } from "./password-links";

/** Clients the caller may see. Team members see only clients they are allocated to or have tasks for. */
export function clientScope(ctx: AppContext): Prisma.ClientWhereInput {
  if (can(ctx.role, "clients.view_all")) return { organizationId: ctx.organization.id };
  const me = ctx.employee?.id ?? "00000000-0000-0000-0000-000000000000";
  return {
    organizationId: ctx.organization.id,
    status: { in: ["ACTIVE", "ON_HOLD"] },
    OR: [
      { teamAllocations: { some: { employeeId: me, status: { in: ["ACTIVE", "PLANNED"] } } } },
      { tasks: { some: { assignments: { some: { employeeId: me, removedAt: null } } } } },
    ],
  };
}

export async function getClientForCtx(ctx: AppContext, clientId: string) {
  return prisma.client.findFirst({ where: { AND: [clientScope(ctx), { id: clientId }] } });
}

const gstinList = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean) : []))
  .pipe(z.array(gstinSchema).max(50));

// ------------------------------------------------------------- quick registration

export const quickRegistrationSchema = z.object({
  tradeName: zRequiredText(200),
  legalName: zOptionalText(200),
  constitutionId: z.uuid().optional(),
  pan: panSchema.optional(),
  gstins: gstinList,
  natureOfClient: z.enum(["ONE_TIME", "RETAINER"]).optional(),
  contactName: zOptionalText(120),
  contactMobile: intlMobileSchema.optional(),
  contactEmail: z.email().optional(),
  "serviceIds[]": z.array(z.uuid()).default([]),
});

export async function quickRegisterClient(ctx: AppContext, v: z.infer<typeof quickRegistrationSchema>) {
  const services = await prisma.service.findMany({ where: { id: { in: v["serviceIds[]"] }, organizationId: ctx.organization.id }, select: { id: true } });
  return prisma.$transaction(async (tx) => {
    const count = await tx.client.count({ where: { organizationId: ctx.organization.id } });
    const client = await tx.client.create({
      data: {
        organizationId: ctx.organization.id,
        clientCode: `CL-${String(count + 1).padStart(3, "0")}`,
        tradeName: v.tradeName,
        legalName: v.legalName,
        constitutionId: v.constitutionId,
        pan: v.pan,
        natureOfClient: v.natureOfClient,
        status: "PENDING_APPROVAL",
        createdById: ctx.user.id,
        submittedAt: new Date(),
        gstRegistrations: { create: [...new Set(v.gstins)].map((gstin) => ({ gstin })) },
        contacts: v.contactName ? { create: { name: v.contactName, mobile: v.contactMobile, email: v.contactEmail, isPrimary: true } } : undefined,
        services: {
          create: services.map((s) => ({ organizationId: ctx.organization.id, serviceId: s.id, engagementNature: v.natureOfClient })),
        },
      },
    });
    await audit(tx, ctx, "client.quick_registered", "client", client.id);
    await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], {
      type: "client.pending_approval",
      title: `New client awaiting approval: ${client.tradeName}`,
      link: `/app/clients/${client.id}`,
    }, ctx.user.id);
    return client;
  });
}

// ------------------------------------------------------------- full details

export const clientDetailsSchema = z.object({
  tradeName: zRequiredText(200),
  legalName: zOptionalText(200),
  address: zOptionalText(1000),
  pan: panSchema.optional(),
  tan: tanSchema.optional(),
  constitutionId: z.uuid().optional(),
  natureOfClient: z.enum(["ONE_TIME", "RETAINER"]).optional(),
  primaryBusinessNatureId: z.uuid().optional(),
  secondaryBusinessNatureId: z.uuid().optional(),
  isMsme: z.enum(["yes", "no"]).optional(),
  msmeRegistrationNumber: zOptionalText(40),
  esiNumber: zOptionalText(40),
  pfNumber: zOptionalText(40),
  GST_STATUS: z.uuid().optional(),
  BILLING_BASIS: z.uuid().optional(),
  PLACE_OF_WORK: z.uuid().optional(),
  TURNOVER: z.uuid().optional(),
  PRIORITY: z.uuid().optional(),
  markComplete: zCheckbox.optional(),
});

const BASES = ["GST_STATUS", "BILLING_BASIS", "PLACE_OF_WORK", "TURNOVER", "PRIORITY"] as const;

export async function saveClientDetails(ctx: AppContext, clientId: string, v: z.infer<typeof clientDetailsSchema>, fd: FormData) {
  const client = await getClientForCtx(ctx, clientId);
  if (!client) throw new BusinessRuleError("Client not found.");
  const uploads: Record<string, string> = {};
  for (const f of ["profilePicture", "msmeCertificate", "esiCertificate", "pfCertificate"]) {
    const file = fd.get(f);
    if (hasFile(file)) uploads[f] = (await storeUpload(ctx, file, { area: "clients", ownerId: client.id, imagesOnly: f === "profilePicture" })).id;
  }
  await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: client.id },
      data: {
        tradeName: v.tradeName,
        legalName: v.legalName ?? null,
        address: v.address ?? null,
        pan: v.pan ?? null,
        tan: v.tan ?? null,
        constitutionId: v.constitutionId ?? null,
        natureOfClient: v.natureOfClient ?? null,
        primaryBusinessNatureId: v.primaryBusinessNatureId ?? null,
        secondaryBusinessNatureId: v.secondaryBusinessNatureId ?? null,
        isMsme: v.isMsme === undefined ? null : v.isMsme === "yes",
        msmeRegistrationNumber: v.msmeRegistrationNumber ?? null,
        esiNumber: v.esiNumber ?? null,
        pfNumber: v.pfNumber ?? null,
        ...(uploads.profilePicture ? { profilePictureFileId: uploads.profilePicture } : {}),
        ...(uploads.msmeCertificate ? { msmeCertificateFileId: uploads.msmeCertificate } : {}),
        ...(uploads.esiCertificate ? { esiCertificateFileId: uploads.esiCertificate } : {}),
        ...(uploads.pfCertificate ? { pfCertificateFileId: uploads.pfCertificate } : {}),
        ...(v.markComplete ? { detailsCompletedAt: new Date() } : {}),
      },
    });
    for (const basis of BASES) {
      const optionId = v[basis];
      if (optionId) {
        const opt = await tx.classificationOption.findFirst({ where: { id: optionId, basis } });
        if (!opt) throw new BusinessRuleError("Invalid classification.");
        await tx.clientClassification.upsert({
          where: { clientId_basis: { clientId: client.id, basis } },
          update: { optionId },
          create: { clientId: client.id, basis, optionId },
        });
      } else {
        await tx.clientClassification.deleteMany({ where: { clientId: client.id, basis } });
      }
    }
    await audit(tx, ctx, "client.details_updated", "client", client.id);
  });
}

// ------------------------------------------------------------- status transitions

export const transitionSchema = z.object({
  action: z.enum(["approve", "reject", "hold", "resume", "deactivate", "reactivate", "resubmit"]),
  reason: zOptionalText(1000),
});

export async function transitionClient(ctx: AppContext, clientId: string, action: ClientAction, reason?: string) {
  const client = await getClientForCtx(ctx, clientId);
  if (!client) throw new BusinessRuleError("Client not found.");
  const to = clientTransition(client.status as ClientStatus, action, ctx.role);
  if (!to) throw new BusinessRuleError("This change is not allowed for the client's current status or your role.");
  if (action === "reject" && !reason) throw new BusinessRuleError("Give a reason for rejection.");
  await prisma.$transaction(async (tx) => {
    // Optimistic concurrency: only transition from the status we validated.
    const res = await tx.client.updateMany({
      where: { id: client.id, status: client.status },
      data: {
        status: to,
        ...(action === "approve" ? { approvedAt: new Date(), approvedById: ctx.user.id } : {}),
        ...(action === "reject" ? { rejectedAt: new Date(), rejectedById: ctx.user.id, rejectionReason: reason } : {}),
        ...(action === "resubmit" ? { submittedAt: new Date() } : {}),
      },
    });
    if (res.count !== 1) throw new BusinessRuleError("The client was changed by someone else. Refresh and try again.");
    await audit(tx, ctx, `client.${action}`, "client", client.id, { from: client.status, to, reason: reason ?? null });
    if (action === "resubmit") {
      await notifyRoles(tx, ctx.organization.id, ["OWNER", "ADMIN"], { type: "client.pending_approval", title: `Client resubmitted: ${client.tradeName}`, link: `/app/clients/${client.id}` }, ctx.user.id);
    }
    // Tell the client's portal users about approval decisions.
    if (action === "approve" || action === "reactivate") {
      await notifyClientUsers(tx, ctx.organization.id, client.id, { type: "client.approved", title: "Your account is active", body: "Welcome to the Office ERP client portal.", link: "/client" });
    }
    if (action === "reject") {
      await notifyClientUsers(tx, ctx.organization.id, client.id, { type: "client.rejected", title: "Your registration needs attention", body: reason, link: "/account/pending" });
    }
  });
}

// ------------------------------------------------------------- GSTINs, contacts, representatives, services, documents

export const gstinSchemaForm = z.object({ gstin: gstinSchema });
export const contactSchema = z.object({
  name: zRequiredText(120),
  designation: zOptionalText(120),
  mobile: mobileSchema.optional(),
  email: z.email().optional(),
  address: zOptionalText(500),
  isPrimary: zCheckbox.optional(),
});
export const representativeSchema = z.object({
  role: z.enum(["PROPRIETOR", "PARTNER", "DIRECTOR", "TRUSTEE", "KARTA", "MEMBER", "OTHER"]),
  fullName: zRequiredText(120),
  mobile: mobileSchema.optional(),
  email: z.email().optional(),
  address: zOptionalText(500),
  pan: panSchema.optional(),
  aadhaar: aadhaarSchema.optional(),
});
export const engagementSchema = z.object({
  serviceId: z.uuid("Select a service"),
  agreedFee: zMoney.optional(),
  engagementNature: z.enum(["ONE_TIME", "RETAINER"]).optional(),
  startDate: zIsoDate.optional(),
  dueDate: zIsoDate.optional(),
  timelineNote: zOptionalText(500),
  description: zOptionalText(1000),
  pocName: zOptionalText(120),
  pocMobile: mobileSchema.optional(),
  pocEmail: z.email().optional(),
  pocAddress: zOptionalText(500),
});
export const documentSchema = z.object({ title: zOptionalText(200), type: z.enum(["REGISTRATION_CERTIFICATE", "OTHER"]) });

export async function addRepresentative(ctx: AppContext, clientId: string, v: z.infer<typeof representativeSchema>, fd: FormData) {
  const client = await getClientForCtx(ctx, clientId);
  if (!client) throw new BusinessRuleError("Client not found.");
  const constitution = client.constitutionId
    ? await prisma.constitution.findUnique({ where: { id: client.constitutionId }, select: { name: true, representativeRole: true, allowsMultiple: true } })
    : null;
  if (!isRepresentativeRoleAllowed(constitution?.representativeRole, v.role)) {
    throw new BusinessRuleError(`A ${constitution!.name} cannot have a ${v.role.toLowerCase()}. Choose ${constitution!.representativeRole.toLowerCase()}, member or other.`);
  }
  if (constitution) {
    const existing = await prisma.constitutionMember.findMany({ where: { clientId: client.id }, select: { role: true } });
    if (exceedsSingleHolder(constitution, [...existing.map((m) => m.role), v.role])) {
      throw new BusinessRuleError(`A ${constitution.name} has only one ${constitution.representativeRole.toLowerCase()}. Remove the existing one first.`);
    }
  }
  const pic = fd.get("profilePicture");
  const picId = hasFile(pic) ? (await storeUpload(ctx, pic, { area: "clients", ownerId: client.id, imagesOnly: true })).id : undefined;
  const aadhaar = v.aadhaar ? encryptWithLast4(v.aadhaar) : null;
  await prisma.$transaction(async (tx) => {
    const m = await tx.constitutionMember.create({
      data: {
        organizationId: ctx.organization.id,
        clientId: client.id,
        role: v.role,
        fullName: v.fullName,
        mobile: v.mobile,
        email: v.email,
        address: v.address,
        pan: v.pan,
        aadhaarEncrypted: aadhaar?.encrypted,
        aadhaarLast4: aadhaar?.last4,
        profilePictureFileId: picId,
      },
    });
    await audit(tx, ctx, "client.representative_added", "constitution_member", m.id);
  });
}

export async function addEngagement(ctx: AppContext, clientId: string, v: z.infer<typeof engagementSchema>) {
  const client = await getClientForCtx(ctx, clientId);
  if (!client) throw new BusinessRuleError("Client not found.");
  const service = await prisma.service.findFirst({ where: { id: v.serviceId, organizationId: ctx.organization.id } });
  if (!service) throw new BusinessRuleError("Service not found.");
  await prisma.clientService.create({
    data: {
      organizationId: ctx.organization.id,
      clientId: client.id,
      serviceId: service.id,
      agreedFee: v.agreedFee,
      engagementNature: v.engagementNature,
      startDate: v.startDate ? dateOnly(v.startDate) : null,
      dueDate: v.dueDate ? dateOnly(v.dueDate) : null,
      retainerStartDate: v.engagementNature === "RETAINER" && v.startDate ? dateOnly(v.startDate) : null,
      timelineNote: v.timelineNote,
      description: v.description,
      pocName: v.pocName,
      pocMobile: v.pocMobile,
      pocEmail: v.pocEmail,
      pocAddress: v.pocAddress,
    },
  });
}

// ------------------------------------------------------------- client portal access

export const portalInviteSchema = z.object({ name: zRequiredText(120), email: z.email("Enter a valid email").transform((v) => v.toLowerCase()) });

/** Create a portal login for a client (e.g. one registered by staff) and return a one-time setup link. */
export async function invitePortalUser(ctx: AppContext, clientId: string, v: z.infer<typeof portalInviteSchema>) {
  const client = await getClientForCtx(ctx, clientId);
  if (!client) throw new BusinessRuleError("Client not found.");
  if (!["ACTIVE", "ON_HOLD", "PENDING_APPROVAL"].includes(client.status)) throw new BusinessRuleError("Portal access can only be given to active or pending clients.");
  if (await prisma.user.findUnique({ where: { email: v.email }, select: { id: true } })) throw new BusinessRuleError("A login with this email already exists.");
  const user = await prisma.$transaction(async (tx) => {
    const u = await createCredentialUser(tx, { name: v.name, email: v.email, password: randomBytes(24).toString("base64url") });
    await tx.organizationMembership.create({ data: { organizationId: ctx.organization.id, userId: u.id, role: "CLIENT", clientId: client.id } });
    await audit(tx, ctx, "client.portal_user_invited", "client", client.id);
    return u;
  });
  return createPasswordLink(user.id, "setup");
}

async function portalMembership(ctx: AppContext, clientId: string, membershipId: string) {
  const m = await prisma.organizationMembership.findFirst({ where: { id: membershipId, organizationId: ctx.organization.id, clientId, role: "CLIENT" } });
  if (!m) throw new BusinessRuleError("Portal user not found.");
  return m;
}

export async function issuePortalResetLink(ctx: AppContext, clientId: string, membershipId: string) {
  const m = await portalMembership(ctx, clientId, membershipId);
  const link = await createPasswordLink(m.userId, "reset");
  await prisma.$transaction((tx) => audit(tx, ctx, "client.portal_reset_link_issued", "client", clientId));
  return link;
}

export async function setPortalUserStatus(ctx: AppContext, clientId: string, membershipId: string, status: "ACTIVE" | "DISABLED") {
  const m = await portalMembership(ctx, clientId, membershipId);
  await prisma.$transaction(async (tx) => {
    await tx.organizationMembership.update({ where: { id: m.id }, data: { status } });
    if (status === "DISABLED") await tx.session.deleteMany({ where: { userId: m.userId } });
    await audit(tx, ctx, `client.portal_user_${status.toLowerCase()}`, "client", clientId);
  });
}
