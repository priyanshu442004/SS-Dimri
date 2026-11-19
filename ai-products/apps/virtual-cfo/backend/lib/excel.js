// Excel workbook of an analysis: Summary, Scorecard, Ratios, the three
// extracted statements, Risks & Actions.
const HEAD = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3FA8" } };
const LABELS = {
  shareCapital: "Share capital", reservesAndSurplus: "Reserves & surplus", totalEquity: "Shareholders' funds", longTermBorrowings: "Long-term borrowings",
  deferredTaxLiabilities: "Deferred tax liabilities (net)", longTermProvisions: "Long-term provisions", otherNonCurrentLiabilities: "Other non-current liabilities",
  shortTermBorrowings: "Short-term borrowings", tradePayables: "Trade payables", otherCurrentLiabilities: "Other current liabilities", shortTermProvisions: "Short-term provisions",
  totalCurrentLiabilities: "Total current liabilities", totalEquityAndLiabilities: "Total equity & liabilities", propertyPlantEquipment: "Property, plant & equipment",
  capitalWorkInProgress: "Capital work in progress", nonCurrentInvestments: "Non-current investments", deferredTaxAssets: "Deferred tax assets (net)",
  longTermLoansAndAdvances: "Long-term loans & advances", otherNonCurrentAssets: "Other non-current assets", totalNonCurrentAssets: "Total non-current assets",
  inventories: "Inventories", tradeReceivables: "Trade receivables", cashAndBank: "Cash & bank balances", shortTermLoansAndAdvances: "Short-term loans & advances",
  otherCurrentAssets: "Other current assets", currentInvestments: "Current investments", totalCurrentAssets: "Total current assets", totalAssets: "Total assets",
  revenueFromOperations: "Revenue from operations", otherIncome: "Other income", totalIncome: "Total income", costOfMaterialsConsumed: "Cost of materials consumed",
  purchasesOfStockInTrade: "Purchases of stock-in-trade", changesInInventories: "Changes in inventories", employeeBenefits: "Employee benefits expense",
  financeCosts: "Finance costs", depreciation: "Depreciation & amortisation", otherExpenses: "Other expenses", totalExpenses: "Total expenses",
  profitBeforeTax: "Profit before tax", currentTax: "Current tax", deferredTax: "Deferred tax", totalTax: "Total tax", profitAfterTax: "Profit for the year", eps: "EPS (₹)",
  netCashFromOperating: "Net cash from operating activities", netCashFromInvesting: "Net cash from investing activities", netCashFromFinancing: "Net cash from financing activities",
  netChangeInCash: "Net change in cash", openingCash: "Opening cash & equivalents", closingCash: "Closing cash & equivalents", purchaseOfFixedAssets: "Purchase of fixed assets", interestPaid: "Interest paid",
};
const RATIO_LABELS = {
  currentRatio: "Current ratio (x)", debtEquity: "Debt / equity (x)", debtServiceCoverage: "Debt service coverage (x)", returnOnEquity: "Return on equity (%)",
  inventoryTurnover: "Inventory turnover (x)", receivablesTurnover: "Receivables turnover (x)", payablesTurnover: "Payables turnover (x)",
  netProfitMargin: "Net profit margin (%)", returnOnCapitalEmployed: "ROCE (%)",
};

function head(ws, cols) {
  ws.columns = cols.map(([h, w]) => ({ header: h, width: w }));
  ws.getRow(1).eachCell((c) => { c.fill = HEAD; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

export async function buildWorkbook(a) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Agarwal & Saxena Financial Statement Analysis";
  const m = a.model;

  const s = wb.addWorksheet("Summary");
  s.columns = [{ width: 34 }, { width: 22 }, { width: 60 }];
  s.addRow([m.title]).font = { bold: true, size: 14 };
  s.addRow([`${a.company} · ${m.subtitle}`]).font = { italic: true };
  s.addRow([]);
  s.addRow(["Health score", `${m.score} / 100`, m.verdictLead]).font = { bold: true };
  s.addRow(["Verdict", "", m.verdictText]); s.getRow(5).alignment = { wrapText: true, vertical: "top" }; s.getRow(5).height = 48;
  s.addRow([]);
  const k = s.addRow(["KPI", "Value", "Change"]); k.eachCell((c) => { c.fill = HEAD; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
  m.kpis.forEach((x) => s.addRow([x.label, x.value, x.sub]));
  s.addRow([]);
  s.addRow(["What's working"]).font = { bold: true };
  m.working.forEach((w) => s.addRow(["", "", w]));

  const sc = wb.addWorksheet("Scorecard");
  head(sc, [["Dimension", 26], ["Status", 10], ["Key metrics", 60], ["Takeaway", 40]]);
  m.scorecard.forEach((r) => sc.addRow([r.dimension, r.status, r.metrics, r.takeaway]));

  const r = wb.addWorksheet("Ratios");
  head(r, [["Ratio", 30], [a.fy, 12], [a.pfy, 12], ["Variance %", 12], ["Source", 14]]);
  Object.entries(a.ratios).forEach(([key, v]) => r.addRow([RATIO_LABELS[key] || key, v.c, v.p, v.variance != null ? Math.round(v.variance * 100) / 100 : null, v.source]));

  const unit = { thousands: "₹ '000", lakhs: "₹ lakh", crores: "₹ crore", millions: "₹ million", rupees: "₹" }[a.statements.unit] || "₹ '000";
  for (const [name, st] of [["Balance Sheet", a.statements.balanceSheet], ["Profit & Loss", a.statements.profitLoss], ["Cash Flow", a.statements.cashFlow]]) {
    const ws = wb.addWorksheet(name);
    head(ws, [[`Line item (${unit})`, 40], [a.fy, 16], [a.pfy, 16]]);
    Object.keys({ ...st.c, ...st.p }).filter((key) => st.c[key] != null || st.p[key] != null).forEach((key) => ws.addRow([LABELS[key] || key, st.c[key] ?? 0, st.p[key] ?? 0]));
    ws.getColumn(2).numFmt = "#,##,##0.00"; ws.getColumn(3).numFmt = "#,##,##0.00";
  }

  const ra = wb.addWorksheet("Risks & Actions");
  head(ra, [["Type", 14], ["Item", 26], ["Detail", 90]]);
  m.risks.forEach((x) => ra.addRow(["Risk", x.lead.replace(/:$/, ""), x.text]));
  m.actions.forEach((x, i) => ra.addRow([`Action ${i + 1}`, x.lead.replace(/\.$/, ""), x.text]));
  if (a.notes.length) a.notes.forEach((x) => ra.addRow(["Data note", "", x]));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
