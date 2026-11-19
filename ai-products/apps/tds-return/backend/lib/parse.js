// Reads the TDS input files (CSV or .xlsx) and maps their columns to fields.
// The expected layouts are the client's templates (Payment Ledger, Vendor Master,
// TDS Challan Register, optional review notes CSV). Header names are matched
// loosely, so re-ordered columns, extra columns and small naming changes still work;
// if a required column can't be found, DeepSeek is asked to map the headers.
import { complete } from "./deepseek.js";

// ------------------------------------------------------------------ raw tables
function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
}

async function parseXLSX(buffer) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets.find((s) => s.actualRowCount > 1) || wb.worksheets[0];
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      let v = r.getCell(c).value;
      if (v && typeof v === "object" && !(v instanceof Date)) v = v.result ?? v.text ?? v.richText?.map((t) => t.text).join("") ?? "";
      vals.push(v ?? "");
    }
    if (vals.some((x) => String(x).trim() !== "")) rows.push(vals);
  });
  return rows;
}

export async function readTable(buffer, filename) {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "txt") return parseCSV(buffer.toString("utf8").replace(/^﻿/, ""));
  if (ext === "xlsx") return parseXLSX(buffer);
  throw new Error(`${filename}: unsupported file type ".${ext}". Upload CSV or .xlsx (save .xls files as .xlsx).`);
}

// ------------------------------------------------------------------ values
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const iso = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m, d));
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
};

/** Any date-like cell → "YYYY-MM-DD" (Indian D/M/Y for slash dates), or null. */
export function toDate(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return iso(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
  if (typeof v === "number" && v > 20000 && v < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + v * 864e5); return d.toISOString().slice(0, 10); }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return iso(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s,-]*(\d{2,4})/);
  if (m && MON[m[2].toLowerCase()] !== undefined) return iso(+m[3] < 100 ? 2000 + +m[3] : +m[3], MON[m[2].toLowerCase()], +m[1]);
  return null;
}

/** Number from a cell: handles "7500", "₹7,500", "(500)", blanks. */
export function toNum(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/[₹,\s]|INR|Rs\.?/gi, "").replace(/^\((.*)\)$/, "-$1");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export const text = (v) => (v instanceof Date ? toDate(v) : String(v ?? "").trim());

// ------------------------------------------------------------------ column maps
const norm = (h) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Order inside each spec matters: specific fields are claimed before generic ones.
export const SPECS = {
  payments: {
    label: "Payment Ledger",
    required: ["gross", "tds", "section"],
    fields: {
      id: [/^paymentid$/, /^(payment|voucher|txn|transaction|entry)(no|number|ref|id)$/, /^id$/],
      depositDate: [/deposit.*date|dateofdeposit/],
      date: [/^paymentdate$/, /^(txn|transaction|voucher|posting|credit|booking)?date$/, /dateofpayment|paiddate/],
      vendorId: [/^(vendor|deductee|party|supplier|payee)(id|code)$/],
      vendorName: [/^(vendor|deductee|party|supplier|payee)(name)?$/, /^name$/],
      pan: [/^(vendor|deductee|party|payee)?pan(no|number)?$/],
      section: [/section/],
      nature: [/^nature/, /description|particulars|narration/],
      gross: [/gross/, /^(amount|amountpaid|paymentamount|amountinr|amountcredited)$/],
      tds: [/tdsdeducted|tdsamount|^tds(inr)?$|taxdeducted/, /deducted/],
      net: [/^net/],
    },
  },
  vendors: {
    label: "Vendor Master",
    required: ["vendorId|vendorName", "pan|type|panStatus"],
    fields: {
      panStatus: [/pan.*(status|valid|verif)/],
      vendorId: [/^(vendor|deductee|party|supplier|payee)(id|code)$/, /^id$/, /^code$/],
      vendorName: [/^(vendor|deductee|party|supplier|payee)name$/, /^name$/],
      pan: [/^(vendor|deductee|party|payee)?pan(no|number)?$/],
      type: [/^(vendor|deductee|party|entity|payee)?type$/, /category|constitution|status$/],
    },
  },
  challans: {
    label: "TDS Challan Register",
    required: ["amount"],
    fields: {
      id: [/^challanid$/, /^challan(ref|code|no|number)?$/],
      bsr: [/bsr/],
      serial: [/serial/, /^challanno$|^challannumber$|^cin$/],
      date: [/^(challan|deposit|payment|tender)?date$/, /dateofdeposit/],
      amount: [/^(challan|total|deposit)?amount(inr)?$/, /amount/, /^tds$/],
      minorHead: [/minor/],
      fy: [/^(assessment|financial)?(fy|year)$|financialyear|assessmentfy|^ay$/],
      quarter: [/quarter|^qtr$|^q$/],
    },
  },
};

function mapHeaders(kind, headers) {
  const map = {}; const used = new Set();
  for (const [field, res] of Object.entries(SPECS[kind].fields)) {
    for (const re of res) {
      const i = headers.findIndex((h, idx) => !used.has(idx) && re.test(norm(h)));
      if (i >= 0) { map[field] = i; used.add(i); break; }
    }
  }
  return map;
}

const satisfied = (kind, map) => SPECS[kind].required.every((r) => r.split("|").some((f) => f in map));

async function llmMapHeaders(kind, headers, sample) {
  const fields = Object.keys(SPECS[kind].fields);
  const out = await complete([
    { role: "system", content: `You map spreadsheet columns of an Indian TDS "${SPECS[kind].label}" to fields. Return JSON {${fields.map((f) => `"${f}":idx|null`).join(",")}} where idx is the 0-based column index. Use null when no column fits.` },
    { role: "user", content: JSON.stringify({ headers, sample }) },
  ], { json: true, maxTokens: 300 });
  return Object.fromEntries(Object.entries(out).filter(([k, v]) => fields.includes(k) && Number.isInteger(v) && v >= 0 && v < headers.length));
}

/** Which input a table is, judged from its headers. */
export function detectKind(headers) {
  const h = headers.map(norm);
  const has = (re) => h.some((x) => re.test(x));
  if (has(/bsr/) || (has(/challan/) && has(/amount/))) return "challans";
  if (has(/section/) && (has(/gross/) || has(/tds/))) return "payments";
  if ((has(/vendor|deductee|party/) && has(/pan/) && !has(/amount|gross|tds/)) || has(/panstatus|vendortype/)) return "vendors";
  return "notes";
}

/** Header row = first row with ≥2 non-numeric text cells. */
function splitHeader(table) {
  const hIdx = Math.max(0, table.findIndex((r) => r.filter((c) => String(c).trim() && Number.isNaN(+c) && !(c instanceof Date)).length >= 2));
  return { headers: table[hIdx].map((x) => String(x ?? "").trim()), body: table.slice(hIdx + 1) };
}

/**
 * Parse one uploaded file. kind = "payments" | "vendors" | "challans" | "notes" | "auto".
 * Returns { kind, filename, headers, columns: {field: header}, rows: [{field: value}], raw }.
 */
export async function loadFile(buffer, filename, kind = "auto") {
  const table = await readTable(buffer, filename);
  if (!table.length) throw new Error(`${filename}: the file is empty.`);
  const { headers, body } = splitHeader(table);
  const detected = detectKind(headers);
  const k = kind === "auto" ? detected : kind;
  if (k === "notes") return { kind: "notes", filename, headers, columns: {}, rows: body.map((r) => Object.fromEntries(headers.map((hd, i) => [hd || `Column ${i + 1}`, text(r[i])]))), raw: table };

  let map = mapHeaders(k, headers);
  if (!satisfied(k, map)) {
    try { map = { ...(await llmMapHeaders(k, headers, body.slice(0, 3).map((r) => r.map(text)))), ...map }; }
    catch (e) { console.warn("header mapping (AI) failed:", e.message); }
  }
  if (!satisfied(k, map)) {
    const NAMES = { gross: "Gross_Amount_INR", tds: "TDS_Deducted_INR", section: "TDS_Section_As_Booked", vendorId: "Vendor_ID", vendorName: "Vendor_Name", pan: "PAN", type: "Vendor_Type", panStatus: "PAN_Status", amount: "Amount_INR" };
    const need = SPECS[k].required.filter((r) => !r.split("|").some((f) => f in map)).map((r) => r.split("|").map((f) => NAMES[f] || f).join(" / ")).join(", ");
    throw new Error(`${filename}: this doesn't look like a ${SPECS[k].label} — could not find the ${need} column(s). Found: ${headers.join(", ")}.`);
  }
  const rows = body.map((r) => Object.fromEntries(Object.entries(map).map(([f, i]) => [f, r[i]])));
  return { kind: k, filename, headers, columns: Object.fromEntries(Object.entries(map).map(([f, i]) => [f, headers[i]])), rows, raw: table };
}
