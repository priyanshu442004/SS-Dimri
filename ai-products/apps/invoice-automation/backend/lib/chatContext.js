// Document context for "chat with this batch": every extracted + validated invoice,
// the batch totals and issues, and the text of each original invoice PDF.
import fs from "fs";
import path from "path";
import { pdfToRows } from "./pdfText.js";

export async function invoiceContext(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const b = JSON.parse(fs.readFileSync(path.join(dir, "batch.json"), "utf8"));
  const parts = [
    `=== BATCH SUMMARY ===`,
    `Batch: ${b.batchName} · Period: ${b.period?.from || "-"} to ${b.period?.to || "-"} · Amounts in ₹`,
    JSON.stringify({ status: b.status, totals: b.totals, gstByRate: b.gstByRate, suppliers: b.suppliers }),
    `\n=== ISSUES FOUND ===`,
    ...(b.issues.length ? b.issues.map((x) => `- ${x.title}: ${x.text} Next: ${x.next}`) : ["None"]),
    `\n=== EXTRACTED & VALIDATED INVOICES (one JSON per invoice; "index" = file number) ===`,
    ...b.invoices.map((inv, i) => JSON.stringify({ file: b.files?.[i], ...inv, textLength: undefined })),
  ];
  for (let n = 1; n <= b.invoices.length; n++) {
    const f = path.join(dir, "invoices", `${n}.pdf`);
    if (!fs.existsSync(f)) continue;
    try {
      const { text } = await pdfToRows(fs.readFileSync(f));
      parts.push(`\n=== SOURCE PDF ${n}: ${b.files?.[n - 1] || ""} ===\n${text}`);
    } catch { /* unreadable PDF: extracted fields above still apply */ }
  }
  return { title: `invoice batch "${b.batchName || meta.batchName}" (${b.invoices.length} invoices)`, documents: parts.join("\n") };
}

export const INVOICE_SUGGESTIONS = [
  "Summarise this batch in 5 points",
  "Which invoices should be held, and why?",
  "Show total GST by supplier in a table",
  "How much input tax credit can be claimed from this batch?",
  "List every line item over ₹5,000",
  "Are any supplier GSTINs or invoice numbers repeated?",
];
