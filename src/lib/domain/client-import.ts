// Client import from Excel (pure): recognise columns, clean values, flag problems.
// Column names follow the firm's "12. Client Details" sheet; common variants are matched
// too, and anything unrecognised can be mapped by hand on the preview screen.

export const IMPORT_FIELDS = {
  clientCode: { label: "Client code", aliases: ["client code", "code", "client id", "client no", "client number"] },
  tradeName: { label: "Client name", aliases: ["client name (as used in office)", "client name", "name of client", "trade name", "name", "client", "business name", "party name"] },
  legalName: { label: "Legal name", aliases: ["legal name (as per pan / gst)", "legal name", "name as per pan", "name as per gst", "registered name"] },
  constitution: { label: "Constitution", aliases: ["constitution", "entity type", "type of entity", "legal status", "status of assessee"] },
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
} as const;

export type ImportField = keyof typeof IMPORT_FIELDS;
export type ColumnMapping = (ImportField | "")[];

const norm = (s: string) => s.toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ").trim();

/** Finds the header row (a client sheet often has a title above it) in the first rows. */
export function findHeaderRow(rows: string[][]): number {
  let best = 0;
  let bestScore = -1;
  rows.slice(0, 10).forEach((row, i) => {
    const score = guessMapping(row).filter(Boolean).length;
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

export type ParsedClient = Partial<Record<ImportField, string>> & { gstins: string[] };
export type RowResult = { row: number; values: ParsedClient; errors: string[]; warnings: string[] };

/** Turns one sheet row into clean values. Errors stop a row; warnings drop the bad value only. */
export function parseRow(row: string[], mapping: ColumnMapping, rowNumber: number): RowResult {
  const values: ParsedClient = { gstins: [] };
  const errors: string[] = [];
  const warnings: string[] = [];
  mapping.forEach((f, i) => {
    const v = (row[i] ?? "").trim();
    if (f && v && v !== "—" && v !== "-") values[f] = v;
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
  if (values.fee) {
    const n = Number(values.fee.replace(/[₹,\s]|rs\.?/gi, ""));
    if (Number.isFinite(n) && n >= 0) values.fee = String(n);
    else { warnings.push(`Fee "${values.fee}" is not a number and was skipped`); delete values.fee; }
  }
  return { row: rowNumber, values, errors, warnings };
}
