import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { GST_TYPE_KEYS, gstItemApplies, type GstType } from "@/lib/domain/gst-type";

// The departments a client is with, and the compliances of those departments that apply to it
// (client feedback: picking GST in client registration lists all of GST's compliances).

/** Departments with no statutory compliance of their own in the master list. */
export const EXTRA_DEPARTMENTS = ["Day Book"] as const;

export const clientComplianceFields = {
  "departments[]": z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  "complianceItemIds[]": z.array(z.uuid()).max(300).default([]),
  /** Regular / Composition / Surrendered: the GST compliances follow it. Absent = not shown on the form. */
  gstRegistrationType: z.enum(GST_TYPE_KEYS as [GstType, ...GstType[]]).optional(),
};

/** Compliances to choose from, and the departments in master-data order. */
export async function complianceChoices() {
  const items = await prisma.complianceItem.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, department: true, name: true, form: true, frequency: true, dueDateRule: true },
  });
  const departments = [...new Set([...items.map((i) => i.department), ...EXTRA_DEPARTMENTS])];
  return { items, departments };
}

/** Matches a department typed in a sheet ("income tax", "GST ") to the list. */
export function matchDepartment(text: string, departments: string[]) {
  const t = text.trim().toLowerCase();
  return departments.find((d) => d.toLowerCase() === t) ?? null;
}

/**
 * Replaces the client's departments and compliances. Only compliances of a chosen department
 * are kept, so unticking a department drops its compliances too.
 */
export async function saveClientCompliances(tx: Prisma.TransactionClient, clientId: string, departments: string[], itemIds: string[], gstType?: GstType | "") {
  const known = new Set((await complianceChoices()).departments);
  const depts = [...new Set(departments)].filter((d) => known.has(d));
  // The GST compliances follow the registration type (a composition dealer has no GSTR-1 / 3B, a
  // surrendered registration none at all). Without a type on the form, the saved type is kept.
  const type = gstType === undefined ? (await tx.client.findUnique({ where: { id: clientId }, select: { gstRegistrationType: true } }))?.gstRegistrationType as GstType | null : gstType || null;
  // A GSTIN with its own type (e.g. an ISD registration, tracker S.No. 100 / 107) brings its compliances too.
  const gstinTypes = (await tx.clientGstRegistration.findMany({ where: { clientId, registrationType: { not: null } }, select: { registrationType: true } })).map((g) => g.registrationType as GstType);
  const items = itemIds.length
    ? (await tx.complianceItem.findMany({ where: { id: { in: [...new Set(itemIds)] }, department: { in: depts } }, select: { id: true, department: true, name: true, form: true } })).filter((i) => gstItemApplies(type || gstinTypes.length ? [type, ...gstinTypes] : null, i))
    : [];
  await tx.client.update({ where: { id: clientId }, data: { departments: depts, ...(gstType !== undefined ? { gstRegistrationType: type } : {}) } });
  await tx.clientCompliance.deleteMany({ where: { clientId } });
  if (items.length) await tx.clientCompliance.createMany({ data: items.map((i) => ({ clientId, complianceItemId: i.id })), skipDuplicates: true });
  return { departments: depts.length, compliances: items.length };
}
