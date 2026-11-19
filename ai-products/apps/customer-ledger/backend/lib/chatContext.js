// Document context for "chat with this customer reconciliation": the processed output
// (line-by-line matching, ageing input, actions, balance check) + every uploaded source file as-is.
import fs from "fs";
import path from "path";
import { readTable } from "./parse.js";

const INPUT_LABELS = { books: "COMPANY CUSTOMER LEDGER (BOOKS)", statement: "CUSTOMER STATEMENT", master: "CUSTOMER MASTER", notes: "TEST SCENARIOS / REVIEW NOTES" };
const line = (l) => (l ? `${l.date || "-"} | ${l.ref} | ${l.description || "-"} | ${l.side || "-"} | ₹${l.amount}` : "—");

export async function customerContext(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const r = JSON.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8"));
  const b = r.balance;
  const c = r.customer;
  const parts = [
    `=== CUSTOMER RECONCILIATION SUMMARY ===`,
    `${r.subtitle}. Customer ${c.name} (${c.code || "no code"}${c.gstin ? `, GSTIN ${c.gstin}` : ""}${c.creditTerms != null ? `, credit terms ${c.creditTerms} days` : ""}${c.statementDate ? `, statement date ${c.statementDate}` : ", no statement date given"}). Status: ${r.status}. ${r.approval}`,
    `Next action: ${r.nextAction}`,
    `Uploaded files: ${Object.entries(meta.inputs || {}).map(([k, v]) => `${k}: "${v}"`).join(", ")}`,
    `Amounts are as recorded in each file; Side = Debit / Credit as given (debit = receivable from the customer). Difference_INR is the absolute difference.`,
    `\n=== RECONCILIATION (Reference | Match_Status | Company_Books_INR | Customer_Statement_INR | Difference_INR | Explanation || company books line || customer statement line) ===`,
    ...r.rows.map((x) => `${x.ref} | ${x.status} | ${x.books} | ${x.statement} | ${x.difference} | ${x.explanation} || books: ${line(x.booksLine)} || statement: ${line(x.statementLine)}`),
    `\n=== AGEING INPUT (Invoice_Reference | Invoice_Date | Invoice_Amount_INR | Due_Date | Ageing_Status) ===`,
    ...r.ageing.map((a) => `${a.ref} | ${a.date} | ${a.amount} | ${a.dueDate} | ${a.status}`),
    `\n=== SUMMARY ===`, ...r.summary.map(([k, v]) => `${k}: ${v}`),
    `\n=== ACTIONS ===`, ...r.actions.map((a) => `${a.ref} (${a.issue}, ${a.amount}): ${a.action} — ${a.status}`),
    `\n=== BALANCE CHECK (debit-positive receivable, opening balance ₹${b.opening} from the customer master applied to both sides) ===`,
    `Company books: debits ₹${b.books.debits}, credits ₹${b.books.credits}, closing ₹${b.books.closing}`,
    `Customer statement: debits ₹${b.statement.debits}, credits ₹${b.statement.credits}, closing ₹${b.statement.closing}`,
    `Closing difference (books − statement) ₹${b.difference}; explained by the exceptions ₹${b.explained}; unexplained ₹${b.residual}`,
    ...r.rows.filter((x) => x.status !== "Matched").map((x) => `  ${x.ref} effect on difference: ₹${x.effect}`),
  ];
  if (r.reviewNotes?.length) parts.push(`\n=== TEST SCENARIOS / REVIEW NOTES vs RESULT ===`, ...r.reviewNotes.map((n) => `${n.id}: ${n.text} → ${n.found.map((f) => `${f.ref} ${f.status} (${f.explanation})`).join("; ") || "no matching reference"}`));

  const inputs = path.join(dir, "inputs");
  for (const f of fs.existsSync(inputs) ? fs.readdirSync(inputs).sort() : []) {
    const kind = f.split(".")[0];
    try {
      const rows = await readTable(fs.readFileSync(path.join(inputs, f)), f);
      parts.push(`\n=== SOURCE FILE: ${INPUT_LABELS[kind] || kind} ("${meta.inputs?.[kind] || f}", as uploaded) ===`, rows.map((x) => x.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)).join(" | ")).join("\n"));
    } catch (e) { parts.push(`(${f} unavailable: ${e.message})`); }
  }
  return { title: `customer reconciliation of ${c.name} for ${r.period.label}`, documents: parts.join("\n") };
}

export const CUSTOMER_SUGGESTIONS = [
  "Summarise this customer reconciliation in 5 points",
  "Why do our books and the customer's statement differ?",
  "Explain the credit note difference and what to do",
  "Which invoices are missing on each side?",
  "What is needed to age these invoices?",
  "Draft a balance confirmation email to the customer",
];
