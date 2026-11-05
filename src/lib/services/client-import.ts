import "server-only";
import { prisma } from "@/lib/db";
import { BusinessRuleError } from "@/lib/actions";
import { constitutionCode, findHeaderRow, guessMapping, IMPORT_FIELDS, parseRow, type ColumnMapping, type ImportField, type RowResult } from "@/lib/domain/client-import";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { readFirstSheet, XlsxReadError } from "@/lib/xlsx";
import { audit } from "./audit";
import { nextCode } from "./codes";
import { notifyRoles } from "./notifications";

const MAX_ROWS = 2000;
const MAX_BYTES = 5 * 1024 * 1024;

export type ImportPreview = {
  header: string[];
  mapping: ColumnMapping;
  totalRows: number;
  ready: number;
  duplicates: number;
  failed: number;
  warnings: number;
  /** Problem rows first, then a sample, so nothing wrong stays hidden on a long sheet. */
  rows: (RowResult & { duplicateOf?: string })[];
};

async function rowsFromFile(file: File) {
  if (file.size > MAX_BYTES) throw new BusinessRuleError("The file is larger than 5 MB.");
  if (!/\.xlsx$/i.test(file.name)) throw new BusinessRuleError("Upload an Excel .xlsx file. In Excel: File → Save As → Excel Workbook (.xlsx).");
  try {
    const rows = readFirstSheet(new Uint8Array(await file.arrayBuffer()));
    if (rows.length < 2) throw new BusinessRuleError("No client rows were found on the first sheet.");
    return rows;
  } catch (e) {
    if (e instanceof XlsxReadError) throw new BusinessRuleError(e.message);
    throw e;
  }
}

function sanitizeMapping(raw: unknown, width: number, fallback: ColumnMapping): ColumnMapping {
  if (!Array.isArray(raw) || raw.length !== width) return fallback;
  const seen = new Set<string>();
  return raw.map((v) => {
    if (typeof v !== "string" || !(v in IMPORT_FIELDS) || seen.has(v)) return "";
    seen.add(v);
    return v as ImportField;
  });
}

async function analyse(ctx: AppContext, file: File, requestedMapping?: unknown) {
  const all = await rowsFromFile(file);
  const headerAt = findHeaderRow(all);
  const header = all[headerAt].map((h) => h.trim());
  const body = all.slice(headerAt + 1);
  if (body.length > MAX_ROWS) throw new BusinessRuleError(`The sheet has ${body.length} rows; import up to ${MAX_ROWS} at a time.`);
  const mapping = sanitizeMapping(requestedMapping, header.length, guessMapping(header));
  if (!mapping.includes("tradeName")) {
    return { header, mapping, results: body.map((r, i) => ({ ...parseRow(r, mapping, headerAt + 2 + i) })), existing: null };
  }

  const results: (RowResult & { duplicateOf?: string })[] = body.map((r, i) => parseRow(r, mapping, headerAt + 2 + i));

  // Duplicates: against this firm's clients, and within the sheet itself.
  const existing = await prisma.client.findMany({
    where: { organizationId: ctx.organization.id },
    select: { tradeName: true, clientCode: true, pan: true, gstRegistrations: { select: { gstin: true } } },
  });
  const byName = new Map(existing.map((c) => [c.tradeName.trim().toLowerCase(), c.tradeName]));
  const byCode = new Map(existing.filter((c) => c.clientCode).map((c) => [c.clientCode!.toLowerCase(), c.tradeName]));
  const byPan = new Map(existing.filter((c) => c.pan).map((c) => [c.pan!, c.tradeName]));
  const byGstin = new Map(existing.flatMap((c) => c.gstRegistrations.map((g) => [g.gstin, c.tradeName] as const)));

  for (const r of results) {
    if (r.errors.length) continue;
    const v = r.values;
    const nameKey = v.tradeName!.trim().toLowerCase();
    const match = byName.get(nameKey) ?? (v.clientCode ? byCode.get(v.clientCode.toLowerCase()) : undefined) ?? (v.pan ? byPan.get(v.pan) : undefined) ?? v.gstins.map((g) => byGstin.get(g)).find(Boolean);
    if (match) {
      r.duplicateOf = match;
      continue;
    }
    byName.set(nameKey, v.tradeName!);
    if (v.clientCode) byCode.set(v.clientCode.toLowerCase(), v.tradeName!);
    if (v.pan) byPan.set(v.pan, v.tradeName!);
    for (const g of v.gstins) byGstin.set(g, v.tradeName!);
  }
  return { header, mapping, results, existing };
}

export async function previewClientImport(ctx: AppContext, file: File, requestedMapping?: unknown): Promise<ImportPreview> {
  const { header, mapping, results } = await analyse(ctx, file, requestedMapping);
  const failed = results.filter((r) => r.errors.length);
  const duplicates = results.filter((r) => (r as { duplicateOf?: string }).duplicateOf);
  const warned = results.filter((r) => r.warnings.length);
  const problems = [...failed, ...duplicates, ...warned];
  const clean = results.filter((r) => !problems.includes(r));
  const rows = [...new Set([...problems, ...clean])].slice(0, 200);
  return { header, mapping, totalRows: results.length, ready: results.length - failed.length - duplicates.length, duplicates: duplicates.length, failed: failed.length, warnings: warned.length, rows };
}

const statusOf = (raw: string | undefined, canApprove: boolean, wantsActive: boolean) => {
  if (!canApprove || !wantsActive) return "PENDING_APPROVAL" as const;
  const s = (raw ?? "active").trim().toLowerCase();
  if (s.startsWith("hold") || s === "on hold") return "ON_HOLD" as const;
  if (s.startsWith("discontinued") || s.startsWith("inactive")) return "INACTIVE" as const;
  return "ACTIVE" as const;
};

/**
 * Creates every clean row. Duplicates and rows with errors are skipped and reported,
 * never overwritten. New clients await approval unless an approver asks to activate them.
 */
export async function runClientImport(ctx: AppContext, file: File, requestedMapping: unknown, activate: boolean) {
  const { results } = await analyse(ctx, file, requestedMapping);
  const organizationId = ctx.organization.id;
  const canApprove = can(ctx, "clients.approve");
  const toCreate = results.filter((r) => !r.errors.length && !(r as { duplicateOf?: string }).duplicateOf);
  if (!toCreate.length) throw new BusinessRuleError("There is nothing new to import: every row is a duplicate or has an error.");

  const [constitutions, natures, options, services, usedCodes] = await Promise.all([
    prisma.constitution.findMany({ select: { id: true, code: true, name: true } }),
    prisma.businessNature.findMany({ where: { isActive: true }, select: { id: true, label: true } }),
    prisma.classificationOption.findMany({ where: { basis: { in: ["PLACE_OF_WORK", "BILLING_BASIS"] }, isActive: true }, select: { id: true, basis: true, label: true } }),
    prisma.service.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { organizationId }, select: { clientCode: true } }),
  ]);
  const norm = (s: string) => s.trim().toLowerCase();
  const constitutionId = (text?: string) => {
    if (!text) return undefined;
    const code = constitutionCode(text);
    return (constitutions.find((c) => c.code === code) ?? constitutions.find((c) => norm(c.name) === norm(text)))?.id;
  };
  const natureId = (text?: string) => (text ? natures.find((n) => norm(n.label) === norm(text))?.id : undefined);
  const optionId = (basis: string, text?: string) => {
    if (!text) return undefined;
    const t = norm(text);
    return options.find((o) => o.basis === basis && (norm(o.label) === t || norm(o.label).startsWith(t)))?.id;
  };
  const codes = usedCodes.map((c) => c.clientCode);
  const takenCodes = new Set(codes.filter(Boolean).map((c) => c!.toLowerCase()));

  let created = 0;
  const failures: { row: number; message: string }[] = [];
  for (const r of toCreate) {
    const v = r.values;
    let clientCode = v.clientCode && !takenCodes.has(v.clientCode.toLowerCase()) ? v.clientCode : nextCode("CL", codes);
    if (takenCodes.has(clientCode.toLowerCase())) clientCode = nextCode("CL", codes);
    codes.push(clientCode);
    takenCodes.add(clientCode.toLowerCase());
    const status = statusOf(v.status, canApprove, activate);
    const place = optionId("PLACE_OF_WORK", v.placeOfWork);
    const billing = optionId("BILLING_BASIS", v.billingBasis);
    const wantedServices = (v.services ?? "").split(/[,;\n]+/).map(norm).filter(Boolean);
    const matchedServices = services.filter((s) => wantedServices.some((w) => norm(s.name) === w || norm(s.name).startsWith(w) || w.startsWith(norm(s.name))));
    const fee = v.fee ? Number(v.fee) : undefined;
    try {
      await prisma.$transaction(async (tx) => {
        const client = await tx.client.create({
          data: {
            organizationId,
            clientCode,
            tradeName: v.tradeName!.slice(0, 200),
            legalName: v.legalName?.slice(0, 200),
            address: v.address?.slice(0, 1000),
            pan: v.pan,
            tan: v.tan,
            constitutionId: constitutionId(v.constitution),
            primaryBusinessNatureId: natureId(v.businessNature),
            status,
            registrationChannel: "STAFF",
            createdById: ctx.user.id,
            submittedAt: new Date(),
            approvedAt: status === "PENDING_APPROVAL" ? null : new Date(),
            approvedById: status === "PENDING_APPROVAL" ? null : ctx.user.id,
            gstRegistrations: { create: v.gstins.map((gstin) => ({ gstin })) },
            contacts: v.contactName || v.contactMobile || v.contactEmail
              ? { create: { name: (v.contactName ?? v.tradeName!).slice(0, 120), mobile: v.contactMobile, email: v.contactEmail, isPrimary: true } }
              : undefined,
            services: { create: matchedServices.map((s) => ({ organizationId, serviceId: s.id, agreedFee: fee })) },
            classifications: {
              create: [
                ...(place ? [{ basis: "PLACE_OF_WORK" as const, optionId: place }] : []),
                ...(billing ? [{ basis: "BILLING_BASIS" as const, optionId: billing }] : []),
              ],
            },
          },
        });
        await audit(tx, ctx, "client.imported", "client", client.id);
      });
      created++;
    } catch {
      failures.push({ row: r.row, message: `Row ${r.row} (${v.tradeName}) could not be saved` });
    }
  }
  if (created > 0 && !canApprove || (created > 0 && !activate)) {
    await prisma.$transaction((tx) =>
      notifyRoles(tx, organizationId, ["OWNER", "ADMIN"], { type: "client.pending_approval", title: `${created} imported clients await approval`, link: "/app/clients/approvals" }, ctx.user.id),
    );
  }
  const skipped = results.length - toCreate.length;
  return { created, skipped, failures };
}
