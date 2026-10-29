"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { BusinessRuleError, parseForm, safeAction, zInt, zIsoDate, zOptionalText, zRequiredText, type ActionState } from "@/lib/actions";
import { dateOnly } from "@/lib/dates";
import { createOrganizationDefaults } from "@/lib/domain/organization-defaults";
import { checkRateLimit } from "@/lib/rate-limit";
import { createCredentialUser } from "@/lib/services/accounts";
import { assertRepresentatives, peopleField, representativeRows } from "@/lib/services/client-registration";
import { hasFile, storeUpload, validateUpload } from "@/lib/services/files";
import { isFirmRegistrationOpen } from "@/lib/services/firm-registration";
import { gstinSchema, intlMobileSchema, panSchema, tanSchema } from "@/lib/validation/identifiers";
import { setFlash } from "@/lib/flash";

const schema = z
  .object({
    ownerName: zRequiredText(120),
    email: z.email("Enter a valid email").transform((v) => v.toLowerCase()),
    password: z.string().min(10, "Use at least 10 characters").max(128),
    confirmPassword: z.string(),
    tradeName: zRequiredText(200),
    legalName: zOptionalText(200),
    constitutionId: z.uuid("Select a constitution"),
    people: peopleField,
    pan: panSchema.optional(),
    gstin: gstinSchema.optional(),
    tan: tanSchema.optional(),
    address: zOptionalText(1000),
    contactMobile: intlMobileSchema.optional(),
    accessMode: z.enum(["SINGLE_USER", "MULTI_USER"]),
    declaredEmployeeCount: zInt(0, 100000).optional(),
    declaredClientCount: zInt(0, 1000000).optional(),
    certificateName: zOptionalText(200),
    certificateNumber: zOptionalText(100),
    certificateIssuedOn: zIsoDate.optional(),
    certificateExpiresOn: zIsoDate.optional(),
    website: z.string().max(0).optional(), // honeypot: must stay empty
  })
  .refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export async function createAccount(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (!(await isFirmRegistrationOpen())) return { ok: false, message: "Firm registration is closed." };
  if (!(await checkRateLimit("firm-register", 3, 3600))) return { ok: false, message: "Too many attempts. Please try again later." };
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  const v = parsed.data;

  const certificate = fd.get("certificateFile");
  const logo = fd.get("profilePicture");

  const result = await safeAction(async () => {
    if (await prisma.user.findUnique({ where: { email: v.email }, select: { id: true } })) {
      throw new BusinessRuleError("An account with this email already exists. Please sign in instead.");
    }
    await assertRepresentatives(v.constitutionId, v.people);
    // Check the documents before anything is created, so a bad file never leaves a half-registered firm.
    if (hasFile(certificate)) await validateUpload(certificate);
    if (hasFile(logo)) await validateUpload(logo, { imagesOnly: true });
    const created = await prisma.$transaction(
      async (tx) => {
        const user = await createCredentialUser(tx, { name: v.ownerName, email: v.email, password: v.password });
        const org = await tx.organization.create({
          data: {
            tradeName: v.tradeName,
            legalName: v.legalName,
            constitutionId: v.constitutionId,
            pan: v.pan,
            gstin: v.gstin,
            tan: v.tan,
            address: v.address,
            contactPersonName: v.ownerName,
            contactMobile: v.contactMobile,
            contactEmail: v.email,
            accessMode: v.accessMode,
            licensedUserLimit: v.accessMode === "SINGLE_USER" ? 1 : Math.max(2, (v.declaredEmployeeCount ?? 0) + 1),
            declaredEmployeeCount: v.declaredEmployeeCount,
            declaredClientCount: v.declaredClientCount,
          },
        });
        await tx.organizationMembership.create({ data: { organizationId: org.id, userId: user.id, role: "OWNER" } });
        // The firm's own proprietor/partners/directors: constitution members without a client.
        if (v.people.length) await tx.constitutionMember.createMany({ data: representativeRows(org.id, null, v.people) });
        await createOrganizationDefaults(tx, org.id);
        await tx.auditLog.create({
          data: { organizationId: org.id, actorUserId: user.id, action: "organization.registered", entityType: "organization", entityId: org.id },
        });
        return { orgId: org.id, userId: user.id };
      },
      { timeout: 30_000 },
    );

    // Documents go to private S3 under the new firm's folder (ss-dimri/org/<id>/organizations/…).
    const owner = { organization: { id: created.orgId }, user: { id: created.userId } };
    if (hasFile(certificate)) {
      const stored = await storeUpload(owner, certificate, { area: "organizations", ownerId: created.orgId });
      await prisma.organizationCertificate.create({
        data: {
          organizationId: created.orgId,
          fileId: stored.id,
          certificateName: v.certificateName,
          certificateNumber: v.certificateNumber,
          issuedOn: v.certificateIssuedOn ? dateOnly(v.certificateIssuedOn) : null,
          expiresOn: v.certificateExpiresOn ? dateOnly(v.certificateExpiresOn) : null,
        },
      });
    }
    if (hasFile(logo)) {
      const stored = await storeUpload(owner, logo, { area: "organizations", ownerId: created.orgId, imagesOnly: true });
      await prisma.organization.update({ where: { id: created.orgId }, data: { profilePictureFileId: stored.id } });
    }
  });
  if (result.ok === false) return result;

  // Sign the new owner in (sets the session cookie through the nextCookies plugin).
  // The firm already exists at this point, so a sign-in failure must not look like a failed registration.
  try {
    await auth.api.signInEmail({ body: { email: v.email, password: v.password }, headers: await headers() });
  } catch (e) {
    console.error("Sign-in after firm registration failed", e instanceof Error ? e.message : "unknown");
    await setFlash("Firm registered. Please sign in with your email and password.");
    redirect("/login");
  }
  await setFlash("Firm registered. Welcome to your practice portal.");
  redirect("/app/admin");
}
