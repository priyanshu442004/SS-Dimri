import "server-only";
import { prisma } from "@/lib/db";
import { can, type Capability } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { zonedDateTime } from "@/lib/dates";
import { CATALOG_ENUMS, CATALOG_MODELS, type CatalogField, type CatalogModel } from "./catalog.generated";

// The assistant's general database tool: read-only Prisma queries (findMany / count /
// aggregate / groupBy) written by the model as JSON, checked here against an allow-list
// before they run.
//
// Safety, in order:
//   1. Only the four read operations exist; there is no way to write.
//   2. Every model must be on the allow-list below and the asker must hold its capability
//      (salaries need payroll rights, day reports need day-report rights, and so on).
//   3. Every query is scoped to the asker's firm: `organizationId` (or the parent's) is ANDed
//      into the top-level filter and into every nested list, whatever the model wrote.
//   4. Secret / private columns (password hashes, tokens, Aadhaar, bank account numbers,
//      locations, storage keys) can be neither read nor filtered on, at any depth.
//   5. Relation `true` is expanded to an explicit list of allowed columns, so a bare include
//      can never pull a hidden column; sizes and depth are capped.

type Scope = { kind: "org" } | { kind: "via"; relation: string } | { kind: "global" } | { kind: "relationOnly" };
type ModelPolicy = { cap: Capability; scope: Scope; only?: string[]; hide?: string[]; note?: string };

const ORG: Scope = { kind: "org" };
const via = (relation: string): Scope => ({ kind: "via", relation });

/** Models the assistant may read, the right needed, and how each is tied to a firm. */
export const MODEL_POLICY: Record<string, ModelPolicy> = {
  // people
  Employee: { cap: "employees.view", scope: ORG, note: "Staff members. Name = firstName + lastName. employmentStatus EXITED = ex-employee." },
  Department: { cap: "app.use", scope: ORG },
  Designation: { cap: "app.use", scope: ORG },
  EmployeeNatureOption: { cap: "employees.view", scope: ORG },
  EmployeeReportingRelationship: { cap: "employees.view", scope: via("employee"), note: "employee reports to manager (both Employee)." },
  EmployeeQualification: { cap: "employees.manage", scope: via("employee") },
  EmployeePreviousEmployment: { cap: "employees.manage", scope: via("employee") },
  EmployeeMemo: { cap: "employees.manage", scope: via("employee") },
  EmployeeLetter: { cap: "employees.manage", scope: ORG, hide: ["fields"] },
  EmployeeSalaryRecord: { cap: "payroll.manage", scope: via("employee"), note: "Salary history. Current salary = latest effectiveFrom <= today. agreedSalary per salaryPeriod." },
  OrganizationMembership: { cap: "employees.view", scope: ORG, only: ["id", "organizationId", "userId", "employeeId", "clientId", "role", "status", "createdAt", "employee", "user", "client"], note: "Login account of a person: role OWNER/ADMIN/MANAGER/SENIOR/STAFF/CLIENT." },
  User: { cap: "app.use", scope: { kind: "relationOnly" }, only: ["id", "name", "email", "username", "createdAt"] },
  // attendance & leave
  AttendanceRecord: { cap: "attendance.view_all", scope: ORG, note: "One row per employee per day. For late / on-time questions prefer the attendance_report tool (it applies the office rules)." },
  AttendanceRequest: { cap: "attendance.view_all", scope: ORG, note: "Late-arrival intimations, early-leave and overtime requests." },
  AttendanceCorrection: { cap: "attendance.view_all", scope: via("attendanceRecord") },
  AttendancePolicy: { cap: "app.use", scope: ORG, note: "Office timings and rule numbers of the firm." },
  LeaveRequest: { cap: "attendance.view_all", scope: ORG },
  LeaveBalance: { cap: "attendance.view_all", scope: ORG },
  Holiday: { cap: "app.use", scope: ORG },
  ClientVisit: { cap: "attendance.view_all", scope: ORG },
  DailyWorker: { cap: "attendance.workers", scope: ORG },
  DailyWorkerDay: { cap: "attendance.workers", scope: ORG },
  DailyPlan: { cap: "tasks.view_all", scope: ORG, note: "Morning plan + end-of-day (EOD) report per employee per day." },
  DailyPlanItem: { cap: "tasks.view_all", scope: via("plan") },
  // clients & services
  Client: { cap: "clients.view_all", scope: ORG },
  ClientService: { cap: "clients.view_all", scope: ORG, note: "A service engaged by a client (fees, retainer dates)." },
  ClientContact: { cap: "clients.view_all", scope: via("client") },
  ClientGstRegistration: { cap: "clients.view_all", scope: via("client") },
  ClientClassification: { cap: "clients.view_all", scope: via("client") },
  ClassificationOption: { cap: "app.use", scope: { kind: "global" } },
  BusinessNature: { cap: "app.use", scope: { kind: "global" } },
  Service: { cap: "app.use", scope: ORG },
  WorkType: { cap: "app.use", scope: ORG },
  ClientDue: { cap: "dues.manage", scope: ORG, note: "Fees billed / due from clients." },
  ClientReport: { cap: "reports.client", scope: ORG, hide: ["snapshot"] },
  ClientObservation: { cap: "observations.manage", scope: ORG },
  // work
  TeamAllocation: { cap: "allocations.view_all", scope: ORG, hide: ["extraFields"] },
  WorkCommitment: { cap: "allocations.view_all", scope: ORG },
  Task: { cap: "tasks.view_all", scope: ORG },
  TaskAssignment: { cap: "tasks.view_all", scope: via("task") },
  TaskActivity: { cap: "tasks.view_all", scope: via("task") },
  TaskReview: { cap: "tasks.view_all", scope: via("task") },
  TaskReminder: { cap: "tasks.view_all", scope: via("task") },
  TimesheetEntry: { cap: "timesheet.view_all", scope: ORG },
  TrackerLine: { cap: "timesheet.view_all", scope: ORG, note: "Work-flow tracker lines (bank statement posting etc.)." },
  PendingItem: { cap: "pending.view_all", scope: ORG },
  FollowUp: { cap: "pending.view_all", scope: ORG },
  DayReport: { cap: "dayreport.view_all", scope: ORG },
  DayReportRecipient: { cap: "dayreport.view_all", scope: via("dayReport") },
  // compliance
  ComplianceItem: { cap: "compliance.use", scope: { kind: "global" } },
  ComplianceEntry: { cap: "compliance.manage", scope: ORG, hide: ["customValues"] },
  ClientCompliance: { cap: "compliance.manage", scope: via("client") },
  OrganizationComplianceSetting: { cap: "compliance.manage", scope: ORG },
  // audit
  AuditLog: { cap: "audit.view", scope: ORG, hide: ["metadata"] },
};

/** Never readable or filterable, on any model. */
const SECRET = /(password|token|secret|encrypted|hash|checksum|objectkey|bucket|latitude|longitude|ipaddress|useragent|aadhaar|accountnumber|fileid$)/i;

const BY_NAME = new Map<string, CatalogModel>(CATALOG_MODELS.map((m) => [m.name, m]));
const ENUM_NAMES = new Set(Object.keys(CATALOG_ENUMS));

export class QueryError extends Error {}

type Access = { ctx: AppContext; allowed: Set<string> };

export function accessibleModels(ctx: AppContext): Set<string> {
  return new Set(Object.entries(MODEL_POLICY).filter(([name, p]) => BY_NAME.has(name) && can(ctx, p.cap)).map(([n]) => n));
}

function visibleField(model: string, f: CatalogField, a: Access): boolean {
  const p = MODEL_POLICY[model];
  if (!p) return false;
  if (SECRET.test(f.name)) return false;
  if (p.only && !p.only.includes(f.name)) return false;
  if (p.hide?.includes(f.name)) return false;
  if (f.kind === "relation") return a.allowed.has(f.type);
  return true;
}

function fieldOf(model: string, name: string, a: Access): CatalogField {
  const m = BY_NAME.get(model)!;
  const f = m.fields.find((x) => x.name === name);
  if (!f) throw new QueryError(`${model} has no field "${name}". Fields: ${visibleFields(model, a).map((x) => x.name).join(", ")}`);
  if (!visibleField(model, f, a)) throw new QueryError(`${model}.${name} is not available to the assistant.`);
  return f;
}

function visibleFields(model: string, a: Access) {
  return BY_NAME.get(model)!.fields.filter((f) => visibleField(model, f, a));
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const hasOrg = (model: string) => !!BY_NAME.get(model)?.fields.some((f) => f.name === "organizationId" && f.kind === "scalar");

// ---------------------------------------------------------------- values

function coerceValue(f: CatalogField, v: unknown, tz: string): unknown {
  if (v === null) return null;
  if (Array.isArray(v)) return v.map((x) => coerceValue(f, x, tz));
  if (f.type === "DateTime" && typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return f.date ? new Date(`${s}T00:00:00.000Z`) : zonedDateTime(s, 0, tz);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw new QueryError(`"${v}" is not a valid date for ${f.name} (use YYYY-MM-DD or ISO date-time).`);
    return d;
  }
  if (f.kind === "enum" && typeof v === "string") {
    const values = CATALOG_ENUMS[f.type] ?? [];
    const hit = values.find((x) => x.toLowerCase() === v.toLowerCase());
    if (!hit) throw new QueryError(`${f.name} must be one of ${values.join(", ")} (got "${v}").`);
    return hit;
  }
  if ((f.type === "Int" || f.type === "Float" || f.type === "Decimal" || f.type === "BigInt") && typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  if (isObj(v)) throw new QueryError(`Unexpected object as a value for ${f.name}.`);
  return v;
}

const SCALAR_OPS = new Set(["equals", "not", "in", "notIn", "lt", "lte", "gt", "gte", "contains", "startsWith", "endsWith", "mode", "has", "hasSome", "hasEvery", "isEmpty"]);

function scalarFilter(f: CatalogField, v: unknown, tz: string): unknown {
  if (!isObj(v)) return coerceValue(f, v, tz);
  const out: Record<string, unknown> = {};
  for (const [op, val] of Object.entries(v)) {
    if (!SCALAR_OPS.has(op)) throw new QueryError(`Unsupported filter "${op}" on ${f.name}.`);
    if (op === "mode") { if (val !== "insensitive" && val !== "default") throw new QueryError(`mode must be "insensitive"`); out.mode = val; continue; }
    if (op === "isEmpty") { out[op] = !!val; continue; }
    out[op] = op === "not" && isObj(val) ? scalarFilter(f, val, tz) : coerceValue(f, val, tz);
  }
  // Text search is meant case-insensitively.
  if ((f.type === "String") && ("contains" in out || "startsWith" in out || "endsWith" in out) && !out.mode) out.mode = "insensitive";
  return out;
}

// ---------------------------------------------------------------- where

function where(model: string, w: unknown, a: Access, depth: number): Record<string, unknown> {
  if (w === undefined || w === null) return {};
  if (!isObj(w)) throw new QueryError(`"where" must be an object.`);
  if (depth > 6) throw new QueryError("Filter is nested too deeply.");
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(w)) {
    if (k === "AND" || k === "OR" || k === "NOT") {
      const list = Array.isArray(v) ? v : [v];
      out[k] = list.map((x) => where(model, x, a, depth + 1));
      continue;
    }
    const f = fieldOf(model, k, a);
    if (f.kind !== "relation") { out[k] = scalarFilter(f, v, a.ctx.organization.timezone); continue; }
    if (!isObj(v)) throw new QueryError(`Filter on relation ${model}.${k} must be an object.`);
    if (f.list) {
      const r: Record<string, unknown> = {};
      for (const [op, sub] of Object.entries(v)) {
        if (!["some", "every", "none"].includes(op)) throw new QueryError(`List relation ${k} takes some / every / none.`);
        r[op] = where(f.type, sub, a, depth + 1);
      }
      out[k] = r;
    } else {
      const keys = Object.keys(v);
      if (keys.some((x) => x === "is" || x === "isNot")) {
        const r: Record<string, unknown> = {};
        for (const [op, sub] of Object.entries(v)) {
          if (op !== "is" && op !== "isNot") throw new QueryError(`Use either is / isNot or plain fields for ${k}.`);
          r[op] = sub === null ? null : where(f.type, sub, a, depth + 1);
        }
        out[k] = r;
      } else out[k] = where(f.type, v, a, depth + 1);
    }
  }
  return out;
}

function scopeWhere(model: string, a: Access): Record<string, unknown> {
  const p = MODEL_POLICY[model];
  const org = a.ctx.organization.id;
  if (p.scope.kind === "org") return { organizationId: org };
  if (p.scope.kind === "via") {
    const rel = BY_NAME.get(model)!.fields.find((f) => f.name === (p.scope as { relation: string }).relation)!;
    return { [rel.name]: hasOrg(rel.type) ? { organizationId: org } : scopeWhere(rel.type, a) };
  }
  return {};
}

// ---------------------------------------------------------------- select

function allScalars(model: string, a: Access) {
  return Object.fromEntries(visibleFields(model, a).filter((f) => f.kind !== "relation").map((f) => [f.name, true]));
}

function select(model: string, s: unknown, a: Access, depth: number): Record<string, unknown> {
  if (s === undefined || s === null || s === true) return allScalars(model, a);
  if (!isObj(s)) throw new QueryError(`"select" must be an object of field: true.`);
  if (depth > 4) throw new QueryError("Select is nested too deeply.");
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (v === false) continue;
    if (k === "_count") {
      if (v === true) throw new QueryError(`Use _count: { select: { <listRelation>: true } }.`);
      const sel = isObj(v) && isObj(v.select) ? v.select : null;
      if (!sel) throw new QueryError(`_count needs { select: { relation: true } }.`);
      out._count = { select: Object.fromEntries(Object.keys(sel).map((r) => {
        const f = fieldOf(model, r, a);
        if (f.kind !== "relation" || !f.list) throw new QueryError(`_count works on list relations only (${r}).`);
        return [r, hasOrg(f.type) ? { where: { organizationId: a.ctx.organization.id } } : true];
      })) };
      continue;
    }
    const f = fieldOf(model, k, a);
    if (f.kind !== "relation") { out[k] = true; continue; }
    if (v === true) {
      out[k] = f.list ? { select: allScalars(f.type, a), where: nestedScope(f.type, a), take: 50 } : { select: allScalars(f.type, a) };
      continue;
    }
    if (!isObj(v)) throw new QueryError(`Relation ${k} takes true or { select, where, orderBy, take }.`);
    const sub: Record<string, unknown> = { select: select(f.type, v.select, a, depth + 1) };
    if (f.list) {
      sub.where = { AND: [nestedScope(f.type, a), where(f.type, v.where, a, depth + 1)] };
      if (v.orderBy !== undefined) sub.orderBy = orderBy(f.type, v.orderBy, a, depth + 1);
      sub.take = clampTake(v.take, 50, 200);
    } else if (v.where || v.orderBy || v.take) throw new QueryError(`Single relation ${k} accepts only { select }.`);
    out[k] = sub;
  }
  if (!Object.keys(out).length) return allScalars(model, a);
  return out;
}

function nestedScope(model: string, a: Access) {
  return hasOrg(model) ? { organizationId: a.ctx.organization.id } : {};
}

function clampTake(v: unknown, def: number, max: number) {
  const n = typeof v === "number" ? Math.trunc(v) : def;
  return Math.max(1, Math.min(max, Math.abs(n)));
}

// ---------------------------------------------------------------- orderBy

const DIR = (v: unknown) => {
  if (v === "asc" || v === "desc") return v;
  if (isObj(v) && (v.sort === "asc" || v.sort === "desc")) return { sort: v.sort, ...(v.nulls === "first" || v.nulls === "last" ? { nulls: v.nulls } : {}) };
  throw new QueryError(`Sort direction must be "asc" or "desc".`);
};

function orderBy(model: string, o: unknown, a: Access, depth: number, aggregate = false): unknown {
  const list = Array.isArray(o) ? o : [o];
  return list.map((item) => {
    if (!isObj(item)) throw new QueryError(`orderBy items must be objects like { field: "desc" }.`);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(item)) {
      if (aggregate && ["_count", "_sum", "_avg", "_min", "_max"].includes(k)) {
        if (!isObj(v)) throw new QueryError(`${k} ordering needs { field: "desc" }.`);
        out[k] = Object.fromEntries(Object.entries(v).map(([fk, d]) => { if (fk !== "_all") fieldOf(model, fk, a); return [fk, DIR(d)]; }));
        continue;
      }
      const f = fieldOf(model, k, a);
      if (f.kind === "relation") {
        if (f.list) { if (!isObj(v) || !("_count" in v)) throw new QueryError(`Order by list relation ${k} with { _count: "desc" }.`); out[k] = { _count: DIR(v._count) }; }
        else out[k] = (orderBy(f.type, v, a, depth + 1) as unknown[])[0];
      } else out[k] = DIR(v);
    }
    return out;
  });
}

// ---------------------------------------------------------------- aggregates

const NUMERIC = new Set(["Int", "Float", "Decimal", "BigInt"]);

function aggFields(model: string, v: unknown, a: Access, numericOnly: boolean, allowAll: boolean) {
  if (v === true && allowAll) return true;
  if (!isObj(v)) throw new QueryError(`Aggregate must be { field: true }.`);
  return Object.fromEntries(Object.keys(v).map((k) => {
    if (k === "_all" && allowAll) return [k, true];
    const f = fieldOf(model, k, a);
    if (f.kind === "relation") throw new QueryError(`Cannot aggregate relation ${k}.`);
    if (numericOnly && !NUMERIC.has(f.type)) throw new QueryError(`${k} is not numeric.`);
    return [k, true];
  }));
}

// ---------------------------------------------------------------- results

function fmtDateTime(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Decimal → number, BigInt → number, calendar dates → YYYY-MM-DD, timestamps → firm-local time. */
export function plain(model: string | null, v: unknown, tz: string, key?: string): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (typeof v === "bigint") return Number(v);
  if (v instanceof Date) {
    const f = model && key ? BY_NAME.get(model)?.fields.find((x) => x.name === key) : null;
    return f?.date ? v.toISOString().slice(0, 10) : fmtDateTime(v, tz);
  }
  if (typeof v === "object" && v && "toNumber" in v && typeof (v as { toNumber: unknown }).toNumber === "function") return (v as { toNumber(): number }).toNumber();
  if (Array.isArray(v)) return v.map((x) => plain(model, x, tz, key));
  if (typeof v === "object") {
    const m = model ? BY_NAME.get(model) : null;
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => {
      const rel = m?.fields.find((f) => f.name === k && f.kind === "relation");
      const nextModel = rel ? rel.type : k.startsWith("_") ? model : model;
      return [k, plain(rel ? nextModel : model, x, tz, rel ? undefined : k)];
    }));
  }
  return v;
}

// ---------------------------------------------------------------- run

export type DbQueryInput = { model: string; operation: "findMany" | "count" | "aggregate" | "groupBy"; args?: Record<string, unknown> };

const resultCache = new Map<string, { at: number; value: unknown }>();
const RESULT_TTL_MS = 20_000; // identical queries inside one conversation burst reuse the result (memory only)

export async function runDbQuery(ctx: AppContext, input: DbQueryInput) {
  const a: Access = { ctx, allowed: accessibleModels(ctx) };
  const modelName = [...BY_NAME.keys()].find((n) => n.toLowerCase() === String(input.model ?? "").toLowerCase());
  if (!modelName || !MODEL_POLICY[modelName]) throw new QueryError(`Unknown model "${input.model}". Use one of: ${[...a.allowed].filter((m) => MODEL_POLICY[m].scope.kind !== "relationOnly").join(", ")}`);
  if (!a.allowed.has(modelName)) throw new QueryError(`You do not have access to ${modelName} data (needs a right this person does not hold). Tell the user plainly.`);
  if (MODEL_POLICY[modelName].scope.kind === "relationOnly") throw new QueryError(`${modelName} can only be reached through a relation of another model.`);
  const args = isObj(input.args) ? input.args : {};
  const known = new Set(["where", "select", "orderBy", "take", "skip", "distinct", "by", "_count", "_sum", "_avg", "_min", "_max", "having"]);
  for (const k of Object.keys(args)) if (!known.has(k)) throw new QueryError(`Unsupported argument "${k}". Use where / select / orderBy / take / skip / distinct / by / _count / _sum / _avg / _min / _max.`);

  const scoped = { AND: [scopeWhere(modelName, a), where(modelName, args.where, a, 0)] };
  const delegate = (prisma as unknown as Record<string, Record<string, (q: unknown) => Promise<unknown>>>)[modelName[0].toLowerCase() + modelName.slice(1)];
  const tz = ctx.organization.timezone;
  let q: Record<string, unknown>;
  switch (input.operation) {
    case "findMany": {
      q = { where: scoped, select: select(modelName, args.select, a, 0), take: clampTake(args.take, 50, 300) };
      if (args.orderBy !== undefined) q.orderBy = orderBy(modelName, args.orderBy, a, 0);
      if (typeof args.skip === "number") q.skip = Math.max(0, Math.trunc(args.skip));
      if (Array.isArray(args.distinct)) q.distinct = args.distinct.map((d) => { const f = fieldOf(modelName, String(d), a); if (f.kind === "relation") throw new QueryError("distinct takes scalar fields"); return f.name; });
      break;
    }
    case "count":
      q = { where: scoped };
      break;
    case "aggregate": {
      q = { where: scoped };
      if (args._count !== undefined) q._count = aggFields(modelName, args._count, a, false, true);
      for (const k of ["_sum", "_avg"] as const) if (args[k] !== undefined) q[k] = aggFields(modelName, args[k], a, true, false);
      for (const k of ["_min", "_max"] as const) if (args[k] !== undefined) q[k] = aggFields(modelName, args[k], a, false, false);
      if (Object.keys(q).length === 1) q._count = true;
      break;
    }
    case "groupBy": {
      const by = Array.isArray(args.by) ? args.by : args.by ? [args.by] : [];
      if (!by.length) throw new QueryError(`groupBy needs "by": ["field", ...].`);
      q = { where: scoped, by: by.map((b) => { const f = fieldOf(modelName, String(b), a); if (f.kind === "relation") throw new QueryError(`Group by the id column (e.g. employeeId), not the relation ${b}.`); return f.name; }) };
      q._count = args._count !== undefined ? aggFields(modelName, args._count, a, false, true) : true;
      for (const k of ["_sum", "_avg"] as const) if (args[k] !== undefined) q[k] = aggFields(modelName, args[k], a, true, false);
      for (const k of ["_min", "_max"] as const) if (args[k] !== undefined) q[k] = aggFields(modelName, args[k], a, false, false);
      q.orderBy = args.orderBy !== undefined ? orderBy(modelName, args.orderBy, a, 0, true) : [{ _count: { [(q.by as string[])[0]]: "desc" } }];
      q.take = clampTake(args.take, 100, 300);
      break;
    }
    default:
      throw new QueryError(`operation must be findMany, count, aggregate or groupBy.`);
  }

  const cacheKey = `${ctx.organization.id}|${ctx.membershipId}|${modelName}|${input.operation}|${JSON.stringify(q)}`;
  const hit = resultCache.get(cacheKey);
  if (hit && Date.now() - hit.at < RESULT_TTL_MS) return hit.value;

  let raw: unknown;
  try {
    raw = await delegate[input.operation](q);
  } catch (e) {
    const msg = e instanceof Error ? e.message.split("\n").filter((l) => l.trim()).slice(-3).join(" ").slice(0, 400) : "query failed";
    throw new QueryError(`Database rejected the query: ${msg}`);
  }
  if (input.operation === "groupBy" && Array.isArray(raw)) await attachNames(modelName, q.by as string[], raw as Record<string, unknown>[], a);
  const value = shapeResult(modelName, input.operation, raw, tz, q);
  resultCache.set(cacheKey, { at: Date.now(), value });
  if (resultCache.size > 500) resultCache.delete(resultCache.keys().next().value!);
  return value;
}

/** How a row of each commonly grouped-by model is named for people. */
const NAME_OF: Record<string, { select: Record<string, true>; name: (r: Record<string, unknown>) => string }> = {
  Employee: { select: { id: true, firstName: true, lastName: true }, name: (r) => `${r.firstName} ${r.lastName ?? ""}`.trim() },
  Client: { select: { id: true, tradeName: true }, name: (r) => String(r.tradeName) },
  User: { select: { id: true, name: true }, name: (r) => String(r.name) },
  Service: { select: { id: true, name: true }, name: (r) => String(r.name) },
  Department: { select: { id: true, name: true }, name: (r) => String(r.name) },
  Designation: { select: { id: true, name: true }, name: (r) => String(r.name) },
  Task: { select: { id: true, title: true }, name: (r) => String(r.title) },
};

/**
 * groupBy returns ids (e.g. makerEmployeeId). Add a readable `<relation>Name` next to each,
 * so the model can answer "by person" without another round trip.
 */
async function attachNames(model: string, by: string[], rows: Record<string, unknown>[], a: Access) {
  const fields = BY_NAME.get(model)!.fields;
  await Promise.all(by.map(async (b) => {
    const rel = fields.find((f) => f.kind === "relation" && f.fk === b);
    const how = rel && NAME_OF[rel.type];
    if (!rel || !how || !a.allowed.has(rel.type)) return;
    const ids = [...new Set(rows.map((r) => r[b]).filter((v): v is string => typeof v === "string"))];
    if (!ids.length) return;
    const delegate = (prisma as unknown as Record<string, { findMany: (q: unknown) => Promise<Record<string, unknown>[]> }>)[rel.type[0].toLowerCase() + rel.type.slice(1)];
    const found = await delegate.findMany({ where: { id: { in: ids }, ...(hasOrg(rel.type) ? { organizationId: a.ctx.organization.id } : {}) }, select: how.select });
    const names = new Map(found.map((r) => [r.id as string, how.name(r)]));
    for (const r of rows) if (typeof r[b] === "string") r[`${rel.name}Name`] = names.get(r[b] as string) ?? null;
  }));
}

const MAX_RESULT_CHARS = 28_000;

function shapeResult(model: string, op: string, raw: unknown, tz: string, q: Record<string, unknown>) {
  const data = plain(model, raw, tz);
  if (op === "count") return { count: data };
  if (!Array.isArray(data)) return { result: data };
  let rows = data;
  let json = JSON.stringify(rows);
  let truncated = false;
  while (json.length > MAX_RESULT_CHARS && rows.length > 1) {
    rows = rows.slice(0, Math.max(1, Math.floor(rows.length * 0.7)));
    json = JSON.stringify(rows);
    truncated = true;
  }
  return {
    rows,
    returned: rows.length,
    ...(truncated ? { note: `Result was too large; only the first ${rows.length} rows are shown. Narrow the filter, select fewer fields, or use count / groupBy.` } : {}),
    ...(op === "findMany" && data.length === q.take ? { limitReached: `Exactly ${q.take} rows returned; there may be more (use count, or skip/take).` } : {}),
  };
}

// ---------------------------------------------------------------- schema text for the prompt

const SKIP_IN_SCHEMA = /^(organizationId|createdById|updatedAt)$/;

/** Compact schema of what this person may query, for the system prompt. Stable per rights set. */
export function schemaText(ctx: AppContext): string {
  const a: Access = { ctx, allowed: accessibleModels(ctx) };
  const usedEnums = new Set<string>();
  const lines: string[] = [];
  for (const name of Object.keys(MODEL_POLICY)) {
    if (!a.allowed.has(name)) continue;
    const p = MODEL_POLICY[name];
    const fields = visibleFields(name, a).filter((f) => !SKIP_IN_SCHEMA.test(f.name));
    const parts = fields.map((f) => {
      if (f.kind === "enum") usedEnums.add(f.type);
      const t = f.kind === "relation" ? `→${f.type}${f.list ? "[]" : ""}` : f.type === "DateTime" ? (f.date ? "date" : "datetime") : f.type === "String" ? "" : f.type;
      return `${f.name}${t ? `:${t}` : ""}${f.optional && f.kind !== "relation" ? "?" : ""}`;
    });
    const scope = p.scope.kind === "relationOnly" ? " (only via relations)" : p.scope.kind === "global" ? " (shared list)" : "";
    lines.push(`${name}${scope}${p.note ? ` — ${p.note}` : ""}\n  ${parts.join(", ")}`);
  }
  const enums = [...usedEnums].filter((e) => ENUM_NAMES.has(e)).sort().map((e) => `${e}: ${CATALOG_ENUMS[e].join("|")}`);
  return `${lines.join("\n")}\n\nENUMS\n${enums.join("\n")}`;
}
