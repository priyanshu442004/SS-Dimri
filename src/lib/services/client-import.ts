import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { BusinessRuleError } from "@/lib/actions";
import { dateOnly } from "@/lib/dates";
import {
  constitutionCode, EXTRA_COLUMN, findHeaderRow, guessMapping, IMPORT_FIELDS, mergeRowsByPan, parseRow, SECRET_FIELDS,
  type ColumnMapping, type ImportField, type MergedRow, type ParsedClient,
} from "@/lib/domain/client-import";
import { can } from "@/lib/permissions";
import { encryptField } from "@/lib/security/encryption";
import type { AppContext } from "@/lib/session";
import { readTableFile, TableFileError } from "@/lib/table-file";
import { audit } from "./audit";
import { complianceChoices, matchDepartment } from "./client-compliances";
import { nextCode } from "./codes";
import { notifyRoles } from "./notifications";

const MAX_ROWS = 2000;

type Analysed = MergedRow & { duplicateOf?: string; existingId?: string; isFirm?: boolean };

export type ImportPreview = {
  header: string[];
  mapping: ColumnMapping;
  totalRows: number;
  /** New clients that will be created. */
  ready: number;
  /** Rows folded into another row of the same PAN (several GSTINs of one client). */
  merged: number;
  duplicates: number;
  failed: number;
  warnings: number;
  /** Problem rows first, then a sample, so nothing wrong stays hidden on a long sheet. Passwords are never included. */
  rows: Analysed[];
};

async function rowsFromFile(file: File) {
  try {
    // The firm's workbook has the clients on the "Client Master" tab; otherwise the first sheet.
    return await readTableFile(file, { preferSheet: /^client/i, what: "client" });
  } catch (e) {
    if (e instanceof TableFileError) throw new BusinessRuleError(e.message);
    throw e;
  }
}

function sanitizeMapping(raw: unknown, width: number, fallback: ColumnMapping): ColumnMapping {
  if (!Array.isArray(raw) || raw.length !== width) return fallback;
  const seen = new Set<string>();
  return raw.map((v) => {
    if (v === EXTRA_COLUMN) return EXTRA_COLUMN;
    if (typeof v !== "string" || !(v in IMPORT_FIELDS) || seen.has(v)) return "";
    seen.add(v);
    return v as ImportField;
  });
}

const bareName = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "");

async function analyse(ctx: AppContext, file: File, requestedMapping?: unknown) {
  const numbered = await rowsFromFile(file);
  const all = numbered.map((r) => r.cells);
  const headerAt = findHeaderRow(all);
  const header = all[headerAt].map((h) => h.trim());
  // Row numbers are Excel's own, so "row 7" in the preview is row 7 in the sheet.
  const bodyRows = numbered.slice(headerAt + 1).filter((r) => r.cells.some((c) => c.trim()));
  const body = bodyRows.map((r) => r.cells);
  if (body.length > MAX_ROWS) throw new BusinessRuleError(`The sheet has ${body.length} rows; import up to ${MAX_ROWS} at a time.`);
  const mapping = sanitizeMapping(requestedMapping, header.length, guessMapping(header));
  const parsed = body.map((r, i) => parseRow(r, mapping, bodyRows[i].n, header));
  if (!mapping.includes("tradeName")) return { header, mapping, results: parsed as Analysed[] };

  const results: Analysed[] = mergeRowsByPan(parsed);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { tradeName: true, legalName: true, pan: true, tan: true } });
  const firmNames = new Set([org.tradeName, org.legalName].filter((x): x is string => !!x).map(bareName));

  // Already registered: same client code, PAN or GSTIN; by name only when the row has no PAN
  // (two clients may share a name, e.g. "4th Avenue" with two PANs).
  const existing = await prisma.client.findMany({
    where: { organizationId: ctx.organization.id },
    select: { id: true, tradeName: true, clientCode: true, pan: true, gstRegistrations: { select: { gstin: true } } },
  });
  const byCode = new Map(existing.filter((c) => c.clientCode).map((c) => [c.clientCode!.toLowerCase(), c]));
  const byPan = new Map(existing.filter((c) => c.pan).map((c) => [c.pan!, c]));
  const byGstin = new Map(existing.flatMap((c) => c.gstRegistrations.map((g) => [g.gstin, c] as const)));
  const byName = new Map<string, typeof existing>();
  for (const c of existing) byName.set(c.tradeName.trim().toLowerCase(), [...(byName.get(c.tradeName.trim().toLowerCase()) ?? []), c]);

  // The firm's own TAN: saved on the firm, or on the sheet's row with the firm's PAN. A row with that
  // TAN and no PAN of its own is the firm as a TDS deductor (e.g. "Sunil Dimri" in the Client Master).
  const firmTans = new Set([org.tan, ...results.filter((r) => org.pan && r.values.pan === org.pan).map((r) => r.values.tan)].filter((t): t is string => !!t).map((t) => t.toUpperCase()));
  for (const r of results) {
    if (r.errors.length || r.mergedInto) continue;
    const v = r.values;
    if ((v.pan && org.pan && v.pan === org.pan) || (!v.pan && v.tan && firmTans.has(v.tan)) || firmNames.has(bareName(v.tradeName ?? ""))) {
      r.isFirm = true;
      r.errors.push("This row is the firm itself, not a client");
      continue;
    }
    const sameName = !v.pan ? byName.get(v.tradeName!.trim().toLowerCase()) : undefined;
    const match = (v.clientCode ? byCode.get(v.clientCode.toLowerCase()) : undefined)
      ?? (v.pan ? byPan.get(v.pan) : undefined)
      ?? v.gstins.map((g) => byGstin.get(g)).find(Boolean)
      ?? (sameName?.length === 1 ? sameName[0] : undefined);
    if (match) {
      r.duplicateOf = match.tradeName;
      r.existingId = match.id;
    }
  }
  return { header, mapping, results };
}

/** What the browser may see of a row: no passwords. */
function forBrowser(r: Analysed): Analysed {
  const values = { ...r.values };
  for (const f of SECRET_FIELDS) if (values[f]) values[f] = "••••";
  return { ...r, values };
}

export async function previewClientImport(ctx: AppContext, file: File, requestedMapping?: unknown): Promise<ImportPreview> {
  const { header, mapping, results } = await analyse(ctx, file, requestedMapping);
  const failed = results.filter((r) => r.errors.length);
  const merged = results.filter((r) => !r.errors.length && r.mergedInto);
  const duplicates = results.filter((r) => !r.errors.length && !r.mergedInto && r.duplicateOf);
  const warned = results.filter((r) => r.warnings.length);
  const problems = new Set([...failed, ...duplicates, ...warned, ...merged]);
  const clean = results.filter((r) => !problems.has(r));
  const rows = [...problems, ...clean].slice(0, 300).map(forBrowser);
  return {
    header, mapping, totalRows: results.length,
    ready: results.length - failed.length - merged.length - duplicates.length,
    merged: merged.length, duplicates: duplicates.length, failed: failed.length, warnings: warned.length, rows,
  };
}

const statusOf = (raw: string | undefined, canApprove: boolean, wantsActive: boolean) => {
  if (!canApprove || !wantsActive) return "PENDING_APPROVAL" as const;
  const s = (raw ?? "active").trim().toLowerCase();
  if (s.startsWith("hold") || s === "on hold") return "ON_HOLD" as const;
  if (s.startsWith("discontinued") || s.startsWith("inactive")) return "INACTIVE" as const;
  return "ACTIVE" as const;
};

const secret = (v?: string) => (v ? encryptField(v) : undefined);

/** Client Master columns that are plain values on the client. */
function masterData(v: ParsedClient) {
  return {
    state: v.state?.slice(0, 60),
    dateOfBirth: v.dateOfBirth ? dateOnly(v.dateOfBirth) : undefined,
    itFileNo: v.itFileNo?.slice(0, 40),
    masterRemark: v.remark?.slice(0, 1000),
    gstUserId: v.gstUserId?.slice(0, 120),
    incomeTaxUserId: v.incomeTaxUserId?.slice(0, 120),
    tracesUserId: v.tracesUserId?.slice(0, 120),
    gstPasswordEncrypted: secret(v.gstPassword),
    incomeTaxPasswordEncrypted: secret(v.incomeTaxPassword),
    tracesPasswordEncrypted: secret(v.tracesPassword),
    extraFields: v.extra && Object.keys(v.extra).length ? v.extra : undefined,
  };
}

/** Runs `fn` over items a few at a time: fast on a remote database, gentle on its connections. */
async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/**
 * Creates every new client (rows of the same PAN become one client with all its GSTINs). Rows
 * matching a registered client are skipped, or, when asked, only fill in what that client is
 * missing: values already saved are never overwritten. New clients await approval unless an
 * approver asks to activate them. Departments tick all of that department's compliances.
 */
export async function runClientImport(ctx: AppContext, file: File, requestedMapping: unknown, activate: boolean, fillMissing = false) {
  const { results } = await analyse(ctx, file, requestedMapping);
  const organizationId = ctx.organization.id;
  const canApprove = can(ctx, "clients.approve");
  const toCreate = results.filter((r) => !r.errors.length && !r.mergedInto && !r.duplicateOf);
  const toFill = fillMissing ? results.filter((r) => !r.errors.length && !r.mergedInto && r.existingId) : [];
  if (!toCreate.length && !toFill.length) throw new BusinessRuleError("There is nothing new to import: every row is already registered, merged or has an error.");

  const [constitutions, natures, options, services, usedCodes, choices] = await Promise.all([
    prisma.constitution.findMany({ select: { id: true, code: true, name: true } }),
    prisma.businessNature.findMany({ where: { isActive: true }, select: { id: true, label: true } }),
    prisma.classificationOption.findMany({ where: { basis: { in: ["PLACE_OF_WORK", "BILLING_BASIS"] }, isActive: true }, select: { id: true, basis: true, label: true } }),
    prisma.service.findMany({ where: { organizationId, isActive: true }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { organizationId }, select: { clientCode: true } }),
    complianceChoices(),
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
  const departmentsOf = (v: ParsedClient) => [...new Set(v.departmentList.map((d) => matchDepartment(d, choices.departments)).filter((d): d is string => !!d))];
  const complianceIds = (depts: string[]) => choices.items.filter((i) => depts.includes(i.department)).map((i) => i.id);
  const codes = usedCodes.map((c) => c.clientCode);
  const takenCodes = new Set(codes.filter(Boolean).map((c) => c!.toLowerCase()));

  // Codes are handed out before saving in parallel, so none is given twice.
  const planned = toCreate.map((r) => {
    const v = r.values;
    let clientCode = v.clientCode && !takenCodes.has(v.clientCode.toLowerCase()) ? v.clientCode : nextCode("CL", codes);
    if (takenCodes.has(clientCode.toLowerCase())) clientCode = nextCode("CL", codes);
    codes.push(clientCode);
    takenCodes.add(clientCode.toLowerCase());
    return { r, clientCode };
  });

  let created = 0;
  let filled = 0;
  const failures: { row: number; message: string }[] = [];
  await inBatches(planned, 6, async ({ r, clientCode }) => {
    const v = r.values;
    const status = statusOf(v.status, canApprove, activate);
    const place = optionId("PLACE_OF_WORK", v.placeOfWork);
    const billing = optionId("BILLING_BASIS", v.billingBasis);
    const wantedServices = (v.services ?? "").split(/[,;\n]+/).map(norm).filter(Boolean);
    const matchedServices = services.filter((s) => wantedServices.some((w) => norm(s.name) === w || norm(s.name).startsWith(w) || w.startsWith(norm(s.name))));
    const fee = v.fee ? Number(v.fee) : undefined;
    const depts = departmentsOf(v);
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
            ...masterData(v),
            departments: depts,
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
            compliances: { create: complianceIds(depts).map((complianceItemId) => ({ complianceItemId })) },
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
  });

  await inBatches(toFill, 6, async (r) => {
    try {
      if (await fillClient(ctx, r.existingId!, r.values, departmentsOf(r.values), complianceIds, constitutionId(r.values.constitution))) filled++;
    } catch {
      failures.push({ row: r.row, message: `Row ${r.row} (${r.values.tradeName}): the registered client could not be updated` });
    }
  });

  if (created > 0 && (!canApprove || !activate)) {
    await prisma.$transaction((tx) =>
      notifyRoles(tx, organizationId, ["OWNER", "ADMIN"], { type: "client.pending_approval", title: `${created} imported clients await approval`, link: "/app/clients/approvals" }, ctx.user.id),
    );
  }
  failures.sort((a, b) => a.row - b.row);
  const merged = results.filter((r) => !r.errors.length && r.mergedInto).length;
  return { created, filled, merged, skipped: results.length - created - filled - merged, failures };
}

/** Adds GSTINs, departments and any value the registered client does not have yet. Never overwrites. */
async function fillClient(ctx: AppContext, clientId: string, v: ParsedClient, depts: string[], complianceIds: (d: string[]) => string[], constitution?: string) {
  const c = await prisma.client.findFirst({
    where: { id: clientId, organizationId: ctx.organization.id },
    include: { gstRegistrations: { select: { gstin: true } }, compliances: { select: { complianceItemId: true } } },
  });
  if (!c) return false;
  const data: Prisma.ClientUpdateInput = {};
  const master = masterData(v);
  const blank = <K extends keyof typeof c>(k: K) => c[k] === null || c[k] === undefined || c[k] === "";
  const { extraFields, ...plain } = master;
  for (const [k, val] of Object.entries({ legalName: v.legalName?.slice(0, 200), address: v.address?.slice(0, 1000), pan: v.pan, tan: v.tan, ...plain })) {
    if (val !== undefined && blank(k as keyof typeof c)) (data as Record<string, unknown>)[k] = val;
  }
  // Extra columns: add the ones the client does not have yet; saved ones are kept.
  const savedExtra = (c.extraFields && typeof c.extraFields === "object" && !Array.isArray(c.extraFields) ? c.extraFields : {}) as Record<string, string>;
  const newExtra = Object.entries(extraFields ?? {}).filter(([k]) => !(k in savedExtra));
  if (newExtra.length) data.extraFields = { ...savedExtra, ...Object.fromEntries(newExtra) };
  if (constitution && !c.constitutionId) data.constitution = { connect: { id: constitution } };
  const newDepts = depts.filter((d) => !c.departments.includes(d));
  if (newDepts.length) data.departments = [...c.departments, ...newDepts];
  const gstins = v.gstins.filter((g) => !c.gstRegistrations.some((x) => x.gstin === g));
  const have = new Set(c.compliances.map((x) => x.complianceItemId));
  const addItems = complianceIds(newDepts).filter((id) => !have.has(id));
  if (!Object.keys(data).length && !gstins.length && !addItems.length) return false;
  await prisma.$transaction(async (tx) => {
    // A GSTIN already on another client of the firm is left alone.
    const taken = gstins.length ? await tx.clientGstRegistration.findMany({ where: { gstin: { in: gstins }, client: { organizationId: ctx.organization.id } }, select: { gstin: true } }) : [];
    const free = gstins.filter((g) => !taken.some((t) => t.gstin === g));
    await tx.client.update({
      where: { id: c.id },
      data: {
        ...data,
        ...(free.length ? { gstRegistrations: { create: free.map((gstin) => ({ gstin })) } } : {}),
        ...(addItems.length ? { compliances: { create: addItems.map((complianceItemId) => ({ complianceItemId })) } } : {}),
      },
    });
    await audit(tx, ctx, "client.import_filled", "client", c.id, { fields: Object.keys(data), gstins: free.length });
  });
  return true;
}
