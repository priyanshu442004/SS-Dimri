// Document context for "chat with this vendor reconciliation": the processed output
// (line-by-line matching, summary, actions, balance check) + every uploaded source file as-is.
import fs from "fs";
import path from "path";
import { readTable } from "./parse.js";

const INPUT_LABELS = { books: "BOOKS VENDOR LEDGER", statement: "SUPPLIER STATEMENT", master: "VENDOR MASTER", notes: "TEST SCENARIOS / REVIEW NOTES" };
const line = (l) => (l ? `${l.date || "-"} | ${l.ref} | ${l.description || "-"} | ${l.side || "-"} | ₹${l.amount}` : "—");

export async function vendorContext(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const r = JSON.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8"));
  const b = r.balance;
  const parts = [
    `=== VENDOR RECONCILIATION SUMMARY ===`,
    `${r.subtitle}. Vendor ${r.vendor.name} (${r.vendor.code || "no code"}${r.vendor.gstin ? `, GSTIN ${r.vendor.gstin}` : ""}). Status: ${r.status}. ${r.approval}`,
    `Next action: ${r.nextAction}`,
    `Uploaded files: ${Object.entries(meta.inputs || {}).map(([k, v]) => `${k}: "${v}"`).join(", ")}`,
    `Amounts are as recorded in each file; Side = Debit / Credit as given. Difference_INR is the absolute difference.`,
    `\n=== RECONCILIATION (Reference | Match_Status | Books_INR | Supplier_Statement_INR | Difference_INR | Explanation || books line || statement line) ===`,
    ...r.rows.map((x) => `${x.ref} | ${x.status} | ${x.books} | ${x.statement} | ${x.difference} | ${x.explanation} || books: ${line(x.booksLine)} || statement: ${line(x.statementLine)}`),
    `\n=== SUMMARY ===`, ...r.summary.map(([k, v]) => `${k}: ${v}`),
    `\n=== ACTIONS ===`, ...r.actions.map((a) => `${a.ref} (${a.issue}, ${a.amount}): ${a.action} — ${a.status}`),
    `\n=== BALANCE CHECK (debit-positive, opening balance ₹${b.opening} from the vendor master applied to both sides) ===`,
    `Books: debits ₹${b.books.debits}, credits ₹${b.books.credits}, closing ₹${b.books.closing}`,
    `Supplier statement: debits ₹${b.statement.debits}, credits ₹${b.statement.credits}, closing ₹${b.statement.closing}`,
    `Closing difference (books − statement) ₹${b.difference}; explained by the exceptions ₹${b.explained}; unexplained ₹${b.residual}`,
    ...r.rows.filter((x) => x.status !== "Matched").map((x) => `  ${x.ref} effect on difference: ₹${x.effect}`),
  ];
  if (r.reviewNotes?.length) parts.push(`\n=== TEST SCENARIOS / REVIEW NOTES vs RESULT ===`, ...r.reviewNotes.map((n) => `${n.id}: ${n.text} → ${n.found.map((f) => `${f.ref} ${f.status} (${f.explanation})`).join("; ") || "no matching reference"}`));

  const inputs = path.join(dir, "inputs");
  for (const f of fs.existsSync(inputs) ? fs.readdirSync(inputs).sort() : []) {
    const kind = f.split(".")[0];
    try {
      const rows = await readTable(fs.readFileSync(path.join(inputs, f)), f);
      parts.push(`\n=== SOURCE FILE: ${INPUT_LABELS[kind] || kind} ("${meta.inputs?.[kind] || f}", as uploaded) ===`, rows.map((x) => x.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c)).join(" | ")).join("\n"));
    } catch (e) { parts.push(`(${f} unavailable: ${e.message})`); }
  }
  return { title: `vendor reconciliation of ${r.vendor.name} for ${r.period.label}`, documents: parts.join("\n") };
}

export const VENDOR_SUGGESTIONS = [
  "Summarise this vendor reconciliation in 5 points",
  "Why do the books and the supplier statement differ?",
  "Explain the credit note difference and what to do",
  "Which entries are missing on each side?",
  "Draft a balance confirmation note to the supplier",
  "What adjusting entries might be needed after review?",
];
