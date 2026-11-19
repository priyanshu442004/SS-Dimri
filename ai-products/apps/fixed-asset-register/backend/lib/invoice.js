// Capital purchase invoices (PDF) → structured fields, for matching to the additions ledger.
// Text PDFs are read with pdf.js (rows rebuilt from coordinates, "Label | Value" columns kept apart);
// labelled fields are taken by rule. Only if the invoice number or total can't be found is DeepSeek
// asked to read the text. Scanned (image-only) PDFs are reported as unreadable — nothing is guessed.
import { pdfToRows } from "./pdfText.js";
import { complete } from "./deepseek.js";
import { toDate, toNum } from "./parse.js";

const FIELDS = [
  ["invoiceNo", /^(invoice|bill|tax invoice)\s*(no\.?|number|#|num)\b/i],
  ["invoiceDate", /^(invoice|bill)?\s*date\b/i],
  ["supplier", /^(supplier|vendor|seller|sold by|from)\b/i],
  ["buyer", /^(buyer|bill to|billed to|customer|sold to)\b/i],
  ["description", /^(description|item|particulars|goods|asset)\b/i],
  ["taxable", /^(taxable\s*(value|amount)|sub\s*-?total|net amount|value before tax)\b/i],
  ["gst", /^(gst|igst|cgst|sgst|tax amount|total tax)\b/i],
  ["total", /^(invoice total|grand total|total amount|amount payable|total invoice value|total)\b/i],
  ["terms", /^(payment terms|terms)\b/i],
];
const MONEY = new Set(["taxable", "gst", "total"]);

function byRules(text) {
  const out = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    // "Label | Value" (table) or "Label: Value"
    const m = line.match(/^(.+?)\s*(?:\||:)\s*(.+)$/);
    if (!m) continue;
    const [label, value] = [m[1].trim(), m[2].replace(/\s*\|\s*/g, " ").trim()];
    for (const [f, re] of FIELDS) if (!(f in out) && re.test(label)) { out[f] = value; break; }
  }
  return out;
}

async function byAI(text) {
  const keys = FIELDS.map(([f]) => f);
  const out = await complete([
    { role: "system", content: `Extract fields from an Indian capital purchase invoice. Return JSON {${keys.map((k) => `"${k}":string|null`).join(",")}} copying values exactly as printed. Use null when a field isn't present.` },
    { role: "user", content: text.slice(0, 6000) },
  ], { json: true, maxTokens: 400 });
  return Object.fromEntries(Object.entries(out || {}).filter(([k, v]) => keys.includes(k) && v != null && v !== ""));
}

/** @returns {{file, readable, synthetic, method, invoiceNo, invoiceDate, supplier, buyer, description, taxable, gst, total, terms, text}} */
export async function readInvoice(buffer, file) {
  let text = "";
  try { text = (await pdfToRows(buffer)).text; } catch (e) { return { file, readable: false, error: `Could not open the PDF (${e.message})` }; }
  if (text.replace(/\s/g, "").length < 20) return { file, readable: false, error: "No text layer — the PDF looks scanned; upload a text PDF or enter it in the additions file", text };
  let f = byRules(text), method = "rules";
  if (!f.invoiceNo || !f.total) {
    try { f = { ...(await byAI(text)), ...f }; method = "rules + AI"; } catch (e) { console.warn("invoice AI read failed:", e.message); }
  }
  const money = (k) => (f[k] != null ? toNum(String(f[k]).replace(/[A-Za-z]/g, "")) : null);
  return {
    file, readable: true, method,
    synthetic: /synthetic|for testing|not a tax invoice|sample/i.test(text),
    invoiceNo: f.invoiceNo ? String(f.invoiceNo).trim() : null,
    invoiceDate: toDate(f.invoiceDate) || (f.invoiceDate ? String(f.invoiceDate) : null),
    supplier: f.supplier || null, buyer: f.buyer || null, description: f.description || null, terms: f.terms || null,
    ...Object.fromEntries([...MONEY].map((k) => [k, money(k)])),
    text,
  };
}
