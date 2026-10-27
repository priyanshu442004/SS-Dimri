import "server-only";
import { exceedsSingleHolder, isRepresentativeRoleAllowed } from "@/lib/domain/constitution";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zCheckbox, zIsoDate, zMoney, zOptionalText, zRequiredText } from "@/lib/actions";
import { dateOnly } from "@/lib/dates";
import { encryptWithLast4 } from "@/lib/security/encryption";
import { aadhaarSchema, gstinSchema, mobileSchema, panSchema, tanSchema } from "@/lib/validation/identifiers";
import { createCredentialUser } from "./accounts";
import { hasFile, storeUpload } from "./files";
import { notifyRoles } from "./notifications";

// Public client self-registration (quick and full). Both create the client with
// status PENDING_APPROVAL; only an administrator can activate it.

const gstinList = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean) : []))
  .pipe(z.array(gstinSchema).max(50))
  .refine((l) => new Set(l).size === l.length, "The same GSTIN is entered twice");

const account = {
  email: z.email("Enter a valid email").transform((v) => v.toLowerCase()),
  password: z.string().min(10, "Use at least 10 characters").max(128),
  confirmPassword: z.string(),
  consent: zCheckbox.refine((v) => v, "Please confirm to continue"),
  website: z.string().max(0).optional(), // honeypot
};
const passwordsMatch = (v: { password: string; confirmPassword: string }) => v.password === v.confirmPassword;

/** Quick registration: the minimum needed to identify the business and contact it. */
export const quickRegistrationSchema = z
  .object({
    tradeName: zRequiredText(200),
    contactName: zRequiredText(120),
    contactMobile: mobileSchema,
    pan: panSchema.optional(),
    gstins: gstinList,
    natureOfClient: z.enum(["ONE_TIME", "RETAINER"]).optional(),
    "serviceIds[]": z.array(z.uuid()).default([]),
    ...account,
  })
  .refine(passwordsMatch, { path: ["confirmPassword"], message: "Passwords do not match" });

const personSchema = z.object({
  role: z.enum(["PROPRIETOR", "PARTNER", "DIRECTOR", "TRUSTEE", "KARTA", "MEMBER", "OTHER"]),
  fullName: z.string().trim().min(1, "Name is required").max(120),
  mobile: mobileSchema.optional().or(z.literal("").transform(() => undefined)),
  email: z.email().optional().or(z.literal("").transform(() => undefined)),
  address: z.string().max(500).optional(),
  pan: panSchema.optional().or(z.literal("").transform(() => undefined)),
  aadhaar: aadhaarSchema.optional().or(z.literal("").transform(() => undefined)),
});

/** Full registration (multi-step form). People are sent as a JSON array. */
export const fullRegistrationSchema = z
  .object({
    tradeName: zRequiredText(200),
    legalName: zOptionalText(200),
    address: zOptionalText(1000),
    pan: panSchema.optional(),
    tan: tanSchema.optional(),
    constitutionId: z.uuid("Select the constitution"),
    natureOfClient: z.enum(["ONE_TIME", "RETAINER"]).optional(),
    primaryBusinessNatureId: z.uuid().optional(),
    contactName: zRequiredText(120),
    contactMobile: mobileSchema,
    contactDesignation: zOptionalText(120),
    people: z
      .string()
      .optional()
      .transform((s, c) => {
        try {
          return s ? (JSON.parse(s) as unknown) : [];
        } catch {
          c.addIssue({ code: "custom", message: "Invalid people data" });
          return z.NEVER;
        }
      })
      .pipe(z.array(personSchema).max(30)),
    gstins: gstinList,
    "serviceIds[]": z.array(z.uuid()).default([]),
    isMsme: z.enum(["yes", "no"]).optional(),
    msmeRegistrationNumber: zOptionalText(40),
    esiNumber: zOptionalText(40),
    pfNumber: zOptionalText(40),
    poNumber: zOptionalText(60),
    poDate: zIsoDate.optional(),
    poAmount: zMoney.optional(),
    ...account,
  })
  .refine(passwordsMatch, { path: ["confirmPassword"], message: "Passwords do not match" });

type Quick = z.infer<typeof quickRegistrationSchema>;
type Full = z.infer<typeof fullRegistrationSchema>;

export async function registerClient(organizationId: string, channel: "CLIENT_QUICK" | "CLIENT_FULL", v: Quick | Full, fd: FormData) {
  if (await prisma.user.findUnique({ where: { email: v.email }, select: { id: true } })) {
    // Same message whether or not the address is registered elsewhere would hide
    // a real problem from the applicant; registration (unlike sign-in) states it.
    throw new BusinessRuleError("An account with this email already exists. Sign in instead, or use “Forgot password”.");
  }
  if (v.gstins.length) {
    const dup = await prisma.clientGstRegistration.findFirst({ where: { gstin: { in: v.gstins }, client: { organizationId } }, select: { gstin: true } });
    if (dup) throw new BusinessRuleError(`GSTIN ${dup.gstin} is already registered with us. Please contact the office.`);
  }
  const services = await prisma.service.findMany({
    where: { id: { in: v["serviceIds[]"] }, organizationId, isActive: true, isConfirmed: true },
    select: { id: true },
  });
  const full = channel === "CLIENT_FULL" ? (v as Full) : null;
  if (full) {
    const c = await prisma.constitution.findUnique({ where: { id: full.constitutionId }, select: { id: true, name: true, representativeRole: true, allowsMultiple: true } });
    if (!c) throw new BusinessRuleError("Select a valid constitution.");
    const wrong = full.people.find((p) => !isRepresentativeRoleAllowed(c.representativeRole, p.role));
    if (wrong) throw new BusinessRuleError(`${wrong.fullName} cannot be recorded as ${wrong.role.toLowerCase()} for a ${c.name}.`);
    if (exceedsSingleHolder(c, full.people.map((p) => p.role))) throw new BusinessRuleError(`A ${c.name} has only one ${c.representativeRole.toLowerCase()}.`);
  }

  const { user, client } = await prisma.$transaction(
    async (tx) => {
      const user = await createCredentialUser(tx, { name: v.contactName, email: v.email, password: v.password });
      const count = await tx.client.count({ where: { organizationId } });
      const client = await tx.client.create({
        data: {
          organizationId,
          clientCode: `CL-${String(count + 1).padStart(3, "0")}`,
          tradeName: v.tradeName,
          legalName: full?.legalName,
          address: full?.address,
          pan: v.pan,
          tan: full?.tan,
          constitutionId: full?.constitutionId,
          natureOfClient: v.natureOfClient,
          primaryBusinessNatureId: full?.primaryBusinessNatureId,
          isMsme: full?.isMsme === undefined ? null : full.isMsme === "yes",
          msmeRegistrationNumber: full?.msmeRegistrationNumber,
          esiNumber: full?.esiNumber,
          pfNumber: full?.pfNumber,
          status: "PENDING_APPROVAL",
          registrationChannel: channel,
          createdById: user.id,
          submittedAt: new Date(),
          detailsCompletedAt: full ? new Date() : null,
          gstRegistrations: { create: v.gstins.map((gstin) => ({ gstin })) },
          contacts: {
            create: {
              name: v.contactName,
              mobile: v.contactMobile,
              email: v.email,
              designation: full?.contactDesignation,
              isPrimary: true,
            },
          },
          services: { create: services.map((s) => ({ organizationId, serviceId: s.id, engagementNature: v.natureOfClient })) },
        },
      });
      if (full) {
        for (const p of full.people) {
          const a = p.aadhaar ? encryptWithLast4(p.aadhaar) : null;
          await tx.constitutionMember.create({
            data: {
              organizationId,
              clientId: client.id,
              role: p.role,
              fullName: p.fullName,
              mobile: p.mobile,
              email: p.email,
              address: p.address,
              pan: p.pan,
              aadhaarEncrypted: a?.encrypted,
              aadhaarLast4: a?.last4,
            },
          });
        }
        if (full.poNumber) {
          await tx.clientPurchaseOrder.create({
            data: { organizationId, clientId: client.id, poNumber: full.poNumber, poDate: full.poDate ? dateOnly(full.poDate) : null, amount: full.poAmount },
          });
        }
      }
      await tx.organizationMembership.create({ data: { organizationId, userId: user.id, role: "CLIENT", clientId: client.id } });
      await tx.auditLog.create({
        data: { organizationId, actorUserId: user.id, action: `client.self_registered_${channel === "CLIENT_QUICK" ? "quick" : "full"}`, entityType: "client", entityId: client.id },
      });
      await notifyRoles(tx, organizationId, ["OWNER", "ADMIN"], {
        type: "client.pending_approval",
        title: `New client registration: ${client.tradeName}`,
        body: channel === "CLIENT_QUICK" ? "Quick registration — details to be completed" : "Full registration submitted",
        link: `/app/clients/${client.id}`,
      });
      return { user, client };
    },
    { timeout: 30_000 },
  );

  // Documents (full registration only). Stored after the records exist; a failed
  // upload never loses the registration itself.
  if (full) {
    const owner = { organization: { id: organizationId }, user: { id: user.id } };
    const updates: Record<string, string> = {};
    for (const [field, column] of [["msmeCertificate", "msmeCertificateFileId"], ["esiCertificate", "esiCertificateFileId"], ["pfCertificate", "pfCertificateFileId"], ["profilePicture", "profilePictureFileId"]] as const) {
      const f = fd.get(field);
      if (hasFile(f)) updates[column] = (await storeUpload(owner, f, { area: "clients", ownerId: client.id, imagesOnly: field === "profilePicture" })).id;
    }
    if (Object.keys(updates).length) await prisma.client.update({ where: { id: client.id }, data: updates });
    for (const f of fd.getAll("certificates").slice(0, 10)) {
      if (!hasFile(f)) continue;
      const stored = await storeUpload(owner, f, { area: "clients", ownerId: client.id });
      await prisma.clientDocument.create({ data: { clientId: client.id, fileId: stored.id, type: "REGISTRATION_CERTIFICATE", title: f.name.slice(0, 200) } });
    }
    const po = fd.get("poFile");
    if (hasFile(po) && full.poNumber) {
      const stored = await storeUpload(owner, po, { area: "clients", ownerId: client.id });
      await prisma.clientPurchaseOrder.updateMany({ where: { clientId: client.id, poNumber: full.poNumber }, data: { fileId: stored.id } });
    }
  }
  return client;
}
