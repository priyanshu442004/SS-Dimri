// Client import from Excel (pure): recognise columns, clean values, flag problems.
// Column names follow the firm's SSDA_Client_Master sheet (and the older "12. Client Details");
// common variants are matched too, and anything unrecognised can be mapped by hand.

export const IMPORT_FIELDS = {
  clientCode: { label: "Client code", aliases: ["client code", "code", "client id", "client no", "client number"] },
  tradeName: { label: "Client name", aliases: ["client name (as used in office)", "client name", "name of client", "trade name", "name", "client", "business name", "party name"] },
  legalName: { label: "Legal name", aliases: ["legal name (as per pan)", "legal name (as per pan / gst)", "legal name", "name as per pan", "name as per gst", "registered name"] },
  constitution: { label: "Constitution", aliases: ["constitution of business", "constitution", "entity type", "type of entity", "legal status", "status of assessee"] },
  businessNature: { label: "Nature of business", aliases: ["nature of business", "business nature", "line of business", "industry"] },
  gstin: { label: "GSTIN", aliases: ["gstin", "gst no", "gst number", "gst", "gstin no", "gst registration no"] },
  pan: { label: "PAN", aliases: ["pan", "pan no", "pan number"] },
  tan: { label: "TAN", aliases: ["tan", "tan no", "tan number"] },
  contactName: { label: "Contact person", aliases: ["contact person", "contact name", "contact", "authorised person", "person name"] },
  contactMobile: { label: "Mobile", aliases: ["mobile", "mobile no", "mobile number", "phone", "phone no", "contact no", "contact number"] },
  contactEmail: { label: "Email", aliases: ["email", "email id", "e-mail", "mail id", "email address"] },
  address: { label: "Address", aliases: ["address", "office address", "registered address", "registered office"] },
  services: { label: "Services taken", aliases: ["services taken", "services", "service", "nature of service", "nature of services"] },
  placeOfWork: { label: "Place of work", aliases: ["place of work", "work location", "location of work"] },
  billingBasis: { label: "Billing basis", aliases: ["billing basis", "billing", "billing type"] },
  fee: { label: "Fee (₹)", aliases: ["fee (₹)", "fee", "fees", "agreed fee", "fee (rs)", "fee rs", "monthly fee"] },
  status: { label: "Status", aliases: ["status", "client status"] },
  state: { label: "State", aliases: ["state", "state name"] },
  dateOfBirth: { label: "DOB / incorporation date", aliases: ["dob", "date of birth", "date of incorporation", "dob / doi", "doi"] },
  itFileNo: { label: "IT file no.", aliases: ["it file no", "it file number", "file no", "income tax file no"] },
  departments: { label: "Applicable department", aliases: ["applicable department", "applicable departments", "department", "departments"] },
  remark: { label: "Remark", aliases: ["remark", "remarks", "note", "notes"] },
  gstUserId: { label: "GST user ID", aliases: ["gst user id", "gst username", "gst login id"] },
  gstPassword: { label: "GST password", aliases: ["gst password"] },
  incomeTaxUserId: { label: "Income Tax user ID", aliases: ["income tax user id", "it user id", "income tax username"] },
  incomeTaxPassword: { label: "Income Tax password", aliases: ["income tax password", "it password"] },
  tracesUserId: { label: "TRACES user ID", aliases: ["traces user id", "traces username"] },
  tracesPassword: { label: "TRACES password", aliases: ["traces password"] },
} as const;

/** Columns that hold secrets: stored encrypted, never sent back to the browser. */
export const SECRET_FIELDS = ["gstPassword", "incomeTaxPassword", "tracesPassword"] as const;

export type ImportField = keyof typeof IMPORT_FIELDS;
/** "extra" = a column with no field of its own: kept on the client as it is (client feedback 13 Nov 2026). */
export const EXTRA_COLUMN = "extra" as const;
export type ColumnMapping = (ImportField | typeof EXTRA_COLUMN | "")[];

const norm = (s: string) => s.toLowerCase().replace(/\*/g, " ").replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
/** Serial-number columns are never worth keeping. */
const isSerial = (h: string) => /^(s ?no|sr ?no|sl ?no|serial( no| number)?|#|no)$/.test(norm(h));

/** Finds the header row (a client sheet often has a title above it) in the first rows. */
export function findHeaderRow(rows: string[][]): number {
  let best = 0;
  let bestScore = -1;
  rows.slice(0, 10).forEach((row, i) => {
    const score = guessMapping(row).filter((m) => m && m !== EXTRA_COLUMN).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  });
  return best;
}

export function guessMapping(header: string[]): ColumnMapping {
  const taken = new Set<ImportField>();
  const fields = Object.keys(IMPORT_FIELDS) as ImportField[];
  const matchOn = (test: (alias: string, h: string) => boolean) => (h: string) => {
    for (const f of fields) {
      if (taken.has(f)) continue;
      if (IMPORT_FIELDS[f].aliases.some((a) => test(a, h))) return f;
    }
    return "" as const;
  };
  const exact = matchOn((a, h) => a === h);
  const loose = matchOn((a, h) => a.length > 3 && h.startsWith(a));
  const mapping: ColumnMapping = header.map(() => "");
  // Exact matches first, so "Client Name" is never taken by a looser match on another column.
  header.forEach((h, i) => {
    const f = exact(norm(h));
    if (f) { mapping[i] = f; taken.add(f); }
  });
  header.forEach((h, i) => {
    if (mapping[i]) return;
    const f = loose(norm(h));
    if (f) { mapping[i] = f; taken.add(f); }
  });
  // Any other headed column is kept as an extra detail, so nothing in the sheet is lost.
  header.forEach((h, i) => {
    if (!mapping[i] && h.trim() && !isSerial(h)) mapping[i] = EXTRA_COLUMN;
  });
  return mapping;
}

const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const TAN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Constitution wording in sheets → master codes. */
const CONSTITUTION_WORDS: [RegExp, string][] = [
  [/^(proprietor|proprietorship|sole prop)/i, "CON-03"],
  [/^(partnership|firm)/i, "CON-04"],
  [/^llp|limited liability/i, "CON-05"],
  [/^(pvt|private)/i, "CON-06"],
  [/^(public|ltd|limited)/i, "CON-07"],
  [/^(opc|one person)/i, "CON-08"],
  [/^(trust|ngo|society|section 8)/i, "CON-09"],
  [/^(aop|boi|association)/i, "CON-10"],
  [/^(govt|government|local body)/i, "CON-11"],
  [/^huf|hindu undivided/i, "CON-02"],
  [/^individual/i, "CON-01"],
];
export function constitutionCode(text: string) {
  return CONSTITUTION_WORDS.find(([re]) => re.test(text.trim()))?.[1] ?? null;
}

export function normalizeMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 11 && digits.startsWith("0") ? digits.slice(1) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

export type ParsedClient = Partial<Record<ImportField, string>> & { gstins: string[]; departmentList: string[]; extra?: Record<string, string> };

/** DD/MM/YYYY (or an Excel ISO date) → YYYY-MM-DD. */
export function parseSheetDate(raw: string): string | null {
  const t = raw.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (dmy) [d, m, y] = [Number(dmy[1]), Number(dmy[2]), Number(dmy[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 1850 || y > 2100) return null;
  return date.toISOString().slice(0, 10);
}
export type RowResult = { row: number; values: ParsedClient; errors: string[]; warnings: string[] };

/** Turns one sheet row into clean values. Errors stop a row; warnings drop the bad value only. */
export function parseRow(row: string[], mapping: ColumnMapping, rowNumber: number, header: string[] = []): RowResult {
  const values: ParsedClient = { gstins: [], departmentList: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  mapping.forEach((f, i) => {
    const v = (row[i] ?? "").trim();
    if (!f || !v || v === "—" || v === "-") return;
    if (f === EXTRA_COLUMN) {
      const key = (header[i] ?? "").trim().slice(0, 80) || `Column ${i + 1}`;
      values.extra = { ...values.extra, [key]: v.slice(0, 1000) };
    } else values[f] = v;
  });
  if (!values.tradeName) errors.push("Client name is empty");
  if (values.gstin) {
    const list = values.gstin.split(/[\s,;/]+/).map((g) => g.toUpperCase()).filter(Boolean);
    const bad = list.filter((g) => !GSTIN.test(g));
    if (bad.length) warnings.push(`GSTIN ${bad.join(", ")} is not valid and was skipped`);
    values.gstins = [...new Set(list.filter((g) => GSTIN.test(g)))];
  }
  if (values.pan) {
    values.pan = values.pan.toUpperCase();
    if (!PAN.test(values.pan)) { warnings.push(`PAN ${values.pan} is not valid and was skipped`); delete values.pan; }
  }
  if (values.tan) {
    values.tan = values.tan.toUpperCase();
    if (!TAN.test(values.tan)) { warnings.push(`TAN ${values.tan} is not valid and was skipped`); delete values.tan; }
  }
  if (values.contactMobile) {
    const m = normalizeMobile(values.contactMobile);
    if (m) values.contactMobile = m;
    else { warnings.push(`Mobile ${values.contactMobile} is not a valid Indian number and was skipped`); delete values.contactMobile; }
  }
  if (values.contactEmail) {
    values.contactEmail = values.contactEmail.toLowerCase();
    if (!EMAIL.test(values.contactEmail)) { warnings.push(`Email ${values.contactEmail} is not valid and was skipped`); delete values.contactEmail; }
  }
  if (values.dateOfBirth) {
    const iso = parseSheetDate(values.dateOfBirth);
    if (iso) values.dateOfBirth = iso;
    else { warnings.push(`DOB "${values.dateOfBirth}" is not a date (DD/MM/YYYY) and was skipped`); delete values.dateOfBirth; }
  }
  if (values.departments) values.departmentList = [...new Set(values.departments.split(/[,;/\n]+/).map((x) => x.trim()).filter(Boolean))];
  if (values.fee) {
    const n = Number(values.fee.replace(/[₹,\s]|rs\.?/gi, ""));
    if (Number.isFinite(n) && n >= 0) values.fee = String(n);
    else { warnings.push(`Fee "${values.fee}" is not a number and was skipped`); delete values.fee; }
  }
  return { row: rowNumber, values, errors, warnings };
}

export type MergedRow = RowResult & { mergedInto?: number };

/**
 * The Client Master has one row per GSTIN, matched on PAN. Rows with the same PAN are one
 * client: the first row keeps its values, later rows add their GSTINs, departments and any
 * value the first row left empty, and are marked as merged. A row without a PAN joins an
 * earlier row of the same name; the same name with a different PAN stays a separate client.
 */
export function mergeRowsByPan(rows: RowResult[]): MergedRow[] {
  const out: MergedRow[] = rows.map((r) => ({ ...r, values: { ...r.values, gstins: [...r.values.gstins], departmentList: [...r.values.departmentList] } }));
  const byPan = new Map<string, MergedRow>();
  const byName = new Map<string, MergedRow[]>();
  const nameKey = (v: ParsedClient) => (v.tradeName ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  for (const r of out) {
    if (r.errors.length) continue;
    const v = r.values;
    const sameName = byName.get(nameKey(v)) ?? [];
    const target = v.pan ? byPan.get(v.pan) : sameName.length === 1 ? sameName[0] : sameName.find((x) => !x.values.pan);
    if (target) {
      const t = target.values;
      t.gstins = [...new Set([...t.gstins, ...v.gstins])];
      t.departmentList = [...new Set([...t.departmentList, ...v.departmentList])];
      if (v.extra) t.extra = { ...v.extra, ...t.extra };
      for (const [k, val] of Object.entries(v) as [ImportField, string][]) {
        if (typeof val === "string" && val && !t[k]) t[k] = val;
      }
      r.mergedInto = target.row;
      continue;
    }
    if (v.pan) byPan.set(v.pan, r);
    byName.set(nameKey(v), [...sameName, r]);
  }
  return out;
}
