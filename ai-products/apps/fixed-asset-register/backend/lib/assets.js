// Fixed asset processing — deterministic engine (no AI in any figure).
// Existing register + current-year additions + disposals + class depreciation policy (+ capital invoices)
// → asset rollforward with the quarter's book depreciation, exceptions and an additions extract.
//
// Book depreciation (SLM, the policy's class method):
//   depreciable amount = cost × (1 − residual %)      monthly charge = depreciable ÷ (life × 12)
//   full-month convention for assets in use before the quarter; the charge stops at the depreciable amount.
// A calculation is HELD (blank, with an exception) rather than guessed when:
//   • the register's method differs from the class policy (or the class has a conflicting register method),
//   • an asset is disposed of in the quarter without opening accumulated depreciation,
//   • an addition starts after the quarter's first month and no partial-period convention is configured,
//   • WDV needs an opening written-down value that isn't supplied, or the class has no policy.
// Tax depreciation is never inferred from the book policy.
import { toDate, toNum, text } from "./parse.js";

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const norm = (s) => text(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const idKey = (v) => text(v).toUpperCase().replace(/\s+/g, "");
const invKey = (v) => text(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
export const inrText = (n) => `INR ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function methodOf(v) {
  const s = norm(v);
  if (/slm|straight/.test(s)) return "SLM";
  if (/wdv|written|reducing|declining|dbm/.test(s)) return "WDV";
  return text(v) ? text(v).toUpperCase() : null;
}

// ---- Indian financial-year quarters (April–March)
export function quarterOf(d) {
  const y = +d.slice(0, 4), m = +d.slice(5, 7);
  const fy = m >= 4 ? y : y - 1;
  const q = Math.floor(((m - 4 + 12) % 12) / 3) + 1;
  const sm = 4 + (q - 1) * 3; // start month (4, 7, 10, 13→1)
  const sy = sm > 12 ? fy + 1 : fy, smm = ((sm - 1) % 12) + 1;
  const start = `${sy}-${String(smm).padStart(2, "0")}-01`;
  const endD = new Date(Date.UTC(sy, smm - 1 + 3, 0));
  return { q, fy, key: `${fy}Q${q}`, label: `Q${q} FY ${fy}-${String((fy + 1) % 100).padStart(2, "0")}`, start, end: endD.toISOString().slice(0, 10) };
}
const monthIdx = (d) => +d.slice(0, 4) * 12 + +d.slice(5, 7) - 1;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;

export function processAssets({ register: R, additions: A, disposals: D, policy: P, invoices = [] }) {
  const exceptions = []; // { asset, issue, action, kind }
  const add = (asset, issue, action, kind = "data") => exceptions.push({ asset, issue, action, kind });

  // ---- policy by class
  const policy = new Map();
  for (const p of P?.rows || []) {
    const cls = text(p.assetClass);
    if (!cls) continue;
    const res = p.residual != null && text(p.residual) !== "" ? toNum(p.residual) : null;
    policy.set(norm(cls), {
      cls, method: methodOf(p.method), life: toNum(p.life) || null, rate: toNum(p.rate) || null,
      residualPct: res == null ? null : res <= 1 && res > 0 && !/%/.test(text(p.residual)) && res !== 1 ? res * 100 : res,
      convention: text(p.convention) || null, notes: text(p.notes),
    });
  }
  const synthetic = [...policy.values()].some((p) => /synthetic|test/i.test(p.notes)) || invoices.some((i) => i.synthetic);

  // ---- disposals by asset
  const disposals = new Map();
  for (const d of D?.rows || []) {
    const id = idKey(d.assetId);
    if (!id) continue;
    disposals.set(id, { date: toDate(d.disposalDate), proceeds: d.proceeds != null && text(d.proceeds) !== "" ? toNum(d.proceeds) : null, buyer: text(d.buyer), approval: text(d.approval) });
  }

  // ---- the quarter: where the additions and disposals fall (most common FY quarter)
  const dates = [...(A?.rows || []).map((a) => toDate(a.useDate) || toDate(a.invoiceDate)), ...[...disposals.values()].map((d) => d.date)].filter(Boolean);
  const counts = {};
  for (const d of dates) { const k = quarterOf(d).key; counts[k] = (counts[k] || 0) + 1; }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0];
  const Q = best ? quarterOf(dates.find((d) => quarterOf(d).key === best[0])) : quarterOf(new Date().toISOString().slice(0, 10));
  const otherQ = dates.filter((d) => quarterOf(d).key !== Q.key);
  const qMonths = 3;
  const qCol = `Q${Q.q}`;

  // existing methods per class (for the class-level conflict check on additions)
  const regMethods = new Map();
  for (const r of R.rows) { const c = norm(r.assetClass), m = methodOf(r.method); if (c && m) (regMethods.get(c) || regMethods.set(c, new Set()).get(c)).add(m); }

  const rows = [];
  const held = { conflict: [], disposal: [], convention: [], policy: [], opening: [] };
  const seen = new Set();

  /** SLM / WDV for `months` of the quarter. Returns { dep, note } or null when it can't be computed. */
  function compute(a, pol, monthsInQ, { monthsBefore = 0, opening = {} } = {}) {
    const resPct = pol.residualPct ?? 0;
    if (pol.method === "SLM") {
      const life = pol.life;
      if (!life) return null;
      const depreciable = a.cost * (1 - resPct / 100);
      const monthly = depreciable / (life * 12);
      const before = opening.accDep != null ? opening.accDep : Math.min(depreciable, monthly * monthsBefore);
      const remaining = Math.max(0, depreciable - before);
      const dep = r2(Math.min(monthly * monthsInQ, remaining));
      return { dep, monthly: r2(monthly), accBefore: r2(before), fully: remaining <= 0.005 };
    }
    if (pol.method === "WDV") {
      const rate = pol.rate ? (pol.rate > 1 ? pol.rate / 100 : pol.rate) : null; // WDV needs a configured rate
      const wdv = opening.wdv != null ? opening.wdv : opening.accDep != null ? a.cost - opening.accDep : monthsBefore === 0 ? a.cost : null;
      if (rate == null || wdv == null) return null;
      return { dep: r2((wdv * rate * monthsInQ) / 12), rate };
    }
    return null;
  }

  // ---- existing assets
  for (const r of R.rows) {
    const id = idKey(r.assetId);
    if (!id) continue;
    if (seen.has(id)) { add(id, "Duplicate asset ID in the register; first row used", "Remove or renumber the duplicate"); continue; }
    seen.add(id);
    const cls = text(r.assetClass), pol = policy.get(norm(cls));
    const cost = toNum(r.cost);
    const regMethod = methodOf(r.method);
    const lr = toNum(r.lifeOrRate);
    const regLife = regMethod === "SLM" || (lr > 1 && lr <= 100 && !/%/.test(text(r.lifeOrRate))) ? lr || null : null;
    const regResPct = cost ? r2((toNum(r.residual) / cost) * 100) : 0;
    const useDate = toDate(r.useDate) || toDate(r.purchaseDate);
    const disp = disposals.get(id);
    const dispDate = disp?.date || toDate(r.disposalDate) || null;
    const disposedFlag = /dispos|sold|scrap|retir|written ?off/i.test(text(r.status));
    if (disp && toDate(r.disposalDate) && disp.date && toDate(r.disposalDate) !== disp.date) add(id, `Disposal date differs: register ${toDate(r.disposalDate)}, disposals file ${disp.date}`, "Confirm the disposal date");
    if (disposedFlag && !dispDate) add(id, "Register status is disposed but no disposal date or disposal record is supplied", "Obtain the disposal record");

    const base = { id, description: text(r.description), cls, cost, source: "register", useDate, invoice: null };
    if (dispDate && dispDate < Q.start) { rows.push({ ...base, method: regMethod, life: regLife, residualPct: regResPct, start: null, status: `Disposed ${dispDate}`, dep: null, note: "Disposed before the period; no charge", held: false, excluded: true }); continue; }
    const start = useDate && useDate > Q.start ? useDate : Q.start;
    const status = dispDate && dispDate <= Q.end ? `Disposed ${dispDate}` : "Active";
    const row = { ...base, method: regMethod, life: pol?.life ?? regLife, residualPct: pol?.residualPct ?? regResPct, start, status, dep: null, note: "", held: true };

    if (!pol) {
      row.note = `No depreciation policy for class '${cls || "blank"}'; calculation held`;
      add(id, `No depreciation policy supplied for asset class '${cls || "blank"}'`, "Add the class to the depreciation policy");
      held.policy.push(id);
    } else if (regMethod && pol.method && regMethod !== pol.method) {
      row.life = regLife ?? pol.life; row.residualPct = regResPct;
      row.note = "Method differs from supplied class policy; calculation held for review";
      add(id, `Register says ${regMethod} while class policy says ${pol.method}`, "Confirm approved book depreciation method; calculate only after resolution", "policy");
      held.conflict.push(id);
    } else if (status !== "Active") {
      const opening = { accDep: r.openingAccDep != null && text(r.openingAccDep) !== "" ? toNum(r.openingAccDep) : null };
      if (opening.accDep == null) {
        row.note = "Need opening accumulated depreciation and disposal accounting details";
        add(id, "Disposed during period; opening accumulated depreciation and disposal accounting not supplied", "Obtain opening accumulated depreciation, disposal approval and sale accounting", "policy");
        held.disposal.push(id);
      } else {
        const months = monthIdx(dispDate) - monthIdx(Q.start) + 1;
        const c = compute(row, pol, months, { opening });
        row.dep = c?.dep ?? null; row.held = !c;
        const nbv = r2(cost - opening.accDep - (c?.dep || 0));
        row.note = c ? `Illustrative ${qCol} ${pol.method} to disposal; NBV ${inrText(nbv)}${disp?.proceeds != null ? `, ${disp.proceeds - nbv >= 0 ? "gain" : "loss"} ${inrText(Math.abs(r2(disp.proceeds - nbv)))}` : ""}; needs approval` : "Disposal calculation held";
        row.disposal = { nbv, proceeds: disp?.proceeds ?? null, gainLoss: disp?.proceeds != null ? r2(disp.proceeds - nbv) : null };
        if (!c) held.disposal.push(id);
      }
    } else {
      if (regLife && pol.life && pol.method === "SLM" && regLife !== pol.life) add(id, `Register useful life ${regLife} years differs from class policy ${pol.life} years; policy used`, "Confirm the approved useful life", "info");
      const monthsBefore = useDate ? Math.max(0, monthIdx(Q.start) - monthIdx(useDate)) : 0;
      const monthsInQ = useDate && useDate > Q.start ? Math.max(0, monthIdx(Q.end) - monthIdx(useDate) + 1) : qMonths;
      const opening = { accDep: r.openingAccDep != null && text(r.openingAccDep) !== "" ? toNum(r.openingAccDep) : null, wdv: r.openingWdv != null && text(r.openingWdv) !== "" ? toNum(r.openingWdv) : null };
      const c = compute(row, pol, monthsInQ, { monthsBefore, opening });
      if (!c) {
        row.note = pol.method === "WDV" ? "WDV needs the opening written-down value; calculation held" : "Policy life or rate missing; calculation held";
        add(id, row.note.replace("; calculation held", ""), pol.method === "WDV" ? "Supply opening WDV or accumulated depreciation" : "Complete the class policy", "data");
        held.opening.push(id);
      } else {
        row.dep = c.dep; row.held = false; row.calc = { ...c, months: monthsInQ };
        row.note = c.fully ? "Fully depreciated; no charge" : `Illustrative ${qCol} ${pol.method}; policy-based`;
      }
    }
    rows.push(row);
  }

  // ---- invoices (PDF) by number
  const invByNo = new Map(invoices.filter((i) => i.readable && i.invoiceNo).map((i) => [invKey(i.invoiceNo), i]));
  const usedInv = new Set();

  // ---- additions
  const extract = [];
  for (const a of A?.rows || []) {
    const desc = text(a.description);
    const invNo = text(a.invoiceNo);
    let id = idKey(a.assetId);
    if (!id && !desc) continue;
    if (!id) { id = `ADD-${invKey(invNo) || rows.length + 1}`; add(id, `No asset ID proposed for '${desc}'; temporary ID assigned`, "Assign the asset ID before capitalisation"); }
    if (seen.has(id)) add(id, "Proposed asset ID already exists in the register", "Assign a new asset ID");
    seen.add(id);
    const cls = text(a.assetClass), pol = policy.get(norm(cls));
    const cost = toNum(a.cost);
    const useDate = toDate(a.useDate) || toDate(a.invoiceDate);
    const inv = invNo ? invByNo.get(invKey(invNo)) : null;
    if (inv) usedInv.add(invKey(invNo));

    // additions extract
    let docStatus = "Ledger addition input";
    if (inv) {
      const parts = [];
      if (inv.total != null && Math.abs(inv.total - cost) > 0.5) {
        parts.push(`invoice total ${inrText(inv.total)} differs from ledger cost ${inrText(cost)}`);
        add(id, `Invoice ${invNo} total ${inrText(inv.total)} differs from ledger cost ${inrText(cost)}`, "Agree the capitalised cost to the invoice before calculation");
      }
      if (inv.taxable != null && inv.gst != null && inv.total != null && Math.abs(inv.taxable + inv.gst - inv.total) > 0.5) {
        parts.push("taxable value + GST does not add up to the total");
        add(id, `Invoice ${invNo}: taxable ${inrText(inv.taxable)} + GST ${inrText(inv.gst)} ≠ total ${inrText(inv.total)}`, "Check the invoice arithmetic");
      }
      docStatus = parts.length ? `Extracted from ${inv.synthetic ? "sample " : ""}invoice; ${parts.join("; ")}` : `Extracted from ${inv.synthetic ? "sample " : ""}invoice; tax split should be independently validated`;
    }
    extract.push({ invoiceNo: invNo, assetId: id, description: desc, cost, status: docStatus, vendor: text(a.vendor), invoiceDate: toDate(a.invoiceDate), invoice: inv ? { taxable: inv.taxable, gst: inv.gst, total: inv.total, supplier: inv.supplier, date: inv.invoiceDate, file: inv.file } : null });

    const base = { id, description: desc, cls, cost, source: "addition", useDate, invoice: invNo || null, vendor: text(a.vendor) };
    if (useDate && useDate > Q.end) { rows.push({ ...base, method: pol?.method || null, life: pol?.life ?? null, residualPct: pol?.residualPct ?? null, start: useDate, status: "Addition", dep: null, note: "Available for use after the period; no charge this quarter", held: false, excluded: true }); continue; }
    const start = useDate && useDate > Q.start ? useDate : Q.start;
    const row = { ...base, method: pol?.method || null, life: pol?.life ?? null, residualPct: pol?.residualPct ?? null, start, status: "Addition", dep: null, note: "", held: true };
    const existing = regMethods.get(norm(cls));
    if (!pol) {
      row.note = `No depreciation policy for class '${cls || "blank"}'; calculation held`;
      add(id, `No depreciation policy supplied for asset class '${cls || "blank"}'`, "Add the class to the depreciation policy");
      held.policy.push(id);
    } else if (existing && pol.method && [...existing].some((m) => m !== pol.method)) {
      const other = [...existing].filter((m) => m !== pol.method).join("/");
      row.note = `${cls} method conflict in supplied policy; review before calculation`;
      add(id, `${cls} class policy says ${pol.method} but existing ${cls.toLowerCase()} register uses ${other}`, "Confirm approved method for this asset class", "policy");
      held.conflict.push(id);
    } else {
      const conv = norm(pol.convention);
      const useMonth = useDate ? monthIdx(useDate) - monthIdx(Q.start) : 0; // 0 = first month of the quarter
      let months = null, note = "";
      if (/day|prorata|daily/.test(conv) && useDate) { months = (daysBetween(start, Q.end) / 365) * 12; note = `Illustrative ${qCol} ${pol.method}; daily pro-rata from ${start}`; }
      else if (/next|following/.test(conv)) { months = Math.max(0, qMonths - useMonth - 1); note = `Illustrative ${qCol} ${pol.method}; from the month after use`; }
      else if (/month|full/.test(conv)) { months = qMonths - Math.max(0, useMonth); note = `Illustrative ${qCol} ${pol.method}; full month of use counted`; }
      else if (useMonth <= 0) { months = qMonths; note = `${qCol} illustrative partial-month convention needs approval`; }
      if (months == null) {
        row.note = "Partial-period convention not specified; calculation held";
        add(id, "Partial-period convention not specified", "Configure date/month convention before calculating", "policy");
        held.convention.push(id);
      } else {
        const c = compute(row, pol, months);
        if (!c) { row.note = "Policy life or rate missing; calculation held"; add(id, "Policy life or rate missing", "Complete the class policy"); held.opening.push(id); }
        else { row.dep = c.dep; row.held = false; row.calc = { ...c, months: r2(months) }; row.note = note; }
      }
    }
    rows.push(row);
  }

  // disposals for assets nobody knows
  for (const [id, d] of disposals) if (!rows.some((r) => r.id === id)) add(id, `Disposal record (${d.date || "no date"}) for an asset not in the register`, "Confirm the asset ID");
  // invoices not in the additions file
  for (const i of invoices) {
    if (!i.readable) add("DOC", `${i.file}: ${i.error}`, "Upload a text PDF or enter the invoice in the additions file");
    else if (!i.invoiceNo) add("DOC", `${i.file}: invoice number not found`, "Check the invoice and the additions file");
    else if (!usedInv.has(invKey(i.invoiceNo))) add(i.invoiceNo, `Invoice ${i.invoiceNo} (${i.file}) extracted but not in the additions file`, "Add it to the additions or confirm it is not a capital purchase");
  }
  if (otherQ.length) add("ALL", `Dates outside ${Q.label} (${[...new Set(otherQ)].join(", ")}) found in additions/disposals`, "Confirm the period; out-of-quarter items are treated as before/after it");

  // order: asset rows order, then document / file-level, then the tax line
  const order = new Map(rows.map((r, i) => [r.id, i]));
  exceptions.sort((a, b) => (order.get(a.asset) ?? 1e6) - (order.get(b.asset) ?? 1e6));
  exceptions.push({ asset: "ALL", issue: "Tax depreciation schedule requires separate tax block/rates and relevant tax data", action: "Do not infer tax depreciation from book policy", kind: "policy" });

  // ---- summary lines
  const existingN = rows.filter((r) => r.source === "register").length;
  const additionsN = rows.filter((r) => r.source === "addition").length;
  const extracted = invoices.filter((i) => i.readable && i.invoiceNo && usedInv.has(invKey(i.invoiceNo)));
  const docText = !invoices.length ? "No capital invoice uploaded"
    : extracted.length ? `${extracted.map((i) => i.invoiceNo).join(", ")} ${extracted.some((i) => i.synthetic) ? "sample " : ""}capital invoice${extracted.length > 1 ? "s" : ""} extracted`
      : invoices.some((i) => i.readable) ? "Invoice read but not matched to the additions" : "Invoice could not be read";
  const heldParts = [
    held.conflict.length && `${held.conflict.join("/")} method conflict`,
    held.disposal.length && `${held.disposal.join("/")} disposal details`,
    held.convention.length && `${held.convention.join("/")} partial-period convention`,
    held.policy.length && `${held.policy.join("/")} class policy missing`,
    held.opening.length && `${held.opening.join("/")} opening values or policy inputs`,
  ].filter(Boolean);
  const heldText = heldParts.length ? `${heldParts.join("; ")}.` : "None.";
  const next = [held.conflict.length || held.policy.length ? "Confirm approved book policy" : null,
    held.disposal.length || held.opening.length ? "obtain missing opening/disposal data" : null,
    exceptions.some((x) => /^Invoice |\.pdf: /.test(x.issue)) ? "agree the capital invoices to the additions" : null].filter(Boolean);
  let nextAction = next.length ? `${next.length > 2 ? `${next.slice(0, -1).join(", ")} and ${next.at(-1)}` : next.join(" and ")}.` : held.convention.length ? "Configure the partial-period convention and recalculate held additions." : "Review the illustrative schedule and approve the conventions used.";
  nextAction = nextAction[0].toUpperCase() + nextAction.slice(1);
  const approval = "Draft schedule; not statutory/tax depreciation output.";

  const computed = rows.filter((r) => r.dep != null);
  const totals = {
    cost: r2(rows.filter((r) => !r.excluded).reduce((s, r) => s + r.cost, 0)),
    additions: r2(rows.filter((r) => r.source === "addition").reduce((s, r) => s + r.cost, 0)),
    disposalsCost: r2(rows.filter((r) => /Disposed/.test(r.status) && !r.excluded).reduce((s, r) => s + r.cost, 0)),
    dep: r2(computed.reduce((s, r) => s + r.dep, 0)),
    heldCost: r2(rows.filter((r) => r.held && !r.excluded).reduce((s, r) => s + r.cost, 0)),
  };

  return {
    title: "Fixed Asset Processing Summary",
    subtitle: `${Q.label} · ${synthetic ? "Synthetic draft only" : "Draft only"}`,
    period: { label: Q.label, quarter: Q.q, fy: Q.fy, start: Q.start, end: Q.end, column: `${qCol}_Depreciation_INR` },
    synthetic, approval, nextAction, heldText, docText,
    rows: rows.map(({ calc, ...r }) => ({ ...r, calc: calc || null })),
    exceptions, extract,
    policy: [...policy.values()],
    disposals: [...disposals].map(([id, d]) => ({ id, ...d })),
    invoices: invoices.map(({ text: _t, ...i }) => i),
    totals,
    stats: { existing: existingN, additions: additionsN, computed: computed.length, held: rows.filter((r) => r.held && !r.excluded).length, exceptions: exceptions.length, invoices: invoices.length, extracted: extracted.length, dep: totals.dep },
    pdfRows: [
      ["Asset records", `${existingN} existing asset${existingN === 1 ? "" : "s"} plus ${additionsN} addition${additionsN === 1 ? "" : "s"}`],
      ["Document extraction", docText],
      ["Held calculations", heldText],
      ["Next action", nextAction],
      ["Approval", approval],
    ],
    detection: Object.fromEntries([["register", R], ["additions", A], ["disposals", D], ["policy", P]].filter(([, F]) => F).map(([k, F]) => [k, { file: F.filename, columns: F.columns, rows: F.rows.length }])),
  };
}

export const pdfModel = (r) => ({ title: r.title, subtitle: r.subtitle, rows: r.pdfRows });
