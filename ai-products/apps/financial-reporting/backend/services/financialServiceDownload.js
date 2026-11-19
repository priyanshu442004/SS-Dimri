import XLSX from "xlsx";
import csv from "csv-parser";
import { Readable } from "stream";
import { classifyAccounts } from "../services/classifierService.js";
import fs from "fs";
import path from "path";


const AE_ALIAS_MAP = {
  "construction expenses-(unallocated)":                  "construction expense (project)",
  "tender fees-(unallocated)":                            "tender fees",
  "maintenance charges-(unallocated)":                    "maintenance charges - lko",
  "electricity charges-(unallocated)":                    "electricity charges",
  "legal & professional-(unallocated)":                   "legal & professional charges",
  "bank commision on bg-(unallocated)":                   "bank commision on bg",
  "architect fees (wip)-(unallocated)":                   "architect fees (wip)",
  "provision for current tax":                            "provision for income tax",
  "re-measurement gain/(loss) on defined benefit plans":  "re-measurement gains/(losses) on defined ind as 115",
  "loan processing charges-pl":                           "loan processing charges",
  // These have no TB account — intentionally excluded:
  // "revenue from constructed properties"      → contra entry
  // "profit on fair value of non-current investment (ind-as)" → contra entry
  // "finance cost-(unallocated)"               → no TB account
  // "depreciation expense"                     → no TB account
  // "amortization expense"                     → no TB account
  // "current tax"                              → no TB account
  // "deferred tax expenses"                    → no TB account
  // "advance to other than subsidiaries"       → no TB account
  // "provision for interest on msme"           → no TB account
};


const loadAESheet = () => {
  const filePath = path.join(process.cwd(), "static_sheets", "AE.xlsx");
  const workbook = XLSX.readFile(filePath, { 
    cellFormula: true,  // keep formulas but also read cached .v values
    cellNF: false,
    cellDates: false
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const range = XLSX.utils.decode_range(sheet['!ref']);
  const aeMap = {};

  // Row 5 (index 4) = headers, data starts row 6 (index 5)
  for (let R = 5; R <= range.e.r; R++) {
    const particularsCell = sheet[XLSX.utils.encode_cell({ r: R, c: 2 })]; // col C = Particulars
    const classCell       = sheet[XLSX.utils.encode_cell({ r: R, c: 1 })]; // col B = Classification
    const amountCell      = sheet[XLSX.utils.encode_cell({ r: R, c: 3 })]; // col D = Amount

   

    if (!particularsCell) continue;

    let account = (particularsCell.v || "").toString().trim().toLowerCase();
    const type  = (classCell?.v || "").toString().toLowerCase();
    if (type.includes("opening")) continue;
    const amount = parseAmount(amountCell?.v); // ✅ handles "1,23,456" and numbers

    if (!account) continue;

     if (account.includes('land/dev')) {
  console.log('FULL CELL:', JSON.stringify(amountCell));
}

    account = AE_ALIAS_MAP[account] ?? account;

    if (!aeMap[account]) {
      aeMap[account] = { adjustment: 0, regrouping: 0, indAS: 0 };
    }

    if (type.includes("adjust"))       aeMap[account].adjustment += amount;
    else if (type.includes("regroup")) aeMap[account].regrouping += amount;
    else if (type.includes("ind"))     aeMap[account].indAS      += amount;
  }

  return aeMap;
};


let openingDate = null;
let closingDate = null;
const formatDate = (date) => {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
};

const mergeDuplicateAccounts = (rows) => {
  const grouped = {};

  rows.forEach((row) => {
    const normalizedAccount = normalizeString(row.accountHead);
    if (!normalizedAccount) return;

    const key = [
      normalizedAccount,
      normalizeString(row.NATURE),
      normalizeString(row["Balance Sheet Head"]),
      normalizeString(row["Group heads"])
    ].join("|");

    if (!grouped[key]) {
      grouped[key] = {
        ...row,
        netOpeningBalance: Number(row.netOpeningBalance) || 0,
        netFY:             Number(row.netFY)             || 0,
        netClosingBalance: Number(row.netClosingBalance) || 0,
      };
    } else {
      grouped[key].netOpeningBalance += Number(row.netOpeningBalance) || 0;
      grouped[key].netFY             += Number(row.netFY)             || 0;
      grouped[key].netClosingBalance += Number(row.netClosingBalance) || 0;
    }
  });

  return Object.values(grouped);
};

const normalizeString = (value) => {
  return value
    ?.toString()
    .normalize("NFKC")              // normalize unicode
    .replace(/\s+/g, " ")           // collapse multiple spaces
    .trim()
    .toLowerCase();
};

function parseAmount(val) {
  if (!val) return 0;
  return parseFloat(val.toString().replace(/,/g, "")) || 0;
}

function divideByTenLakh(value) {
  return +(value / 1000000).toFixed(2);
}





export const generatePLData = async (filePath) => {
    try {
        const uploadPath = path.join(process.cwd(), "uploads");
      
            if (!fs.existsSync(uploadPath)) {
              // removing res, req not available in this context, so throwing error instead
              return Promise.reject(new Error("Uploads folder does not exist"));
            }
      
            const files = fs.readdirSync(uploadPath);
      
            if (!files.length) {
              return Promise.reject(new Error("No file available in uploads folder"));
            }
      
            const latestFile = files
              .map(file => ({
                name: file,
                time: fs.statSync(path.join(uploadPath, file)).mtime.getTime()
              }))
              .sort((a, b) => b.time - a.time)[0].name;
      
            filePath = path.join(uploadPath, latestFile);
          
      
      
           const ext = filePath.split(".").pop().toLowerCase();
          let rows = [];
       let closingYear = null;
          let openingYear = null;
          // ===== CSV =====
           if (ext === "csv") {
            rows = await new Promise((resolve, reject) => {
              const results = [];
      
              fs.createReadStream(filePath)
                .pipe(csv())
                .on("data", (data) => results.push(data))
                .on("end", () => resolve(results))
                .on("error", reject);
            });
          }
      
          // ===== EXCEL =====
           else if (ext === "xlsx" || ext === "xls") {
      
            const workbook = XLSX.readFile(filePath);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
      
            const sheetData = XLSX.utils.sheet_to_json(sheet, {
              header: 1,
              range: 0,
              blankrows: false
            });
      
            const headerText = sheetData.flat().join(" ");
      
            const dateMatch = headerText.match(
          /From\s+\w+\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+To\s+\w+\s+(\d{1,2}\/\d{1,2}\/\d{2})/i
        );
      
      
      
       if (dateMatch) {
          console.log("Date match found:", dateMatch);
          
          const parseDate = (dateStr) => {
            const [day, month, year2] = dateStr.split("/");
            const fullYear = 2000 + parseInt(year2); // 25 → 2025
            return new Date(fullYear, month - 1, day);
          };
      
          openingDate = parseDate(dateMatch[1]); // "1/4/25"
          closingDate = parseDate(dateMatch[2]); // "30/9/25"
          
          console.log("Parsed dates:", openingDate, closingDate);
        } else {
          console.log("No date match");
        }
      
            rows = XLSX.utils.sheet_to_json(sheet, {
              range: 4,
              defval: "",
              raw: false
            });
          }
      
          else {
            return Promise.reject(new Error("Unsupported file type. Please upload a CSV or Excel file."));
          }
      
          // ===== CLASSIFY =====
          const classifiedRows = await classifyAccounts(rows);
      
          // ===== CALCULATE NET BALANCES =====
          const processed = classifiedRows.map((row) => {
            const debitOpening = parseAmount(row["Debit Opening"]);
            const creditOpening = parseAmount(row["Credit Opening"]);
            const debitClosing = parseAmount(row["Debit Closing"]);
            const creditClosing = parseAmount(row["Credit Closing"]);
      
            return {
              accountHead: row["Account Head"],
              groupHead: row["Group heads"],
              balanceSheetHead: row["Balance Sheet Head"],
              NATURE:               row["NATURE"],               // ✅ add this
          "Balance Sheet Head": row["Balance Sheet Head"],   // ✅ add this
          "Group heads":        row["Group heads"], 
              netOpeningBalance: debitOpening - creditOpening,
              netClosingBalance: debitClosing - creditClosing,
            };
          });
      
           const MergedData = mergeDuplicateAccounts(processed);
      
      // ===== APPLY AE VALUES AFTER MERGE =====
      const aeData = loadAESheet();
      const finalMergedData = MergedData.map((row) => {
        const accountKey = (row.accountHead || "").trim().toLowerCase();
        const adjustment = aeData[accountKey]?.adjustment || 0;
        const regrouping = aeData[accountKey]?.regrouping || 0;
        const indAS      = aeData[accountKey]?.indAS      || 0;
        const netClsBalance = (row.netClosingBalance + adjustment + regrouping + indAS) / 1000000;
      
        return {
          ...row,
          adjustment,
          regrouping,
          indAS,
          netClsBalance,
        };
      });
      
      
      
      const calculate18 = (finalMergedData) => {
      
        const sumIncomeClosing = (targetGroupHead) => {
          let total = 0;
          const target = targetGroupHead.trim().toLowerCase();
      
          finalMergedData.forEach((row) => {
            if (row.groupHead?.trim().toLowerCase() === target) {
              total += Number(row.netClsBalance) || 0;
            }
          });
      
          return +(-total).toFixed(2);
        };
      
        const sumIncomeOpening = (targetGroupHead) => {
          let total = 0;
          const target = targetGroupHead.trim().toLowerCase();
      
          finalMergedData.forEach((row) => {
            if (row.groupHead?.trim().toLowerCase() === target) {
              total += Number(row.netOpeningBalance) || 0;
            }
          });
      
          return divideByTenLakh(-total);
        };
      
        // Closing calculations (exact original logic)
        const revConstructedClosing  = sumIncomeClosing("(a). Revenue from constructed properties");
        const rentalIncomeClosing    = sumIncomeClosing("Rental income");
        const camRecoveryClosing     = sumIncomeClosing("Recovery of CAM charges");
        const holdingChargesClosing  = sumIncomeClosing("Holding and transfer charges from customer");
      
        const otherOpRevTotalClosing =
          +(rentalIncomeClosing + camRecoveryClosing + holdingChargesClosing).toFixed(2);
      
        const grandTotalClosing =
          +(revConstructedClosing + otherOpRevTotalClosing).toFixed(2);
      
        // Opening calculations (same logic, using opening balances)
        const revConstructedOpening  = sumIncomeOpening("(a). Revenue from constructed properties");
        const rentalIncomeOpening    = sumIncomeOpening("Rental income");
        const camRecoveryOpening     = sumIncomeOpening("Recovery of CAM charges");
        const holdingChargesOpening  = sumIncomeOpening("Holding and transfer charges from customer");
      
        const otherOpRevTotalOpening =
          +(rentalIncomeOpening + camRecoveryOpening + holdingChargesOpening).toFixed(2);
      
        const grandTotalOpening =
          +(revConstructedOpening + otherOpRevTotalOpening).toFixed(2);
      
        return {
          opening: grandTotalOpening,
          closing: grandTotalClosing
        };
      };
      
      
      // ── NOTE 19 – OTHER INCOME ─────
      
      const normalizeString = (str) => {
        return (str || "").trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
      };
      
      const calculate19 = (finalMergedData) => {
        const sumIncome = (groupHead) => {
          let opening = 0;
          let closing = 0;
      
          finalMergedData.forEach((row, index) => {
            const rowGroupHead = normalizeString(row.groupHead || "");
            const targetGroupHead = normalizeString(groupHead);
            
            if (rowGroupHead === targetGroupHead) {
              opening += Number(row.netOpeningBalance) || 0;
              closing += Number(row.netClsBalance) || 0;
            }
          });
      
          return {
            opening: divideByTenLakh(Math.abs(opening)),
            closing: +Math.abs(closing).toFixed(2),
          };
        };
      
        // Individual calculations with console.log for debugging
        console.log('MergedData sample:', finalMergedData.slice(0, 3)); // First 3 rows for debugging
        
        const interestDebentures = sumIncome("Interest on debentures");
        const interestFD = sumIncome("Interest on fixed deposits");
        const interestLoans = sumIncome("Interest on loans");
        const interestDelayed = sumIncome("Interest on delayed payments");
        const interestTaxRefund = sumIncome("Interest on income tax refund");
      
        const dividendIncome = sumIncome("b). Dividend Income");
      
        const profitFixedAssets = sumIncome("Profit on sale of fixed assets");
        const projFacilitation = sumIncome("Project facilitation charges");
        const scrapIncome = sumIncome("Income from sale of scrap");
        const profitUnquotedInv = sumIncome("Profit on sale of un-quoted investment");
        const miscIncome = sumIncome("Miscellaneous income");
      
        // Debug log individual results
        console.log('Interest items:', { interestDebentures, interestFD, interestLoans, interestDelayed, interestTaxRefund });
      
        // Subtotals
        const interestSubtotal = {
          opening: +(interestDebentures.opening + interestFD.opening + interestLoans.opening + interestDelayed.opening + interestTaxRefund.opening).toFixed(2),
          closing: +(interestDebentures.closing + interestFD.closing + interestLoans.closing + interestDelayed.closing + interestTaxRefund.closing).toFixed(2),
        };
      
        const otherNonOpSubtotal = {
          opening: +(profitFixedAssets.opening + projFacilitation.opening + scrapIncome.opening + profitUnquotedInv.opening + miscIncome.opening).toFixed(2),
          closing: +(profitFixedAssets.closing + projFacilitation.closing + scrapIncome.closing + profitUnquotedInv.closing + miscIncome.closing).toFixed(2),
        };
      
        // Grand totals
        const grandTotal = {
          opening: +(interestSubtotal.opening + dividendIncome.opening + otherNonOpSubtotal.opening).toFixed(2),
          closing: +(interestSubtotal.closing + dividendIncome.closing + otherNonOpSubtotal.closing).toFixed(2),
        };
      
        console.log('Final totals:', grandTotal);
      
        return {
          opening: grandTotal.opening,
          closing: grandTotal.closing,
        };
      };
      
      
      
      
      // ── NOTE 22 – EMPLOYEE BENEFIT EXPENSE ───────────
      const calculate22 = (finalMergedData) => {
      
        const sumClosing = (targetGroupHead) => {
          let total = 0;
          const target = targetGroupHead.trim().toLowerCase();
      
          finalMergedData.forEach((row) => {
            if (row.groupHead?.trim().toLowerCase() === target) {
              total += Number(row.netClsBalance) || 0;
            }
          });
      
          return +total.toFixed(2);
        };
      
        const sumOpening = (targetGroupHead) => {
          let total = 0;
          const target = targetGroupHead.trim().toLowerCase();
      
          finalMergedData.forEach((row) => {
            if (row.groupHead?.trim().toLowerCase() === target) {
              total += Number(row.netOpeningBalance) || 0;
            }
          });
      
          return divideByTenLakh(total);
        };
      
        // Closing values (exact original logic)
        const salaryC      = sumClosing("Salary, wages and bonus");
        const pfC          = sumClosing("Contribution to provident fund");
        const staffWelfC   = sumClosing("Staff welfare expenses");
        const esiC         = sumClosing("Contribution to employees state insurance fund");
        const transferredC = sumClosing("Less: Employee benefits expense transferred to project cost");
      
        const grossTotalC  = +(salaryC + pfC + esiC + staffWelfC).toFixed(2);
        const netTotalClosing = +(grossTotalC - transferredC).toFixed(2);
      
        // Opening values (same logic, using opening balance)
        const salaryO      = sumOpening("Salary, wages and bonus");
        const pfO          = sumOpening("Contribution to provident fund");
        const staffWelfO   = sumOpening("Staff welfare expenses");
        const esiO         = sumOpening("Contribution to employees state insurance fund");
        const transferredO = sumOpening("Less: Employee benefits expense transferred to project cost");
      
        const grossTotalO  = +(salaryO + pfO + esiO + staffWelfO).toFixed(2);
        const netTotalOpening = +(grossTotalO - transferredO).toFixed(2);
      
        return {
          opening: netTotalOpening,
          closing: netTotalClosing
        };
      };
      
      
      // ── NOTE 23 – FINANCE COSTS ───────────
      
      const calculate23 = (finalMergedData) => {
      
        const sumClosing = (targetGroupHead) => {
          let total = 0;
          const target = targetGroupHead.trim().toLowerCase();
      
          finalMergedData.forEach((row) => {
            if (row.groupHead?.trim().toLowerCase() === target) {
              total += Number(row.netClsBalance) || 0;
            }
          });
      
          return +total.toFixed(2);
        };
      
        const sumOpening = (targetGroupHead) => {
          let total = 0;
          const target = targetGroupHead.trim().toLowerCase();
      
          finalMergedData.forEach((row) => {
            if (row.groupHead?.trim().toLowerCase() === target) {
              total += Number(row.netOpeningBalance) || 0;
            }
          });
      
          return divideByTenLakh(total);
        };
      
        // Closing values (exact original logic)
        const interestC           = sumClosing("Interest");
        const loanChargesC        = sumClosing("Loan processing Charges");
        const bankChargesC        = sumClosing("Bank charges");
        const finCostTransferredC = sumClosing("Less: Finance cost\u00a0transferred to project cost");
      
        const grossTotalC = +(interestC + loanChargesC + bankChargesC).toFixed(2);
        const netTotalClosing = +(grossTotalC - finCostTransferredC).toFixed(2);
      
        // Opening values (same logic using opening balance)
        const interestO           = sumOpening("Interest");
        const loanChargesO        = sumOpening("Loan processing Charges");
        const bankChargesO        = sumOpening("Bank charges");
        const finCostTransferredO = sumOpening("Less: Finance cost\u00a0transferred to project cost");
      
        const grossTotalO = +(interestO + loanChargesO + bankChargesO).toFixed(2);
        const netTotalOpening = +(grossTotalO - finCostTransferredO).toFixed(2);
      
        return {
          opening: netTotalOpening,
          closing: netTotalClosing
        };
      };
      
      
      // ── NOTE 25 – OTHER EXPENSES ────────
      
      const calculate25 = (finalMergedData) => {
      
        const sumClosing = (targetGroupHead) => {
          let total = 0;
          const target = targetGroupHead.trim().toLowerCase();
      
          finalMergedData.forEach((row) => {
            if (row.groupHead?.trim().toLowerCase() === target) {
              total += Number(row.netClsBalance) || 0;
            }
          });
      
          return +total.toFixed(2);
        };
      
        const sumOpening = (targetGroupHead) => {
          let total = 0;
          const target = targetGroupHead.trim().toLowerCase();
      
          finalMergedData.forEach((row) => {
            if (row.groupHead?.trim().toLowerCase() === target) {
              total += Number(row.netOpeningBalance) || 0;
            }
          });
      
          return divideByTenLakh(total);
        };
      
        // Closing values (exact original logic)
        const itemsClosing = [
          sumClosing("Rent"),
          sumClosing("Business promotion"),
          sumClosing("Power, fuel and water"),
          sumClosing("Travelling and conveyance"),
          sumClosing("Communication "),
          sumClosing("Printing and stationery"),
          sumClosing("Repair & maintenance"),
          sumClosing("Offer expenses"),
          sumClosing("CAM charges"),
          sumClosing("Legal and professional"),
          sumClosing("Payment to auditor*"),
          sumClosing("Brokerage, discount and commission"),
          sumClosing("Rates and taxes"),
          sumClosing("Advertisement"),
          sumClosing("Insurance charges"),
          sumClosing("Social Welfare Expenses-CSR"),
          sumClosing("Miscellaneous expenses"),
        ];
      
        const totalClosing =
          +itemsClosing.reduce((sum, value) => sum + value, 0).toFixed(2);
      
        // Opening values (same logic using opening balance)
        const itemsOpening = [
          sumOpening("Rent"),
          sumOpening("Business promotion"),
          sumOpening("Power, fuel and water"),
          sumOpening("Travelling and conveyance"),
          sumOpening("Communication "),
          sumOpening("Printing and stationery"),
          sumOpening("Repair & maintenance"),
          sumOpening("Offer expenses"),
          sumOpening("CAM charges"),
          sumOpening("Legal and professional"),
          sumOpening("Payment to auditor*"),
          sumOpening("Brokerage, discount and commission"),
          sumOpening("Rates and taxes"),
          sumOpening("Advertisement"),
          sumOpening("Insurance charges"),
          sumOpening("Social Welfare Expenses-CSR"),
          sumOpening("Miscellaneous expenses"),
        ];
      
        const totalOpening =
          +itemsOpening.reduce((sum, value) => sum + value, 0).toFixed(2);
      
        return {
          opening: totalOpening,
          closing: totalClosing
        };
      };
      
      
      // ── NOTE 27 – TAX EXPENSE ─────
      
      const calculate26 = (finalMergedData) => {
      
        const sumClosing = (targetGroupHead) => {
          let total = 0;
          const target = targetGroupHead.trim().toLowerCase();
      
          finalMergedData.forEach((row) => {
            if (row.groupHead?.trim().toLowerCase() === target) {
              total += Number(row.netClsBalance) || 0;
            }
          });
      
          return +total.toFixed(2);
        };
      
        const sumOpening = (targetGroupHead) => {
          let total = 0;
          const target = targetGroupHead.trim().toLowerCase();
      
          finalMergedData.forEach((row) => {
            if (row.groupHead?.trim().toLowerCase() === target) {
              total += Number(row.netOpeningBalance) || 0;
            }
          });
      
          return divideByTenLakh(total);
        };
      
        // Closing values (exact original logic)
        const currentTaxC     = sumClosing("Current tax");
        const priorPeriodTaxC = sumClosing("Adjustment of tax relating to earlier periods");
        const deferredTaxC    = sumClosing("Deferred tax expenses");
      
        const totalClosing =
          +(currentTaxC + priorPeriodTaxC + deferredTaxC).toFixed(2);
      
        // Opening values (same logic using opening balance)
        const currentTaxO     = sumOpening("Current tax");
        const priorPeriodTaxO = sumOpening("Adjustment of tax relating to earlier periods");
        const deferredTaxO    = sumOpening("Deferred tax expenses");
      
        const totalOpening =
          +(currentTaxO + priorPeriodTaxO + deferredTaxO).toFixed(2);
      
        return {
          opening: totalOpening,
          closing: totalClosing
        };
      };
      
      
      const notes={
          "18": calculate18(finalMergedData),
          "19": calculate19(finalMergedData),
          "22": calculate22(finalMergedData),
          "23": calculate23(finalMergedData),
          "25": calculate25(finalMergedData),
          "26": calculate26(finalMergedData),
      }
      
      
      return {
           dates: {
         closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null
        },
          notes
        
      };
      
   
       
   
     } catch (err) {
       console.error("Notes Processing Error:", err);
       throw err;
     }
}

export const generateBSData = async (filePath) => {
   try {
     
 const uploadPath = path.join(process.cwd(), "uploads");

      const files = fs.readdirSync(uploadPath);

      if (!files.length) {
        return Promise.reject(new Error("No file available in uploads folder"));
      }

      // 👉 You can customize logic (latest file)
      const latestFile = files
        .map(file => ({
          name: file,
          time: fs.statSync(path.join(uploadPath, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time)[0].name;

      filePath = path.join(uploadPath, latestFile);
    
    const ext = filePath.split(".").pop().toLowerCase();
    let rows = [];
 let closingYear = null;
    let openingYear = null;
    // ===== CSV =====
    // if (ext === "csv") {
    //   rows = await new Promise((resolve, reject) => {
    //     const results = [];
    //     const stream = Readable.from(req.file.buffer.toString());
    //     stream
    //       .pipe(csv())
    //       .on("data", (data) => results.push(data))
    //       .on("end", () => resolve(results))
    //       .on("error", reject);
    //   });
    // }
    if (ext === "csv") {
  rows = await new Promise((resolve, reject) => {
    const results = [];

    fs.createReadStream(filePath)   // ✅ use filePath
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", reject);
  });
}

    // ===== EXCEL =====
//     else if (ext === "xlsx" || ext === "xls") {
//   const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
//   const sheet = workbook.Sheets[workbook.SheetNames[0]];

//   // 👇 Extract top rows text
//   const sheetData = XLSX.utils.sheet_to_json(sheet, {
//     header: 1,
//     range: 0,
//     blankrows: false
//   });

//   const headerText = sheetData
//     .flat()
//     .join(" ");

//   console.log("Header Text:", headerText);

//   // Extract ending year (after "To")
//   const match = headerText.match(/To\s.*?\/(\d{2})\b/);



//  if (match) {
//         const yearShort = match[1];
//         closingYear = 2000 + parseInt(yearShort);
//         openingYear = closingYear - 1;
//       }


//       rows = XLSX.utils.sheet_to_json(sheet, {
//         range: 4,
//         defval: "",
//         raw: false
//       });
//     }
else if (ext === "xlsx" || ext === "xls") {

  const workbook = XLSX.readFile(filePath);   // ✅ use readFile
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  const sheetData = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    range: 0,
    blankrows: false
  });

  const headerText = sheetData.flat().join(" ");

   const dateMatch = headerText.match(
    /From\s+\w+\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+To\s+\w+\s+(\d{1,2}\/\d{1,2}\/\d{2})/i
  );



 if (dateMatch) {
    console.log("Date match found:", dateMatch);
    
    const parseDate = (dateStr) => {
      const [day, month, year2] = dateStr.split("/");
      const fullYear = 2000 + parseInt(year2); // 25 → 2025
      return new Date(fullYear, month - 1, day);
    };

    openingDate = parseDate(dateMatch[1]); // "1/4/25"
    closingDate = parseDate(dateMatch[2]); // "30/9/25"
    
    console.log("Parsed dates:", openingDate, closingDate);
  } else {
    console.log("No date match");
  }

  rows = XLSX.utils.sheet_to_json(sheet, {
    range: 4,
    defval: "",
    raw: false
  });
}

    else {
      return Promise.reject(new Error("Unsupported file type. Please upload a CSV or Excel file."));
    }

    // ===== CLASSIFY =====
    const classifiedRows = await classifyAccounts(rows);

    // ===== CALCULATE NET BALANCES =====
    const processed = classifiedRows.map((row) => {
      const debitOpening = parseAmount(row["Debit Opening"]);
      const creditOpening = parseAmount(row["Credit Opening"]);
      const debitClosing = parseAmount(row["Debit Closing"]);
      const creditClosing = parseAmount(row["Credit Closing"]);

      return {
        accountHead: row["Account Head"],
        groupHead: row["Group heads"],
        balanceSheetHead: row["Balance Sheet Head"],
        NATURE:               row["NATURE"],               // ✅ add this
    "Balance Sheet Head": row["Balance Sheet Head"],   // ✅ add this
    "Group heads":        row["Group heads"], 
        netOpeningBalance: debitOpening - creditOpening,
        netClosingBalance: debitClosing - creditClosing,
      };
    });

    const MergedData = mergeDuplicateAccounts(processed);

// ===== APPLY AE VALUES AFTER MERGE =====
const aeData = loadAESheet();
const finalMergedData = MergedData.map((row) => {
  const accountKey = (row.accountHead || "").trim().toLowerCase();
  const adjustment = aeData[accountKey]?.adjustment || 0;
  const regrouping = aeData[accountKey]?.regrouping || 0;
  const indAS      = aeData[accountKey]?.indAS      || 0;
  const netClsBalance = (row.netClosingBalance + adjustment + regrouping + indAS) / 1000000;

  return {
    ...row,
    adjustment,
    regrouping,
    indAS,
    netClsBalance,
  };
});

    // ===== HANDLE NOTE 6(b) =====
   const calculate6b = (finalMergedData) => {

  const targetGroupHeads = [
    "Security deposits (assets)"
  ];

  const filtered = finalMergedData.filter(row =>
    targetGroupHeads.includes(row.groupHead)
  );

  let totalOpening = 0;
  let totalClosing = 0;

  filtered.forEach(row => {
    totalOpening += Number(row.netOpeningBalance) || 0;
    totalClosing += Number(row.netClsBalance) || 0
  });

  return {
    opening: divideByTenLakh(totalOpening),
    closing: +totalClosing.toFixed(2)
  };
};

  const calculate8 = (finalMergedData) => {

  const targetGroupHeads = [
    "Advance to subsidiary companies",
    "Advance to Other Parties",
    "Advances for Land",
    "Advance to Other Parties.",
    "Value Added Tax"
  ];

  const filtered = finalMergedData.filter(row =>
    targetGroupHeads.includes(row.groupHead)
  );

  // Same helper logic
  const sumByGroup = (groupName) => {
    const rows = filtered.filter(r => r.groupHead === groupName);

    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += Number(r.netOpeningBalance) || 0;
      closing += Number(r.netClsBalance) || 0
    });

    return {
      opening: divideByTenLakh(opening),
      closing: +closing.toFixed(2)
    };
  };

  const subsidiary = sumByGroup("Advance to subsidiary companies");
  const otherParties1 = sumByGroup("Advance to Other Parties");
  const land = sumByGroup("Advances for Land");
  const otherParties2 = sumByGroup("Advance to Other Parties.");
  const vat = sumByGroup("Value Added Tax");

  const totalOpening =
    subsidiary.opening +
    otherParties1.opening +
    land.opening +
    otherParties2.opening +
    vat.opening;

  const totalClosing =
    subsidiary.closing +
    otherParties1.closing +
    land.closing +
    otherParties2.closing +
    vat.closing;

  return {
    opening: +totalOpening.toFixed(2),
    closing: +totalClosing.toFixed(2)
  };
};


const calculate10a = (finalMergedData) => {

  const targetGroupHead = "Sundry Debtors";

  const filtered = finalMergedData.filter(row =>
    row.groupHead?.trim().toLowerCase() === targetGroupHead.toLowerCase()
  );

  let totalOpening = 0;
  let totalClosing = 0;

  filtered.forEach(row => {
    totalOpening += Number(row.netOpeningBalance) || 0;
    totalClosing += Number(row.netClsBalance) || 0
  });

  return {
    opening: divideByTenLakh(totalOpening),
    closing: +totalClosing.toFixed(2)
  };
};


const calculate10b = (finalMergedData) => {

  const targetGroupHead = "- in current accounts";

  const filtered = finalMergedData.filter(row =>
    row.groupHead?.trim().toLowerCase() === targetGroupHead.toLowerCase()
  );

  let totalOpening = 0;
  let totalClosing = 0;

  filtered.forEach(row => {
    totalOpening += Number(row.netOpeningBalance) || 0;
    totalClosing += Number(row.netClsBalance) || 0
  });

  return {
    opening: divideByTenLakh(totalOpening),
    closing: +totalClosing.toFixed(2)
  };
};

const calculate10c = (finalMergedData) => {

  const targetGroupHead =
    "Bank Deposit with maturity remaining less than 12 months";

  const filtered = finalMergedData.filter(row =>
    row.groupHead?.trim().toLowerCase() === targetGroupHead.toLowerCase()
  );

  let totalOpening = 0;
  let totalClosing = 0;

  filtered.forEach(row => {
    totalOpening += Number(row.netOpeningBalance) || 0;
    totalClosing += Number(row.netClsBalance) || 0
  });

  return {
    opening: divideByTenLakh(totalOpening),
    closing: +totalClosing.toFixed(2)
  };
};

const calculate10d = (finalMergedData) => {

  const targetGroupHeads = [
    "Interest accrued on bank deposits",
    "Advances recoverable in cash or in kind or for value to be received",
    "Earnest money deposits",
    "Retention money",
    "Interest accrued on debentures"
  ];

  const filtered = finalMergedData.filter(row =>
    targetGroupHeads.includes(row.groupHead)
  );

  let totalOpening = 0;
  let totalClosing = 0;

  targetGroupHeads.forEach(groupName => {
    const rows = filtered.filter(r => r.groupHead === groupName);

    rows.forEach(r => {
      totalOpening += Number(r.netOpeningBalance) || 0;
      totalClosing += Number(r.netClsBalance) || 0
    });
  });

  return {
    opening: divideByTenLakh(totalOpening),
    closing: +totalClosing.toFixed(2)
  };
};

const calculate11 = (finalMergedData) => {

  const targetGroupHeads = [
    "Prepaid expenses",
    "-- GST Input Credit",
    "-- Advance tax (net of provision)"
  ];

  const filtered = finalMergedData.filter(row =>
    targetGroupHeads.includes(row.groupHead)
  );

  let totalOpening = 0;
  let totalClosing = 0;

  targetGroupHeads.forEach(groupName => {
    const rows = filtered.filter(r => r.groupHead === groupName);

    rows.forEach(r => {
      totalOpening += Number(r.netOpeningBalance) || 0;
      totalClosing += Number(r.netClsBalance) || 0
    });
  });

  return {
    opening: divideByTenLakh(totalOpening),
    closing: +totalClosing.toFixed(2)
  };
};

//14
const calculate14 = (finalMergedData) => {

  const provisionRows = finalMergedData.filter(r =>
    r.groupHead?.toLowerCase().includes("provision for employee benefits")
  );

  let totalOpening = 0;
  let totalClosing = 0;

  provisionRows.forEach(r => {
    totalOpening += Math.abs(Number(r.netOpeningBalance) || 0);
    totalClosing += Math.abs(Number(r.netClsBalance) || 0);
  });

  return {
    opening: divideByTenLakh(totalOpening),
    closing: +totalClosing.toFixed(2)
  };
};



// NOTE 15(c) >>>>>>>>>>>>>>>>>>>>>>>>

const calculate15c = (finalMergedData) => {

  const sumRows = (rows) => {
    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += Number(r.netOpeningBalance) || 0;
      closing += Number(r.netClsBalance) || 0
    });

    return {
      opening: divideByTenLakh(Math.abs(opening)),
      closing: +Math.abs(closing).toFixed(2) 
    };
  };

  const financialRows = finalMergedData.filter(r =>
    normalizeString(r.balanceSheetHead || "").includes("financial")
  );

  const securityRows = financialRows.filter(r =>
    normalizeString(r.groupHead || "").includes("security")
  );

  const edcRows = financialRows.filter(r =>
    normalizeString(r.groupHead || "") === normalizeString("EDC/ IDC payable")
  );

  const interestRows = financialRows.filter(r =>
    normalizeString(r.groupHead || "") === normalizeString("Interest accrued")
  );

  const security = sumRows(securityRows);
  const edc = sumRows(edcRows);
  const interest = sumRows(interestRows);

  const totalOpening =
    security.opening +
    edc.opening +
    interest.opening;

  const totalClosing =
    security.closing +
    edc.closing +
    interest.closing;

  return {
    opening: +totalOpening.toFixed(2),
    closing: +totalClosing.toFixed(2)
  };
};

// NOTE 16 >>>>>>>>>>>>>>>>>>>>>>>>


const calculate16 = (finalMergedData) => {

  const sumRows = (rows) => {
    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += Number(r.netOpeningBalance) || 0;
      closing += Number(r.netClsBalance) || 0
    });

    return {
      opening: divideByTenLakh(Math.abs(opening)),
      closing: +Math.abs(closing).toFixed(2)
    };
  };

  const currentLiabilityRows = finalMergedData.filter(r =>
    normalizeString(r.balanceSheetHead || "") ===
    normalizeString("Other Current Liabilities")
  );

  const realisation = sumRows(
    currentLiabilityRows.filter(r =>
      normalizeString(r.groupHead || "") ===
      normalizeString("Realisation under agreement to sell")
    )
  );

  const statutory = sumRows(
    currentLiabilityRows.filter(r =>
      normalizeString(r.groupHead || "").includes("statutory")
    )
  );

  const employee = sumRows(
    currentLiabilityRows.filter(r =>
      normalizeString(r.groupHead || "").includes("employee")
    )
  );

  const other = sumRows(
    currentLiabilityRows.filter(r =>
      normalizeString(r.groupHead || "").includes("other")
    )
  );

  const totalOpening =
    realisation.opening +
    statutory.opening +
    employee.opening +
    other.opening;

  const totalClosing =
    realisation.closing +
    statutory.closing +
    employee.closing +
    other.closing;

  return {
    opening: +totalOpening.toFixed(2),
    closing: +totalClosing.toFixed(2)
  };
};

//  Note 17 >>>>>>>>>>>>>>>>>>>>>>>>

const calculate17 = (finalMergedData) => {

  const sumRows = (rows) => {
    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += Number(r.netOpeningBalance) || 0;
      closing += Number(r.netClsBalance) || 0
    });

    return {
      opening: divideByTenLakh(Math.abs(opening)),
      closing: +Math.abs(closing).toFixed(2)
    };
  };

  const employee = sumRows(
    finalMergedData.filter(r =>
      normalizeString(r.groupHead || "") ===
      normalizeString("Provision for employee benefits")
    )
  );

  const currentTax = sumRows(
    finalMergedData.filter(r =>
      normalizeString(r.groupHead || "") ===
      normalizeString("Provision for current tax")
    )
  );

  const bonus = sumRows(
    finalMergedData.filter(r =>
      normalizeString(r.groupHead || "") ===
      normalizeString("Provision for Bonus")
    )
  );

  const totalOpening =
    employee.opening +
    currentTax.opening +
    bonus.opening;

  const totalClosing =
    employee.closing +
    currentTax.closing +
    bonus.closing;

  return {
    opening: +totalOpening.toFixed(2),
    closing: +totalClosing.toFixed(2)
  };
};


const notes={
"6b": calculate6b(finalMergedData),
"8": calculate8(finalMergedData),
"10a": calculate10a(finalMergedData),
"10b": calculate10b(finalMergedData),
"10c": calculate10c(finalMergedData),
"10d": calculate10d(finalMergedData),
"11": calculate11(finalMergedData),
"14": calculate14(finalMergedData),
"15c": calculate15c(finalMergedData),
"16": calculate16(finalMergedData),
"17": calculate17(finalMergedData),
}


return {
    dates: {
   closing: closingDate ? formatDate(closingDate) : null,
    opening: openingDate ? formatDate(openingDate) : null
  },
    notes
  
};

    throw new Error("Unsupported file type");
  
    } catch (err) {
      console.error("Notes Processing Error:", err);
        throw err;
    }
}

export const generateTBsummary = async (filePath) => {

 try {
   
     const uploadPath = path.join(process.cwd(), "uploads");
    
          const files = fs.readdirSync(uploadPath);
    
          if (!files.length) {
            return Promise.reject(new Error("No file available in uploads folder"));
          }
    
          // 👉 You can customize logic (latest file)
          const latestFile = files
            .map(file => ({
              name: file,
              time: fs.statSync(path.join(uploadPath, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time)[0].name;
    
          filePath = path.join(uploadPath, latestFile);
        
        const ext = filePath.split(".").pop().toLowerCase();
        let rows = [];
     let closingYear = null;
        let openingYear = null;
        // ===== CSV =====
        // if (ext === "csv") {
        //   rows = await new Promise((resolve, reject) => {
        //     const results = [];
        //     const stream = Readable.from(req.file.buffer.toString());
        //     stream
        //       .pipe(csv())
        //       .on("data", (data) => results.push(data))
        //       .on("end", () => resolve(results))
        //       .on("error", reject);
        //   });
        // }
        if (ext === "csv") {
      rows = await new Promise((resolve, reject) => {
        const results = [];
    
        fs.createReadStream(filePath)   // ✅ use filePath
          .pipe(csv())
          .on("data", (data) => results.push(data))
          .on("end", () => resolve(results))
          .on("error", reject);
      });
    }
    
        // ===== EXCEL =====
    //     else if (ext === "xlsx" || ext === "xls") {
    //   const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    //   const sheet = workbook.Sheets[workbook.SheetNames[0]];
    
    //   // 👇 Extract top rows text
    //   const sheetData = XLSX.utils.sheet_to_json(sheet, {
    //     header: 1,
    //     range: 0,
    //     blankrows: false
    //   });
    
    //   const headerText = sheetData
    //     .flat()
    //     .join(" ");
    
    //   console.log("Header Text:", headerText);
    
    //   // Extract ending year (after "To")
    //   const match = headerText.match(/To\s.*?\/(\d{2})\b/);
    
    
    
    //  if (match) {
    //         const yearShort = match[1];
    //         closingYear = 2000 + parseInt(yearShort);
    //         openingYear = closingYear - 1;
    //       }
    
    
    //       rows = XLSX.utils.sheet_to_json(sheet, {
    //         range: 4,
    //         defval: "",
    //         raw: false
    //       });
    //     }
    else if (ext === "xlsx" || ext === "xls") {
    
      const workbook = XLSX.readFile(filePath);   // ✅ use readFile
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
    
      const sheetData = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        range: 0,
        blankrows: false
      });
    
      const headerText = sheetData.flat().join(" ");
    
       const dateMatch = headerText.match(
        /From\s+\w+\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+To\s+\w+\s+(\d{1,2}\/\d{1,2}\/\d{2})/i
      );
    
    
    
     if (dateMatch) {
        console.log("Date match found:", dateMatch);
        
        const parseDate = (dateStr) => {
          const [day, month, year2] = dateStr.split("/");
          const fullYear = 2000 + parseInt(year2); // 25 → 2025
          return new Date(fullYear, month - 1, day);
        };
    
        openingDate = parseDate(dateMatch[1]); // "1/4/25"
        closingDate = parseDate(dateMatch[2]); // "30/9/25"
        
        console.log("Parsed dates:", openingDate, closingDate);
      } else {
        console.log("No date match");
      }
    
      rows = XLSX.utils.sheet_to_json(sheet, {
        range: 4,
        defval: "",
        raw: false
      });
    }
    
        else {
          return Promise.reject(new Error("Unsupported file type. Please upload a CSV or Excel file."));
        }
    
        // ===== CLASSIFY =====
        const classifiedRows = await classifyAccounts(rows);
    
        // ===== CALCULATE NET BALANCES =====
        const processed = classifiedRows.map((row) => {
          const debitOpening = parseAmount(row["Debit Opening"]);
          const creditOpening = parseAmount(row["Credit Opening"]);
          const debitClosing = parseAmount(row["Debit Closing"]);
          const creditClosing = parseAmount(row["Credit Closing"]);
    
          return {
            accountHead: row["Account Head"],
            groupHead: row["Group heads"],
            balanceSheetHead: row["Balance Sheet Head"],
            NATURE:               row["NATURE"],               // ✅ add this
        "Balance Sheet Head": row["Balance Sheet Head"],   // ✅ add this
        "Group heads":        row["Group heads"], 
            netOpeningBalance: debitOpening - creditOpening,
            netClosingBalance: debitClosing - creditClosing,
          };
        });
    
        const MergedData = mergeDuplicateAccounts(processed);
    
    // ===== APPLY AE VALUES AFTER MERGE =====
    const aeData = loadAESheet();
    const finalMergedData = MergedData.map((row) => {
      const accountKey = (row.accountHead || "").trim().toLowerCase();
      const adjustment = aeData[accountKey]?.adjustment || 0;
      const regrouping = aeData[accountKey]?.regrouping || 0;
      const indAS      = aeData[accountKey]?.indAS      || 0;
      const netClsBalance = (row.netClosingBalance + adjustment + regrouping + indAS) / 1000000;
    
      return {
        ...row,
        adjustment,
        regrouping,
        indAS,
        netClsBalance,
      };
    });
    
        // ===== HANDLE NOTE 6(b) =====
       const calculate6b = (finalMergedData) => {
    
      const targetGroupHeads = [
        "Security deposits (assets)"
      ];
    
      const filtered = finalMergedData.filter(row =>
        targetGroupHeads.includes(row.groupHead)
      );
    
      let totalOpening = 0;
      let totalClosing = 0;
    
      filtered.forEach(row => {
        totalOpening += Number(row.netOpeningBalance) || 0;
        totalClosing += Number(row.netClsBalance) || 0
      });
    
      return {
        opening: divideByTenLakh(totalOpening),
        closing: +totalClosing.toFixed(2)
      };
    };
    
      const calculate8 = (finalMergedData) => {
    
      const targetGroupHeads = [
        "Advance to subsidiary companies",
        "Advance to Other Parties",
        "Advances for Land",
        "Advance to Other Parties.",
        "Value Added Tax"
      ];
    
      const filtered = finalMergedData.filter(row =>
        targetGroupHeads.includes(row.groupHead)
      );
    
      // Same helper logic
      const sumByGroup = (groupName) => {
        const rows = filtered.filter(r => r.groupHead === groupName);
    
        let opening = 0;
        let closing = 0;
    
        rows.forEach(r => {
          opening += Number(r.netOpeningBalance) || 0;
          closing += Number(r.netClsBalance) || 0
        });
    
        return {
          opening: divideByTenLakh(opening),
          closing: +closing.toFixed(2)
        };
      };
    
      const subsidiary = sumByGroup("Advance to subsidiary companies");
      const otherParties1 = sumByGroup("Advance to Other Parties");
      const land = sumByGroup("Advances for Land");
      const otherParties2 = sumByGroup("Advance to Other Parties.");
      const vat = sumByGroup("Value Added Tax");
    
      const totalOpening =
        subsidiary.opening +
        otherParties1.opening +
        land.opening +
        otherParties2.opening +
        vat.opening;
    
      const totalClosing =
        subsidiary.closing +
        otherParties1.closing +
        land.closing +
        otherParties2.closing +
        vat.closing;
    
      return {
        opening: +totalOpening.toFixed(2),
        closing: +totalClosing.toFixed(2)
      };
    };
    
    
    const calculate10a = (finalMergedData) => {
    
      const targetGroupHead = "Sundry Debtors";
    
      const filtered = finalMergedData.filter(row =>
        row.groupHead?.trim().toLowerCase() === targetGroupHead.toLowerCase()
      );
    
      let totalOpening = 0;
      let totalClosing = 0;
    
      filtered.forEach(row => {
        totalOpening += Number(row.netOpeningBalance) || 0;
        totalClosing += Number(row.netClsBalance) || 0
      });
    
      return {
        opening: divideByTenLakh(totalOpening),
        closing: +totalClosing.toFixed(2)
      };
    };
    
    
    const calculate10b = (finalMergedData) => {
    
      const targetGroupHead = "- in current accounts";
    
      const filtered = finalMergedData.filter(row =>
        row.groupHead?.trim().toLowerCase() === targetGroupHead.toLowerCase()
      );
    
      let totalOpening = 0;
      let totalClosing = 0;
    
      filtered.forEach(row => {
        totalOpening += Number(row.netOpeningBalance) || 0;
        totalClosing += Number(row.netClsBalance) || 0
      });
    
      return {
        opening: divideByTenLakh(totalOpening),
        closing: +totalClosing.toFixed(2)
      };
    };
    
    const calculate10c = (finalMergedData) => {
    
      const targetGroupHead =
        "Bank Deposit with maturity remaining less than 12 months";
    
      const filtered = finalMergedData.filter(row =>
        row.groupHead?.trim().toLowerCase() === targetGroupHead.toLowerCase()
      );
    
      let totalOpening = 0;
      let totalClosing = 0;
    
      filtered.forEach(row => {
        totalOpening += Number(row.netOpeningBalance) || 0;
        totalClosing += Number(row.netClsBalance) || 0
      });
    
      return {
        opening: divideByTenLakh(totalOpening),
        closing: +totalClosing.toFixed(2)
      };
    };
    
    const calculate10d = (finalMergedData) => {
    
      const targetGroupHeads = [
        "Interest accrued on bank deposits",
        "Advances recoverable in cash or in kind or for value to be received",
        "Earnest money deposits",
        "Retention money",
        "Interest accrued on debentures"
      ];
    
      const filtered = finalMergedData.filter(row =>
        targetGroupHeads.includes(row.groupHead)
      );
    
      let totalOpening = 0;
      let totalClosing = 0;
    
      targetGroupHeads.forEach(groupName => {
        const rows = filtered.filter(r => r.groupHead === groupName);
    
        rows.forEach(r => {
          totalOpening += Number(r.netOpeningBalance) || 0;
          totalClosing += Number(r.netClsBalance) || 0
        });
      });
    
      return {
        opening: divideByTenLakh(totalOpening),
        closing: +totalClosing.toFixed(2)
      };
    };
    
    const calculate11 = (finalMergedData) => {
    
      const targetGroupHeads = [
        "Prepaid expenses",
        "-- GST Input Credit",
        "-- Advance tax (net of provision)"
      ];
    
      const filtered = finalMergedData.filter(row =>
        targetGroupHeads.includes(row.groupHead)
      );
    
      let totalOpening = 0;
      let totalClosing = 0;
    
      targetGroupHeads.forEach(groupName => {
        const rows = filtered.filter(r => r.groupHead === groupName);
    
        rows.forEach(r => {
          totalOpening += Number(r.netOpeningBalance) || 0;
          totalClosing += Number(r.netClsBalance) || 0
        });
      });
    
      return {
        opening: divideByTenLakh(totalOpening),
        closing: +totalClosing.toFixed(2)
      };
    };
    
    //14
    const calculate14 = (finalMergedData) => {
    
      const provisionRows = finalMergedData.filter(r =>
        r.groupHead?.toLowerCase().includes("provision for employee benefits")
      );
    
      let totalOpening = 0;
      let totalClosing = 0;
    
      provisionRows.forEach(r => {
        totalOpening += Math.abs(Number(r.netOpeningBalance) || 0);
        totalClosing += Math.abs(Number(r.netClsBalance) || 0);
      });
    
      return {
        opening: divideByTenLakh(totalOpening),
        closing: +totalClosing.toFixed(2)
      };
    };
    
    
    
    // NOTE 15(c) >>>>>>>>>>>>>>>>>>>>>>>>
    
    const calculate15c = (finalMergedData) => {
    
      const sumRows = (rows) => {
        let opening = 0;
        let closing = 0;
    
        rows.forEach(r => {
          opening += Number(r.netOpeningBalance) || 0;
          closing += Number(r.netClsBalance) || 0
        });
    
        return {
          opening: divideByTenLakh(Math.abs(opening)),
          closing: +Math.abs(closing).toFixed(2) 
        };
      };
    
      const financialRows = finalMergedData.filter(r =>
        normalizeString(r.balanceSheetHead || "").includes("financial")
      );
    
      const securityRows = financialRows.filter(r =>
        normalizeString(r.groupHead || "").includes("security")
      );
    
      const edcRows = financialRows.filter(r =>
        normalizeString(r.groupHead || "") === normalizeString("EDC/ IDC payable")
      );
    
      const interestRows = financialRows.filter(r =>
        normalizeString(r.groupHead || "") === normalizeString("Interest accrued")
      );
    
      const security = sumRows(securityRows);
      const edc = sumRows(edcRows);
      const interest = sumRows(interestRows);
    
      const totalOpening =
        security.opening +
        edc.opening +
        interest.opening;
    
      const totalClosing =
        security.closing +
        edc.closing +
        interest.closing;
    
      return {
        opening: +totalOpening.toFixed(2),
        closing: +totalClosing.toFixed(2)
      };
    };
    
    // NOTE 16 >>>>>>>>>>>>>>>>>>>>>>>>
    
    
    const calculate16 = (finalMergedData) => {
    
      const sumRows = (rows) => {
        let opening = 0;
        let closing = 0;
    
        rows.forEach(r => {
          opening += Number(r.netOpeningBalance) || 0;
          closing += Number(r.netClsBalance) || 0
        });
    
        return {
          opening: divideByTenLakh(Math.abs(opening)),
          closing: +Math.abs(closing).toFixed(2)
        };
      };
    
      const currentLiabilityRows = finalMergedData.filter(r =>
        normalizeString(r.balanceSheetHead || "") ===
        normalizeString("Other Current Liabilities")
      );
    
      const realisation = sumRows(
        currentLiabilityRows.filter(r =>
          normalizeString(r.groupHead || "") ===
          normalizeString("Realisation under agreement to sell")
        )
      );
    
      const statutory = sumRows(
        currentLiabilityRows.filter(r =>
          normalizeString(r.groupHead || "").includes("statutory")
        )
      );
    
      const employee = sumRows(
        currentLiabilityRows.filter(r =>
          normalizeString(r.groupHead || "").includes("employee")
        )
      );
    
      const other = sumRows(
        currentLiabilityRows.filter(r =>
          normalizeString(r.groupHead || "").includes("other")
        )
      );
    
      const totalOpening =
        realisation.opening +
        statutory.opening +
        employee.opening +
        other.opening;
    
      const totalClosing =
        realisation.closing +
        statutory.closing +
        employee.closing +
        other.closing;
    
      return {
        opening: +totalOpening.toFixed(2),
        closing: +totalClosing.toFixed(2)
      };
    };
    
    //  Note 17 >>>>>>>>>>>>>>>>>>>>>>>>
    
    const calculate17 = (finalMergedData) => {
    
      const sumRows = (rows) => {
        let opening = 0;
        let closing = 0;
    
        rows.forEach(r => {
          opening += Number(r.netOpeningBalance) || 0;
          closing += Number(r.netClsBalance) || 0
        });
    
        return {
          opening: divideByTenLakh(Math.abs(opening)),
          closing: +Math.abs(closing).toFixed(2)
        };
      };
    
      const employee = sumRows(
        finalMergedData.filter(r =>
          normalizeString(r.groupHead || "") ===
          normalizeString("Provision for employee benefits")
        )
      );
    
      const currentTax = sumRows(
        finalMergedData.filter(r =>
          normalizeString(r.groupHead || "") ===
          normalizeString("Provision for current tax")
        )
      );
    
      const bonus = sumRows(
        finalMergedData.filter(r =>
          normalizeString(r.groupHead || "") ===
          normalizeString("Provision for Bonus")
        )
      );
    
      const totalOpening =
        employee.opening +
        currentTax.opening +
        bonus.opening;
    
      const totalClosing =
        employee.closing +
        currentTax.closing +
        bonus.closing;
    
      return {
        opening: +totalOpening.toFixed(2),
        closing: +totalClosing.toFixed(2)
      };
    };
    
    
    const notes={
    "6b": calculate6b(finalMergedData),
    "8": calculate8(finalMergedData),
    "10a": calculate10a(finalMergedData),
    "10b": calculate10b(finalMergedData),
    "10c": calculate10c(finalMergedData),
    "10d": calculate10d(finalMergedData),
    "11": calculate11(finalMergedData),
    "14": calculate14(finalMergedData),
    "15c": calculate15c(finalMergedData),
    "16": calculate16(finalMergedData),
    "17": calculate17(finalMergedData),
    }
    
    
    return {
        dates: {
       closing: closingDate ? formatDate(closingDate) : null,
        opening: openingDate ? formatDate(openingDate) : null
      },
        tb: processed,
      
    };
    
       

  } catch (err) {
    console.error("Notes Processing Error:", err);
    return {
      success: false,
      message: "Processing failed",
      error: err.message
    };
  }

}