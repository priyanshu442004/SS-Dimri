import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError, zIsoDate, zOptionalText } from "@/lib/actions";
import { dateOnly, formatDate } from "@/lib/dates";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { audit } from "./audit";
import { notifyEmployees } from "./notifications";

// Fixed Assets Register and asset allocation (tracker S.No. 89, 90, 21 Nov 2026): the firm's own office
// assets (laptops, desktops, printers, mobiles, furniture …), who has each one (issue / return with the
// condition), the history of every asset, and the assets each person holds — shown to the person and on
// the employee page, so nothing is missed when someone leaves (Ex-Employee process).

export const ASSET_CATEGORIES = ["Laptop", "Desktop", "Monitor", "Printer / scanner", "Mobile phone", "Tablet", "Networking", "Furniture", "Air conditioner", "Software licence", "Other"] as const;
export const ASSET_CONDITIONS = { NEW: "New", GOOD: "Good", FAIR: "Fair", POOR: "Poor", DAMAGED: "Damaged" } as const;
export const ASSET_STATUSES = { IN_STOCK: "In stock", ISSUED: "Issued", UNDER_REPAIR: "Under repair", DISPOSED: "Disposed" } as const;
const conditions = Object.keys(ASSET_CONDITIONS) as [keyof typeof ASSET_CONDITIONS, ...(keyof typeof ASSET_CONDITIONS)[]];

const assertManage = (ctx: AppContext) => { if (!can(ctx, "assets.manage")) throw new BusinessRuleError("Only an administrator can change the assets register."); };

export const assetSchema = z.object({
  code: z.string({ error: "Enter the asset code" }).trim().min(1, "Enter the asset code").max(40),
  description: z.string({ error: "Describe the asset" }).trim().min(2, "Describe the asset").max(300),
  category: z.enum(ASSET_CATEGORIES).optional(),
  serialNo: zOptionalText(120),
  purchaseDate: zIsoDate.optional(),
  vendor: zOptionalText(200),
  cost: z.coerce.number().min(0).max(100_000_000).optional(),
  location: zOptionalText(200),
  condition: z.enum(conditions).optional(),
  status: z.enum(["IN_STOCK", "UNDER_REPAIR", "DISPOSED"]).optional(),
  notes: zOptionalText(1000),
});

export type SparePart = { name: string; issuedOn: string };

/**
 * Spare parts from the asset form's repeating rows ("spareName" / "spareDate", client feedback
 * 26 Nov 2026). Fully blank rows are dropped; a half-filled row is an error, not silently lost.
 */
export function parseSpareParts(fd: FormData): { parts: SparePart[] } | { error: string } {
  const names = fd.getAll("spareName").map((x) => String(x).trim());
  const dates = fd.getAll("spareDate").map((x) => String(x).trim());
  const parts: SparePart[] = [];
  for (let i = 0; i < Math.max(names.length, dates.length); i++) {
    const name = names[i] ?? "", date = dates[i] ?? "";
    if (!name && !date) continue;
    if (!name) return { error: `Spare part row ${i + 1}: enter the spare part.` };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: `Spare part row ${i + 1} (${name}): enter the issue date.` };
    if (name.length > 200) return { error: `Spare part row ${i + 1}: keep the name under 200 characters.` };
    parts.push({ name, issuedOn: date });
  }
  if (parts.length > 100) return { error: "At most 100 spare parts per asset." };
  return { parts };
}

export async function saveAsset(ctx: AppContext, v: z.infer<typeof assetSchema>, id?: string, spareParts?: SparePart[]) {
  assertManage(ctx);
  const clash = await prisma.officeAsset.findFirst({ where: { organizationId: ctx.organization.id, code: v.code, ...(id ? { id: { not: id } } : {}) }, select: { id: true } });
  if (clash) throw new BusinessRuleError(`Asset code ${v.code} is already used.`);
  const data = {
    code: v.code, description: v.description, category: v.category ?? null, serialNo: v.serialNo ?? null,
    purchaseDate: v.purchaseDate ? dateOnly(v.purchaseDate) : null, vendor: v.vendor ?? null, cost: v.cost ?? null,
    location: v.location ?? null, condition: v.condition ?? null, notes: v.notes ?? null,
  };
  return prisma.$transaction(async (tx) => {
    if (id) {
      const a = await tx.officeAsset.findFirst({ where: { id, organizationId: ctx.organization.id } });
      if (!a) throw new BusinessRuleError("Asset not found.");
      // An issued asset stays "Issued" until it is returned.
      await tx.officeAsset.update({ where: { id }, data: { ...data, ...(a.status !== "ISSUED" && v.status ? { status: v.status } : {}) } });
      if (spareParts) await replaceSpareParts(tx, id, spareParts);
      await audit(tx, ctx, "asset.updated", "asset", id);
      return id;
    }
    const a = await tx.officeAsset.create({ data: { ...data, organizationId: ctx.organization.id, status: v.status ?? "IN_STOCK" } });
    if (spareParts?.length) await replaceSpareParts(tx, a.id, spareParts);
    await audit(tx, ctx, "asset.added", "asset", a.id);
    return a.id;
  });
}

/** The form shows every spare part, so what it sends is the asset's full list. */
async function replaceSpareParts(tx: Prisma.TransactionClient, assetId: string, parts: SparePart[]) {
  await tx.assetSparePart.deleteMany({ where: { assetId } });
  if (parts.length) await tx.assetSparePart.createMany({ data: parts.map((p, i) => ({ assetId, name: p.name, issuedOn: dateOnly(p.issuedOn), sortOrder: i })) });
}

export const issueSchema = z.object({ employeeId: z.uuid("Select the team member"), issuedOn: zIsoDate, issueCondition: z.enum(conditions).optional(), notes: zOptionalText(500) });

export async function issueAsset(ctx: AppContext, assetId: string, v: z.infer<typeof issueSchema>) {
  assertManage(ctx);
  const [a, emp] = await Promise.all([
    prisma.officeAsset.findFirst({ where: { id: assetId, organizationId: ctx.organization.id } }),
    prisma.employee.findFirst({ where: { id: v.employeeId, organizationId: ctx.organization.id, employmentStatus: { not: "EXITED" } }, select: { id: true, firstName: true } }),
  ]);
  if (!a) throw new BusinessRuleError("Asset not found.");
  if (!emp) throw new BusinessRuleError("Team member not found (or has left).");
  if (a.status === "ISSUED") throw new BusinessRuleError("This asset is already issued. Take it back first.");
  if (a.status === "DISPOSED") throw new BusinessRuleError("This asset is disposed.");
  await prisma.$transaction(async (tx) => {
    const res = await tx.officeAsset.updateMany({ where: { id: a.id, status: a.status }, data: { status: "ISSUED", condition: v.issueCondition ?? a.condition } });
    if (res.count !== 1) throw new BusinessRuleError("The asset was changed by someone else. Refresh the page.");
    await tx.assetIssue.create({ data: { assetId: a.id, employeeId: emp.id, issuedOn: dateOnly(v.issuedOn), issueCondition: v.issueCondition ?? a.condition, notes: v.notes } });
    await audit(tx, ctx, "asset.issued", "asset", a.id, { employeeId: emp.id });
    await notifyEmployees(tx, ctx.organization.id, [emp.id], { type: "asset.issued", title: `Asset issued to you: ${a.description} (${a.code})`, body: `From ${formatDate(dateOnly(v.issuedOn))}`, link: "/app/assets?tab=mine" });
  });
  return emp.firstName;
}

export const returnSchema = z.object({ returnedOn: zIsoDate, returnCondition: z.enum(conditions).optional(), notes: zOptionalText(500) });

export async function returnAsset(ctx: AppContext, assetId: string, v: z.infer<typeof returnSchema>) {
  assertManage(ctx);
  const open = await prisma.assetIssue.findFirst({ where: { assetId, returnedOn: null, asset: { organizationId: ctx.organization.id } }, include: { asset: true } });
  if (!open) throw new BusinessRuleError("This asset is not issued to anyone.");
  if (dateOnly(v.returnedOn) < open.issuedOn) throw new BusinessRuleError("The return date is before the issue date.");
  await prisma.$transaction(async (tx) => {
    await tx.assetIssue.update({ where: { id: open.id }, data: { returnedOn: dateOnly(v.returnedOn), returnCondition: v.returnCondition, notes: [open.notes, v.notes].filter(Boolean).join(" · ") || null } });
    await tx.officeAsset.update({ where: { id: assetId }, data: { status: v.returnCondition === "DAMAGED" ? "UNDER_REPAIR" : "IN_STOCK", condition: v.returnCondition ?? open.asset.condition } });
    await audit(tx, ctx, "asset.returned", "asset", assetId, { employeeId: open.employeeId });
  });
}

export async function deleteAsset(ctx: AppContext, id: string) {
  assertManage(ctx);
  const a = await prisma.officeAsset.findFirst({ where: { id, organizationId: ctx.organization.id }, include: { _count: { select: { issues: true } } } });
  if (!a) throw new BusinessRuleError("Asset not found.");
  if (a._count.issues) throw new BusinessRuleError("This asset has an issue history. Mark it Disposed instead of removing it.");
  await prisma.$transaction(async (tx) => {
    await tx.officeAsset.delete({ where: { id } });
    await audit(tx, ctx, "asset.removed", "asset", id);
  });
}

export type AssetFilters = { q: string; status: string; category: string };
export function parseAssetFilters(sp: Record<string, unknown>): AssetFilters {
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return { q: s(sp.q).slice(0, 80), status: s(sp.status) in ASSET_STATUSES ? s(sp.status) : "", category: (ASSET_CATEGORIES as readonly string[]).includes(s(sp.category)) ? s(sp.category) : "" };
}

/** The register with who holds each issued asset. */
export async function assetRegister(organizationId: string, f: AssetFilters) {
  const where: Prisma.OfficeAssetWhereInput = {
    organizationId,
    ...(f.status ? { status: f.status } : {}),
    ...(f.category ? { category: f.category } : {}),
    ...(f.q ? { OR: [{ code: { contains: f.q, mode: "insensitive" } }, { description: { contains: f.q, mode: "insensitive" } }, { serialNo: { contains: f.q, mode: "insensitive" } }, { issues: { some: { returnedOn: null, employee: { OR: [{ firstName: { contains: f.q, mode: "insensitive" } }, { lastName: { contains: f.q, mode: "insensitive" } }] } } } }] } : {}),
  };
  return prisma.officeAsset.findMany({
    where, orderBy: { code: "asc" }, take: 2000,
    include: {
      issues: { orderBy: { issuedOn: "desc" }, include: { employee: { select: { id: true, firstName: true, lastName: true } } } },
      spareParts: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
}

/** Assets a person holds now (and returned ones), for "My assets", the employee page and the exit check. */
export async function assetsOf(employeeId: string) {
  return prisma.assetIssue.findMany({
    where: { employeeId },
    orderBy: [{ returnedOn: { sort: "asc", nulls: "first" } }, { issuedOn: "desc" }],
    include: { asset: { select: { code: true, description: true, category: true, serialNo: true } } },
  });
}
