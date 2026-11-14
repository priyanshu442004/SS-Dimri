// Team Allocation import from Excel / CSV (pure): recognise the columns of the firm's
// "Allocate a team member" sheet, clean every value, match names, and say plainly what is
// wrong with a row. One row = one team member on one client for a period.

import { parseSheetDate } from "./client-import";
import { formatVisitDays, parseFrequency, parseVisitDays, parseWeekDays, scheduleWarnings, type Frequency } from "./allocation-schedule";

export const ALLOCATION_FIELDS = {
  client: { label: "Client", required: true, aliases: ["client", "client name", "name of client", "party", "party name"] },
  employee: { label: "Team member", required: true, aliases: ["team member", "employee", "employee name", "staff", "staff name", "member", "name of employee", "person"] },
  role: { label: "Role on this client", aliases: ["role on this client", "role", "level", "level on this client", "seniority"] },
  resourceType: { label: "Resource type", aliases: ["resource type", "resource", "type of resource"] },
  from: { label: "From", required: true, aliases: ["from", "from date", "start date", "start", "allocation start date", "date from"] },
  to: { label: "To", aliases: ["to", "to date", "end date", "end", "till", "date to"] },
  weekDays: { label: "Week days", aliases: ["week days", "weekdays", "days", "week day", "working days"] },
  fullDay: { label: "Full Day", aliases: ["full day", "full-day", "whole day"] },
  frequency: { label: "Frequency", aliases: ["frequency", "visit frequency", "how often"] },
  visitDays: { label: "Visit day(s) of month", aliases: ["visit day(s) of month", "visit days of month", "visit days", "visit day", "day of month", "dates of month"] },
  firstHalfHours: { label: "1st half (hours)", aliases: ["1st half (hours)", "1st half", "first half (hours)", "first half", "first half hours", "1st half hours"] },
  secondHalfHours: { label: "2nd half (hours)", aliases: ["2nd half (hours)", "2nd half", "second half (hours)", "second half", "second half hours", "2nd half hours"] },
  reportsTo: { label: "Reports to (timesheet reviewer)", aliases: ["reports to (timesheet reviewer)", "reports to", "timesheet reviewer", "reviewer", "reporting to"] },
  teamLeader: { label: "Team leader (escalation)", aliases: ["team leader (escalation)", "team leader", "escalation", "team lead"] },
  allowOverlap: { label: "Allow overlap with other allocations", aliases: ["allow overlap with other allocations", "allow overlap", "overlap", "overlap allowed"] },
  remark: { label: "Remark", aliases: ["remark", "remarks", "note", "notes", "comment", "comments"] },
} as const;

export type AllocationField = keyof typeof ALLOCATION_FIELDS;
/** "extra" = a column with no field of its own: kept on the allocation as it is. */
export const EXTRA_COLUMN = "extra" as const;
export type AllocationMapping = (AllocationField | typeof EXTRA_COLUMN | "")[];

/** Headings compared without case, stars ("Client *"), dots or extra spaces. */
export const normHeading = (s: string) => s.toLowerCase().replace(/\*/g, " ").replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
/** Serial-number columns are never worth keeping. */
export const isSerialHeading = (h: string) => /^(s ?no|sr ?no|sl ?no|serial( no| number)?|#|no)$/.test(normHeading(h));

export function guessAllocationMapping(header: string[]): AllocationMapping {
  const fields = Object.keys(ALLOCATION_FIELDS) as AllocationField[];
  const taken = new Set<AllocationField>();
  const out: AllocationMapping = header.map(() => "");
  const pass = (test: (alias: string, h: string) => boolean) =>
    header.forEach((raw, i) => {
      if (out[i]) return;
      const h = normHeading(raw);
      const f = fields.find((k) => !taken.has(k) && ALLOCATION_FIELDS[k].aliases.some((a) => test(a, h)));
      if (f) { out[i] = f; taken.add(f); }
    });
  pass((a, h) => a === h);
  pass((a, h) => a.length > 3 && h.startsWith(a));
  header.forEach((raw, i) => {
    if (!out[i] && raw.trim() && !isSerialHeading(raw)) out[i] = EXTRA_COLUMN;
  });
  return out;
}

/** The heading row is the one (in the first 10) that names the most known columns. */
export function findAllocationHeaderRow(rows: string[][]): number {
  let best = 0;
  let score = -1;
  rows.slice(0, 10).forEach((row, i) => {
    const s = guessAllocationMapping(row).filter((m) => m && m !== EXTRA_COLUMN).length;
    if (s > score) { best = i; score = s; }
  });
  return best;
}

export const ALLOCATION_ROLES = { JUNIOR: "Junior", MID_LEVEL: "Mid level", SENIOR: "Senior", TEAM_LEADER: "Team Leader", TRAINEE: "Trainee" } as const;
export type AllocationRole = keyof typeof ALLOCATION_ROLES;

export function parseRole(text: string): AllocationRole | null {
  const t = normHeading(text).replace(/-/g, " ");
  if (/^(jr|junior)/.test(t)) return "JUNIOR";
  if (/^(mid|middle|mid level)/.test(t)) return "MID_LEVEL";
  if (/^(sr|senior)/.test(t)) return "SENIOR";
  if (/^(team ?lead(er)?|tl|lead)/.test(t)) return "TEAM_LEADER";
  if (/^(trainee|intern|article)/.test(t)) return "TRAINEE";
  return null;
}

/** The firm's resource types (Team Allocation sheet). "Dedicated" and "Shared" are older values still shown. */
export const ALLOCATION_RESOURCE_TYPES = [
  "Backend Team",
  "Onsite (at client office)",
  "Visiting (periodic visits)",
  "Shared (more than one client)",
  "Backup / Standby",
] as const;
export const LEGACY_RESOURCE_TYPES = ["Dedicated", "Shared"] as const;

export function parseResourceType(text: string): string | null {
  const t = normHeading(text);
  const exact = [...ALLOCATION_RESOURCE_TYPES, ...LEGACY_RESOURCE_TYPES].find((r) => normHeading(r) === t);
  if (exact) return exact;
  if (/^back ?end/.test(t)) return "Backend Team";
  if (/^on ?-? ?site|^at client/.test(t)) return "Onsite (at client office)";
  if (/^visit/.test(t)) return "Visiting (periodic visits)";
  if (/^shared/.test(t)) return "Shared (more than one client)";
  if (/^(backup|back up|standby|stand by)/.test(t)) return "Backup / Standby";
  return null;
}

export function parseYesNo(text: string): boolean | null {
  const t = normHeading(text);
  if (/^(y|yes|true|1|✓|✔)$/.test(t)) return true;
  if (/^(n|no|false|0|✗|✘)$/.test(t)) return false;
  return null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
/** DD-MM-YYYY, DD/MM/YYYY, 1-Nov-2026, or an Excel date → YYYY-MM-DD. */
export function parseAnyDate(raw: string): string | null {
  const t = raw.trim();
  const named = /^(\d{1,2})[\s/.-]+([a-z]{3,9})[\s/.,-]+(\d{2,4})$/i.exec(t);
  if (named) {
    const m = MONTHS[named[2].slice(0, named[2].toLowerCase() === "sept" ? 4 : 3).toLowerCase()];
    const y = named[3].length === 2 ? 2000 + Number(named[3]) : Number(named[3]);
    return m ? parseSheetDate(`${named[1]}/${m}/${y}`) : null;
  }
  const short = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/.exec(t);
  if (short) return parseSheetDate(`${short[1]}/${short[2]}/20${short[3]}`);
  return parseSheetDate(t);
}

export type ParsedAllocation = {
  client?: string;
  employee?: string;
  role: AllocationRole | null;
  resourceType: string | null;
  from?: string;
  to: string | null;
  weekDays: number[];
  frequency: Frequency | null;
  visitDays: string | null;
  /** null + null = full day; 0 + 0 = no fixed hours (As required). */
  firstHalfHours: number | null;
  secondHalfHours: number | null;
  reportsTo?: string;
  teamLeader?: string;
  allowOverlap: boolean;
  remark?: string;
  extra: Record<string, string>;
};

export type AllocationRowResult = { row: number; values: ParsedAllocation; errors: string[]; warnings: string[] };

/** One sheet row → clean values. Errors stop the row; warnings explain a value that was left out or read a certain way. */
export function parseAllocationRow(row: string[], header: string[], mapping: AllocationMapping, rowNumber: number, cap: { first: number; second: number }): AllocationRowResult {
  const raw: Partial<Record<AllocationField, string>> = {};
  const extra: Record<string, string> = {};
  mapping.forEach((f, i) => {
    const v = (row[i] ?? "").trim();
    if (!f || !v || v === "—" || v === "-") return;
    if (f === EXTRA_COLUMN) extra[(header[i] ?? `Column ${i + 1}`).trim().slice(0, 80) || `Column ${i + 1}`] = v.slice(0, 500);
    else raw[f] = v;
  });
  const errors: string[] = [];
  const warnings: string[] = [];
  const values: ParsedAllocation = {
    client: raw.client, employee: raw.employee, role: null, resourceType: null, to: null, weekDays: [], frequency: null, visitDays: null,
    firstHalfHours: null, secondHalfHours: null, reportsTo: raw.reportsTo, teamLeader: raw.teamLeader, allowOverlap: false, remark: raw.remark?.slice(0, 1000), extra,
  };

  if (!raw.client) errors.push("Client is empty");
  if (!raw.employee) errors.push("Team member is empty");
  if (!raw.from) errors.push("From date is empty");
  else {
    const d = parseAnyDate(raw.from);
    if (d) values.from = d;
    else errors.push(`From date “${raw.from}” is not a date (use DD-MM-YYYY)`);
  }
  if (raw.to) {
    const d = parseAnyDate(raw.to);
    if (!d) errors.push(`To date “${raw.to}” is not a date (use DD-MM-YYYY, or leave blank if ongoing)`);
    else if (values.from && d < values.from) errors.push("To date is before the From date");
    else values.to = d;
  }
  if (raw.role) {
    values.role = parseRole(raw.role);
    if (!values.role) warnings.push(`Role “${raw.role}” is not one of ${Object.values(ALLOCATION_ROLES).join(", ")}; left blank`);
  }
  if (raw.resourceType) {
    values.resourceType = parseResourceType(raw.resourceType);
    if (!values.resourceType) {
      values.resourceType = raw.resourceType.slice(0, 60);
      warnings.push(`Resource type “${raw.resourceType}” is not in the list; saved as written`);
    }
  }
  if (raw.frequency) {
    values.frequency = parseFrequency(raw.frequency);
    if (!values.frequency) warnings.push(`Frequency “${raw.frequency}” was not recognised; left blank (treated as every working day)`);
  }
  if (raw.weekDays) {
    const w = parseWeekDays(raw.weekDays);
    values.weekDays = w.days.filter((d) => d !== 0);
    if (w.unknown.length) warnings.push(`Week days: could not read “${w.unknown.join(", ")}”`);
    if (w.days.includes(0)) warnings.push("Sunday is not a working day and was left out");
  }
  if (raw.visitDays) {
    const rule = parseVisitDays(raw.visitDays);
    values.visitDays = rule ? formatVisitDays(rule) : raw.visitDays.slice(0, 80);
    if (values.frequency && !["TWICE_A_MONTH", "MONTHLY"].includes(values.frequency)) warnings.push("Visit day(s) of month are only used for Twice a month / Monthly; kept for reference");
  }
  if (raw.allowOverlap) {
    const yn = parseYesNo(raw.allowOverlap);
    if (yn === null) warnings.push(`Allow overlap “${raw.allowOverlap}” should be Yes or No; taken as No`);
    values.allowOverlap = yn ?? false;
  }

  // Hours: Full Day = Yes → whole day; No → the half-day hours; blank → hours if given, else whole day.
  const hours = (text: string | undefined, label: string, max: number) => {
    if (text === undefined) return undefined;
    const n = Number(text.replace(/h(ou)?rs?\.?$/i, "").trim());
    if (!Number.isFinite(n) || n < 0) { errors.push(`${label} “${text}” is not a number of hours`); return undefined; }
    if (n > max) { errors.push(`${label} is ${n} h, but that half has only ${max} h (firm timing policy)`); return undefined; }
    return Math.round(n * 100) / 100;
  };
  const first = hours(raw.firstHalfHours, "1st half", cap.first);
  const second = hours(raw.secondHalfHours, "2nd half", cap.second);
  const fullDay = raw.fullDay ? parseYesNo(raw.fullDay) : null;
  if (raw.fullDay && fullDay === null) warnings.push(`Full Day “${raw.fullDay}” should be Yes or No`);
  const anyHours = (first ?? 0) > 0 || (second ?? 0) > 0;
  if (fullDay === true) {
    if (anyHours) warnings.push("Full Day is Yes, so the half-day hours were ignored");
  } else if (anyHours) {
    values.firstHalfHours = first ?? 0;
    values.secondHalfHours = second ?? 0;
  } else if (values.frequency === "AS_REQUIRED") {
    values.firstHalfHours = 0;
    values.secondHalfHours = 0;
  } else if (fullDay === false && !errors.some((e) => /half/.test(e))) {
    errors.push("Full Day is No, so fill the hours in 1st half and/or 2nd half (or set Full Day = Yes)");
  }

  warnings.push(...scheduleWarnings(values));
  return { row: rowNumber, values, errors, warnings };
}

// ---------------------------------------------------------------- name matching

/** Lower case, "&" = "and", "Pvt Ltd" = "Private Limited", punctuation and spaces dropped. */
export function nameKey(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bprivate\b/g, "pvt")
    .replace(/\blimited\b/g, "ltd")
    .replace(/\bcompany\b/g, "co")
    .replace(/[^a-z0-9]+/g, "");
}

/** Names as typed, ignoring only case and spacing. */
export const exactKey = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export type NameCandidate = { id: string; label: string; keys: string[]; firstKey?: string; exact?: string[] };
export type NameMatch = { id: string } | { error: "missing" } | { error: "ambiguous"; labels: string[] };

/**
 * Finds the one record a name in the sheet means: exact name (or code / PAN) first, then
 * the name without its bracket "(Kamal)", then what is in the bracket, then a unique first name.
 */
export function matchName(text: string, candidates: NameCandidate[]): NameMatch {
  const tries = [text, text.replace(/\(.*?\)/g, " "), ...[...text.matchAll(/\(([^)]+)\)/g)].map((m) => m[1])].map(nameKey).filter(Boolean);
  for (const k of tries) {
    const hits = candidates.filter((c) => c.keys.includes(k));
    if (hits.length === 1) return { id: hits[0].id };
    if (hits.length > 1) {
      // "Phul Kari the Suit Shop" and "Phulkari The Suit Shop" are two clients: the exact spelling wins.
      const spelled = hits.filter((h) => h.exact?.includes(exactKey(text)));
      if (spelled.length === 1) return { id: spelled[0].id };
      return { error: "ambiguous", labels: hits.map((h) => h.label) };
    }
  }
  for (const k of tries) {
    const hits = candidates.filter((c) => c.firstKey === k);
    if (hits.length === 1) return { id: hits[0].id };
    if (hits.length > 1) return { error: "ambiguous", labels: hits.map((h) => h.label) };
  }
  return { error: "missing" };
}
