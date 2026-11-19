// Deterministic bank ↔ books matching. No LLM involvement: every amount,
// total and match decision is reproducible from the inputs.
//
// Tiers (each consumes rows so later tiers only see what is left):
//   1 exact         same reference + same amount
//   2 duplicate     a second book row identical (ref+amount) to one already matched
//   3 mismatch      same reference, different amount            → review
//   4 amount-date   same amount, dates within tolerance, best narration similarity
//   5 one-to-many   one bank row = sum of 2–4 book rows          → review
//   6 many-to-one   2–4 bank rows = one book row                 → review
// Whatever remains is bank-only or book-only and gets classified.

const DAY = 864e5;
const cents = (n) => Math.round(n * 100);
const daysBetween = (a, b) => (a && b ? Math.round((b - a) / DAY) : 0);
const STOP = new Set(["NEFT", "RTGS", "IMPS", "UPI", "POS", "CHQ", "REF", "PVT", "LTD", "PAYMENT", "RECEIPT", "THE", "AND", "FOR", "CLIENT", "VENDOR", "TO", "FROM", "A/C"]);

function tokens(...parts) {
  return new Set(parts.join(" ").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").split(/\s+/)
    .filter((t) => t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t)));
}
function similarity(bank, book) {
  const a = tokens(bank.narration), b = tokens(book.party, book.narration);
  if (!a.size || !b.size) return 0;
  let hit = 0; for (const t of a) if (b.has(t)) hit++;
  return hit / Math.min(a.size, b.size);
}

/** All index combinations of size k from n (n small). */
function* combos(n, k, start = 0, acc = []) {
  if (acc.length === k) { yield acc; return; }
  for (let i = start; i < n; i++) yield* combos(n, k, i + 1, [...acc, i]);
}

function findGroup(target, pool, tol) {
  // pool: candidate rows with the same sign as target and within the date window
  const cands = pool
    .filter((r) => Math.abs(daysBetween(target.date, r.date)) <= tol && Math.abs(r.amount) < Math.abs(target.amount))
    .sort((a, b) => Math.abs(daysBetween(target.date, a.date)) - Math.abs(daysBetween(target.date, b.date)))
    .slice(0, 14);
  const want = cents(target.amount);
  for (let k = 2; k <= 4; k++) {
    for (const idx of combos(cands.length, k)) {
      if (idx.reduce((s, i) => s + cents(cands[i].amount), 0) === want) return idx.map((i) => cands[i]);
    }
  }
  return null;
}

export function reconcile(bankRows, bookRows, { tolerance = 3, periodEnd } = {}) {
  const bank = bankRows.map((r) => ({ ...r }));
  const books = bookRows.map((r) => ({ ...r }));
  const usedBank = new Set(), usedBook = new Set();
  const matches = [];

  const add = (type, bRows, kRows, extra = {}) => {
    bRows.forEach((r) => usedBank.add(r.id)); kRows.forEach((r) => usedBook.add(r.id));
    const bankAmt = bRows.reduce((s, r) => s + r.amount, 0), bookAmt = kRows.reduce((s, r) => s + r.amount, 0);
    const dd = daysBetween(kRows[0]?.date, bRows[0]?.date);
    matches.push({ type, bank: bRows, books: kRows, bankAmount: +bankAmt.toFixed(2), bookAmount: +bookAmt.toFixed(2),
      amountDiff: +(bookAmt - bankAmt).toFixed(2), dateDiff: dd, ...extra });
  };
  const freeBank = () => bank.filter((r) => !usedBank.has(r.id));
  const freeBooks = () => books.filter((r) => !usedBook.has(r.id));

  // 1 · exact reference + amount
  for (const b of bank) {
    if (!b.ref) continue;
    const c = freeBooks().filter((k) => k.ref === b.ref && cents(k.amount) === cents(b.amount))
      .sort((x, y) => Math.abs(daysBetween(x.date, b.date)) - Math.abs(daysBetween(y.date, b.date)))[0];
    if (!c) continue;
    const crossesPeriod = periodEnd && (b.valueDate || b.date) > periodEnd && c.date <= periodEnd;
    const late = Math.abs(daysBetween(c.date, b.valueDate || b.date)) > tolerance;
    add("exact", [b], [c], { confidence: crossesPeriod || late ? 0.9 : 1, timing: crossesPeriod || late });
  }

  // 2 · duplicate book entries of an already-matched transaction
  const duplicates = [];
  for (const k of freeBooks()) {
    const twin = matches.find((m) => m.books.some((x) => x.id !== k.id && x.ref && x.ref === k.ref && cents(x.amount) === cents(k.amount)));
    if (twin) { usedBook.add(k.id); duplicates.push({ row: k, original: twin.books[0], bank: twin.bank[0] }); }
  }

  // 3 · same reference, different amount
  for (const b of freeBank()) {
    if (!b.ref) continue;
    const c = freeBooks().find((k) => k.ref === b.ref && Math.sign(k.amount) === Math.sign(b.amount));
    if (c) add("mismatch", [b], [c], { confidence: 0.5, review: true });
  }

  // 4 · same amount within the date window, best narration similarity
  for (const b of freeBank()) {
    const cands = freeBooks().filter((k) => cents(k.amount) === cents(b.amount) && Math.abs(daysBetween(k.date, b.date)) <= tolerance)
      .map((k) => ({ k, s: similarity(b, k) + (/contra/i.test(k.type) && /TRANSFER|SWEEP|FT\//i.test(b.narration + b.ref) ? 0.5 : 0) }))
      .sort((x, y) => y.s - x.s || Math.abs(daysBetween(x.k.date, b.date)) - Math.abs(daysBetween(y.k.date, b.date)));
    if (!cands.length) continue;
    const ambiguous = cands.length > 1 && cands[0].s === cands[1].s;
    if (ambiguous) continue; // leave for the reviewer
    add("amount-date", [b], [cands[0].k], { confidence: +Math.min(0.95, 0.7 + 0.25 * Math.min(cands[0].s, 1)).toFixed(2) });
  }

  // 5 · one bank row ↔ several book rows
  for (const b of freeBank()) {
    const pool = freeBooks().filter((k) => Math.sign(k.amount) === Math.sign(b.amount));
    const g = findGroup(b, pool, tolerance);
    if (g) {
      const fee = g.find((k) => Math.abs(k.amount) <= Math.abs(b.amount) * 0.01 || /fee|charge/i.test(k.party + " " + k.narration + " " + k.ref));
      add(fee ? "split-fee" : "one-to-many", [b], g, { confidence: 0.8, review: true, fee: fee?.id });
    }
  }
  // 6 · several bank rows ↔ one book row
  for (const k of freeBooks()) {
    const pool = freeBank().filter((b) => Math.sign(b.amount) === Math.sign(k.amount));
    const g = findGroup(k, pool, tolerance);
    if (g) add("many-to-one", g, [k], { confidence: 0.8, review: true });
  }

  return { matches, duplicates, bankOnly: freeBank(), bookOnly: freeBooks() };
}

// ------------------------------------------------------------------ classification
export function classifyBankOnly(r) {
  const t = `${r.narration} ${r.ref} ${r.channel}`.toUpperCase();
  if (/\bINT(EREST)?\b|^INT\//.test(t) && r.amount > 0) return "interest";
  if (/CHARGE|\bFEE\b|COMMISSION|\bCHG\b|SERVICE FEE|SMS ALERT|GST ON/.test(t) && r.amount < 0) return "charges";
  if (/SWEEP|TRANSFER (FROM|TO)|FUND TRANSFER|\bFT\b|^FT\/|OWN A\/C/.test(t)) return "transfer";
  return r.amount > 0 ? "unrecorded-receipt" : "unrecorded-payment";
}
export function classifyBookOnly(r) {
  const t = `${r.narration} ${r.ref} ${r.voucher} ${r.party}`.toUpperCase();
  if (r.amount < 0 && /CHQ|CHEQUE|CHECK/.test(t)) return "outstanding-cheque";
  if (r.amount > 0 && /DEP(OSIT)?|IN TRANSIT|CREDIT PENDING|CLEARING/.test(t)) return "deposit-in-transit";
  return r.amount > 0 ? "book-receipt" : "book-payment";
}
