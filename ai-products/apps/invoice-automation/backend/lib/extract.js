// Invoice field extraction. Rule-based first (labelled fields + the line-item
// table mapped by its own header names); DeepSeek only when required fields
// are missing, e.g. an unfamiliar vendor layout. Amounts are never computed by
// the model — validation (validate.js) recomputes GST deterministically.
import { pdfToRows } from "./pdfText.js";
import { complete } from "./deepseek.js";

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const num = (s) => {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[₹,\s]|INR|Rs\.?/gi, ""));
  return Number.isFinite(n) ? n : null;
};
const isoDate = (s) => {
  if (!s) return null;
  s = String(s).trim();
  let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/); // Indian invoices: DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-,]+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
};

function field(lines, ...labels) {
  for (const re of labels) {
    for (const l of lines) {
      const m = l.match(re);
      if (m) return m[1].replace(/\s*\|\s*/g, " ").trim();
    }
  }
  return null;
}

const GSTIN = /\b(\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z])\b/;

function lineItems(lines) {
  const h = lines.findIndex((l) => /description/i.test(l) && /(taxable|amount|value)/i.test(l) && l.includes("|"));
  if (h < 0) return [];
  const head = lines[h].split("|").map((s) => s.trim().toLowerCase());
  const col = (re) => head.findIndex((x) => re.test(x));
  const ci = { desc: col(/desc|particular|item/), hsn: col(/hsn|sac/), qty: col(/qty|quantity/), taxable: col(/taxable|amount|value/), rate: col(/rate|gst\s*%/), tax: col(/tax amount|gst amount/) };
  const items = [];
  for (let i = h + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^(taxable value|sub ?total|cgst|sgst|igst|invoice total|total)\b/i.test(l)) break;
    const cells = l.split("|").map((s) => s.trim());
    if (cells.length < 3) continue;
    const get = (k) => (ci[k] >= 0 ? cells[ci[k]] : undefined);
    items.push({
      description: get("desc") || cells[0],
      hsn: get("hsn") || null,
      quantity: num(get("qty")),
      taxable: num(get("taxable")),
      ratePercent: num(String(get("rate") ?? "").replace("%", "")),
      tax: num(get("tax")),
    });
  }
  return items.filter((x) => x.taxable != null);
}

export function parseRules(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const supplierGstin = (field(lines, /^supplier gstin[^:]*:\s*(.+)$/i, /^gstin[^:]*:\s*(.+)$/i) || "").match(GSTIN)?.[1] || null;
  const recipientGstin = (field(lines, /^(?:recipient|buyer|customer|bill to) gstin[^:]*:\s*(.+)$/i) || "").match(GSTIN)?.[1] || null;
  const items = lineItems(lines);
  const inv = {
    supplierName: field(lines, /^supplier(?: name)?\s*:\s*(.+)$/i, /^(?:from|seller|vendor)\s*:\s*(.+)$/i),
    supplierGstin,
    supplierAddress: field(lines, /^supplier address\s*:\s*(.+)$/i),
    invoiceNumber: field(lines, /^invoice (?:number|no\.?|#)\s*:\s*(.+)$/i, /^bill (?:number|no\.?)\s*:\s*(.+)$/i),
    invoiceDate: isoDate(field(lines, /^invoice date\s*:\s*(.+)$/i, /^date\s*:\s*(.+)$/i)),
    billTo: field(lines, /^bill to\s*:\s*(.+)$/i, /^buyer\s*:\s*(.+)$/i),
    recipientGstin,
    items,
    taxableValue: num(field(lines, /^taxable value\s*:\s*(.+)$/i, /^sub ?total\s*:\s*(.+)$/i)) ?? (items.length ? items.reduce((s, x) => s + x.taxable, 0) : null),
    cgst: num(field(lines, /^cgst[^:]*:\s*(.+)$/i)),
    sgst: num(field(lines, /^(?:sgst|utgst)[^:]*:\s*(.+)$/i)),
    igst: num(field(lines, /^igst[^:]*:\s*(.+)$/i)),
    invoiceTotal: num(field(lines, /^(?:invoice total|grand total|total amount|amount payable|total)\s*:\s*(.+)$/i)),
  };
  return inv;
}

const REQUIRED = ["supplierName", "invoiceNumber", "invoiceDate", "taxableValue", "invoiceTotal"];
const missing = (inv) => REQUIRED.filter((k) => inv[k] == null || inv[k] === "");

async function parseWithModel(text) {
  const out = await complete([
    { role: "system", content: `Extract fields from an Indian GST tax invoice. Return JSON:
{"supplierName":string,"supplierGstin":string|null,"supplierAddress":string|null,"invoiceNumber":string,"invoiceDate":"YYYY-MM-DD","billTo":string|null,"recipientGstin":string|null,
"items":[{"description":string,"hsn":string|null,"quantity":number|null,"taxable":number,"ratePercent":number|null,"tax":number|null}],
"taxableValue":number,"cgst":number|null,"sgst":number|null,"igst":number|null,"invoiceTotal":number}
Read values exactly as printed; do not calculate. Numbers without currency symbols or separators. Use null when absent.` },
    { role: "user", content: text.slice(0, 12000) },
  ], { json: true, maxTokens: 1200 });
  return { ...out, invoiceDate: isoDate(out.invoiceDate) || out.invoiceDate };
}

/** PDF buffer → extracted invoice (+ how it was read). */
export async function extractInvoice(buffer) {
  const { text, charCount } = await pdfToRows(buffer);
  if (charCount < 40) return { error: "No text layer — scanned image PDFs are not supported yet.", method: "none" };
  let inv = parseRules(text), method = "rules";
  if (missing(inv).length) {
    try {
      const ai = await parseWithModel(text);
      // keep rule-read values, fill gaps from the model
      inv = Object.fromEntries(Object.keys({ ...ai, ...inv }).map((k) => [k, inv[k] ?? ai[k] ?? null]));
      if (!inv.items?.length && ai.items?.length) inv.items = ai.items;
      method = "rules+ai";
    } catch (e) {
      console.warn("AI extraction failed:", e.message);
    }
  }
  const gaps = missing(inv);
  return { ...inv, method, missing: gaps, text };
}
