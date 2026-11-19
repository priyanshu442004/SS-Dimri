// Audited Infrastructure statement figures (₹ millions). Pure data, no imports:
// shared by the on-screen statements, their Excel downloads, the report email
// and the backend "Download All Statements" workbook, so all of them match.

export const SCREENSHOT_VALUES_BS = {
  "4": { closing: 240.20, opening: 242.79 },
  "5": { closing: 52.00, opening: 52.00 },
  "4_int": { closing: 1.03, opening: 1.33 },
  "6(a)": { closing: 3294.12, opening: 3400.82 },
  "6(b)": { closing: 28.31, opening: 27.09 },
  "6(c)": { closing: 51.12, opening: 3.34 },
  "7": { closing: 48.03, opening: 36.43 },
  "8": { closing: 2400.00, opening: 2934.91 },
  "9": { closing: 5615.99, opening: 4947.86 },
  "10(a)": { closing: 146.77, opening: 138.58 },
  "10(b)": { closing: 23.95, opening: 161.37 },
  "10(c)": { closing: 643.12, opening: 706.93 },
  "10(d)": { closing: 765.24, opening: 438.16 },
  "11": { closing: 510.31, opening: 391.87 },
  "12": { closing: 324.76, opening: 108.25 },
  "12(a)": { closing: 6253.64, opening: 6396.91 },
  "13(a)": { closing: 24.29, opening: 458.77 },
  "14": { closing: 39.81, opening: 35.77 },
  "15(a)": { closing: 4784.31, opening: 4661.53 },
  "15b_micro": { closing: 12.07, opening: 26.05 },
  "15b_other": { closing: 123.78, opening: 103.05 },
  "15(c)": { closing: 126.87, opening: 124.13 },
  "16": { closing: 2090.19, opening: 1240.59 },
  "17": { closing: 40.48, opening: 328.43 },
};

const r2 = (n) => Math.round(n * 100) / 100;

/** Rows of the Infrastructure balance sheet: [label, note, closing, opening]. */
export function infraBSRows(balanceSheetData) {
  const notes = balanceSheetData?.data?.notes || {};
  const v = (key, type) => SCREENSHOT_VALUES_BS[key]?.[type] ?? Number(notes[key]?.[type] || 0);
  const line = (label, note, key = note) => [label, note, r2(v(key, "closing")), r2(v(key, "opening"))];
  const total = (label, keys) => [label, "", r2(keys.reduce((s, k) => s + v(k, "closing"), 0)), r2(keys.reduce((s, k) => s + v(k, "opening"), 0))];
  return [
    ["ASSETS"],
    ["NON-CURRENT ASSETS"],
    line("Property, plant & equipment", "4"),
    line("Capital work in progress", "5"),
    line("Other intangible assets", "4", "4_int"),
    ["Financial assets"],
    line("(i) Investments", "6(a)"),
    line("(ii) Loans", "6(b)"),
    line("(iii) Other financial assets", "6(c)"),
    line("Deferred tax assets (net)", "7"),
    line("Other non-current assets", "8"),
    total("TOTAL NON-CURRENT ASSETS", ["4", "5", "4_int", "6(a)", "6(b)", "6(c)", "7", "8"]),
    ["CURRENT ASSETS"],
    line("Inventories", "9"),
    ["Financial assets"],
    line("(i) Trade receivables", "10(a)"),
    line("(ii) Cash and cash equivalents", "10(b)"),
    line("(iii) Bank balances other than above", "10(c)"),
    line("(iv) Other financial assets", "10(d)"),
    line("Other current assets", "11"),
    total("TOTAL CURRENT ASSETS", ["9", "10(a)", "10(b)", "10(c)", "10(d)", "11"]),
    ["TOTAL ASSETS", "", 13820.2, 13483.48],
    ["EQUITY AND LIABILITIES"],
    ["EQUITY"],
    line("Equity share capital", "12"),
    line("Other equity", "12(a)"),
    total("TOTAL EQUITY", ["12", "12(a)"]),
    ["NON-CURRENT LIABILITIES"],
    ["Financial liabilities"],
    line("Borrowings", "13(a)"),
    line("Provisions", "14"),
    total("TOTAL NON-CURRENT LIABILITIES", ["13(a)", "14"]),
    ["CURRENT LIABILITIES"],
    ["Financial liabilities"],
    line("(i) Borrowings", "15(a)"),
    ["(ii) Trade payables", "15(b)"],
    line("- Dues to micro and small enterprises", "15(b)", "15b_micro"),
    line("- Due to creditors other than micro and small enterprises", "15(b)", "15b_other"),
    line("(iii) Other financial liabilities", "15(c)"),
    line("Other current liabilities", "16"),
    line("Provisions", "17"),
    total("TOTAL CURRENT LIABILITIES", ["15(a)", "15b_micro", "15b_other", "15(c)", "16", "17"]),
    ["TOTAL EQUITY AND LIABILITIES", "", 13820.2, 13483.48],
  ];
}

export const INFRA_PL_EXPORT_DATA = [
  { Particulars: 'INCOMES', Notes: '', 'September 30, 2025': '', 'March 31, 2025': '' },
  { Particulars: 'I. Revenue from operations', Notes: '18', 'September 30, 2025': '348.72', 'March 31, 2025': '1,210.49' },
  { Particulars: 'II. Other incomes', Notes: '19', 'September 30, 2025': '651.00', 'March 31, 2025': '1,600.94' },
  { Particulars: 'III. TOTAL INCOME', Notes: '', 'September 30, 2025': '999.72', 'March 31, 2025': '2,811.43' },
  { Particulars: '', Notes: '', 'September 30, 2025': '', 'March 31, 2025': '' },
  { Particulars: 'EXPENSES', Notes: '', 'September 30, 2025': '', 'March 31, 2025': '' },
  { Particulars: 'Cost of Material Consumption', Notes: '20', 'September 30, 2025': '952.62', 'March 31, 2025': '2,261.08' },
  { Particulars: 'Changes in inventories of raw material, land stock, work in progress and finished goods', Notes: '21', 'September 30, 2025': '(668.14)', 'March 31, 2025': '(1,570.42)' },
  { Particulars: 'Employee benefits', Notes: '22', 'September 30, 2025': '218.01', 'March 31, 2025': '297.52' },
  { Particulars: 'Finance costs', Notes: '23', 'September 30, 2025': '108.94', 'March 31, 2025': '152.13' },
  { Particulars: 'Depreciation and amortization', Notes: '24', 'September 30, 2025': '4.30', 'March 31, 2025': '8.37' },
  { Particulars: 'Other expenses', Notes: '25', 'September 30, 2025': '277.81', 'March 31, 2025': '495.97' },
  { Particulars: 'TOTAL EXPENSES', Notes: '', 'September 30, 2025': '893.53', 'March 31, 2025': '1,644.65' },
  { Particulars: '', Notes: '', 'September 30, 2025': '', 'March 31, 2025': '' },
  { Particulars: 'V. Profit before exceptional items and tax', Notes: '', 'September 30, 2025': '106.19', 'March 31, 2025': '1,166.78' },
  { Particulars: 'VI. Exceptional items', Notes: '', 'September 30, 2025': '0.00', 'March 31, 2025': '0.00' },
  { Particulars: 'VII. Profit before tax', Notes: '', 'September 30, 2025': '106.19', 'March 31, 2025': '1,166.78' },
  { Particulars: '', Notes: '', 'September 30, 2025': '', 'March 31, 2025': '' },
  { Particulars: 'VIII. Tax expense', Notes: '26', 'September 30, 2025': '', 'March 31, 2025': '' },
  { Particulars: 'Current tax', Notes: '', 'September 30, 2025': '37.60', 'March 31, 2025': '327.16' },
  { Particulars: 'Adjustment of tax relating to earlier periods', Notes: '', 'September 30, 2025': '0.00', 'March 31, 2025': '(0.68)' },
  { Particulars: 'Deferred tax charge/ (credit)', Notes: '', 'September 30, 2025': '(12.10)', 'March 31, 2025': '59.50' },
  { Particulars: 'Total Tax', Notes: '', 'September 30, 2025': '25.49', 'March 31, 2025': '385.98' },
  { Particulars: '', Notes: '', 'September 30, 2025': '', 'March 31, 2025': '' },
  { Particulars: 'IX. Profit for the year', Notes: '', 'September 30, 2025': '80.70', 'March 31, 2025': '780.80' },
  { Particulars: '', Notes: '', 'September 30, 2025': '', 'March 31, 2025': '' },
  { Particulars: 'X. Other comprehensive income', Notes: '', 'September 30, 2025': '', 'March 31, 2025': '' },
  { Particulars: 'Gain/ (loss) on fair valuation of investment', Notes: '', 'September 30, 2025': '6.11', 'March 31, 2025': '(4.93)' },
  { Particulars: 'Income tax effect on (i)', Notes: '', 'September 30, 2025': '(1.07)', 'March 31, 2025': '0.86' },
  { Particulars: 'Re-measurement gain/ (loss) on defined benefit plans', Notes: '', 'September 30, 2025': '(2.25)', 'March 31, 2025': '(1.77)' },
  { Particulars: 'Income tax effect on (ii)', Notes: '', 'September 30, 2025': '0.57', 'March 31, 2025': '0.31' },
  { Particulars: 'XI. Total comprehensive income for the year', Notes: '', 'September 30, 2025': '84.05', 'March 31, 2025': '775.27' },
  { Particulars: '', Notes: '', 'September 30, 2025': '', 'March 31, 2025': '' },
  { Particulars: 'XII. Earning per equity share', Notes: '27', 'September 30, 2025': '', 'March 31, 2025': '' },
  { Particulars: 'Equity shares of par value ₹ 5/- each', Notes: '', 'September 30, 2025': '1.24', 'March 31, 2025': '12.02' },
  { Particulars: 'Basic/ diluted (in ₹)', Notes: '', 'September 30, 2025': '1.24', 'March 31, 2025': '12.02' },
];

// "(668.14)" -> -668.14, "1,210.49" -> 1210.49; other text unchanged
export const toNum = (v) => {
  const s = String(v).trim();
  if (!/^\(?-?[\d,]+(\.\d+)?\)?$/.test(s)) return v;
  const n = Number(s.replace(/[(),]/g, ""));
  return s.startsWith("(") ? -n : n;
};


export const INFRA_PL_COLS = ["Particulars", "Notes", "September 30, 2025", "March 31, 2025"];
/** P&L rows: [label, note, current, previous] with numbers parsed. */
export const infraPLRows = () => INFRA_PL_EXPORT_DATA.map((r) => [r.Particulars, r.Notes, toNum(r[INFRA_PL_COLS[2]]), toNum(r[INFRA_PL_COLS[3]])]);
