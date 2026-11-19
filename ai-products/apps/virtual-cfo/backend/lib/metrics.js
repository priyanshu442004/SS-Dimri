// Turns extracted statements into every figure, status and sentence of the
// "Financial Health Summary" (same structure and wording rules as the reference
// report). Deterministic: same documents → same report.

const UNIT = { rupees: 1, thousands: 1e3, lakhs: 1e5, crores: 1e7, millions: 1e6 };
const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const has = (v) => typeof v === "number" && Number.isFinite(v);
const r2 = (x) => Math.round(x * 100) / 100;
const growth = (cur, prev) => (has(cur) && has(prev) && prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : null);
const avg = (a, b) => (has(a) && has(b) ? (a + b) / 2 : has(a) ? a : null);

// ---------------------------------------------------------------- formatting (matches the reference)
const MINUS = "−";
const cr = (rupees, dp = 2) => `₹${(rupees / 1e7).toFixed(dp)} Cr`;
const sig3 = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
/** small amounts in lakhs (3 significant digits), large in crores */
const money = (rupees) => (Math.abs(rupees) < 1e7 ? `₹${sig3(Math.abs(rupees) / 1e5)} L` : cr(Math.abs(rupees)));
const signed = (x, dp = 1) => (x == null ? "n/a" : `${x >= 0 ? "+" : MINUS}${Math.abs(x).toFixed(Math.abs(x) < 1 ? 2 : dp)}%`);
const pct2 = (x) => (x == null ? "n/a" : `${x.toFixed(2)}%`);
const times = (x) => (x == null ? "n/a" : `${x.toFixed(2)}x`);

export const COLORS = { blue: "#1b3fa8", light: "#4399ff", teal: "#12887a", green: "#2e8b57", amber: "#f59e0b", grey: "#7b8794", red: "#dc4a38" };
const POINTS = { Good: 90, Watch: 77, Mixed: 64, Low: 45 };

export function analyse({ data, notes }) {
  const bsDoc = data.balanceSheet, plDoc = data.profitLoss, cfDoc = data.cashFlow, rDoc = data.ratios;
  const mult = UNIT[bsDoc.unit] || UNIT[plDoc.unit] || 1e3;
  const R = (v) => (has(v) ? v * mult : null); // to rupees
  const bs = { c: bsDoc.current || {}, p: bsDoc.previous || {} };
  const pl = { c: plDoc.current || {}, p: plDoc.previous || {} };
  const cf = { c: cfDoc.current || {}, p: cfDoc.previous || {} };
  const fy = bsDoc.currentLabel || plDoc.currentLabel || "FY", pfy = bsDoc.previousLabel || plDoc.previousLabel || "Previous year";
  const company = bsDoc.company || plDoc.company || "The company";

  // ---- balance sheet aggregates (always summed in code)
  const agg = (b) => {
    const ca = n(b.inventories) + n(b.tradeReceivables) + n(b.cashAndBank) + n(b.shortTermLoansAndAdvances) + n(b.otherCurrentAssets) + n(b.currentInvestments);
    const cl = n(b.shortTermBorrowings) + n(b.tradePayables) + n(b.otherCurrentLiabilities) + n(b.shortTermProvisions);
    const equity = n(b.totalEquity) || n(b.shareCapital) + n(b.reservesAndSurplus);
    const total = n(b.totalAssets) || n(b.totalEquityAndLiabilities);
    const debt = n(b.longTermBorrowings) + n(b.shortTermBorrowings);
    return { ca, cl, equity, total, debt, capEmployed: equity + debt + n(b.deferredTaxLiabilities) };
  };
  const A = { c: agg(bs.c), p: agg(bs.p) };

  // ---- ratios: auditor's note first, computed otherwise
  const note = rDoc?.ratios || {};
  const ebit = (p) => n(p.profitBeforeTax) + n(p.financeCosts);
  const computed = {
    currentRatio: { c: A.c.cl ? A.c.ca / A.c.cl : null, p: A.p.cl ? A.p.ca / A.p.cl : null },
    debtEquity: { c: A.c.equity ? A.c.debt / A.c.equity : null, p: A.p.equity ? A.p.debt / A.p.equity : null },
    debtServiceCoverage: { c: null, p: null },
    returnOnEquity: { c: A.p.equity ? (n(pl.c.profitAfterTax) / avg(A.c.equity, A.p.equity)) * 100 : null, p: null },
    inventoryTurnover: { c: avg(bs.c.inventories, bs.p.inventories) ? n(pl.c.revenueFromOperations) / avg(bs.c.inventories, bs.p.inventories) : null, p: null },
    receivablesTurnover: { c: avg(bs.c.tradeReceivables, bs.p.tradeReceivables) ? n(pl.c.revenueFromOperations) / avg(bs.c.tradeReceivables, bs.p.tradeReceivables) : null, p: null },
    payablesTurnover: { c: avg(bs.c.tradePayables, bs.p.tradePayables) ? n(pl.c.costOfMaterialsConsumed) / avg(bs.c.tradePayables, bs.p.tradePayables) : null, p: null },
    netProfitMargin: { c: pl.c.revenueFromOperations ? (n(pl.c.profitAfterTax) / pl.c.revenueFromOperations) * 100 : null, p: pl.p.revenueFromOperations ? (n(pl.p.profitAfterTax) / pl.p.revenueFromOperations) * 100 : null },
    returnOnCapitalEmployed: { c: A.c.capEmployed ? (ebit(pl.c) / A.c.capEmployed) * 100 : null, p: A.p.capEmployed ? (ebit(pl.p) / A.p.capEmployed) * 100 : null },
  };
  const ratio = (k) => {
    const nt = note[k] || {};
    const c = has(nt.current) ? nt.current : computed[k]?.c ?? null;
    const p = has(nt.previous) ? nt.previous : computed[k]?.p ?? null;
    const v = has(nt.variancePct) ? nt.variancePct : growth(c, p);
    return { c, p, variance: v, source: has(nt.current) ? "ratio note" : "computed" };
  };
  const RT = Object.fromEntries(Object.keys(computed).map((k) => [k, ratio(k)]));

  // ---- core figures (rupees)
  const rev = { c: R(pl.c.revenueFromOperations), p: R(pl.p.revenueFromOperations) };
  const pat = { c: R(pl.c.profitAfterTax), p: R(pl.p.profitAfterTax) };
  const total = { c: R(A.c.total), p: R(A.p.total) };
  const eq = { c: R(A.c.equity), p: R(A.p.equity) };
  const cash = { c: R(bs.c.cashAndBank), p: R(bs.p.cashAndBank) };
  const stb = { c: R(bs.c.shortTermBorrowings), p: R(bs.p.shortTermBorrowings) };
  const ltb = { c: R(bs.c.longTermBorrowings), p: R(bs.p.longTermBorrowings) };
  const fin = { c: R(pl.c.financeCosts), p: R(pl.p.financeCosts) };
  const emp = { c: R(pl.c.employeeBenefits), p: R(pl.p.employeeBenefits) };
  const mat = { c: R(pl.c.costOfMaterialsConsumed), p: R(pl.p.costOfMaterialsConsumed) };
  const ocf = R(cf.c.netCashFromOperating), icf = R(cf.c.netCashFromInvesting), fcf = R(cf.c.netCashFromFinancing);
  const capex = Math.abs(n(R(cf.c.purchaseOfFixedAssets)));
  const cwip = n(R(bs.c.capitalWorkInProgress));

  const g = {
    rev: growth(rev.c, rev.p), pat: growth(pat.c, pat.p), assets: growth(total.c, total.p), equity: growth(eq.c, eq.p),
    cash: growth(cash.c, cash.p), stb: growth(stb.c, stb.p), ltb: growth(ltb.c, ltb.p), fin: growth(fin.c, fin.p),
  };
  const share = (num, den) => (den ? (num / den) * 100 : 0);
  const ebitM = { c: share(R(ebit(pl.c)), rev.c), p: share(R(ebit(pl.p)), rev.p) };
  const matPct = { c: share(mat.c, rev.c), p: share(mat.p, rev.p) };
  const finPct = { c: share(fin.c, rev.c), p: share(fin.p, rev.p) };
  const empPct = { c: share(emp.c, rev.c), p: share(emp.p, rev.p) };
  const flat = g.rev != null && Math.abs(g.rev) < 1;

  // ---- six dimensions
  const CR = RT.currentRatio.c, DE = RT.debtEquity.c, DSCR = RT.debtServiceCoverage.c;
  const up = (r) => r.c != null && r.p != null && r.c > r.p;
  const status = {};
  status.liquidity = CR == null ? "Watch" : CR < 1 ? "Low" : CR < 1.33 ? "Watch" : "Good";
  const profUps = [RT.netProfitMargin, RT.returnOnEquity, RT.returnOnCapitalEmployed].filter((r) => r.c != null && r.p != null);
  const ups = profUps.filter(up).length;
  status.profitability = n(pat.c) < 0 ? "Low" : !profUps.length ? "Watch" : ups === profUps.length ? "Good" : ups === 0 ? "Low" : "Mixed";
  status.leverage = (DE != null && DE > 3) || (DSCR != null && DSCR < 1) ? "Low" : (DE != null && DE > 1.5) || (DSCR != null && DSCR < 1.5) ? "Watch" : "Good";
  const turn = [["Inventory", RT.inventoryTurnover], ["Receivables", RT.receivablesTurnover], ["Payables", RT.payablesTurnover]].filter(([, r]) => r.c != null && r.p != null);
  const slowed = turn.filter(([, r]) => r.c < r.p).map(([k]) => k), improved = turn.filter(([, r]) => r.c > r.p).map(([k]) => k);
  status.efficiency = !turn.length ? "Watch" : slowed.length === 0 ? "Good" : slowed.length === turn.length ? "Low" : "Watch";
  status.cashflow = ocf == null ? "Watch" : ocf < 0 ? "Low" : ocf < n(pat.c) ? "Watch" : "Good";
  status.growth = g.rev != null && g.rev < -10 ? "Low" : g.assets != null && g.rev != null && g.assets - g.rev > 25 ? "Watch" : g.rev > 0 && (g.equity ?? 0) >= 0 ? "Good" : "Watch";
  const score = Math.round(Object.values(status).reduce((s, v) => s + POINTS[v], 0) / 6);
  const risk = score >= 75 ? "low risk" : score >= 50 ? "moderate risk" : "high risk";

  // ---- verdict
  const parts = [];
  const profitUp = n(pat.c) > n(pat.p) && up(RT.returnOnEquity);
  let first = profitUp ? "Profitability is improving" : "Profitability is under pressure";
  if (g.assets != null && g.assets >= 100) first += " and the asset base has more than doubled";
  else if (g.assets != null && g.assets >= 80) first += " and the asset base has nearly doubled";
  else if (g.assets != null && g.assets >= 20) first += ` and the asset base grew ${g.assets.toFixed(0)}%`;
  const stShare = share(stb.c, total.c);
  if (stShare > 50 && (g.stb ?? 0) > 100) first += ", but growth is funded almost entirely by short-term overdraft";
  else if (stShare > 30) first += ", but short-term borrowing is a large share of funding";
  parts.push(first + ".");
  const weak = [];
  if (status.liquidity === "Low") weak.push("Liquidity");
  if (DSCR != null && DSCR < 1) weak.push("debt-servicing capacity");
  else if (status.leverage === "Low") weak.push("leverage");
  if (weak.length) parts.push(`${weak.join(" and ")} ${weak.length > 1 ? "are" : "is"} critically weak.`.replace(/^./, (c) => c.toUpperCase()));
  else if (score >= 75) parts.push("Liquidity and leverage are comfortable.");

  // ---- KPI cards
  const tone = (good) => (good ? "good" : "bad");
  const kpis = [
    { label: "REVENUE", value: cr(n(rev.c)), sub: `${signed(g.rev)}${flat ? " (flat)" : ""}`, subTone: flat ? "neutral" : tone(g.rev > 0), bar: g.rev == null || g.rev >= -1 ? "good" : "bad" },
    { label: "NET PROFIT GROWTH", value: signed(g.pat), sub: `margin ${pct2(RT.netProfitMargin.c)}`, subTone: tone((g.pat ?? 0) > 0), bar: tone((g.pat ?? 0) > 0) },
    { label: "TOTAL ASSETS", value: cr(n(total.c)), sub: `${(g.assets ?? 0) >= 0 ? "▲" : "▼"} ${signed(g.assets)}`, subTone: "neutral", bar: "good" },
    { label: "ROE", value: pct2(RT.returnOnEquity.c), sub: `${up(RT.returnOnEquity) ? "▲" : "▼"} from ${pct2(RT.returnOnEquity.p)}`, subTone: tone(up(RT.returnOnEquity)), bar: tone(up(RT.returnOnEquity)) },
    { label: "CURRENT RATIO", value: times(CR), sub: `${(RT.currentRatio.variance ?? 0) >= 0 ? "▲" : "▼"} ${signed(RT.currentRatio.variance)}`, subTone: tone(CR >= 1 && (RT.currentRatio.variance ?? 0) >= 0), bar: tone(CR >= 1 && (RT.currentRatio.variance ?? 0) >= 0) },
    { label: "DEBT / EQUITY", value: times(DE), sub: `${(RT.debtEquity.variance ?? 0) >= 0 ? "▲" : "▼"} ${signed(RT.debtEquity.variance)}`, subTone: tone(!(DE > 2 && (RT.debtEquity.variance ?? 0) > 0)), bar: tone(!(DE > 2 && (RT.debtEquity.variance ?? 0) > 0)) },
  ];

  // ---- balance sheet composition (₹ Cr)
  const toCr = (x) => r2(n(x) / 1e7);
  const assetsItems = [
    ["Fixed Assets", R(bs.c.propertyPlantEquipment), COLORS.blue], ["CWIP", R(bs.c.capitalWorkInProgress), COLORS.light],
    ["Inventory", R(bs.c.inventories), COLORS.teal], ["Receivables", R(bs.c.tradeReceivables), COLORS.green], ["Cash & Bank", R(bs.c.cashAndBank), COLORS.amber],
  ];
  const otherA = n(total.c) - assetsItems.reduce((s, [, v]) => s + n(v), 0);
  assetsItems.push(["Other Assets", otherA, COLORS.grey]);
  const liabItems = [["Short-term OD", stb.c, COLORS.red], ["LT Borrowings", ltb.c, COLORS.amber], ["Trade Payables", R(bs.c.tradePayables), COLORS.light], ["Equity", eq.c, COLORS.green]];
  liabItems.push(["Other Liab.", n(total.c) - liabItems.reduce((s, [, v]) => s + n(v), 0), COLORS.grey]);
  const donut = (items) => ({ totalLabel: `₹${(n(total.c) / 1e7).toFixed(1)} Cr`, items: items.map(([label, v, color]) => ({ label, value: Math.max(0, toCr(v)), text: `₹${toCr(v).toFixed(2)} Cr`, color })) });
  const fixedShare = Math.round(share(n(R(bs.c.propertyPlantEquipment)) + cwip, total.c));
  const cashShare = share(cash.c, total.c), eqShare = Math.round(share(eq.c, total.c));

  // ---- profitability text
  const marginUp = up(RT.netProfitMargin), epsUp = n(pl.c.eps) > n(pl.p.eps);
  const earningsLead = marginUp && epsUp ? "Earnings quality improved." : !marginUp && !epsUp ? "Earnings quality weakened." : "Earnings quality is mixed.";
  const capGrowth = growth(A.c.capEmployed, A.p.capEmployed), ebitGrowth = growth(ebit(pl.c), ebit(pl.p));
  const roceUp = up(RT.returnOnCapitalEmployed);
  const bullets = [`EBIT margin ${pct2(ebitM.c)} (from ${pct2(ebitM.p)})`];
  if (has(pl.c.eps)) bullets.push(`EPS ₹${n(pl.c.eps).toFixed(2)} (from ₹${n(pl.p.eps).toFixed(2)})`);
  if (mat.c) bullets.push(`Material cost ${matPct.c.toFixed(1)}% of revenue (from ${matPct.p.toFixed(1)}%)`);
  if (RT.returnOnCapitalEmployed.c != null)
    bullets.push(`ROCE ${roceUp ? "improved" : "slipped"} to ${pct2(RT.returnOnCapitalEmployed.c)} (from ${pct2(RT.returnOnCapitalEmployed.p)})${!roceUp && capGrowth != null && ebitGrowth != null && capGrowth > ebitGrowth ? " as capital employed grew faster than earnings" : ""}`);

  // ---- what's working
  const working = [];
  if ((g.pat ?? 0) > 100) working.push(`Net profit more than doubled (${signed(g.pat)})${flat ? " on flat revenue" : ""}.`);
  else if ((g.pat ?? 0) > 0) working.push(`Net profit grew ${signed(g.pat)}${flat ? " on flat revenue" : ""}.`);
  if (up(RT.returnOnEquity)) working.push(`ROE improved to ${pct2(RT.returnOnEquity.c)} from ${pct2(RT.returnOnEquity.p)}.`);
  if (up(RT.receivablesTurnover)) working.push(`Receivables collection faster: ${times(RT.receivablesTurnover.c)} turnover (from ${times(RT.receivablesTurnover.p)}).`);
  if (up(RT.inventoryTurnover)) working.push(`Inventory moving faster: ${times(RT.inventoryTurnover.c)} turnover (from ${times(RT.inventoryTurnover.p)}).`);
  if (total.p && capex > 0.2 * total.p) working.push("Heavy investment in fixed assets and CWIP supports future capacity.");
  if (up(RT.currentRatio)) working.push(`Liquidity improved: current ratio ${times(CR)} (from ${times(RT.currentRatio.p)}).`);
  if (RT.debtEquity.c != null && RT.debtEquity.p != null && RT.debtEquity.c < RT.debtEquity.p) working.push(`Leverage reduced: D/E ${times(DE)} (from ${times(RT.debtEquity.p)}).`);
  if (ocf > 0) working.push(`Operations generated ${cr(ocf)} of cash.`);
  if ((g.rev ?? 0) > 10) working.push(`Revenue grew ${signed(g.rev)}.`);
  if (!working.length) working.push("No dimension improved materially year on year.");

  // ---- cash flow + turnover captions
  const cfBars = [["Operating", ocf], ["Investing", icf], ["Financing", fcf]].map(([label, v]) => ({ label, value: toCr(v), text: `${toCr(v) >= 0 ? "+" : "-"}${Math.abs(toCr(v)).toFixed(2)}` }));
  let cashText;
  if (ocf < 0 && icf < 0 && fcf > 0) {
    const burn = -(ocf + icf);
    cashText = `Operations and investing burn ₹${(burn / 1e7).toFixed(1)} Cr, covered by new financing ${Math.abs(fcf - burn) / burn < 0.05 ? "of the same amount" : `of ₹${(fcf / 1e7).toFixed(1)} Cr`}.`;
  } else {
    cashText = `Operations ${ocf >= 0 ? "generated" : "used"} ₹${Math.abs(ocf / 1e7).toFixed(1)} Cr; investing ${icf >= 0 ? "added" : "used"} ₹${Math.abs(icf / 1e7).toFixed(1)} Cr; financing ${fcf >= 0 ? "added" : "repaid"} ₹${Math.abs(fcf / 1e7).toFixed(1)} Cr.`;
  }
  const lc = (s) => s.toLowerCase();
  const join = (arr) => (arr.length > 1 ? `${arr.slice(0, -1).join(", ")} and ${arr.at(-1)}` : arr[0]);
  const turnText = !slowed.length ? "All turnover ratios improved."
    : !improved.length ? `${join(slowed)} cycles all slowed.`.replace(/^./, (c) => c.toUpperCase())
    : `${join(improved)} improved, but ${join(slowed.map(lc))} ${slowed.length > 1 ? `cycles ${slowed.length === 2 ? "both " : ""}slowed` : "cycle slowed"}.`;

  // ---- scorecard
  const takeaway = {
    liquidity: A.c.ca < A.c.cl ? "Negative working capital" : status.liquidity === "Good" ? "Comfortable liquidity" : "Thin liquidity buffer",
    profitability: status.profitability === "Good" ? "Margins and returns improving" : status.profitability === "Low" ? "Profitability under pressure"
      : (g.pat ?? 0) > 0 && !roceUp ? "Earnings up, capital returns down" : "Returns up, margins down",
    leverage: DSCR != null && DSCR < 1 ? "Earnings don’t cover debt service" : status.leverage === "Low" ? "Highly leveraged balance sheet" : status.leverage === "Watch" ? "Leverage elevated" : "Comfortable leverage",
    efficiency: status.efficiency === "Good" ? "Working-capital cycles improving" : slowed.includes("Inventory") ? "Inventory cycle slowing" : slowed.includes("Receivables") ? "Collections slowing" : "Supplier cycle lengthening",
    cashflow: status.cashflow === "Good" ? "Operations generate cash" : status.cashflow === "Watch" ? "Cash conversion below profit" : fcf > 0 && (g.stb ?? 0) > 0 ? "Overdraft-funded cash burn" : "Operating cash burn",
    growth: status.growth === "Low" ? "Revenue contracting" : status.growth === "Good" ? "Balanced growth" : "Assets outpace revenue",
  };
  const opCf = `Op. CF ${ocf < 0 ? MINUS : ""}₹${Math.abs(ocf / 1e7).toFixed(2)} Cr`;
  const scorecard = [
    { dimension: "Liquidity", status: status.liquidity, metrics: `Current ratio ${times(CR)} · cash ${money(n(cash.c))} (${signed(g.cash)})`, takeaway: takeaway.liquidity },
    { dimension: "Profitability", status: status.profitability, metrics: `Net margin ${pct2(RT.netProfitMargin.c)} · ROE ${pct2(RT.returnOnEquity.c)} · ROCE ${pct2(RT.returnOnCapitalEmployed.c)}`, takeaway: takeaway.profitability },
    { dimension: "Leverage & Solvency", status: status.leverage, metrics: `D/E ${times(DE)}${DSCR != null ? ` · DSCR ${times(DSCR)} (from ${times(RT.debtServiceCoverage.p)})` : ""}`, takeaway: takeaway.leverage },
    { dimension: "Operational Efficiency", status: status.efficiency, metrics: `Inventory T/O ${times(RT.inventoryTurnover.c)} · Receivables ${times(RT.receivablesTurnover.c)} · Payables ${times(RT.payablesTurnover.c)}`, takeaway: takeaway.efficiency },
    { dimension: "Cash Flow Health", status: status.cashflow, metrics: `${opCf} · finance cost ${money(n(fin.c))} (${signed(g.fin)})`, takeaway: takeaway.cashflow },
    { dimension: "Growth & Capital", status: status.growth, metrics: `Assets ${signed(g.assets)} · revenue ${signed(g.rev)} · equity ${signed(g.equity)}`, takeaway: takeaway.growth },
  ];

  // ---- key risks
  const risks = [];
  if ((g.stb ?? 0) > 50) risks.push({ lead: "Refinancing risk:", text: `short-term borrowings surged ${g.stb.toFixed(0)}% while long-term debt ${(g.ltb ?? 0) < 0 ? `fell ${Math.abs(g.ltb).toFixed(1)}%` : `rose ${(g.ltb ?? 0).toFixed(1)}%`} to ${cr(n(ltb.c))}.` });
  if (DSCR != null && DSCR < 1) risks.push({ lead: "Debt service:", text: `DSCR of ${times(DSCR)} means operating earnings cover only a fraction of debt payments.` });
  if ((g.cash ?? 0) < -50) risks.push({ lead: "Cash position:", text: `cash fell ${Math.abs(g.cash).toFixed(1)}% to ${money(n(cash.c))}${stb.c ? ` against ₹${(stb.c / 1e7).toFixed(1)} Cr of overdraft` : ""}.` });
  if (finPct.c > finPct.p || empPct.c > empPct.p) risks.push({ lead: "Cost pressure:", text: `finance cost is ${finPct.c.toFixed(2)}% of revenue (from ${finPct.p.toFixed(2)}%); employee cost ${empPct.c.toFixed(1)}% (from ${empPct.p.toFixed(1)}%).` });
  if (risks.length < 4 && CR != null && CR < 1) risks.push({ lead: "Liquidity:", text: `current ratio ${times(CR)} — current liabilities exceed current assets.` });
  if (risks.length < 4 && ocf < 0) risks.push({ lead: "Cash burn:", text: `operations used ${cr(Math.abs(ocf))} in the year.` });
  if (risks.length < 4 && (g.rev ?? 0) < -5) risks.push({ lead: "Revenue:", text: `revenue fell ${Math.abs(g.rev).toFixed(1)}%.` });
  if (!risks.length) risks.push({ lead: "No major risks:", text: "liquidity, leverage and cash flow are within comfortable ranges." });

  // ---- recommended actions
  const actions = [];
  if (stb.c && stb.c > n(ltb.c) && (g.stb ?? 0) > 0) actions.push({ lead: "Refinance overdraft.", text: "Move short-term overdraft into longer-term debt to ease repayment pressure." });
  if (ocf < 0 && capex > 0) actions.push({ lead: "Phase new capex.", text: "Pause further spend until operating cash flow turns positive." });
  if (slowed.includes("Inventory") || slowed.includes("Payables")) actions.push({ lead: "Tighten working capital.", text: "Speed up inventory movement; review supplier payment terms." });
  if (DE != null && DE > 2) actions.push({ lead: "Strengthen equity.", text: `Raise equity or retain earnings to bring leverage below ${times(DE)}.` });
  if (cwip > 0) actions.push({ lead: "Commission CWIP.", text: `Convert ${cr(cwip)} of work-in-progress into revenue-earning assets.` });
  for (const a of [{ lead: "Improve collections.", text: "Tighten credit terms and follow up overdue receivables." }, { lead: "Protect margins.", text: "Review input costs and pricing to sustain profitability." }, { lead: "Build a cash buffer.", text: "Keep at least one quarter of fixed costs in liquid funds." }])
    if (actions.length < 5) actions.push(a);

  const unitWord = { thousands: "₹ '000", lakhs: "₹ lakh", crores: "₹ crore", millions: "₹ million", rupees: "₹" }[bsDoc.unit] || "₹ '000";
  const dataNote = `figures are computed from the uploaded statements (source unit: ${unitWord}); ratios are taken from the analytical-ratios note where reported. ${notes.length ? `${notes.join(" ")} ` : ""}Verify against the audited statements before external use.`;

  const model = {
    title: `${fy} Financial Health Summary`,
    subtitle: `CFO Intelligence · Financial Health Platform · ${fy} vs ${pfy}`,
    footer: `CFO Intelligence · ${fy} Financial Health Summary · AI-generated from uploaded statements`,
    subject: company,
    score, verdictLead: `Overall verdict: ${risk}.`, verdictText: parts.join(" "),
    kpis,
    assets: donut(assetsItems), liabilities: donut(liabItems),
    assetCaption: { lead: "Asset composition", text: `~${fixedShare}% sits in fixed assets and capital work-in-progress; cash is ${cashShare < 2 ? "only " : ""}₹${(n(cash.c) / 1e7).toFixed(2)} Cr.` },
    liabCaption: { lead: "Liabilities breakdown", text: stShare >= 30 ? `~${Math.round(stShare)}% is short-term overdraft; equity funds ${eqShare < 20 ? "just " : ""}${eqShare}% of the balance sheet.` : `equity funds ${eqShare}% of the balance sheet; borrowings make up ${Math.round(share(n(stb.c) + n(ltb.c), total.c))}%.` },
    returns: [
      { label: "ROE", value: n(RT.returnOnEquity.c), text: pct2(RT.returnOnEquity.c), color: COLORS.green },
      { label: "ROCE", value: n(RT.returnOnCapitalEmployed.c), text: pct2(RT.returnOnCapitalEmployed.c), color: COLORS.amber },
      { label: "Net margin", value: n(RT.netProfitMargin.c), text: pct2(RT.netProfitMargin.c), color: COLORS.blue },
    ],
    earnings: { lead: earningsLead, bullets },
    working: working.slice(0, 4),
    cashflow: cfBars,
    cashCaption: { lead: "Cash flow (₹ Cr).", text: cashText },
    turnover: { prevLabel: pfy, curLabel: fy, groups: [["Inventory T/O", RT.inventoryTurnover], ["Receivables T/O", RT.receivablesTurnover], ["Payables T/O", RT.payablesTurnover]].map(([label, r]) => ({ label, prev: n(r.p), cur: n(r.c) })) },
    turnoverCaption: { lead: "Turnover ratios.", text: turnText },
    scorecard, risks: risks.slice(0, 4), actions: actions.slice(0, 5),
    dataNote,
  };

  return {
    company, fy, pfy, unit: bsDoc.unit, periodEnd: bsDoc.periodEnd, score, risk, status,
    model,
    ratios: RT,
    figures: { revenue: rev, pat, totalAssets: total, equity: eq, cash, stb, ltb, financeCost: fin, ocf, icf, fcf, capex, cwip, growth: g, ebitMargin: ebitM, materialPct: matPct, financePct: finPct, employeePct: empPct },
    statements: { balanceSheet: bs, profitLoss: pl, cashFlow: cf, unit: bsDoc.unit },
    notes,
  };
}
