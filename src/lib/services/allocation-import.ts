import "server-only";
import { prisma } from "@/lib/db";
import { BusinessRuleError } from "@/lib/actions";
import { dateOnly, formatDate, isoDateInTz } from "@/lib/dates";
import { capacityFromPolicy, findConflicts, formatHours, type AllocationSpan, type DayCapacity } from "@/lib/domain/allocation";
import {
  ALLOCATION_FIELDS, EXTRA_COLUMN, exactKey, findAllocationHeaderRow, guessAllocationMapping, matchName, nameKey, parseAllocationRow,
  type AllocationField, type AllocationMapping, type AllocationRowResult, type NameCandidate,
} from "@/lib/domain/allocation-import";
import type { AppContext } from "@/lib/session";
import { readTableFile, TableFileError } from "@/lib/table-file";
import { getPolicy } from "./attendance";
import { allocationSpans, allocationStatusFor } from "./allocations";
import { audit } from "./audit";
import { notifyEmployees } from "./notifications";

// Team Allocation import: read the sheet, match clients and team members by name, check every
// row (duplicates, clashes, the sheet's own rules) and show the result before anything is saved.

const MAX_ROWS = 1000;

export type AllocationOutcome = "ready" | "duplicate" | "clash" | "error";
export type AnalysedAllocation = AllocationRowResult & {
  outcome: AllocationOutcome;
  /** Why a row is a duplicate or clashes. */
  note?: string;
  clientId?: string;
  clientLabel?: string;
  employeeId?: string;
  employeeLabel?: string;
  reportsToId?: string;
  teamLeaderId?: string;
  status?: "ACTIVE" | "PLANNED" | "ENDED";
};

export type AllocationImportPreview = {
  header: string[];
  mapping: AllocationMapping;
  totalRows: number;
  ready: number;
  duplicates: number;
  clashes: number;
  failed: number;
  warnings: number;
  /** Problem rows first; at most 300. */
  rows: AnalysedAllocation[];
};

function sanitizeMapping(raw: unknown, width: number, fallback: AllocationMapping): AllocationMapping {
  if (!Array.isArray(raw) || raw.length !== width) return fallback;
  const seen = new Set<string>();
  return raw.map((v) => {
    if (v === EXTRA_COLUMN) return EXTRA_COLUMN;
    if (typeof v !== "string" || !(v in ALLOCATION_FIELDS) || seen.has(v)) return "";
    seen.add(v);
    return v as AllocationField;
  });
}

const fullName = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();

async function lookups(organizationId: string) {
  const [clients, employees] = await Promise.all([
    prisma.client.findMany({ where: { organizationId }, select: { id: true, tradeName: true, legalName: true, clientCode: true, pan: true, status: true } }),
    prisma.employee.findMany({
      where: { organizationId },
      select: { id: true, firstName: true, lastName: true, temporaryEmployeeCode: true, permanentEmployeeCode: true, approvalStatus: true, employmentStatus: true },
    }),
  ]);
  const clientCandidates: NameCandidate[] = clients.map((c) => ({
    id: c.id,
    label: `${c.tradeName}${c.clientCode ? ` (${c.clientCode})` : ""}`,
    keys: [c.tradeName, c.legalName, c.clientCode, c.pan].filter((x): x is string => !!x).map(nameKey),
    exact: [c.tradeName, c.legalName].filter((x): x is string => !!x).map(exactKey),
  }));
  const employeeCandidates: NameCandidate[] = employees.map((e) => ({
    id: e.id,
    label: fullName(e),
    keys: [fullName(e), e.temporaryEmployeeCode, e.permanentEmployeeCode].filter((x): x is string => !!x).map(nameKey),
    exact: [exactKey(fullName(e))],
    firstKey: nameKey(e.firstName),
  }));
  return { clients: new Map(clients.map((c) => [c.id, c])), employees: new Map(employees.map((e) => [e.id, e])), clientCandidates, employeeCandidates };
}

type Lookups = Awaited<ReturnType<typeof lookups>>;

const CLIENT_STATE: Record<string, string> = {
  PENDING_APPROVAL: "is waiting for approval. Approve it first (Clients → Approval queue)",
  REJECTED: "was rejected",
  INACTIVE: "is discontinued",
  DRAFT: "is not registered yet",
};

/** Client and team member names → records, with plain reasons when a name does not fit. */
function resolveNames(r: AnalysedAllocation, l: Lookups) {
  const v = r.values;
  if (v.client) {
    const m = matchName(v.client, l.clientCandidates);
    if ("id" in m) {
      const c = l.clients.get(m.id)!;
      if (c.status === "ACTIVE" || c.status === "ON_HOLD") { r.clientId = c.id; r.clientLabel = c.tradeName; }
      else r.errors.push(`Client “${c.tradeName}” ${CLIENT_STATE[c.status] ?? "is not active"}`);
    } else if (m.error === "ambiguous") r.errors.push(`More than one client matches “${v.client}”: ${m.labels.slice(0, 4).join(", ")}. Use the client code or PAN`);
    else r.errors.push(`Client “${v.client}” was not found in the Client Master (check the spelling, or import / register the client first)`);
  }
  const person = (text: string | undefined, label: string, strict: boolean) => {
    if (!text) return undefined;
    const m = matchName(text, l.employeeCandidates);
    const fail = (msg: string) => (strict ? r.errors.push(msg) : r.warnings.push(`${msg}; left blank`));
    if ("id" in m) {
      const e = l.employees.get(m.id)!;
      if (e.employmentStatus === "EXITED") return void fail(`${label} “${fullName(e)}” has left the firm`);
      if (e.approvalStatus !== "APPROVED") return void fail(`${label} “${fullName(e)}” is not approved yet (Employees → approve first)`);
      return e;
    }
    if (m.error === "ambiguous") fail(`More than one team member matches “${text}”: ${m.labels.slice(0, 4).join(", ")}. Use the full name or employee code`);
    else fail(`${label} “${text}” was not found among the team members`);
    return undefined;
  };
  const emp = person(v.employee, "Team member", true);
  if (emp) { r.employeeId = emp.id; r.employeeLabel = fullName(emp); }
  r.reportsToId = person(v.reportsTo, "Reports to", false)?.id;
  r.teamLeaderId = person(v.teamLeader, "Team leader", false)?.id;
}

const spanOf = (r: AnalysedAllocation): AllocationSpan => ({
  startDate: dateOnly(r.values.from!),
  endDate: r.values.to ? dateOnly(r.values.to) : null,
  firstHalfHours: r.values.firstHalfHours,
  secondHalfHours: r.values.secondHalfHours,
  weekDays: r.values.weekDays,
  frequency: r.values.frequency,
  visitDays: r.values.visitDays,
  allowOverlap: r.values.allowOverlap,
  clientName: r.clientLabel,
});

const overlapsDates = (a: { startDate: Date; endDate: Date | null }, b: { startDate: Date; endDate: Date | null }) =>
  a.startDate.getTime() <= (b.endDate?.getTime() ?? Infinity) && b.startDate.getTime() <= (a.endDate?.getTime() ?? Infinity);

/** Duplicates (same person, same client, overlapping dates) and clashes, against saved allocations and earlier rows. */
async function checkRows(ctx: AppContext, rows: AnalysedAllocation[], cap: DayCapacity, today: Date) {
  const ok = rows.filter((r) => !r.errors.length && r.clientId && r.employeeId);
  const people = [...new Set(ok.map((r) => r.employeeId!))];
  const [saved, savedSpans] = await Promise.all([
    prisma.teamAllocation.findMany({
      where: { organizationId: ctx.organization.id, employeeId: { in: people }, status: { in: ["ACTIVE", "PLANNED", "ENDED"] } },
      select: { clientId: true, employeeId: true, startDate: true, endDate: true },
    }),
    allocationSpans(ctx.organization.id, people),
  ]);
  const earlier: (AllocationSpan & { employeeId: string; clientId: string; row: number })[] = [];
  for (const r of ok) {
    const span = spanOf(r);
    r.status = allocationStatusFor(span.startDate, span.endDate, today);
    const dup = saved.find((s) => s.clientId === r.clientId && s.employeeId === r.employeeId && overlapsDates(s, span));
    const dupRow = earlier.find((s) => s.clientId === r.clientId && s.employeeId === r.employeeId && overlapsDates(s, span));
    if (dup) {
      r.outcome = "duplicate";
      r.note = `Already allocated to this client from ${formatDate(dup.startDate)}${dup.endDate ? ` to ${formatDate(dup.endDate)}` : ""}`;
      continue;
    }
    if (dupRow) {
      r.outcome = "error";
      r.errors.push(`Same team member on the same client for overlapping dates as row ${dupRow.row}`);
      continue;
    }
    // A finished (history) row, or one that allows overlap, is not checked for clashes.
    if (r.status !== "ENDED" && !r.values.allowOverlap) {
      const others = [...savedSpans, ...earlier].filter((s) => s.employeeId === r.employeeId);
      const c = findConflicts(span, others, cap);
      if (c.isConflict) {
        r.outcome = "clash";
        r.note = `On ${formatDate(c.clashDay)} ${r.employeeLabel} would have ${formatHours(c.firstHours)} h in the 1st half and ${formatHours(c.secondHours)} h in the 2nd (available ${formatHours(cap.first)} + ${formatHours(cap.second)} h). Also on: ${c.overlapping.map((o) => o.clientName).join(", ")}. Set “Allow overlap” to Yes, or change the days / hours`;
      }
    }
    earlier.push({ ...span, employeeId: r.employeeId!, clientId: r.clientId!, row: r.row });
  }
}

async function analyse(ctx: AppContext, file: File, requestedMapping?: unknown) {
  let numbered;
  try {
    numbered = await readTableFile(file, { preferSheet: /^allocation/i, what: "allocation" });
  } catch (e) {
    if (e instanceof TableFileError) throw new BusinessRuleError(e.message);
    throw e;
  }
  const all = numbered.map((r) => r.cells);
  const headerAt = findAllocationHeaderRow(all);
  const header = all[headerAt].map((h) => h.trim());
  const body = numbered.slice(headerAt + 1);
  if (body.length > MAX_ROWS) throw new BusinessRuleError(`The sheet has ${body.length} rows; import up to ${MAX_ROWS} at a time.`);
  const mapping = sanitizeMapping(requestedMapping, header.length, guessAllocationMapping(header));
  const { row: policy } = await getPolicy(ctx.organization.id);
  const cap = capacityFromPolicy(policy);
  const today = dateOnly(isoDateInTz(new Date(), ctx.organization.timezone));
  const rows: AnalysedAllocation[] = body.map((r) => ({ ...parseAllocationRow(r.cells, header, mapping, r.n, cap), outcome: "ready" as AllocationOutcome }));
  const missing = (["client", "employee", "from"] as const).filter((f) => !mapping.includes(f));
  if (!missing.length) {
    const l = await lookups(ctx.organization.id);
    for (const r of rows) if (!r.errors.length) resolveNames(r, l);
    await checkRows(ctx, rows, cap, today);
  }
  for (const r of rows) if (r.errors.length) r.outcome = "error";
  return { header, mapping, rows, missing };
}

export async function previewAllocationImport(ctx: AppContext, file: File, requestedMapping?: unknown): Promise<AllocationImportPreview & { missing: string[] }> {
  const { header, mapping, rows, missing } = await analyse(ctx, file, requestedMapping);
  const count = (o: AllocationOutcome) => rows.filter((r) => r.outcome === o).length;
  const order: Record<AllocationOutcome, number> = { error: 0, clash: 1, duplicate: 2, ready: 3 };
  const sorted = [...rows].sort((a, b) => order[a.outcome] - order[b.outcome] || (b.warnings.length ? 1 : 0) - (a.warnings.length ? 1 : 0) || a.row - b.row);
  return {
    header, mapping, missing: missing.map((f) => ALLOCATION_FIELDS[f].label), totalRows: rows.length,
    ready: count("ready"), duplicates: count("duplicate"), clashes: count("clash"), failed: count("error"),
    warnings: rows.filter((r) => r.warnings.length).length, rows: sorted.slice(0, 300),
  };
}

/**
 * Saves every ready row (and, when asked, the clashing ones marked "allow overlap").
 * Duplicates and rows with errors are skipped. Each person gets one notice for their new clients.
 */
export async function runAllocationImport(ctx: AppContext, file: File, requestedMapping: unknown, includeClashes: boolean) {
  const { rows, missing } = await analyse(ctx, file, requestedMapping);
  if (missing.length) throw new BusinessRuleError(`Tell us which column holds: ${missing.map((f) => ALLOCATION_FIELDS[f].label).join(", ")}.`);
  const toSave = rows.filter((r) => r.outcome === "ready" || (includeClashes && r.outcome === "clash"));
  if (!toSave.length) throw new BusinessRuleError("There is nothing to import: every row is already allocated, clashes or has an error.");

  let created = 0;
  const failures: { row: number; message: string }[] = [];
  const newClients = new Map<string, string[]>();
  for (let i = 0; i < toSave.length; i += 25) {
    const batch = toSave.slice(i, i + 25);
    try {
      await prisma.$transaction(async (tx) => {
        for (const r of batch) {
          const v = r.values;
          const a = await tx.teamAllocation.create({
            data: {
              organizationId: ctx.organization.id,
              clientId: r.clientId!,
              employeeId: r.employeeId!,
              seniorityLevel: v.role,
              startDate: dateOnly(v.from!),
              endDate: v.to ? dateOnly(v.to) : null,
              firstHalfHours: v.firstHalfHours,
              secondHalfHours: v.secondHalfHours,
              resourceType: v.resourceType,
              reportsToEmployeeId: r.reportsToId,
              teamLeaderEmployeeId: r.teamLeaderId,
              weekDays: v.weekDays,
              frequency: v.frequency,
              visitDays: v.visitDays,
              allowOverlap: v.allowOverlap || r.outcome === "clash",
              remark: v.remark,
              extraFields: Object.keys(v.extra).length ? v.extra : undefined,
              status: r.status ?? "ACTIVE",
              createdById: ctx.user.id,
            },
          });
          await audit(tx, ctx, "allocation.imported", "team_allocation", a.id, { row: r.row, overlapAllowedOnImport: r.outcome === "clash" });
          if (r.status !== "ENDED") newClients.set(r.employeeId!, [...(newClients.get(r.employeeId!) ?? []), r.clientLabel!]);
        }
      }, { timeout: 60_000 });
      created += batch.length;
    } catch {
      for (const r of batch) failures.push({ row: r.row, message: `Row ${r.row} (${r.values.employee} → ${r.values.client}) could not be saved` });
      for (const r of batch) newClients.delete(r.employeeId!);
    }
  }
  if (newClients.size) {
    await prisma.$transaction(async (tx) => {
      for (const [employeeId, names] of newClients) {
        await notifyEmployees(tx, ctx.organization.id, [employeeId], {
          type: "allocation.created",
          title: names.length === 1 ? `You are allocated to ${names[0]}` : `You are allocated to ${names.length} clients: ${names.slice(0, 3).join(", ")}${names.length > 3 ? "…" : ""}`,
          link: "/app/allocations",
        });
      }
    });
  }
  const count = (o: AllocationOutcome) => rows.filter((r) => r.outcome === o).length;
  return { created, duplicates: count("duplicate"), clashesSkipped: includeClashes ? 0 : count("clash"), failed: count("error"), failures };
}
