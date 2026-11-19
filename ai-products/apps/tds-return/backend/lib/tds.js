// TDS return preparation & reconciliation — deterministic engine.
// Input: parsed Payment Ledger, Vendor Master, Challan Register (+ optional review notes).
// Output: deduction register with a review note per payment, challan summary, exceptions,
// control summary, section / deductee / month-wise workings. No AI is involved in any figure.
import { toDate, toNum, text } from "./parse.js";

// ------------------------------------------------------------------ configured rules
// Indicative rates used for the consistency check. They are configuration, not legal advice:
// every flagged payment is routed to a tax professional, as the client's notes require.
export const RATE_RULES = {
  "194C": { label: "Payments to contractors", basis: "1% individual / HUF, 2% others", rate: (v) => (/individual|huf|proprietor/i.test(v.type) ? 1 : 2) },
  "194J": { label: "Professional / technical fees", basis: "10% professional fees, 2% technical services", rate: (_v, p) => (/technical|call cent/i.test(p.nature) ? 2 : 10) },
  "194I": { label: "Rent", basis: "10% land / building / furniture, 2% plant & machinery", rate: (_v, p) => (/plant|machin|equipment|vehicle/i.test(p.nature) ? 2 : 10) },
  "194H": { label: "Commission / brokerage", basis: "2%", rate: () => 2 },
  "194A": { label: "Interest other than securities", basis: "10%", rate: () => 10 },
  "194Q": { label: "Purchase of goods", basis: "0.1%", rate: () => 0.1 },
};
export const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
/** Deductee type from the 4th character of a well-formed PAN (used when the master has no type). */
const PAN_TYPES = { P: "Individual", H: "HUF", C: "Company", F: "Firm / LLP", A: "AOP", T: "Trust", B: "BOI", L: "Local authority", J: "Artificial juridical person", G: "Government" };
const panHolderType = (pan) => (pan && PAN_RE.test(pan) ? PAN_TYPES[pan[3]] || "" : "");

const r2 = (n) => Math.round(n * 100) / 100;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** Reference format for figures inside text: "INR 30,700". */
export const inrText = (n) => `INR ${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const normSection = (s) => text(s).toUpperCase().replace(/^SEC(TION)?\.?\s*/, "").replace(/[\s-]/g, "");
const normPan = (s) => text(s).toUpperCase().replace(/\s/g, "");

/** Indian financial year + quarter of an ISO date. */
export function fyQuarter(isoDate) {
  if (!isoDate) return { fy: null, q: null };
  const y = +isoDate.slice(0, 4), m = +isoDate.slice(5, 7);
  const start = m >= 4 ? y : y - 1;
  return { fy: `${start}-${String(start + 1).slice(2)}`, q: `Q${m >= 4 ? Math.ceil((m - 3) / 3) : 4}` };
}
/** Due date for depositing TDS deducted in a month: 7th of next month (30 April for March). */
function dueDate(isoDate) {
  const y = +isoDate.slice(0, 4), m = +isoDate.slice(5, 7);
  if (m === 3) return `${y}-04-30`;
  const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-07`;
}
const normQuarter = (q) => { const m = text(q).toUpperCase().match(/Q?\s*([1-4])/); return m ? `Q${m[1]}` : null; };
const normFy = (fy) => {
  const m = text(fy).match(/(20\d{2})\s*[-/]\s*(\d{2,4})/);
  return m ? `${m[1]}-${m[2].slice(-2)}` : null;
};

// ------------------------------------------------------------------ main
export function buildTds({ payments: P, vendors: V, challans: C, notes: N }) {
  // ---- vendor master
  const vendors = V.rows.map((r) => ({
    vendorId: text(r.vendorId), vendorName: text(r.vendorName), pan: normPan(r.pan),
    type: text(r.type), panStatus: text(r.panStatus),
  })).filter((v) => v.vendorId || v.vendorName);
  const byId = new Map(vendors.filter((v) => v.vendorId).map((v) => [v.vendorId.toUpperCase(), v]));
  const byName = new Map(vendors.filter((v) => v.vendorName).map((v) => [v.vendorName.toLowerCase(), v]));
  const synthetic = vendors.some((v) => /synthetic/i.test(v.panStatus));

  // ---- payments
  const seen = new Map();
  const payments = P.rows.map((r, i) => {
    const gross = r2(toNum(r.gross)), tds = r2(toNum(r.tds));
    const hasNet = text(r.net) !== "";
    const p = {
      row: i + 2,
      id: text(r.id) || `ROW-${String(i + 2).padStart(3, "0")}`,
      date: toDate(r.date), vendorId: text(r.vendorId), vendorName: text(r.vendorName),
      panBooked: normPan(r.pan), section: normSection(r.section), nature: text(r.nature),
      gross, tds, net: hasNet ? r2(toNum(r.net)) : r2(gross - tds), netGiven: hasNet,
      depositDate: toDate(r.depositDate),
    };
    if (!p.gross && !p.tds) return null; // blank / total rows
    const master = (p.vendorId && byId.get(p.vendorId.toUpperCase())) || (p.vendorName && byName.get(p.vendorName.toLowerCase())) || null;
    p.inMaster = Boolean(master);
    p.vendorType = master?.type || panHolderType(normPan(r.pan) || master?.pan);
    p.panStatus = master?.panStatus || "";
    p.pan = p.panBooked || master?.pan || "";
    p.panFromMaster = !p.panBooked && Boolean(master?.pan);
    p.panMismatch = Boolean(p.panBooked && master?.pan && p.panBooked !== master.pan);
    p.panMissing = !p.pan || /missing|invalid|inoperative|not\s*(available|valid)/i.test(p.panStatus);
    p.deductee = p.vendorName || master?.vendorName || p.vendorId;
    p.deducteeKey = (p.vendorId || p.pan || p.vendorName).toUpperCase();
    p.rate = p.gross ? r2((p.tds / p.gross) * 100) : 0;
    const rule = RATE_RULES[p.section];
    p.expectedRate = rule && !p.panMissing ? rule.rate({ type: p.vendorType }, p) : null;
    p.rateOk = p.expectedRate == null || Math.abs(p.rate - p.expectedRate) < 0.01;
    Object.assign(p, fyQuarter(p.date));
    p.month = p.date?.slice(0, 7) || null;
    p.dup = seen.has(p.id);
    seen.set(p.id, true);
    return p;
  }).filter(Boolean);
  if (!payments.length) throw new Error(`${P.filename}: no payments with amounts found.`);

  // ---- challans
  const challans = C.rows.map((r, i) => {
    const date = toDate(r.date);
    const fq = fyQuarter(date);
    // a challan paid on/before the 7th usually settles the previous month's deductions
    let month = date?.slice(0, 7) || null;
    if (date && +date.slice(8, 10) <= 7) { const d = new Date(`${date}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); month = d.toISOString().slice(0, 7); }
    return {
      row: i + 2, id: text(r.id) || `CH-ROW-${i + 2}`, bsr: text(r.bsr), date, serial: text(r.serial),
      amount: r2(toNum(r.amount)), minorHead: text(r.minorHead),
      fy: normFy(r.fy) || fq.fy, q: normQuarter(r.quarter) || fyQuarter(month ? `${month}-01` : null).q, month,
    };
  }).filter((c) => c.amount);

  // ---- deductee / section / quarter groups
  const groups = new Map();
  for (const p of payments) {
    const k = `${p.deducteeKey}|${p.section}|${p.fy}|${p.q}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  for (const g of groups.values()) {
    const rates = new Set(g.map((p) => p.rate));
    const inconsistent = g.length > 1 && rates.size > 1;
    g.forEach((p, i) => { p.group = { size: g.length, first: g[0].id, index: i, inconsistent, members: g.map((x) => x.id) }; });
  }

  // ---- review note per payment (highest-priority finding wins)
  for (const p of payments) {
    const g = p.group;
    let note, flag;
    if (p.panMissing) { note = p.tds === 0 ? "Missing PAN and zero TDS: mandatory human review" : "Missing PAN: mandatory human review (higher rate under section 206AA may apply)"; flag = "pan"; }
    else if (p.dup) { note = `Duplicate Payment_ID ${p.id}: confirm it is not booked twice`; flag = "data"; }
    else if (p.netGiven && Math.abs(p.gross - p.tds - p.net) >= 0.01) { note = "Net paid does not equal gross less TDS: check the entry"; flag = "data"; }
    else if (g.inconsistent) { note = g.index === 0 ? "Review rate/threshold against facts and current rules" : `Review deduction consistency with ${g.first}`; flag = "rate"; }
    else if (!p.rateOk) { note = "Review rate and applicability"; flag = "rate"; }
    else if (g.size > 1 && g.index > 0) { note = `Aggregate with ${g.first} for deductee/section review`; flag = "aggregate"; }
    else if (p.section === "194I") { note = "Review threshold, timing and rate"; flag = "check"; }
    else if (p.tds === 0) { note = "No TDS deducted: confirm threshold or exemption applies"; flag = "rate"; }
    else if (!RATE_RULES[p.section]) { note = `Section ${p.section || "not stated"} has no configured rate: verify section/rate`; flag = "check"; }
    else { note = "Recorded deduction; verify section/rate"; flag = "ok"; }
    p.note = note; p.flag = flag;
  }

  // ---- totals
  const sum = (a, f) => r2(a.reduce((s, x) => s + f(x), 0));
  const totals = {
    payments: payments.length, gross: sum(payments, (p) => p.gross), tds: sum(payments, (p) => p.tds), net: sum(payments, (p) => p.net),
    challans: sum(challans, (c) => c.amount), challanCount: challans.length,
  };
  totals.difference = r2(totals.tds - totals.challans);

  // ---- period
  const periods = [...new Set(payments.filter((p) => p.fy).map((p) => `${p.fy}|${p.q}`))].sort();
  const fys = [...new Set(periods.map((x) => x.split("|")[0]))];
  const qs = [...new Set(periods.map((x) => x.split("|")[1]))];
  const periodLabel = fys.length === 1 ? `${qs.length === 1 ? qs[0] : `${qs[0]}–${qs.at(-1)}`} FY ${fys[0]}` : periods.map((x) => `${x.split("|")[1]} FY ${x.split("|")[0]}`).join(", ");
  const dates = payments.map((p) => p.date).filter(Boolean).sort();

  // ---- quarter-wise challan reconciliation
  const quarters = periods.map((key) => {
    const [fy, q] = key.split("|");
    const ps = payments.filter((p) => p.fy === fy && p.q === q);
    const cs = challans.filter((c) => c.fy === fy && c.q === q);
    const tds = sum(ps, (p) => p.tds), ch = sum(cs, (c) => c.amount);
    return { fy, q, label: `${q} FY ${fy}`, payments: ps.length, tds, challans: ch, challanIds: cs.map((c) => c.id), difference: r2(tds - ch) };
  });
  const unplacedChallans = challans.filter((c) => !periods.includes(`${c.fy}|${c.q}`));

  // ---- month-wise allocation (deductions of a month vs challans that settle it)
  const months = [...new Set([...payments.map((p) => p.month), ...challans.map((c) => c.month)].filter(Boolean))].sort().map((m) => {
    const ps = payments.filter((p) => p.month === m), cs = challans.filter((c) => c.month === m);
    const tds = sum(ps, (p) => p.tds), ch = sum(cs, (c) => c.amount);
    return { month: m, label: `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`, payments: ps.map((p) => p.id), tds, challans: cs.map((c) => c.id), challanAmount: ch, difference: r2(tds - ch), due: dueDate(`${m}-01`) };
  });

  // ---- section-wise and deductee-wise summaries (return working)
  const sections = [...new Set(payments.map((p) => p.section))].sort().map((s) => {
    const ps = payments.filter((p) => p.section === s);
    return { section: s || "—", nature: RATE_RULES[s]?.label || ps[0]?.nature || "", basis: RATE_RULES[s]?.basis || "Not configured", count: ps.length, deductees: new Set(ps.map((p) => p.deducteeKey)).size, gross: sum(ps, (p) => p.gross), tds: sum(ps, (p) => p.tds) };
  });
  const deductees = [...groups.values()].map((g) => ({
    deductee: g[0].deductee, pan: g[0].pan || "", type: g[0].vendorType, section: g[0].section, quarter: `${g[0].q} FY ${g[0].fy}`,
    payments: g.map((p) => p.id), gross: sum(g, (p) => p.gross), tds: sum(g, (p) => p.tds), rates: [...new Set(g.map((p) => p.rate))],
  }));

  // ---- exceptions (order: reference layout first, extra data checks, filing schema last)
  const ex = [];
  const add = (key, related, issue, action) => ex.push({ key, related, issue, action, status: "Open" });
  const ids = (a) => a.map((p) => p.id).join("; ");

  const panIssues = payments.filter((p) => p.panMissing);
  if (panIssues.length) add("pan", ids(panIssues), panIssues.every((p) => !p.pan) ? "PAN missing" : "PAN missing or not valid", "Obtain/validate PAN and determine applicable treatment before filing");

  const rateIssues = payments.filter((p) => !p.panMissing && (p.group.inconsistent || !p.rateOk || (p.tds === 0 && p.flag === "rate")));
  if (rateIssues.length) add("rate", ids(rateIssues), "Deduction rate consistency", "Verify applicable section, threshold, timing and rate using current-year rules");

  for (const q of quarters) {
    if (Math.abs(q.difference) < 0.01) continue;
    const scope = fys.length === 1 ? `All ${q.q} payments` : `All ${q.label} payments`;
    const msg = q.difference > 0
      ? `Recorded deductions total ${inrText(q.tds)}; challans total ${inrText(q.challans)}; difference ${inrText(q.difference)}. Allocate challans and investigate shortfall/unmatched balance.`
      : `Recorded deductions total ${inrText(q.tds)}; challans total ${inrText(q.challans)}; challans exceed deductions by ${inrText(q.difference)}. Allocate challans and identify the unmatched challan balance.`;
    add("challan", scope, "Challan reconciliation", msg);
  }
  if (unplacedChallans.length) add("challan", unplacedChallans.map((c) => c.id).join("; "), "Challan outside the payment period", `Challans totalling ${inrText(sum(unplacedChallans, (c) => c.amount))} relate to a quarter with no payments in the ledger. Confirm the period or provide the matching deductions.`);

  for (const g of groups.values()) {
    if (g.length > 1 && !g[0].group.inconsistent && !g[0].panMissing) add("aggregate", g.map((p) => p.id).join(" + "), "Deductee aggregation", "Aggregate deductee-wise transactions for threshold and return preparation checks");
  }

  const notInMaster = payments.filter((p) => !p.inMaster);
  if (notInMaster.length) add("master", ids(notInMaster), "Deductee not in vendor master", "Add the deductee to the vendor master with PAN and deductee type before preparing the return");
  const panMismatch = payments.filter((p) => p.panMismatch);
  if (panMismatch.length) add("master", ids(panMismatch), "PAN differs from vendor master", "Confirm the correct PAN; the return must carry the PAN on the deductee's records");
  const arithmetic = payments.filter((p) => p.netGiven && Math.abs(p.gross - p.tds - p.net) >= 0.01);
  if (arithmetic.length) add("data", ids(arithmetic), "Net paid ≠ gross − TDS", "Correct the ledger entry so gross, TDS and net paid agree");
  const dups = payments.filter((p) => p.dup);
  if (dups.length) add("data", ids(dups), "Duplicate payment reference", "Confirm whether the payment is booked twice before it is reported");
  const late = payments.filter((p) => p.tds > 0 && p.depositDate && p.date && p.depositDate > dueDate(p.date));
  if (late.length) add("late", ids(late), "TDS deposited after due date", "Compute interest under section 201(1A) and confirm the challan used");
  const noDeposit = payments.filter((p) => p.tds > 0 && !p.depositDate);
  if (noDeposit.length) add("late", ids(noDeposit), "TDS deposit date missing", "Record the challan / deposit date for each deduction");

  add("schema", "Return dataset", "Filing schema", "Map validated data to current filing utility schema after rule/version configuration");
  const exceptions = ex.map((e, i) => ({ id: `EX-TDS-${String(i + 1).padStart(2, "0")}`, ...e }));

  // ---- PDF "Key exceptions" line
  const has = (k) => exceptions.some((e) => e.key === k);
  const keyParts = [
    has("pan") && "missing PAN", has("rate") && "rate/applicability checks", has("aggregate") && "deductee aggregation",
    has("challan") && "challan allocation", has("master") && "vendor master gaps", has("data") && "ledger data errors",
    has("late") && "deposit timing", "filing schema validation",
  ].filter(Boolean);
  const keyExceptions = `${keyParts.join("; ").replace(/^./, (c) => c.toUpperCase())}.`;

  // ---- review notes (optional CSV): which exceptions cover each note
  const reviewNotes = (N?.rows || []).map((row) => {
    const vals = Object.values(row).filter(Boolean);
    const textAll = vals.join(" ");
    const refs = [...new Set(textAll.match(/\b(?:PAY|CH|V)\d{2,}\b/gi) || [])].map((s) => s.toUpperCase());
    const covered = exceptions.filter((e) => refs.some((r) => e.related.toUpperCase().includes(r))
      || (/challan/i.test(textAll) && e.key === "challan") || (/schema|filing utility|format/i.test(textAll) && e.key === "schema")
      || (/pan/i.test(textAll) && e.key === "pan" && refs.some((r) => e.related.includes(r))));
    return { id: vals[0] || "", text: vals.slice(1).join(" · ") || vals[0] || "", refs, covered: covered.map((e) => e.id) };
  });

  const status = "Draft - human validation required";
  return {
    title: "TDS Processing Summary",
    subtitle: `${synthetic ? "Synthetic " : ""}${periodLabel} · Draft for review`,
    period: { label: periodLabel, start: dates[0] || null, end: dates.at(-1) || null, fys, quarters: qs },
    synthetic, status, filingReady: false,
    approval: "Not filing-ready. Tax professional must validate applicable provisions and return schema.",
    keyExceptions, totals,
    control: [
      ["Gross payments (input population)", totals.gross],
      ["TDS recorded in books", totals.tds],
      ["Challans provided", totals.challans],
      ["Unreconciled difference (simple aggregate control)", totals.difference],
      ["Processing status", status],
    ],
    payments, challans, vendors, exceptions, quarters, months, sections, deductees, reviewNotes,
    stats: {
      flagged: payments.filter((p) => p.flag !== "ok").length, panMissing: panIssues.length, rateIssues: rateIssues.length,
      deductees: new Set(payments.map((p) => p.deducteeKey)).size, exceptions: exceptions.length,
    },
    detection: {
      payments: { file: P.filename, columns: P.columns, rows: P.rows.length },
      vendors: { file: V.filename, columns: V.columns, rows: V.rows.length },
      challans: { file: C.filename, columns: C.columns, rows: C.rows.length },
      notes: N ? { file: N.filename, rows: N.rows.length } : null,
    },
    rules: Object.entries(RATE_RULES).map(([section, r]) => ({ section, label: r.label, basis: r.basis })),
  };
}

/** Model for the PDF renderer — same rows as the reference "TDS Processing Summary". */
export function pdfModel(r) {
  return {
    title: r.title,
    subtitle: r.subtitle,
    rows: [
      ["Payments in input", String(r.totals.payments)],
      ["Gross payment population", inrText(r.totals.gross)],
      ["TDS booked", inrText(r.totals.tds)],
      ["Challans provided", inrText(r.totals.challans)],
      ["Aggregate difference", `${r.totals.difference < 0 ? "-" : ""}${inrText(r.totals.difference)}`],
      ["Key exceptions", r.keyExceptions],
      ["Approval", r.approval],
    ],
  };
}
