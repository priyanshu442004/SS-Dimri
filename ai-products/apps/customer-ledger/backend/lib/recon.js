// Customer ledger reconciliation — deterministic engine.
// Company books (customer ledger) vs the customer's statement (+ customer master for name,
// credit terms, opening balance and statement date).
// Passes: 1) same reference (leading zeros / punctuation ignored) → matched, amount or side mismatch;
//         2) leftovers with the same amount and side within 7 days → matched, reference differs;
//         3) the rest → company books only / statement only.
// No AI is involved in any figure.
import { toDate, toNum, text } from "./parse.js";

const r2 = (n) => Math.round(n * 100) / 100;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DATE_WINDOW = 7;
/** Reference format for figures inside text: "INR 22,000". */
export const inrText = (n) => `INR ${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

const refKey = (ref) => text(ref).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/\d+/g, (d) => d.replace(/^0+(?=\d)/, ""));
const descKey = (d) => text(d).toLowerCase().replace(/[^a-z0-9]/g, "");
/** "Sales Invoice" ~ "Invoice"; "Receipt" ≠ "Payment". Blank descriptions don't count as different. */
const sameDesc = (a, b) => { const x = descKey(a), y = descKey(b); return !x || !y || x === y || x.includes(y) || y.includes(x); };
const days = (a, b) => (a && b ? Math.abs(new Date(a) - new Date(b)) / 864e5 : Infinity);
const addDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);

function sideOf(v) {
  const s = text(v).toLowerCase();
  if (/^(d|dr|debit)/.test(s)) return "Debit";
  if (/^(c|cr|credit)/.test(s)) return "Credit";
  return null;
}

/** What kind of document a line is, for the wording of actions. */
export function docType(ref, desc) {
  const s = `${text(desc)} ${text(ref)}`.toLowerCase();
  if (/credit\s*note|\bcn\b|^cn|\bcn-/.test(s) || /^CN/i.test(text(ref))) return "credit note";
  if (/debit\s*note|^dn|\bdn-/.test(s) || /^DN/i.test(text(ref))) return "debit note";
  if (/receipt|payment|paid|collection|neft|rtgs|imps|upi|cheque|chq|^rc|\brc-/.test(s)) return "receipt";
  if (/invoice|bill|\binv|^si\b|^si-|\bsi-/.test(s)) return "invoice";
  if (/tds/.test(s)) return "TDS deduction";
  return "entry";
}

function lines(file, src) {
  return file.rows.map((r, i) => {
    const dr = "debit" in file.columns ? Math.abs(toNum(r.debit)) : 0;
    const cr = "credit" in file.columns ? Math.abs(toNum(r.credit)) : 0;
    let amount, side = sideOf(r.side);
    if ("amount" in file.columns && text(r.amount) !== "") {
      const a = toNum(r.amount);
      amount = Math.abs(a);
      if (!side && !("debit" in file.columns) && a < 0) side = "Credit";
    } else { amount = dr || cr; if (!side) side = dr ? "Debit" : cr ? "Credit" : null; }
    const ref = text(r.ref);
    return {
      src, row: i + 2, date: toDate(r.date), dueDate: toDate(r.dueDate), ref, key: refKey(ref), description: text(r.description),
      amount: r2(amount), side, customerId: text(r.customerId), doc: docType(ref, r.description),
    };
  }).filter((x) => x.ref || x.amount);
}

const signed = (l) => (l.side === "Credit" ? -l.amount : l.amount); // debit-positive (receivable), as in the files

/** Ageing bucket label for days past due. */
const bucket = (d) => (d <= 30 ? "1-30" : d <= 60 ? "31-60" : d <= 90 ? "61-90" : "90+");

// ------------------------------------------------------------------ main
export function reconcile({ books: B, statement: S, master: M, notes: N }) {
  const allBooks = lines(B, "books"), stmt = lines(S, "statement");
  if (!allBooks.length) throw new Error(`${B.filename}: no ledger entries found.`);
  if (!stmt.length) throw new Error(`${S.filename}: no statement entries found.`);

  // ---- customer (a ledger with several customer codes is reconciled for the main one only)
  const codes = allBooks.map((b) => b.customerId).filter(Boolean);
  const customerCode = codes.sort((a, b) => codes.filter((x) => x === b).length - codes.filter((x) => x === a).length)[0] || "";
  const masterRows = (M?.rows || []).map((r) => ({
    customerId: text(r.customerId), customerName: text(r.customerName), gstin: text(r.gstin),
    opening: toNum(r.opening), creditTerms: text(r.creditTerms) === "" ? null : toNum(r.creditTerms), statementDate: toDate(r.statementDate),
  }));
  const customer = masterRows.find((c) => customerCode && c.customerId.toUpperCase() === customerCode.toUpperCase()) || (masterRows.length === 1 ? masterRows[0] : null);
  const customerName = customer?.customerName || customerCode || "Customer";
  const synthetic = [...(M?.headers || []), ...masterRows.flatMap((c) => Object.values(c))].some((x) => /synthetic/i.test(String(x)));
  const mainCode = (customerCode || customer?.customerId || "").toUpperCase();
  const otherCustomers = [...new Set(codes.filter((c) => c.toUpperCase() !== mainCode))];
  const books = allBooks.filter((b) => !b.customerId || !mainCode || b.customerId.toUpperCase() === mainCode);

  // ---- pass 1: same reference
  const used = new Set();
  const pairs = [];
  for (const b of books) {
    const cands = stmt.filter((s) => !used.has(s) && s.key && s.key === b.key);
    const s = cands.find((x) => Math.abs(x.amount - b.amount) < 0.005 && (!x.side || !b.side || x.side === b.side)) || cands[0];
    if (s) { used.add(s); pairs.push({ b, s, pass: "reference" }); }
  }
  // ---- pass 2: same amount + side within the date window, unique candidate
  const pairedBooks = new Set(pairs.map((p) => p.b));
  for (const b of books.filter((x) => !pairedBooks.has(x))) {
    const cands = stmt.filter((s) => !used.has(s) && Math.abs(s.amount - b.amount) < 0.005 && (!s.side || !b.side || s.side === b.side) && days(s.date, b.date) <= DATE_WINDOW);
    if (cands.length === 1) { used.add(cands[0]); pairedBooks.add(b); pairs.push({ b, s: cands[0], pass: "amount-date" }); }
  }

  // ---- classify
  const rows = [];
  for (const { b, s, pass } of pairs) {
    const diff = r2(s.amount - b.amount);
    const sideDiff = b.side && s.side && b.side !== s.side;
    let status, explanation;
    if (sideDiff) { status = "Side mismatch"; explanation = `Recorded as ${b.side} in company books but ${s.side} in the customer statement`; }
    else if (Math.abs(diff) >= 0.005) { status = "Amount mismatch"; explanation = diff > 0 ? `Customer statement exceeds company books by ${inrText(diff)}` : `Company books exceed customer statement by ${inrText(diff)}`; }
    else if (pass === "amount-date") { status = "Matched"; explanation = `Amount and date match; reference differs (company books ${b.ref || "blank"}, statement ${s.ref || "blank"})`; }
    else { status = "Matched"; explanation = sameDesc(b.description, s.description) ? "Exact reference and amount" : "Reference and amount match; description differs"; }
    // a side mismatch moves the balance by both amounts (one side's debit is the other's credit)
    const difference = sideDiff ? Math.abs(r2(signed(b) - signed(s))) : Math.abs(diff);
    rows.push({ ref: b.ref || s.ref, status, books: b.amount, statement: s.amount, difference, explanation, b, s, pass, doc: b.doc !== "entry" ? b.doc : s.doc, effect: r2(signed(b) - signed(s)) });
  }
  for (const b of books.filter((x) => !pairedBooks.has(x))) rows.push({ ref: b.ref, status: "Company books only", books: b.amount, statement: 0, difference: b.amount, explanation: "No corresponding customer statement entry", b, s: null, doc: b.doc, effect: signed(b) });
  for (const s of stmt.filter((x) => !used.has(x))) rows.push({ ref: s.ref, status: "Statement only", books: 0, statement: s.amount, difference: s.amount, explanation: "No corresponding company books entry", b: null, s, doc: s.doc, effect: -signed(s) });

  // chronological (company books date first), stable on file order
  const order = (r) => [(r.b || r.s).date || "9999", r.b ? 0 : 1, (r.b || r.s).row];
  rows.sort((x, y) => { const a = order(x), c = order(y); return a[0] < c[0] ? -1 : a[0] > c[0] ? 1 : a[1] - c[1] || a[2] - c[2]; });

  // ---- actions
  const ACTION = {
    "Amount mismatch": (d) => (d === "receipt" ? "Confirm receipt amount against the bank statement and customer remittance advice"
      : `Confirm ${d === "entry" ? "entry" : d} value with customer and supporting document`),
    "Side mismatch": (d) => `Confirm with the customer whether the ${d} is a debit or credit and correct the side if supported`,
    "Company books only": (d) => (d === "invoice" ? "Confirm invoice delivery/acceptance and whether customer omitted it"
      : d === "receipt" ? "Confirm receipt in the bank statement and ask the customer to record the payment"
        : d === "entry" ? "Check whether the entry was communicated to the customer and whether they omitted it"
          : `Confirm the ${d} was issued to and accepted by the customer`),
    "Statement only": (d) => (d === "invoice" ? "Trace customer-reported invoice to sales records before posting"
      : d === "receipt" ? "Trace customer-reported payment to the bank statement before posting the receipt"
        : d === "credit note" ? "Trace customer-reported credit note to approved returns/credit authorisation before posting"
          : `Trace customer-reported ${d === "entry" ? "entry" : d} to supporting documents before posting`),
  };
  const exceptions = rows.filter((r) => r.status !== "Matched");
  const actions = exceptions.map((r) => ({ ref: r.ref, action: ACTION[r.status](r.doc), status: "Pending", issue: r.status, amount: r.difference }));

  // ---- ageing input: invoices in the company books
  const terms = customer?.creditTerms;
  const asOf = customer?.statementDate || null;
  const ageing = books.filter((b) => b.doc === "invoice" && b.side !== "Credit").map((b) => {
    const due = b.dueDate || (terms != null && asOf && b.date ? addDays(b.date, terms) : null);
    let status;
    if (!due || !asOf) status = "Due date not calculable: credit terms/date of statement required";
    else {
      const late = Math.round((Date.parse(asOf) - Date.parse(due)) / 864e5);
      status = late > 0 ? `Overdue by ${late} day${late === 1 ? "" : "s"} (${bucket(late)} days) at ${asOf}` : `Not yet due at ${asOf}`;
    }
    return { ref: b.ref, date: b.date || "", amount: b.amount, dueDate: due && asOf ? due : "Not supplied", status, overdueDays: due && asOf ? Math.max(0, Math.round((Date.parse(asOf) - Date.parse(due)) / 864e5)) : null };
  });

  // ---- summary
  const count = (st) => rows.filter((r) => r.status === st).length;
  const absDiff = r2(exceptions.reduce((s, r) => s + r.difference, 0));
  const status = exceptions.length ? "Draft - review and resolve exceptions" : "Draft - no exceptions; reviewer sign-off required";
  const summary = [
    ["Matched entries", count("Matched")],
    ["Amount mismatches", count("Amount mismatch")],
    ...(count("Side mismatch") ? [["Side mismatches", count("Side mismatch")]] : []),
    ["Company-books-only entries", count("Company books only")],
    ["Statement-only entries", count("Statement only")],
    ["Absolute value of identified differences", absDiff],
    ["Output status", status],
  ];

  // ---- balances (debit-positive receivable, opening from the customer master)
  const opening = customer?.opening || 0;
  const tot = (ls) => ({ debits: r2(ls.filter((l) => l.side !== "Credit").reduce((s, l) => s + l.amount, 0)), credits: r2(ls.filter((l) => l.side === "Credit").reduce((s, l) => s + l.amount, 0)) });
  const tb = tot(books), ts = tot(stmt);
  const balance = {
    opening, books: { ...tb, closing: r2(opening + tb.debits - tb.credits) }, statement: { ...ts, closing: r2(opening + ts.debits - ts.credits) },
    sidesKnown: [...books, ...stmt].every((l) => l.side),
  };
  balance.difference = r2(balance.books.closing - balance.statement.closing);
  balance.explained = r2(exceptions.reduce((s, r) => s + r.effect, 0));
  balance.residual = r2(balance.difference - balance.explained);

  // ---- period
  const dates = [...books, ...stmt].map((l) => l.date).filter(Boolean).sort();
  const mlabel = (d) => `${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;
  const first = dates[0], last = dates.at(-1);
  const periodLabel = !first ? "Period not stated" : first.slice(0, 7) === last.slice(0, 7) ? mlabel(first)
    : first.slice(0, 4) === last.slice(0, 4) ? `${MONTHS[+first.slice(5, 7) - 1]} – ${mlabel(last)}` : `${mlabel(first)} – ${mlabel(last)}`;

  // ---- PDF lines
  const list = (st) => rows.filter((r) => r.status === st).map((r) => `${r.ref}: ${inrText(r.difference)}`).join("; ") || "None";
  const evidence = { invoice: "invoice/receipt", receipt: "invoice/receipt", entry: "supporting document" };
  const docs = [...new Set(exceptions.map((r) => evidence[r.doc] || r.doc))];
  const joinAnd = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a.at(-1)}`);
  const nextAction = exceptions.length ? `Confirm ${joinAnd(docs)} evidence with customer.` : "No exceptions; obtain customer balance confirmation and sign off.";
  const matched = count("Matched");

  // ---- review notes / test scenarios (optional CSV): show what the engine found for each referenced item
  const byKey = new Map(rows.map((r) => [refKey(r.ref), r]));
  const reviewNotes = (N?.rows || []).map((row) => {
    const vals = Object.values(row).filter(Boolean);
    const all = vals.join(" ");
    const tokens = [...new Set(all.match(/[A-Za-z]{1,6}[-/ ]?\d+/g) || [])];
    const hits = tokens.map((t) => byKey.get(refKey(t))).filter(Boolean);
    return { id: vals[0] || "", text: vals.slice(1).join(" · "), found: hits.map((h) => ({ ref: h.ref, status: h.status, explanation: h.explanation })) };
  });

  return {
    title: "Customer Reconciliation Summary",
    subtitle: `${customerName} · ${periodLabel} · ${synthetic ? "Synthetic draft" : "Draft"}`,
    customer: { code: customer?.customerId || customerCode, name: customerName, gstin: customer?.gstin || "", creditTerms: terms ?? null, statementDate: asOf, opening, inMaster: Boolean(customer), otherCustomers },
    period: { label: periodLabel, start: first || null, end: last || null },
    synthetic, status, approval: "Draft - reviewer sign-off required.", nextAction,
    rows: rows.map((r) => ({
      ref: r.ref, status: r.status, books: r.books, statement: r.statement, difference: r.difference, explanation: r.explanation, doc: r.doc, effect: r.effect, pass: r.pass || null,
      booksLine: r.b && { row: r.b.row, date: r.b.date, ref: r.b.ref, description: r.b.description, amount: r.b.amount, side: r.b.side },
      statementLine: r.s && { row: r.s.row, date: r.s.date, ref: r.s.ref, description: r.s.description, amount: r.s.amount, side: r.s.side },
    })),
    summary, actions, ageing, balance, reviewNotes,
    stats: { matched, mismatches: count("Amount mismatch"), sideMismatches: count("Side mismatch"), booksOnly: count("Company books only"), statementOnly: count("Statement only"), exceptions: exceptions.length, absDiff, booksLines: books.length, statementLines: stmt.length, invoices: ageing.length },
    pdfRows: [
      ["Matched", `${matched} ${matched === 1 ? "entry" : "entries"}`],
      ["Amount mismatch", list("Amount mismatch")],
      ...(count("Side mismatch") ? [["Debit / credit side mismatch", list("Side mismatch")]] : []),
      ["Company books only", list("Company books only")],
      ["Customer statement only", list("Statement only")],
      ["Next action", nextAction],
      ["Approval", "Draft - reviewer sign-off required."],
    ],
    detection: {
      books: { file: B.filename, columns: B.columns, rows: B.rows.length },
      statement: { file: S.filename, columns: S.columns, rows: S.rows.length },
      master: M ? { file: M.filename, columns: M.columns, rows: M.rows.length } : null,
      notes: N ? { file: N.filename, rows: N.rows.length } : null,
    },
  };
}

export const pdfModel = (r) => ({ title: r.title, subtitle: r.subtitle, rows: r.pdfRows });
