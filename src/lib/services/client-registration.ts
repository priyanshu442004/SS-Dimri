import "server-only";
import { exceedsSingleHolder, isRepresentativeRoleAllowed } from "@/lib/domain/constitution";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zOptionalText, zRequiredText } from "@/lib/actions";
import { encryptWithLast4 } from "@/lib/security/encryption";
import type { AppContext } from "@/lib/session";
import { aadhaarSchema, gstinSchema, mobileSchema, panSchema, tanSchema } from "@/lib/validation/identifiers";
import { audit } from "./audit";
import { hasFile, storeUpload } from "./files";
import { notifyRoles } from "./notifications";

// Full client registration by the firm (Clients → New client). Clients cannot
// register themselves: every client belongs to the firm whose staff created it.
// The client starts as PENDING_APPROVAL; an administrator activates it, and the
// client portal login is invited separately from the client's page.

const gstinList = z
  .string()
  .optional()
  .transform((s) => (s ? s.split(/[\s,]+/).map((x) => x.trim().toUpperCase()).filter(Boolean) : []))
  .pipe(z.array(gstinSchema).max(50))
  .refine((l) => new Set(l).size === l.length, "The same GSTIN is entered twice");

const personSchema = z.object({
  role: z.enum(["PROPRIETOR", "PARTNER", "DIRECTOR", "TRUSTEE", "KARTA", "MEMBER", "OTHER"]),
  fullName: z.string().trim().min(1, "Name is required").max(120),
  mobile: mobileSchema.optional().or(z.literal("").transform(() => undefined)),
  email: z.email().optional().or(z.literal("").transform(() => undefined)),
  address: z.string().max(500).optional(),
  pan: panSchema.optional().or(z.literal("").transform(() => undefined)),
  aadhaar: aadhaarSchema.optional().or(z.literal("").transform(() => undefined)),
});
type PersonInput = z.infer<typeof personSchema>;

/** The constitution's people (proprietor, partners, directors…), posted as a JSON array. */
export const peopleField = z
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
  .pipe(z.array(personSchema).max(30));

/** Checks the people's roles against the constitution; throws a BusinessRuleError when they do not fit. */
export async function assertRepresentatives(constitutionId: string, people: PersonInput[]) {
  const c = await prisma.constitution.findUnique({ where: { id: constitutionId }, select: { id: true, name: true, representativeRole: true, allowsMultiple: true } });
  if (!c) throw new BusinessRuleError("Select a valid constitution.");
  const wrong = people.find((p) => !isRepresentativeRoleAllowed(c.representativeRole, p.role));
  if (wrong) throw new BusinessRuleError(`${wrong.fullName} cannot be recorded as ${wrong.role.toLowerCase()} for a ${c.name}.`);
  if (exceedsSingleHolder(c, people.map((p) => p.role))) throw new BusinessRuleError(`A ${c.name} has only one ${c.representativeRole.toLowerCase()}.`);
}

/** Rows for constitution_members; `clientId` null records the firm's own people. Aadhaar is encrypted. */
export function representativeRows(organizationId: string, clientId: string | null, people: PersonInput[]) {
  return people.map((p, i) => {
    const a = p.aadhaar ? encryptWithLast4(p.aadhaar) : null;
    return {
      organizationId,
      clientId,
      role: p.role,
      fullName: p.fullName,
      mobile: p.mobile,
      email: p.email,
      address: p.address,
      pan: p.pan,
      aadhaarEncrypted: a?.encrypted,
      aadhaarLast4: a?.last4,
      sortOrder: i,
    };
  });
}

/** Full registration (multi-step form). People are sent as a JSON array. */
export const fullRegistrationSchema = z.object({
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
  contactEmail: z.email("Enter a valid email").transform((v) => v.toLowerCase()).optional(),
  contactDesignation: zOptionalText(120),
  people: peopleField,
  gstins: gstinList,
  "serviceIds[]": z.array(z.uuid()).default([]),
  isMsme: z.enum(["yes", "no"]).optional(),
  msmeRegistrationNumber: zOptionalText(40),
  esiNumber: zOptionalText(40),
  pfNumber: zOptionalText(40),
});

/** Creates the client in the signed-in member's firm, with its people, GSTINs, services and documents. */
export async function registerClient(ctx: AppContext, v: z.infer<typeof fullRegistrationSchema>, fd: FormData) {
  const organizationId = ctx.organization.id;
  if (v.gstins.length) {
    const dup = await prisma.clientGstRegistration.findFirst({ where: { gstin: { in: v.gstins }, client: { organizationId } }, select: { gstin: true, client: { select: { tradeName: true } } } });
    if (dup) throw new BusinessRuleError(`GSTIN ${dup.gstin} is already registered for ${dup.client.tradeName}.`);
  }
  const services = await prisma.service.findMany({ where: { id: { in: v["serviceIds[]"] }, organizationId, isActive: true }, select: { id: true } });
  if (v.primaryBusinessNatureId && !(await prisma.businessNature.findFirst({ where: { id: v.primaryBusinessNatureId, isActive: true }, select: { id: true } }))) {
    throw new BusinessRuleError("Select a valid nature of business.");
  }
  await assertRepresentatives(v.constitutionId, v.people);

  const client = await prisma.$transaction(
    async (tx) => {
      const count = await tx.client.count({ where: { organizationId } });
      const client = await tx.client.create({
        data: {
          organizationId,
          clientCode: `CL-${String(count + 1).padStart(3, "0")}`,
          tradeName: v.tradeName,
          legalName: v.legalName,
          address: v.address,
          pan: v.pan,
          tan: v.tan,
          constitutionId: v.constitutionId,
          natureOfClient: v.natureOfClient,
          primaryBusinessNatureId: v.primaryBusinessNatureId,
          isMsme: v.isMsme === undefined ? null : v.isMsme === "yes",
          msmeRegistrationNumber: v.msmeRegistrationNumber,
          esiNumber: v.esiNumber,
          pfNumber: v.pfNumber,
          status: "PENDING_APPROVAL",
          registrationChannel: "STAFF",
          createdById: ctx.user.id,
          submittedAt: new Date(),
          detailsCompletedAt: new Date(),
          gstRegistrations: { create: v.gstins.map((gstin) => ({ gstin })) },
          contacts: { create: { name: v.contactName, mobile: v.contactMobile, email: v.contactEmail, designation: v.contactDesignation, isPrimary: true } },
          services: { create: services.map((s) => ({ organizationId, serviceId: s.id, engagementNature: v.natureOfClient })) },
        },
      });
      if (v.people.length) await tx.constitutionMember.createMany({ data: representativeRows(organizationId, client.id, v.people) });
      await audit(tx, ctx, "client.registered_full", "client", client.id);
      await notifyRoles(tx, organizationId, ["OWNER", "ADMIN"], {
        type: "client.pending_approval",
        title: `New client awaiting approval: ${client.tradeName}`,
        body: "Full registration",
        link: `/app/clients/${client.id}`,
      }, ctx.user.id);
      return client;
    },
    { timeout: 30_000 },
  );

  // Documents are stored after the records exist; a failed upload never loses the registration itself.
  const updates: Record<string, string> = {};
  for (const [field, column] of [["msmeCertificate", "msmeCertificateFileId"], ["esiCertificate", "esiCertificateFileId"], ["pfCertificate", "pfCertificateFileId"], ["profilePicture", "profilePictureFileId"]] as const) {
    const f = fd.get(field);
    if (hasFile(f)) updates[column] = (await storeUpload(ctx, f, { area: "clients", ownerId: client.id, imagesOnly: field === "profilePicture" })).id;
  }
  if (Object.keys(updates).length) await prisma.client.update({ where: { id: client.id }, data: updates });
  for (const f of fd.getAll("certificates").slice(0, 10)) {
    if (!hasFile(f)) continue;
    const stored = await storeUpload(ctx, f, { area: "clients", ownerId: client.id });
    await prisma.clientDocument.create({ data: { clientId: client.id, fileId: stored.id, type: "REGISTRATION_CERTIFICATE", title: f.name.slice(0, 200) } });
  }
  return client;
}
