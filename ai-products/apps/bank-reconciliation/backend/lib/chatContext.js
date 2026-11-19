// Document context for "chat with this reconciliation": the processed result (summary,
// exceptions, difference bridge, every matched / unmatched line) + the raw uploaded files.
import fs from "fs";
import path from "path";
import { readTable } from "./parse.js";

const line = (r) => `${r.id} | ${r.date} | ${r.ref || "-"} | ${r.narration}${r.party ? ` | ${r.party}` : ""} | ${r.amount}`;

async function rawFile(dir, prefix) {
  const f = fs.readdirSync(path.join(dir, "inputs")).find((n) => n.startsWith(prefix));
  if (!f) return "";
  const rows = await readTable(fs.readFileSync(path.join(dir, "inputs", f)), f);
  return rows.map((r) => r.join(" | ")).join("\n");
}

export async function bankContext(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const r = JSON.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8"));
  const parts = [
    `=== RECONCILIATION SUMMARY ===`,
    `Account: ${r.accountName || "-"} · Period: ${r.period.label} · Files: bank "${meta.inputs?.bank}", books "${meta.inputs?.books}"`,
    `Amounts in ₹. Bank: + = credit (money in), − = debit. Books shown in the same sign convention.`,
    JSON.stringify({ summary: r.summary, status: r.status, stats: r.stats, settings: r.settings }),
    `\n=== EXCEPTIONS (need review) ===`,
    ...r.exceptions.map((e, i) => `${i + 1}. ${e.title} [${e.cls}] rows ${e.rows.join(", ")} · amount ${e.amount} · ${e.text} · Next: ${e.next}`),
    `\n=== DIFFERENCE BRIDGE (explains bank closing − books closing) ===`,
    JSON.stringify(r.bridge),
    `\n=== MATCHED PAIRS (type · bank rows ⇄ book rows · amount diff · date diff days) ===`,
    ...r.matches.map((m) => `${m.type} · ${m.bank.map(line).join(" + ")} ⇄ ${m.books.map(line).join(" + ")} · diff ${m.amountDiff ?? 0} · ${m.dateDiff ?? 0}d`),
    `\n=== UNMATCHED BANK LINES ===`, ...r.unmatched.bank.map((x) => `${line(x)} · ${x.cls}`),
    `\n=== UNMATCHED BOOK LINES ===`, ...r.unmatched.books.map((x) => `${line(x)} · ${x.cls}`),
  ];
  try {
    parts.push(`\n=== SOURCE FILE: BANK STATEMENT (as uploaded) ===`, await rawFile(dir, "bank-statement"));
    parts.push(`\n=== SOURCE FILE: BOOKS LEDGER (as uploaded) ===`, await rawFile(dir, "books-ledger"));
  } catch (e) { parts.push(`(source files unavailable: ${e.message})`); }
  return { title: `bank reconciliation of ${r.accountName || "the account"} for ${r.period.label}`, documents: parts.join("\n") };
}

export const BANK_SUGGESTIONS = [
  "Summarise this reconciliation in 5 points",
  "Explain how the closing difference is made up",
  "Which items are not recorded in the books, and what entries are needed?",
  "List the outstanding cheques and deposits in transit",
  "Are there any duplicate or suspicious transactions?",
  "Show all bank charges and interest in a table",
];
