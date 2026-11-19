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
    cellFormula: true, 
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
const detectCompany = (filePath) => {
  let companyType = "INFRASTRUCTURE";
  let headerRowIndex = 4; // Default

  try {
    const ext = filePath.split(".").pop().toLowerCase();
    if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      
      // Search first 25 rows for "ELDECO SOHNA" and "Account Head"
      for (let i = 0; i < Math.min(data.length, 25); i++) {
        const row = data[i] || [];
        const rowStr = row.join(" ").toUpperCase();
        
        if (rowStr.includes("ELDECO SOHNA")) {
          companyType = "SOHNA";
        }
        
        if (row.some(cell => cell && cell.toString().trim().toLowerCase() === "account head")) {
          headerRowIndex = i;
        }
      }
    }
  } catch (e) {
    console.error("Detect Error:", e);
  }
  
  return { companyType, headerRowIndex };
};

// controllers/balanceSheet.controller.js
export const processBalanceSheet = async (req, res) => {
  try {
   
let filePath;
    // ✅ CASE 1: If file uploaded → use uploaded file
    if (req.file) {
      filePath = req.file.path;
    } 
 // ✅ CASE 2: If no file uploaded → read existing file from uploads folder
    else {
      const uploadPath = path.join(process.cwd(), "uploads");

      const files = fs.readdirSync(uploadPath);

      if (!files.length) {
        return res.status(400).json({ message: "No file available in uploads folder" });
      }

      // 👉 You can customize logic (latest file)
      const latestFile = files
        .map(file => ({
          name: file,
          time: fs.statSync(path.join(uploadPath, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time)[0].name;

      filePath = path.join(uploadPath, latestFile);
    }
    const { companyType, headerRowIndex } = detectCompany(filePath);
    console.log("FINAL DETECTED COMPANY TYPE:", companyType, "Header Row:", headerRowIndex, "for file:", filePath);
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
    range: headerRowIndex,
    defval: "",
    raw: false
  });
}

    else {
      return res.status(400).json({ message: "Unsupported file type" });
    }

    // ===== CLASSIFY =====
    const classifiedRows = await classifyAccounts(rows, companyType);

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

    // ===== BRANCH BY COMPANY =====
    if (companyType === "SOHNA") {
      return processBalanceSheetSohna(MergedData, res);
    }

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


return res.status(200).json({
  success: true,
  companyType: "INFRASTRUCTURE",
  data: {
    dates: {
      closing: closingDate ? formatDate(closingDate) : null,
      opening: openingDate ? formatDate(openingDate) : null
    },
    notes
  }
});

    return res.status(400).json({ message: "Note not implemented yet" });

  } catch (err) {
    console.error("Notes Processing Error:", err);
    return res.status(500).json({
      success: false,
      message: "Processing failed",
      error: err.message
    });
  }
};

const processBalanceSheetSohna = (MergedData, res) => {
  const divideByMillion = (val) => +(val / 1000000).toFixed(2);

  const sumByGroup = (groupHeads, fallbackKey = null) => {
    let opening = 0;
    let closing = 0;
    const heads = Array.isArray(groupHeads) ? groupHeads.map(h => h.trim().toLowerCase()) : [groupHeads.trim().toLowerCase()];

    MergedData.forEach(row => {
      const rowGroup = (row.groupHead || "").trim().toLowerCase();
      if (heads.includes(rowGroup)) {
        opening += Number(row.netOpeningBalance) || 0;
        closing += Number(row.netClosingBalance) || 0;
      }
    });

    let resOpening = divideByMillion(opening);
    let resClosing = divideByMillion(closing);

    // Apply Static Fallbacks if TB value is 0
    const staticMap = {
      "5":   { o: 40.68,   c: 40.41   },
      "6a":  { o: 1.70,    c: 1.70    },
      "6b":  { o: 4.31,    c: 1.05    },
      "7":   { o: 113.01,  c: 192.51  },
      "8":   { o: 151.89,  c: 421.56  },
      "9":   { o: 574.20,  c: 3932.41 },
      "10a": { o: 29.13,   c: 10.71   },
      "10b": { o: 17.48,   c: 180.72  },
      "10c": { o: 376.72,  c: 398.92  },
      "10d": { o: 47.31,   c: 49.44   },
      "11":  { o: 19.83,   c: 23.20   },
      "12":  { o: 80.09,   c: 40.66   },
      "13":  { o: 61.00,   c: 61.00   },
      "14":  { o: 874.80,  c: 838.80  },
      "15b": { o: 0,       c: 669.09  },
      "16":  { o: 0.61,    c: 0.70    },
      "17a": { o: 140.08,  c: 1388.05 },
      "17b": { o: 0,       c: 869.16  },
      "17c": { o: 42.20,   c: 293.19  },
      "17d": { o: 25.73,   c: 19.04   },
      "18":  { o: 306.79,  c: 224.00  },
      "19":  { o: 5.14,    c: 30.25   },
    };

    if (fallbackKey && staticMap[fallbackKey] && (resClosing === 0 || isNaN(resClosing))) {
       resOpening = staticMap[fallbackKey].o + "*";
       resClosing = staticMap[fallbackKey].c + "*";
    }

    return { opening: resOpening, closing: resClosing };
  };

  const notes = {
    "5": sumByGroup("Property, plant & equipment", "5"),
    "6a": sumByGroup("Long-term Investments", "6a"),
    "6b": sumByGroup("Other financial assets", "6b"),
    "7": sumByGroup("Deferred tax Asset/(Deferred tax Liabilities)", "7"),
    "8": sumByGroup("Other non-current assets", "8"),
    "9": sumByGroup(["WIP", "STOCK CONSUMPTION ACCOUNT (WIP)"], "9"),
    "10a": sumByGroup("Trade receivables", "10a"),
    "10b": sumByGroup(["Balances with banks - in current accounts", "Cash on hand", "Imprest"], "10b"),
    "10c": sumByGroup(["FIXED DEPOSIT", "Interest accrued on fixed deposits"], "10c"),
    "10d": sumByGroup(["Advances recoverable in cash or in kind or for value to be received", "Other financial assets"], "10d"),
    "11": sumByGroup("Current tax assets (net)", "11"),
    "12": sumByGroup("Other current assets", "12"),
    "13": sumByGroup("Equity Share Capital", "13"),
    "14": sumByGroup("Contra", "14"),
    "15a": sumByGroup("Loan from related parties", "15a"),
    "15b": sumByGroup("Lease Liability", "15b"),
    "16": sumByGroup(["Non-Current_Gratuity Provision", "Non-Current_Leave Encashment Provision"], "16"),
    "17a": sumByGroup("secured loan", "17a"),
    "17b": sumByGroup("Lease Liability", "17b"),
    "17c": sumByGroup("Sundry Creditors", "17c"),
    "17d": sumByGroup(["Security Deposits (Payable)/Retention Money", "Other Liabilities"], "17d"),
    "18": sumByGroup(["Realisation under agreement to sell", "Balance payable to govt authority", "Other Liabilities"], "18"),
    "19": sumByGroup(["Other provisions", "Non-Current_Gratuity Provision", "Non-Current_Leave Encashment Provision"], "19")
  };

  return res.status(200).json({
    success: true,
    companyType: "SOHNA",
    data: {
      dates: {
        opening: "31st March 2025",
        closing: "30th September 2025"
      },
      notes
    }
  });
};
