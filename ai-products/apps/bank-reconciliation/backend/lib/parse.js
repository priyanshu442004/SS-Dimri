// Reads a bank statement / books ledger (CSV or .xlsx) into normalized rows:
//   { id, date, valueDate, ref, narration, party, voucher, type, channel, amount }
// amount is signed from the bank account's point of view: + money in, − money out.
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
  // loaded on demand: exceljs is slow to import and only needed for .xlsx uploads
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets.find((s) => s.actualRowCount > 1) || wb.worksheets[0];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const vals = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      let v = r.getCell(c).value;
      if (v && typeof v === "object") v = v instanceof Date ? v : v.result ?? v.text ?? v.richText?.map((t) => t.text).join("") ?? "";
      vals.push(v ?? "");
    }
    rows.push(vals);
  });
  return rows;
}

export async function readTable(buffer, filename) {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "txt") return parseCSV(buffer.toString("utf8").replace(/^﻿/, ""));
  if (ext === "xlsx") return parseXLSX(buffer);
  throw new Error(`Unsupported file type ".${ext}". Upload CSV or .xlsx (save .xls files as .xlsx).`);
}

// ------------------------------------------------------------------ columns
const SYN = {
  id: [/^(statement|ledger)?_?row_?id$/, /^s\.?\s?no\.?$/, /^sr\.?\s?no/, /^row_?id$/],
  date: [/^(transaction|txn|tran|posting|voucher|entry)?[\s_]*date$/, /^date$/],
  valueDate: [/^value[\s_]*date$/],
  ref: [/ref(erence)?/, /utr/, /chq|cheque|instrument/],
  narration: [/narration|description|particulars|remarks|details/],
  party: [/party|ledger|account[\s_]*name|payee|beneficiary/],
  voucher: [/voucher[\s_]*(no|number)|vch|^doc(ument)?[\s_]*no/],
  type: [/voucher[\s_]*type|^type$|txn[\s_]*type/],
  channel: [/channel|mode/],
  debit: [/^debit|withdraw|^dr\b|paid[\s_]*out/],
  credit: [/^credit|deposit|^cr\b|paid[\s_]*in/],
  amount: [/^amount$|^amt$/],
};
const norm = (h) => String(h).trim().toLowerCase();

function mapHeaders(headers) {
  const map = {}; const used = new Set();
  // order matters: specific before generic (valueDate before date, voucher type before voucher)
  for (const key of ["id", "valueDate", "type", "voucher", "debit", "credit", "amount", "date", "ref", "narration", "party", "channel"]) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && SYN[key].some((re) => re.test(norm(h))));
    if (i >= 0) { map[key] = i; used.add(i); }
  }
  return map;
}

async function llmMapHeaders(headers, sample, kind) {
  const out = await complete([
    { role: "system", content: `Map spreadsheet columns of a ${kind} to fields. Return JSON {"date":idx|null,"valueDate":idx|null,"ref":idx|null,"narration":idx|null,"party":idx|null,"voucher":idx|null,"type":idx|null,"debit":idx|null,"credit":idx|null,"amount":idx|null,"id":idx|null}. idx = 0-based column index.` },
    { role: "user", content: JSON.stringify({ headers, sample }) },
  ], { json: true, maxTokens: 300 });
  return Object.fromEntries(Object.entries(out).filter(([, v]) => Number.isInteger(v)));
}

// ------------------------------------------------------------------ values
const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** Decide D/M vs M/D from all slash-dates in a column. */
function slashOrder(values) {
  let dmy = false, mdy = false;
  for (const v of values) {
    const m = String(v).match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
    if (!m) continue;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  }
  return mdy && !dmy ? "mdy" : "dmy"; // Indian default when ambiguous
}

function toDate(v, order) {
  if (v instanceof Date) return new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5); // Excel serial
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    const [d, mo] = order === "mdy" ? [+m[2], +m[1]] : [+m[1], +m[2]];
    return new Date(Date.UTC(y, mo - 1, d));
  }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]*(\d{2,4})/);
  if (m && MON[m[2].toLowerCase()] !== undefined) {
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    return new Date(Date.UTC(y, MON[m[2].toLowerCase()], +m[1]));
  }
  return null;
}

const toNum = (v) => {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(/[₹,\s]/g, "").replace(/^\((.*)\)$/, "-$1").replace(/(cr|dr)$/i, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

// ------------------------------------------------------------------ public
/**
 * @param kind "bank" | "books"
 * @param signMode for books: "auto" | "bank" (credit = receipt) | "accounting" (debit = receipt)
 */
export async function loadRows(buffer, filename, kind, signMode = "auto") {
  const table = await readTable(buffer, filename);
  if (table.length < 2) throw new Error(`${filename}: no data rows found.`);
  // header = first row with ≥3 non-empty text cells
  const hIdx = table.findIndex((r) => r.filter((c) => String(c).trim() && isNaN(+c)).length >= 3);
  const headers = table[hIdx].map((h) => String(h).trim());
  const body = table.slice(hIdx + 1);

  let map = mapHeaders(headers);
  const missing = !("date" in map) || !(("debit" in map && "credit" in map) || "amount" in map);
  if (missing) map = { ...map, ...(await llmMapHeaders(headers, body.slice(0, 3), kind === "bank" ? "bank statement" : "cash/bank book ledger")) };
  if (!("date" in map) || !(("debit" in map && "credit" in map) || "amount" in map))
    throw new Error(`${filename}: could not find date and debit/credit (or amount) columns.`);

  const order = slashOrder(body.map((r) => r[map.date]));
  const get = (r, k) => (k in map ? r[map[k]] : "");
  const prefix = kind === "bank" ? "BS" : "CB";

  let rows = body.map((r, i) => {
    const dr = "debit" in map ? toNum(get(r, "debit")) : 0;
    const cr = "credit" in map ? toNum(get(r, "credit")) : 0;
    const amt = "amount" in map && !("debit" in map) ? toNum(get(r, "amount")) : cr - dr;
    return {
      id: String(get(r, "id") || `${prefix}-${String(i + 1).padStart(4, "0")}`).trim(),
      date: toDate(get(r, "date"), order),
      valueDate: toDate(get(r, "valueDate"), order),
      ref: String(get(r, "ref") ?? "").trim().toUpperCase(),
      narration: String(get(r, "narration") ?? "").trim(),
      party: String(get(r, "party") ?? "").trim(),
      voucher: String(get(r, "voucher") ?? "").trim(),
      type: String(get(r, "type") ?? "").trim(),
      channel: String(get(r, "channel") ?? "").trim().toUpperCase(),
      amount: Math.round(amt * 100) / 100,
    };
  }).filter((r) => r.date && r.amount !== 0);

  // books sign convention: receipts must come out positive
  let convention = "bank";
  if (kind === "books") {
    if (signMode === "accounting") convention = "accounting";
    else if (signMode === "auto") {
      const receipts = rows.filter((r) => /receipt/i.test(r.type));
      const payments = rows.filter((r) => /payment/i.test(r.type));
      const score = receipts.filter((r) => r.amount < 0).length + payments.filter((r) => r.amount > 0).length;
      const agree = receipts.filter((r) => r.amount > 0).length + payments.filter((r) => r.amount < 0).length;
      if (score > agree) convention = "accounting";
    }
    if (convention === "accounting") rows = rows.map((r) => ({ ...r, amount: -r.amount }));
  }

  return { rows, columns: Object.fromEntries(Object.entries(map).map(([k, i]) => [k, headers[i]])), dateOrder: order, convention };
}
