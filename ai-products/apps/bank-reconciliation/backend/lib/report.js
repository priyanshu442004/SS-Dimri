// Builds the reconciliation result (for the UI) and the PDF model (for the
// renderer) from matcher output. All wording is template-driven so the same
// inputs always give the same report.
import { reconcile, classifyBankOnly, classifyBookOnly } from "./match.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (d) => d ? `${String(d.getUTCDate()).padStart(2, "0")}-${MONTHS[d.getUTCMonth()]}-${d.getUTCFullYear()}` : "";
const iso = (d) => (d ? d.toISOString().slice(0, 10) : null);

/** ₹ amount, Indian grouping. dp=0 drops ".00" for whole numbers (used in "Bank ₹76,400; books ₹74,600"). */
export function inr(n, { dp = 2, sign = false } = {}) {
  const a = Math.abs(n);
  const whole = dp === 0 && Number.isInteger(Math.round(a * 100) / 100);
  const s = a.toLocaleString("en-IN", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
  return `${sign && n < 0 ? "−" : ""}₹${s}`;
}
const NUM = ["zero", "one", "two", "three", "four", "five", "six"];
const words = (n) => NUM[n] || String(n);
const sum = (rows) => +rows.reduce((s, r) => s + r.amount, 0).toFixed(2);
const crdr = (amt, n = 1) => (amt > 0 ? (n > 1 ? "credits" : "credit") : n > 1 ? "debits" : "debit");
const list = (rows) => rows.map((r) => inr(r.amount)).join(" + ");

/** "Client Willow" → "Willow", "Payroll - April" → "Payroll", "Orion Stationers" → "Orion". */
function shortParty(row) {
  let s = (row.party || row.narration || "").split(/\s+-\s+|,/)[0];
  s = s.replace(/^(client|customer|vendor|supplier|m\/s\.?)\s+/i, "").trim();
  return s.split(/\s+/)[0] || "Unnamed";
}
/** Bank narration → readable name: "NEFT CLIENT HOTEL MERIDIAN REF 0028" → "Hotel Meridian". */
function bankName(row) {
  const s = row.narration
    .replace(/\bREF\b.*$/i, "")
    .replace(/^(NEFT|RTGS|IMPS|UPI|POS|CHQ|ACH|NACH|ECS|BULK|FT)\b\s*/i, "")
    .replace(/^(CLIENT|VENDOR|CUSTOMER)\s+/i, "")
    .trim();
  const small = new Set(["and", "of", "the", "for", "to", "in", "on", "at", "by", "a", "an"]);
  return s.toLowerCase().split(/\s+/)
    .map((w, i) => (i && small.has(w) ? w : w.replace(/^\w/, (c) => c.toUpperCase())))
    .join(" ") || "Unidentified";
}
const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildReconciliation({ bank, books, opening, tolerance = 3, accountName }) {
  const minD = new Date(Math.min(...bank.rows.map((r) => r.date)));
  const maxD = new Date(Math.max(...bank.rows.map((r) => r.date)));
  // whole calendar month when the statement sits inside one month
  const sameMonth = minD.getUTCFullYear() === maxD.getUTCFullYear() && minD.getUTCMonth() === maxD.getUTCMonth();
  const periodStart = sameMonth ? new Date(Date.UTC(minD.getUTCFullYear(), minD.getUTCMonth(), 1)) : minD;
  const periodEnd = sameMonth ? new Date(Date.UTC(minD.getUTCFullYear(), minD.getUTCMonth() + 1, 0)) : maxD;

  const r = reconcile(bank.rows, books.rows, { tolerance, periodEnd });

  // ---- summary
  const side = (rows, open) => {
    const credits = +rows.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0).toFixed(2);
    const debits = +rows.filter((x) => x.amount < 0).reduce((s, x) => s - x.amount, 0).toFixed(2);
    return { opening: open, credits, debits, net: +(credits - debits).toFixed(2), closing: +(open + credits - debits).toFixed(2) };
  };
  const sBank = side(bank.rows, opening.bank), sBooks = side(books.rows, opening.books);
  const difference = +(sBooks.closing - sBank.closing).toFixed(2);

  // ---- exceptions (order mirrors the reference report)
  const ex = [];
  const push = (e) => ex.push({ ...e, amount: e.amount != null ? +e.amount.toFixed(2) : null });
  const bankOnly = r.bankOnly.map((x) => ({ ...x, cls: classifyBankOnly(x) }));
  const bookOnly = r.bookOnly.map((x) => ({ ...x, cls: classifyBookOnly(x) }));
  const of = (arr, c) => arr.filter((x) => x.cls === c);

  const charges = of(bankOnly, "charges");
  if (charges.length) push({ cls: "unrecorded-bank", title: "Bank charges not in books", rows: charges.map((x) => x.id), amount: sum(charges),
    text: `${list(charges)} ${crdr(-1, charges.length)}. Book-side adjustment needed.`, next: "Record bank charges after verification." });
  const interest = of(bankOnly, "interest");
  if (interest.length) push({ cls: "unrecorded-bank", title: "Interest credit not in books", rows: interest.map((x) => x.id), amount: sum(interest),
    text: `${list(interest)} ${crdr(1, interest.length)}. Book-side adjustment needed.`, next: "Record interest income after verification." });
  for (const t of of(bankOnly, "transfer"))
    push({ cls: "unrecorded-bank", title: /SWEEP/i.test(t.narration) ? "Bank-only sweep transfer" : "Bank-only fund transfer", rows: [t.id], amount: t.amount,
      text: `${inr(t.amount)} ${crdr(t.amount)}. Potential contra entry missing / incomplete.`, next: "Trace linked account and record both sides." });
  for (const t of of(bankOnly, "unrecorded-receipt"))
    push({ cls: "unrecorded-bank", title: `${bankName(t)} receipt not in books`, rows: [t.id], amount: t.amount,
      text: `${inr(t.amount)} credit. Bank credit with no matching book entry.`, next: "Identify the customer and invoice; record the receipt after verification." });
  for (const t of of(bankOnly, "unrecorded-payment"))
    push({ cls: "unrecorded-bank", title: `${bankName(t)} payment not in books`, rows: [t.id], amount: t.amount,
      text: `${inr(t.amount)} debit. Bank debit with no matching book entry.`, next: "Obtain the supporting voucher; record after approval." });

  const cheques = of(bookOnly, "outstanding-cheque");
  if (cheques.length) push({ cls: "timing", title: `Book-only outstanding cheque${cheques.length > 1 ? "s" : ""}`, rows: cheques.map((x) => x.id), amount: sum(cheques),
    text: `${list(cheques)} ${crdr(-1, cheques.length)}. ${cheques.length > 1 ? "Timing items if cheques are not presented." : "Timing item if cheque not presented."}`,
    next: "Confirm cheque status; carry forward only if valid." });
  const deposits = of(bookOnly, "deposit-in-transit");
  if (deposits.length) push({ cls: "timing", title: `Book-only deposit${deposits.length > 1 ? "s" : ""} in transit`, rows: deposits.map((x) => x.id), amount: sum(deposits),
    text: `${list(deposits)} ${crdr(1, deposits.length)}. ${deposits.length > 1 ? "Timing items if deposits are pending." : "Timing item if the deposit is pending."}`,
    next: "Check subsequent bank statement for clearance." });
  for (const t of [...of(bookOnly, "book-receipt"), ...of(bookOnly, "book-payment")])
    push({ cls: "unrecorded-book", title: `${shortParty(t)} ${t.amount > 0 ? "receipt" : "payment"} not in bank`, rows: [t.id], amount: t.amount,
      text: `${inr(t.amount)} ${crdr(t.amount)}. Book entry with no matching bank transaction.`, next: "Verify the voucher; check the next statement or correct the entry." });

  for (const m of r.matches.filter((x) => x.type === "one-to-many")) {
    const label = /BULK/i.test(m.bank[0].narration + m.bank[0].ref) ? `Bulk ${m.bankAmount > 0 ? "collection" : "payment"}` : `${bankName(m.bank[0])}`;
    push({ cls: "group", title: `${label} vs ${words(m.books.length)} book ${m.bankAmount > 0 ? "receipts" : "payments"}`, rows: [...m.bank, ...m.books].map((x) => x.id), amount: m.bankAmount,
      text: `${inr(m.bankAmount)} ${crdr(m.bankAmount)}. One-to-many aggregation match.`, next: "Match as group; retain underlying invoice references." });
  }
  for (const m of r.matches.filter((x) => x.type === "many-to-one")) {
    const batch = /batch|payroll|salary/i.test(m.books[0].narration + m.books[0].party) ? " batch" : "";
    push({ cls: "group", title: `${shortParty(m.books[0])}${batch} vs ${words(m.bank.length)} bank ${m.bookAmount > 0 ? "credits" : "debits"}`, rows: [...m.bank, ...m.books].map((x) => x.id), amount: m.bookAmount,
      text: `${inr(m.bookAmount)} ${crdr(m.bookAmount)}. Many-to-one aggregation match.`, next: `Match batch total to bank ${m.bookAmount > 0 ? "credits" : "debits"}.` });
  }
  for (const m of r.matches.filter((x) => x.type === "mismatch")) {
    const rec = m.bankAmount > 0;
    push({ cls: "mismatch", title: `${shortParty(m.books[0])} ${rec ? "receipt" : "payment"} difference`, rows: [...m.bank, ...m.books].map((x) => x.id), amount: m.amountDiff,
      text: `Bank ${inr(m.bankAmount, { dp: 0 })}; books ${inr(m.bookAmount, { dp: 0 })}. ${inr(Math.abs(m.amountDiff))} discrepancy.`,
      next: `Check ${rec ? "remittance advice / bank credit" : "payment advice / bank debit"}; do not auto-adjust.` });
  }
  for (const d of r.duplicates)
    push({ cls: "duplicate", title: `Duplicate ${shortParty(d.row)} ${d.row.amount > 0 ? "receipt" : "payment"} candidate`, rows: [d.row.id, d.original.id], amount: d.row.amount,
      text: `${inr(d.row.amount)} ${crdr(d.row.amount)}. Potential duplicate book entry.`,
      next: `Check voucher source and ${d.row.amount > 0 ? "customer" : "supplier"} ledger before reversal.` });
  for (const m of r.matches.filter((x) => x.type === "exact" && x.timing))
    push({ cls: "timing", title: `${shortParty(m.books[0])} date/reference timing`, rows: [...m.bank, ...m.books].map((x) => x.id), amount: m.bankAmount,
      text: `${inr(m.bankAmount)} ${crdr(m.bankAmount)}. Date shift / value-date match.`, next: "Match with date tolerance; verify bank reference." });
  for (const m of r.matches.filter((x) => x.type === "split-fee"))
    push({ cls: "group", title: `${shortParty(m.books.find((k) => k.id !== m.fee) || m.books[0])} payment split + fee`, rows: [...m.bank, ...m.books].map((x) => x.id), amount: m.bankAmount,
      text: `Bank ${inr(m.bankAmount, { dp: 0 })}; books ${m.books.map((k) => inr(k.amount, { dp: 0 })).join(" + ")}. Group match; possible fee allocation.`,
      next: "Verify bank charge treatment and match components." });

  // ---- difference bridge: Books − Bank explained item by item
  const bridge = [];
  if (opening.books !== opening.bank) bridge.push({ label: "Opening balance difference", amount: +(opening.books - opening.bank).toFixed(2) });
  for (const x of bankOnly) bridge.push({ label: `Not in books: ${bankName(x)}`, rows: [x.id], amount: -x.amount });
  for (const x of bookOnly) bridge.push({ label: `Not in bank: ${x.party || x.narration}`, rows: [x.id], amount: x.amount });
  for (const d of r.duplicates) bridge.push({ label: `Duplicate book entry: ${d.row.party}`, rows: [d.row.id], amount: d.row.amount });
  for (const m of r.matches.filter((x) => Math.abs(x.amountDiff) >= 0.005))
    bridge.push({ label: `Amount difference: ${m.books[0].party || m.books[0].narration}`, rows: [...m.bank, ...m.books].map((x) => x.id), amount: m.amountDiff });
  const explained = +bridge.reduce((s, b) => s + b.amount, 0).toFixed(2);
  const residual = +(difference - explained).toFixed(2);

  const reconciled = Math.abs(difference) < 0.005 && ex.length === 0;
  const kinds = [];
  if (ex.some((e) => e.cls === "timing")) kinds.push("timing items");
  if (ex.some((e) => e.cls === "unrecorded-bank" || e.cls === "unrecorded-book")) kinds.push("missing book entries");
  if (ex.some((e) => e.cls === "duplicate" || e.cls === "mismatch")) kinds.push("duplicate/amount discrepancy candidates");
  if (ex.some((e) => e.cls === "group")) kinds.push("grouped transactions");
  const kindText = kinds.length > 1 ? `${kinds.slice(0, -1).join(", ")} and ${kinds.at(-1)}` : kinds[0] || "";

  const statusLead = reconciled ? "Overall status: RECONCILED." : "Overall status: NOT FULLY RECONCILED.";
  const statusText = reconciled
    ? "Bank and book balances agree and every transaction is matched. This report is system-generated, not an accounting sign-off."
    : `The statement and books have been compared at transaction level. ${ex.length} item${ex.length === 1 ? "" : "s"} — ${kindText} — require${ex.length === 1 ? "s" : ""} review. ${
        Math.abs(residual) < 0.005 ? "The listed items fully explain the difference." : `An unexplained residual of ${inr(residual)} remains.`
      } This is a system-generated report, not an accounting sign-off.`;

  const counts = r.matches.reduce((a, m) => ((a[m.type] = (a[m.type] || 0) + 1), a), {});
  const matchedBank = r.matches.reduce((s, m) => s + m.bank.length, 0);
  const matchedBooks = r.matches.reduce((s, m) => s + m.books.length, 0);

  const ser = (x) => ({ ...x, date: iso(x.date), valueDate: iso(x.valueDate) });
  return {
    accountName: accountName || "Bank account",
    period: { start: iso(periodStart), end: iso(periodEnd), label: `${fmtDate(periodStart)} to ${fmtDate(periodEnd)}` },
    summary: { bank: sBank, books: sBooks, difference },
    status: { reconciled, lead: statusLead, text: statusText },
    exceptions: ex,
    bridge: { items: bridge, explained, residual },
    stats: { bankRows: bank.rows.length, bookRows: books.rows.length, matchedBank, matchedBooks, counts, duplicates: r.duplicates.length, exceptions: ex.length,
      autoMatched: (counts.exact || 0) + (counts["amount-date"] || 0) - r.matches.filter((m) => m.timing).length },
    matches: r.matches.map((m) => ({ ...m, bank: m.bank.map(ser), books: m.books.map(ser) })),
    unmatched: { bank: bankOnly.map(ser), books: bookOnly.map(ser), duplicates: r.duplicates.map((d) => ser(d.row)) },
    detection: { bank: { columns: bank.columns, dateOrder: bank.dateOrder }, books: { columns: books.columns, dateOrder: books.dateOrder, convention: books.convention } },
    settings: { tolerance, opening },
  };
}

/** Flatten to the renderer's model (strings ready to draw). */
export function pdfModel(res) {
  const s = res.summary;
  const row = (label, a, b) => [label, a, b];
  return {
    title: "BANK RECONCILIATION — FINAL REVIEW REPORT",
    subtitle: `${res.accountName} | Period: ${res.period.label}`,
    statusLead: res.status.lead,
    statusText: res.status.text,
    summary: [
      row("Total credits", inr(s.bank.credits), inr(s.books.credits)),
      row("Total debits", inr(s.bank.debits), inr(s.books.debits)),
      row("Net movement", inr(s.bank.net, { sign: true }), inr(s.books.net, { sign: true })),
      row("Difference (Books − Bank)", "Books − Bank", inr(s.difference, { sign: true })),
    ],
    exceptions: res.exceptions.map((e) => ({ title: e.title, text: e.text, next: e.next })),
    nextSteps: [
      "Confirm the account, period and debit/credit sign convention.",
      "Run exact reference-and-amount matching, then configurable date/narration matching.",
      "Support one-to-many and many-to-one matches; keep underlying source rows linked.",
      "Route ambiguous candidates and all amount mismatches to a human reviewer.",
      "Verify bank-only fees and interest against the statement; post book-side adjustments only after approval.",
      "Check subsequent statements to determine whether outstanding cheques and deposits in transit cleared.",
      "Recompute adjusted balances. Do not create a balancing or ‘plug’ entry. Keep any unexplained residual visible and the reconciliation open.",
      "Store source files, match rationale, reviewer, approval timestamp and final report for audit trail.",
    ],
    productNotes: [
      "Use deterministic code for amounts, totals, balance roll-forward and matching; use the LLM for narration normalization, exception summaries and suggested investigation steps.",
      "Every match should expose match type, source row IDs, confidence, amount difference and date difference.",
      "Use a confidence threshold: high-confidence exact matches can be auto-matched; group matches and ambiguous candidates should be reviewed.",
      "Keep exception classes distinct: timing item, unrecorded bank transaction, possible duplicate, amount mismatch, bank error, book error and unresolved.",
      "Add a subsequent-period clearance workflow for deposits in transit and outstanding payments.",
    ],
    limitation: "Amounts are computed from the uploaded statement and ledger; matches and exception labels are system-generated review suggestions, not verified accounting conclusions. Confirm source evidence before posting entries or signing off.",
  };
}

export { reconcile };
