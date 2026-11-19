// Structured extraction of the four statements with DeepSeek, then validation
// against accounting identities. The model only *reads* figures; every metric
// is computed in code (metrics.js) so the report is deterministic.
import { complete } from "./deepseek.js";

export const DOCS = {
  balanceSheet: { label: "Balance Sheet", keywords: [/balance\s*sheet/i, /equity\s+and\s+liabilities|liabilities/i, /assets/i] },
  profitLoss: { label: "Profit & Loss", keywords: [/profit|loss|income/i, /revenue|sales/i, /expenses/i] },
  cashFlow: { label: "Cash Flow", keywords: [/cash\s*flow/i, /operating\s+activities/i] },
  ratios: { label: "Ratio Analysis", keywords: [/ratio/i, /current\s+ratio|debt[\s-]*equity|return\s+on/i] },
};

/** Cheap guard: does the text look like the document type of its slot? */
export function checkDocType(slot, text) {
  return DOCS[slot].keywords.every((re) => re.test(text));
}

const SCHEMAS = {
  balanceSheet: `{"company":string,"periodEnd":string,"currentLabel":string,"previousLabel":string,"unit":"rupees"|"thousands"|"lakhs"|"crores"|"millions",
"current":{FIELDS},"previous":{FIELDS}}
FIELDS = shareCapital, reservesAndSurplus, totalEquity, longTermBorrowings, deferredTaxLiabilities, longTermProvisions, otherNonCurrentLiabilities,
shortTermBorrowings, tradePayables (sum of all trade-payable sub-lines), otherCurrentLiabilities, shortTermProvisions, totalCurrentLiabilities,
totalEquityAndLiabilities, propertyPlantEquipment (net block incl. intangibles, excluding CWIP), capitalWorkInProgress, nonCurrentInvestments,
deferredTaxAssets, longTermLoansAndAdvances, otherNonCurrentAssets, totalNonCurrentAssets, inventories, tradeReceivables, cashAndBank,
shortTermLoansAndAdvances, otherCurrentAssets, currentInvestments, totalCurrentAssets, totalAssets`,
  profitLoss: `{"company":string,"periodEnd":string,"currentLabel":string,"previousLabel":string,"unit":"rupees"|"thousands"|"lakhs"|"crores"|"millions",
"current":{FIELDS},"previous":{FIELDS}}
FIELDS = revenueFromOperations, otherIncome, totalIncome, costOfMaterialsConsumed, purchasesOfStockInTrade, changesInInventories,
employeeBenefits, financeCosts, depreciation, otherExpenses, totalExpenses, profitBeforeTax, currentTax, deferredTax, totalTax,
profitAfterTax, eps`,
  cashFlow: `{"company":string,"periodEnd":string,"currentLabel":string,"previousLabel":string,"unit":"rupees"|"thousands"|"lakhs"|"crores"|"millions",
"current":{FIELDS},"previous":{FIELDS}}
FIELDS = netCashFromOperating (after tax), netCashFromInvesting, netCashFromFinancing, netChangeInCash, openingCash, closingCash,
purchaseOfFixedAssets (as shown, outflow negative), interestPaid (as shown)`,
  ratios: `{"company":string,"periodEnd":string,"ratios":{KEY:{"current":number|null,"previous":number|null,"variancePct":number|null,"reason":string|null}}}
KEY = currentRatio, debtEquity, debtServiceCoverage, returnOnEquity, inventoryTurnover, receivablesTurnover, payablesTurnover,
netCapitalTurnover, netProfitMargin, returnOnCapitalEmployed, returnOnInvestment
Percent ratios (ROE, net profit margin, ROCE, ROI, variance) as plain numbers: "12.51%" -> 12.51. Use null for "NA" or missing.`,
};

const RULES = `Rules:
- Read figures exactly as printed. Do not calculate, infer or round.
- Numbers in brackets are negative: "(510.28)" -> -510.28. A dash "-" means 0. Missing line -> null.
- Strip thousands separators: "207,001.36" -> 207001.36.
- "current" is the latest period column, "previous" the comparative column.
- unit: the unit stated in the header, e.g. "(In '000)" -> "thousands".
- periodEnd like "31st March 2024". Labels like "FY2024" and "FY2023" for March year-ends.
- Rows are reconstructed from the PDF; columns are separated by " | ". A total row may appear without a label.
Return only the JSON object.`;

async function extractOne(slot, text) {
  return complete(
    [
      { role: "system", content: `You extract figures from an Indian company's financial statement into JSON.\nSchema:\n${SCHEMAS[slot]}\n${RULES}` },
      { role: "user", content: `Document type: ${DOCS[slot].label}\n\n${text.slice(0, 24000)}` },
    ],
    { json: true, maxTokens: 2500 }
  );
}

export async function extractAll(texts) {
  const slots = Object.keys(DOCS);
  const results = await Promise.all(slots.map((s) => extractOne(s, texts[s])));
  const data = Object.fromEntries(slots.map((s, i) => [s, results[i]]));
  return { data, notes: validate(data) };
}

// ------------------------------------------------------------------ validation
const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const close = (a, b, tol = 0.01) => Math.abs(a - b) <= Math.max(1, Math.abs(b) * tol);
const fmt = (v) => v.toLocaleString("en-IN", { maximumFractionDigits: 2 });

/** Checks identities and repairs obvious source typos. Returns human-readable notes. */
export function validate(d) {
  const notes = [];
  for (const period of ["current", "previous"]) {
    const bs = d.balanceSheet?.[period] || {};
    const pl = d.profitLoss?.[period] || {};
    const cf = d.cashFlow?.[period] || {};
    const label = period === "current" ? d.balanceSheet?.currentLabel || "current year" : d.balanceSheet?.previousLabel || "previous year";

    if (bs.totalAssets && bs.totalEquityAndLiabilities && !close(bs.totalAssets, bs.totalEquityAndLiabilities, 0.001))
      notes.push(`${label}: total assets (${fmt(bs.totalAssets)}) and total equity & liabilities (${fmt(bs.totalEquityAndLiabilities)}) differ.`);

    // total equity
    if (!bs.totalEquity && (bs.shareCapital || bs.reservesAndSurplus)) bs.totalEquity = n(bs.shareCapital) + n(bs.reservesAndSurplus);

    // PAT = PBT − tax; fixes typos such as "1,730,192" printed for 1,730.19
    if (pl.profitBeforeTax != null) {
      const tax = pl.totalTax ?? n(pl.currentTax) + n(pl.deferredTax);
      const derived = n(pl.profitBeforeTax) - n(tax);
      if (pl.profitAfterTax == null || !close(pl.profitAfterTax, derived, 0.005)) {
        if (pl.profitAfterTax != null)
          notes.push(`${label} profit after tax is printed as ${fmt(pl.profitAfterTax)}; using ${fmt(derived)} (profit before tax − tax).`);
        pl.profitAfterTax = +derived.toFixed(2);
      }
    }
    if (pl.revenueFromOperations && pl.totalIncome && !close(n(pl.revenueFromOperations) + n(pl.otherIncome), pl.totalIncome))
      notes.push(`${label}: revenue + other income does not equal total income.`);

    if (cf.netCashFromOperating != null && cf.netChangeInCash != null) {
      const sum = n(cf.netCashFromOperating) + n(cf.netCashFromInvesting) + n(cf.netCashFromFinancing);
      if (!close(sum, cf.netChangeInCash, 0.02))
        notes.push(`${label}: operating + investing + financing (${fmt(sum)}) does not equal net change in cash (${fmt(cf.netChangeInCash)}).`);
    }
  }
  // A line printed for one year and shown as "-" (nil) for the other is 0, not missing.
  for (const s of ["balanceSheet", "profitLoss", "cashFlow"]) {
    const c = d[s]?.current, p = d[s]?.previous;
    if (!c || !p) continue;
    for (const k of new Set([...Object.keys(c), ...Object.keys(p)])) {
      if (k === "eps") continue;
      if (typeof c[k] === "number" && p[k] == null) p[k] = 0;
      if (typeof p[k] === "number" && c[k] == null) c[k] = 0;
    }
  }
  return notes;
}
