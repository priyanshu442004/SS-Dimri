import path from "path";

const divideByMillion = (value) => {
  return +(value / 1000000).toFixed(4);
};

// Static fallbacks from new_reports.xlsx
// Static fallbacks from new_reports.xlsx (Current period 30.09.2025)
const STATIC_FALLBACKS = {
  "5":   [{ name: "Property, plant & equipment (Net Block) *", opening: "0.20*", closing: "0.18*" }],
  "6a":  [{ name: "Long-term Investments *", opening: "1.70*", closing: "1.70*" }],
  "6b":  [{ name: "Other financial assets *", opening: "4.31*", closing: "1.05*" }],
  "7":   [{ name: "Deferred tax assets (net) *", opening: "113.01*", closing: "192.51*" }],
  "8":   [{ name: "Other non-current assets *", opening: "151.89*", closing: "421.56*" }],
  "9":   [{ name: "Inventories *", opening: "574.20*", closing: "3032.41*" }],
  "10a": [{ name: "Trade receivables *", opening: "29.13*", closing: "10.71*" }],
  "10b": [{ name: "Cash and cash equivalents *", opening: "17.48*", closing: "180.72*" }],
  "10c": [{ name: "Bank balances other than (ii) above *", opening: "376.72*", closing: "398.92*" }],
  "10d": [{ name: "Other financial assets *", opening: "47.31*", closing: "49.44*" }],
  "11":  [{ name: "Current tax assets (net) *", opening: "19.83*", closing: "23.20*" }],
  "12":  [{ name: "Other current assets *", opening: "80.09*", closing: "40.66*" }],
  "13":  [{ name: "Equity Share Capital *", opening: "61.00*", closing: "61.00*" }],
  "14":  [{ name: "Other Equity *", opening: "874.80*", closing: "838.80*" }],
  "15a": [{ name: "Borrowings (Non-current) *", opening: "0.00*", closing: "0.00*" }],
  "15b": [{ name: "Lease Liability (Non-current) *", opening: "0.00*", closing: "669.09*" }],
  "16":  [{ name: "Provisions (Non-current) *", opening: "0.61*", closing: "0.70*" }],
  "17a": [{ name: "Borrowings (Current) *", opening: "140.08*", closing: "1388.05*" }],
  "17b": [{ name: "Lease Liability (Current) *", opening: "0.00*", closing: "869.16*" }],
  "17c": [{ name: "Trade payables *", opening: "0.00*", closing: "0.00*" }],
  "17d": [{ name: "Other financial liabilities *", opening: "25.73*", closing: "19.04*" }],
  "18":  [{ name: "Other current liabilities *", opening: "306.79*", closing: "224.00*" }],
  "19":  [{ name: "Provisions (Current) *", opening: "5.14*", closing: "30.25*" }],
  "20":  [{ name: "Revenue from operations *", opening: "3384.81*", closing: "411.70*" }],
  "21":  [{ name: "Other incomes *", opening: "29.97*", closing: "29.92*" }],
  "22":  [{ name: "Cost of material consumed *", opening: "472.80*", closing: "2910.83*" }],
  "23":  [{ name: "Changes in Inventories *", opening: "3222.79*", closing: "-2458.21*" }],
  "24":  [{ name: "Employee benefits expense *", opening: "9.54*", closing: "8.71*" }],
  "25":  [{ name: "Finance costs *", opening: "11.67*", closing: "5.68*" }],
  "26":  [{ name: "Other expenses *", opening: "111.48*", closing: "80.83*" }],
  "27":  [{ name: "Basic/diluted EPS (in ₹) *", opening: "-51.15*", closing: "-5.91*" }],
  "19PL":[{ name: "Tax Expense (Current/Deferred) *", opening: "-102.10*", closing: "-70.50*" }]
};

export const processNotesSohna = (MergedData, notePoint, res) => {
  const sumByGroup = (groupHeads, nature = null) => {
    let opening = 0;
    let closing = 0;
    const heads = Array.isArray(groupHeads) 
      ? groupHeads.map(h => h.trim().toLowerCase()) 
      : [groupHeads.trim().toLowerCase()];

    MergedData.forEach(row => {
      const rowGroup = (row.groupHead || "").trim().toLowerCase();
      if (heads.includes(rowGroup)) {
        if (!nature || row.NATURE === nature) {
          opening += Number(row.netOpeningBalance) || 0;
          closing += Number(row.netClosingBalance) || 0;
        }
      }
    });

    return {
      opening: divideByMillion(opening),
      closing: divideByMillion(closing)
    };
  };

  let title = "Note Details";
  let particulars = [];
  let totalOpening = 0;
  let totalClosing = 0;

  // Mapping based on new_reports.xlsx sheets
  switch (notePoint) {
    case "5":
      title = "PROPERTY, PLANT AND EQUIPMENT";
      particulars = [{ name: "Property, plant & equipment", ...sumByGroup("Property, plant & equipment") }];
      break;
    case "6a":
      title = "INVESTMENTS";
      particulars = STATIC_FALLBACKS["6a"];
      break;
    case "6b":
      title = "SECURITY DEPOSITS";
      particulars = [{ name: "Security deposits", ...sumByGroup("Security deposits (assets)") }];
      break;
    case "6c":
      title = "BANK DEPOSITS";
      particulars = [{ name: "Fixed Deposit", ...sumByGroup("Bank Deposit with maturity remaining less than 12 months") }];
      break;
    case "7":
      title = "DEFERRED TAX ASSETS (NET)";
      particulars = [{ name: "Deferred tax Asset / (Liabilities)", ...sumByGroup("Deferred tax Asset/(Deferred tax Liabilities)") }];
      break;
    case "8":
      title = "ADVANCE FOR LAND";
      particulars = [{ name: "Advance for Land", ...sumByGroup("Advance for Land") }];
      break;
    case "9":
      title = "INVENTORIES";
      particulars = [{ name: "Work-in-progress", ...sumByGroup(["WIP", "STOCK CONSUMPTION ACCOUNT (WIP)"]) }];
      break;
    case "10a":
      title = "TRADE RECEIVABLES";
      particulars = [{ name: "Trade receivables", ...sumByGroup("Trade receivables") }];
      break;
    case "10b":
      title = "CASH AND CASH EQUIVALENTS";
      particulars = [{ name: "Balances with banks & Cash", ...sumByGroup(["Balances with banks - in current accounts", "Cash on hand", "Imprest"]) }];
      break;
    case "10c":
      title = "OTHER BANK BALANCES";
      particulars = [{ name: "Fixed Deposits & Interest", ...sumByGroup(["FIXED DEPOSIT", "Interest accrued on fixed deposits"]) }];
      break;
    case "10d":
      title = "OTHER FINANCIAL ASSETS";
      particulars = [
          { name: "Advances recoverable", ...sumByGroup("Advances recoverable in cash or in kind or for value to be received") },
          { name: "Other financial assets", ...sumByGroup("Other financial assets") }
      ];
      break;
    case "11":
      title = "OTHER CURRENT ASSETS";
      particulars = [{ name: "Other current assets", ...sumByGroup("Other current assets") }];
      break;
    case "12":
      title = "EQUITY SHARE CAPITAL";
      particulars = STATIC_FALLBACKS["12"];
      break;
    case "13":
      title = "OTHER EQUITY";
      particulars = [{ name: "Retained Earnings / Contra", ...sumByGroup("Contra") }];
      break;
    case "14a":
      title = "NON-CURRENT BORROWINGS";
      particulars = [{ name: "Loan from related parties", ...sumByGroup("Loan from related parties") }];
      break;
    case "14b":
      title = "OTHER NON-CURRENT FINANCIAL LIABILITIES";
      particulars = [{ name: "Lease Liability", ...sumByGroup("Lease Liability") }];
      break;
    case "15":
      title = "NON-CURRENT PROVISIONS";
      particulars = [{ name: "Gratuity & Leave Provision", ...sumByGroup(["Non-Current_Gratuity Provision", "Non-Current_Leave Encashment Provision"]) }];
      break;
    case "16a":
      title = "CURRENT BORROWINGS";
      particulars = [{ name: "Secured Loan", ...sumByGroup("secured loan") }];
      break;
    case "16b":
      title = "OTHER CURRENT FINANCIAL LIABILITIES";
      particulars = [{ name: "Lease Liability (Current)", ...sumByGroup("Lease Liability") }];
      break;
    case "16c":
      title = "TRADE PAYABLES";
      particulars = [{ name: "Sundry Creditors", ...sumByGroup("Sundry Creditors") }];
      break;
    case "16d":
      title = "OTHER CURRENT FINANCIAL LIABILITIES (SECURITY)";
      particulars = [{ name: "Security Deposits / Retention Money", ...sumByGroup(["Security Deposits (Payable)/Retention Money", "Other Liabilities"]) }];
      break;
    case "17":
      title = "OTHER CURRENT LIABILITIES";
      particulars = [{ name: "Realisation & Statutory Payables", ...sumByGroup(["Realisation under agreement to sell", "Balance payable to govt authority", "Other Liabilities"]) }];
      break;
    case "18":
      title = "CURRENT PROVISIONS";
      particulars = [{ name: "Short Term Provisions", ...sumByGroup(["Other provisions", "Non-Current_Gratuity Provision", "Non-Current_Leave Encashment Provision"]) }];
      break;
    case "19":
      title = "CURRENT TAX LIABILITIES (NET)";
      particulars = [{ name: "Income tax expenses", ...sumByGroup("Income tax expenses") }];
      break;
    case "PL19": // Distinguish from BS 19
    case "19PL":
      title = "TAX EXPENSE";
      particulars = [{ name: "Current tax", ...sumByGroup("Income tax expenses") }];
      break;
    case "20":
      title = "REVENUE FROM OPERATIONS";
      particulars = [{ name: "Revenue from Sales", ...sumByGroup("Realisation under agreement to sell") }];
      break;
    case "21":
      title = "OTHER INCOME";
      particulars = [{ name: "Interest & Misc Income", ...sumByGroup(["Interest on Fixed Deposit", "Interest Received on Delayed Payment", "Interest from related party", "Miscellaneous income"]) }];
      break;
    case "22":
      title = "COST OF MATERIALS CONSUMED";
      particulars = [{ name: "Construction Expenses (WIP)", ...sumByGroup("WIP") }];
      break;
    case "23":
      title = "CHANGES IN INVENTORIES";
      particulars = [{ name: "Change in WIP", ...sumByGroup(["OPENING STOCK P&L", "CLOSING STOCK P&L"]) }];
      break;
    case "24":
      title = "EMPLOYEE BENEFIT EXPENSE";
      particulars = [{ name: "Salary, wages & PF", ...sumByGroup(["Salary wages and Bonus", "Contribution to Provident fund", "Labor Cess - Sohna"]) }];
      break;
    case "26":
      title = "OTHER EXPENSES";
      particulars = [{ name: "Other Operating Expenses", ...sumByGroup(["Advertisement & Publicity", "Auditors Remuneration (*)", "Bank Charges", "Brokerage & Commission", "Business Promotion", "Miscellaneous expenses", "Domestic Travelling-Staff", "Rates & Taxes", "Telephone Expenses", "Office Expense", "Legal & professional fees", "Printing & Stationery", "Electricity charges", "Rent"]) }];
      break;
    case "27":
      title = "EARNING PER EQUITY SHARE";
      particulars = STATIC_FALLBACKS["27"];
      break;
    default:
      return res.status(404).json({ success: false, message: "Note point not found for Sohna" });
  }

  // Calculate totals
  particulars.forEach(p => {
    totalOpening += p.opening || 0;
    totalClosing += p.closing || 0;
  });

  return res.status(200).json({
    success: true,
    data: {
      notePoint,
      title,
      dates: { closing: "30th September 2025", opening: "31st March 2024" },
      particulars,
      totalOpening: +totalOpening.toFixed(4),
      totalClosing: +totalClosing.toFixed(4),
      companyType: "SOHNA"
    }
  });
};
