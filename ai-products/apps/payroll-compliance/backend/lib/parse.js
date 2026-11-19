// Reads the payroll inputs (CSV or .xlsx) and maps their columns to fields.
// The expected layouts are the client's templates (Employee Salary Master, Attendance & Leave,
// Payroll Inputs, Statutory Rule Configuration, optional test-notes CSV). Header names are matched
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
const EMP_ID = [/^(employee|emp|staff|worker|associate)(id|code|no|number)$/, /^(ecode|empcode|id|code)$/];
const EMP_NAME = [/^(employee|emp|staff|worker)?name$/, /name/];
const PERIOD = [/^(payroll|pay|salary)?(period|month)$/, /period|month/];
export const SPECS = {
  master: {
    label: "Employee Salary Master",
    required: ["employeeId", "basic|gross"],
    fields: {
      employeeId: EMP_ID,
      employeeName: EMP_NAME,
      joiningDate: [/join|^doj$|dateofjoin|startdate/],
      exitDate: [/exit|leaving|relieving|^dol$|resign|separation|lastworking/],
      department: [/department|^dept|division|function/],
      payFrequency: [/frequency|paycycle|payfreq/],
      pfBasis: [/pf.*(basis|wage|base)|pfwages/],
      pfFlag: [/pf.*(applicab|flag|eligib|covered)|^pf$/],
      esiFlag: [/esi.*(applicab|flag|eligib|covered)|^esi$/],
      state: [/^(work)?state$|ptstate|location/],
      basic: [/^basic/],
      hra: [/^hra|houserent/],
      special: [/special/],
      otherAllowance: [/^otherallowance|^otherallow/],
      gross: [/^(gross|monthlygross|fixedpay|monthlyctc|monthlysalary|grosssalary)/],
    },
  },
  attendance: {
    label: "Attendance & Leave",
    required: ["employeeId", "unpaidLeave|present"],
    fields: {
      employeeId: EMP_ID,
      employeeName: EMP_NAME,
      period: PERIOD,
      calendarDays: [/calendar|totaldays|daysinmonth|monthdays/],
      offs: [/off|holiday/],
      unpaidLeave: [/unpaid|^lop|lossofpay|^lwp|leavewithoutpay/],
      paidLeave: [/paidleave|^pl$|^pldays/],
      present: [/present|worked|attended/],
      otHours: [/overtime|^ot(hours|hrs)?$/],
    },
  },
  inputs: {
    label: "Payroll Inputs",
    required: ["employeeId", "incentive|reimbursement|advance|otherDeduction|otRate"],
    fields: {
      employeeId: EMP_ID,
      period: PERIOD,
      otRate: [/(overtime|ot)rate|rateperhour|hourlyrate|perhour/],
      otHours: [/^(overtime|ot)(hours|hrs)/],
      incentive: [/incentive|bonus|commission/],
      reimbursement: [/reimburs/],
      advance: [/advance|loan/],
      otherDeduction: [/otherded|deduction/],
    },
  },
  rules: {
    label: "Statutory Rule Configuration",
    required: ["name", "value"],
    fields: {
      value: [/value|configured|setting$/],
      notes: [/note|remark|comment|description/],
      name: [/rule|parameter|name|item|setting/],
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
    { role: "system", content: `You map spreadsheet columns of an Indian payroll "${SPECS[kind].label}" to fields. Return JSON {${fields.map((f) => `"${f}":idx|null`).join(",")}} where idx is the 0-based column index. Use null when no column fits.` },
    { role: "user", content: JSON.stringify({ headers, sample }) },
  ], { json: true, maxTokens: 300 });
  return Object.fromEntries(Object.entries(out).filter(([k, v]) => fields.includes(k) && Number.isInteger(v) && v >= 0 && v < headers.length));
}

/** Which input a table is, judged from its headers. */
export function detectKind(headers) {
  const h = headers.map(norm);
  const has = (re) => h.some((x) => re.test(x));
  if (has(/rule|parameter|setting/) && has(/value/)) return "rules";
  if (has(/^basic|^hra|join|^doj$|monthlyctc|grosssalary|monthlygross/)) return "master";
  if (has(/unpaid|present|^lop|lossofpay|leave|calendar/)) return "attendance";
  if (has(/incentive|reimburs|advance|deduction|overtimerate|otrate|bonus/)) return "inputs";
  return "notes";
}

/** Header row = first row with ≥2 non-numeric text cells. */
function splitHeader(table) {
  const hIdx = Math.max(0, table.findIndex((r) => r.filter((c) => String(c).trim() && Number.isNaN(+c) && !(c instanceof Date)).length >= 2));
  return { headers: table[hIdx].map((x) => String(x ?? "").trim()), body: table.slice(hIdx + 1) };
}

/**
 * Parse one uploaded file. kind = "master" | "attendance" | "inputs" | "rules" | "notes" | "auto".
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
    const NAMES = { employeeId: "Employee_ID", basic: "Basic_INR", gross: "Gross_INR", unpaidLeave: "Unpaid_Leave_Days", present: "Present_Days", incentive: "Incentive_INR", reimbursement: "Reimbursement_INR", advance: "Advance_Recovery_INR", otherDeduction: "Other_Deduction_INR", otRate: "Overtime_Rate_INR_Per_Hour", name: "Rule_Name", value: "Configured_Value" };
    const need = SPECS[k].required.filter((r) => !r.split("|").some((f) => f in map)).map((r) => r.split("|").map((f) => NAMES[f] || f).join(" / ")).join(", ");
    throw new Error(`${filename}: this doesn't look like ${/^[AEIOU]/.test(SPECS[k].label) ? "an" : "a"} ${SPECS[k].label} — could not find the ${need} column(s). Found: ${headers.join(", ")}.`);
  }
  // extra fixed-pay components in the salary master (e.g. Conveyance_Allowance_INR) count as earnings
  const mapped = new Set(Object.values(map));
  const extraPay = k === "master" ? headers.map((hd, i) => [hd, i]).filter(([hd, i]) => !mapped.has(i) && /allowance|conveyance|medical|lta|dearness|^da(inr)?$|^city/.test(norm(hd)) && !/pf|esi|flag|days/.test(norm(hd))) : [];
  const rows = body.map((r) => ({
    ...Object.fromEntries(Object.entries(map).map(([f, i]) => [f, r[i]])),
    ...(extraPay.length ? { extraPay: extraPay.map(([hd, i]) => [hd, r[i]]) } : {}),
  }));
  const columns = Object.fromEntries(Object.entries(map).map(([f, i]) => [f, headers[i]]));
  if (extraPay.length) columns.extraPay = extraPay.map(([hd]) => hd).join(", ");
  return { kind: k, filename, headers, columns, rows, raw: table };
}
