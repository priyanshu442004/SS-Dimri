import XLSX from "xlsx";
import csv from "csv-parser";
import { Readable } from "stream";
import { classifyAccounts } from "../services/classifierService.js";
import fs from "fs";
import path from "path";
import { processNotesSohna } from "./notesSohna.js";



const detectCompany = (filePath) => {
  try {
    const ext = filePath.split(".").pop().toLowerCase();
    let companyName = "";
    if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.readFile(filePath);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      companyName = (data[1] && data[1][0] || "").toString();
    }
    if (companyName.toUpperCase().includes("ELDECO SOHNA")) {
      return "SOHNA";
    }
  } catch (e) {}
  return "INFRASTRUCTURE";
};

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

export const processNotes = async (req, res) => {
  try {
    const { notePoint } = req.body;
     if (!notePoint) {
      return res.status(400).json({ message: "Note point is required" });
    }
let filePath;

    // ✅ CASE 1: Uploaded file
    if (req.file) {
      filePath = req.file.path;
    }
    else {
      const uploadPath = path.join(process.cwd(), "uploads");

      if (!fs.existsSync(uploadPath)) {
        return res.status(400).json({ message: "Uploads folder not found" });
      }

      const files = fs.readdirSync(uploadPath);

      if (!files.length) {
        return res.status(400).json({ message: "No file available in uploads folder" });
      }

      const latestFile = files
        .map(file => ({
          name: file,
          time: fs.statSync(path.join(uploadPath, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time)[0].name;

      filePath = path.join(uploadPath, latestFile);
    }

    

    const companyType = detectCompany(filePath);
    const ext = filePath.split(".").pop().toLowerCase();
   let rows = [];
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

      // Extract full opening and closing dates
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
      return res.status(400).json({ message: "Unsupported file type" });
    }

    // ===== CLASSIFY =====
   // ===== CLASSIFY =====
const classifiedRows = await classifyAccounts(rows, companyType);
    
// ===== CALCULATE NET BALANCES (NO AE HERE) =====
const processed = classifiedRows.map((row) => {
  const debitOpening  = parseAmount(row["Debit Opening"]);
  const creditOpening = parseAmount(row["Credit Opening"]);
  const debitClosing  = parseAmount(row["Debit Closing"]);
  const creditClosing = parseAmount(row["Credit Closing"]);

  return {
    accountHead:      row["Account Head"],
    groupHead:        row["Group heads"],
    balanceSheetHead: row["Balance Sheet Head"],
    netOpeningBalance: debitOpening - creditOpening,
    netClosingBalance: debitClosing - creditClosing,
  };
});

// ===== MERGE FIRST =====
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

// ===== BRANCH BY COMPANY =====
    if (companyType === "SOHNA") {
      return processNotesSohna(finalMergedData, notePoint, res);
    }

    const formatDate = (date) => {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
};

    // ===== HANDLE NOTE 6(b) =====
    if (notePoint === "6(b)") {

      const targetGroupHeads = [
        "Security deposits (assets)"
      ];

      const filtered = finalMergedData.filter(row =>
        targetGroupHeads.includes(row.groupHead)
      );

      let totalOpening = 0;
      let totalClosing = 0;

      filtered.forEach(row => {
        totalOpening += row.netOpeningBalance;
        totalClosing += Number(row.netClsBalance) || 0;
      });

      const responseData = {
        notePoint: "6(b)",
        title: "LOANS",
         dates: {
   closing: closingDate ? formatDate(closingDate) : null,
    opening: openingDate ? formatDate(openingDate) : null
  },
        particulars: [
          {
            name: "Security deposits (assets)",
            opening: divideByTenLakh(totalOpening),
             closing: +totalClosing.toFixed(2)  
          }
        ],
        totalOpening: divideByTenLakh(totalOpening),
         totalClosing: +totalClosing.toFixed(2) 
      };

      return res.status(200).json({
        success: true,
        data: responseData
      });
    }

    if (notePoint === "8") {

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

  // Helper to sum by group head
  const sumByGroup = (groupName) => {
    const rows = filtered.filter(r => r.groupHead === groupName);

    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += r.netOpeningBalance;
       closing += Number(r.netClsBalance) || 0;
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

  const responseData = {
    notePoint: "8",
    title: "OTHER NON-CURRENT ASSETS",
    dates: {
     closing: closingDate ? formatDate(closingDate) : null,
      opening: openingDate ? formatDate(openingDate) : null
    },
    sections: {
      relatedParties: {
        subsidiary,
        otherParties: otherParties1
      },
      others: {
        land,
        otherParties: otherParties2
      },
      government: {
        vat
      }
    },
    totalOpening: +totalOpening.toFixed(2),
    totalClosing: +totalClosing.toFixed(2)
  };

  return res.status(200).json({
    success: true,
    data: responseData
  });
}


if (notePoint === "10(a)") {

  const targetGroupHead = "Sundry Debtors";

  const filtered = finalMergedData.filter(row =>
    row.groupHead?.trim().toLowerCase() === targetGroupHead.toLowerCase()
  );

  let totalOpening = 0;
  let totalClosing = 0;

  filtered.forEach(row => {
    totalOpening += row.netOpeningBalance;
    totalClosing += Number(row.netClsBalance) || 0;
  });

  const responseData = {
    notePoint: "10(a)",
    title: "TRADE RECEIVABLES",
    dates: {
     closing: closingDate ? formatDate(closingDate) : null,
      opening: openingDate ? formatDate(openingDate) : null
    },
    particulars: [
      {
        name: "Unsecured, considered good *",
        opening: divideByTenLakh(totalOpening),
       closing: +totalClosing.toFixed(2)   
      }
    ],
    totalOpening: divideByTenLakh(totalOpening),
   totalClosing: +totalClosing.toFixed(2)    
  };

  return res.status(200).json({
    success: true,
    data: responseData
  });
}


if (notePoint === "10(b)") {

  const targetGroupHead = "- in current accounts";

  const filtered = finalMergedData.filter(row =>
    row.groupHead?.trim().toLowerCase() === targetGroupHead.toLowerCase()
  );

  let totalOpening = 0;
  let totalClosing = 0;

  const lineItems = filtered.map(row => {
    totalOpening += row.netOpeningBalance;
    totalClosing += Number(row.netClsBalance) || 0;

    return {
      name: row.accountHead, // show account head name
      opening: divideByTenLakh(row.netOpeningBalance),
       closing: +(Number(row.netClsBalance) || 0).toFixed(2) 
    };
  });

  const responseData = {
    notePoint: "10(b)",
    title: "CASH AND CASH EQUIVALENTS",
   dates: {
   closing: closingDate ? formatDate(closingDate) : null,
    opening: openingDate ? formatDate(openingDate) : null
  },
    sectionTitle: "Balances with banks",
    lineItems,
    totals: {
      opening: divideByTenLakh(totalOpening),
      closing: +totalClosing.toFixed(2) 
    }
  };

  return res.status(200).json({
    success: true,
    data: responseData
  });
}

if (notePoint === "10(c)") {

  const targetGroupHead = "Bank Deposit with maturity remaining less than 12 months";

  const filtered = finalMergedData.filter(row =>
    row.groupHead?.trim().toLowerCase() === targetGroupHead.toLowerCase()
  );

  let totalOpening = 0;
  let totalClosing = 0;

  const lineItems = filtered.map(row => {
    totalOpening += row.netOpeningBalance;
    totalClosing += Number(row.netClsBalance) || 0;

    return {
      name: row.accountHead,
      opening: divideByTenLakh(row.netOpeningBalance),
      closing: +(Number(row.netClsBalance) || 0).toFixed(2)  
    };
  });

  const responseData = {
    notePoint: "10(c)",
    title: "BANK BALANCES OTHER THAN (II) ABOVE",
    dates: {
     closing: closingDate ? formatDate(closingDate) : null,
      opening: openingDate ? formatDate(openingDate) : null
    },
    sectionTitle: "Fixed Deposits",
    lineItems,
    totals: {
      opening: divideByTenLakh(totalOpening),
      closing: +totalClosing.toFixed(2) 
    }
  };

  return res.status(200).json({
    success: true,
    data: responseData
  });
}

if (notePoint === "10(d)") {

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

  const lineItems = targetGroupHeads.map(groupName => {
    const rows = filtered.filter(r => r.groupHead === groupName);

    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += r.netOpeningBalance;
      closing += Number(r.netClsBalance) || 0;  
    });

    totalOpening += opening;
    totalClosing += closing;

    return {
      name: groupName,
      opening: divideByTenLakh(opening),
      closing: +closing.toFixed(2)    
    };
  });

  const responseData = {
    notePoint: "10(d)",
    title: "OTHER FINANCIAL ASSETS",
    dates: {
     closing: closingDate ? formatDate(closingDate) : null,
      opening: openingDate ? formatDate(openingDate) : null
    },
    lineItems,
    totals: {
      opening: divideByTenLakh(totalOpening),
     closing: +totalClosing.toFixed(2) 
    }
  };

  return res.status(200).json({
    success: true,
    data: responseData
  });
}

if (notePoint === "11") {

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

  const lineItems = targetGroupHeads.map(groupName => {
    const rows = filtered.filter(r => r.groupHead === groupName);

    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += r.netOpeningBalance;
      closing += Number(r.netClsBalance) || 0; 
    });

    totalOpening += opening;
    totalClosing += closing;

    return {
      name: groupName,
      opening: divideByTenLakh(opening),
       closing: +closing.toFixed(2)   
    };
  });

  const responseData = {
    notePoint: "11",
    title: "OTHER CURRENT ASSETS",
    dates: {
     closing: closingDate ? formatDate(closingDate) : null,
      opening: openingDate ? formatDate(openingDate) : null
    },
    sectionTitle: "Considered good – Unsecured",
    lineItems,
    totals: {
      opening: divideByTenLakh(totalOpening),
       closing: +totalClosing.toFixed(2) 
    }
  };

  return res.status(200).json({
    success: true,
    data: responseData
  });
}
// "13a"
if (notePoint === "13(a)") {

  const getRowsByKeyword = (keyword) =>
    finalMergedData.filter(r =>
      r.accountHead?.toLowerCase().includes(keyword.toLowerCase())
    );

  const sumRows = (rows) => {
    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += r.netOpeningBalance;
      closing += Number(r.netClsBalance) || 0;
    });

    return {
      opening: divideByTenLakh(opening),
      closing: +closing.toFixed(2)
    };
  };

  const debentures    = sumRows(getRowsByKeyword("debenture"));
  const ancillaryCost = sumRows(getRowsByKeyword("ancillary"));

  const bankRows = finalMergedData.filter(r =>
    r.accountHead?.toLowerCase().includes("bank")
  );

  const bankNonCurrent = sumRows(
    bankRows.filter(r =>
      r["Balance Sheet Head"]?.toLowerCase().includes("non")
    )
  );

  const bankCurrent = sumRows(
    bankRows.filter(r =>
      r["Balance Sheet Head"]?.toLowerCase().includes("current")
    )
  );

  const nbfcRows = finalMergedData.filter(r =>
    r.accountHead?.toLowerCase().includes("nbfc")
  );

  const nbfcNonCurrent = sumRows(
    nbfcRows.filter(r =>
      r["Balance Sheet Head"]?.toLowerCase().includes("non")
    )
  );

  const nbfcCurrent = sumRows(
    nbfcRows.filter(r =>
      r["Balance Sheet Head"]?.toLowerCase().includes("current")
    )
  );

  const shortTermAdj = sumRows(getRowsByKeyword("short term"));

  // ✅ NEW: Find the specific ICICI Non-current row
  const iciciNonCurrentRow = finalMergedData.find(r =>
    r.groupHead?.toLowerCase().endsWith("- non-current") &&
    r.accountHead?.toLowerCase() === "icici bank ltd-loan-panipat-phase-iii"
  );

  const iciciNonCurrentNetCls = iciciNonCurrentRow
    ? +(Number(iciciNonCurrentRow.netClsBalance) || 0).toFixed(2)
    : null;

  const totalClosing =
    debentures.closing -
    ancillaryCost.closing +
    bankNonCurrent.closing +
    bankCurrent.closing +
    nbfcNonCurrent.closing +
    nbfcCurrent.closing -
    shortTermAdj.closing;

  const totalOpening =
    debentures.opening -
    ancillaryCost.opening +
    bankNonCurrent.opening +
    bankCurrent.opening +
    nbfcNonCurrent.opening +
    nbfcCurrent.opening -
    shortTermAdj.opening;


    

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "13(a)",
      title: "BORROWINGS",
      dates: {
        closing: closingDate ? formatDate(closingDate) : null,
        opening: openingDate ? formatDate(openingDate) : null
      },
      sections: {
        debentures,
        ancillaryCost,
        banks: {
          nonCurrent: bankNonCurrent,
          current: bankCurrent
        },
        nbfc: {
          nonCurrent: nbfcNonCurrent,
          current: nbfcCurrent
        },
        shortTermAdj,
        iciciNonCurrent: {          // ✅ NEW field
          // converting into positive number
          netCls:   iciciNonCurrentNetCls !== null ? Math.abs(iciciNonCurrentNetCls) : 0
        }
      },
      totals: {
        closing: +totalClosing.toFixed(2),
        opening: +totalOpening.toFixed(2)
      }
    }
  });
}
//14
if (notePoint === "14") {

  const provisionRows = finalMergedData.filter(r =>
    r.groupHead?.toLowerCase().includes("provision for employee benefits.")
  );

  let totalOpening = 0;
  let totalClosing = 0;

  provisionRows.forEach(r => {
    totalOpening += Math.abs(r.netOpeningBalance);
    totalClosing += Math.abs(Number(r.netClsBalance) || 0); 
  });
console.log(totalOpening, totalClosing);
  return res.status(200).json({
    success: true,
    data: {
      notePoint: "14",
      title: "PROVISIONS",
      dates: {
       closing: closingDate ? formatDate(closingDate) : null,
        opening: openingDate ? formatDate(openingDate) : null
      },
      particulars: [
        {
          name: "Provision for employee benefits.",
          opening: divideByTenLakh(totalOpening),
          closing: +totalClosing.toFixed(2)  
        }
      ],
      totalOpening: divideByTenLakh(totalOpening),
      totalClosing: +totalClosing.toFixed(2) 
    }
  });
}
// 15 >>>>>>>>>>>>>>>>>>>>>>>>
if (notePoint === "15(a)") {

  const sumRows = (rows) => {
    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += r.netOpeningBalance;
        closing += Number(r.netClsBalance) || 0; 
    });

    return {
      opening: divideByTenLakh(Math.abs(opening)),
      closing: +Math.abs(closing).toFixed(2)
    };
  };

  const contains = (keyword) =>
    finalMergedData.filter(r =>
      normalizeString(r.groupHead).includes(normalizeString(keyword))
    );

  const overdraft = sumRows(contains("overdraft"));
  const relatedPartyLoans = sumRows(contains("related"));
  const directorLoans = sumRows(contains("director"));
  const bodyCorporateLoans = sumRows(contains("body"));
  const currentMaturityRows = contains("current matur");

  const currentDebentures = sumRows(
    currentMaturityRows.filter(r =>
      r.accountHead?.toLowerCase().includes("debenture")
    )
  );

  const currentBanks = sumRows(
    currentMaturityRows.filter(r =>
      r.accountHead?.toLowerCase().includes("bank")
    )
  );

  const currentNBFC = sumRows(
    currentMaturityRows.filter(r =>
      r.accountHead?.toLowerCase().includes("nbfc")
    )
  );

  const totalOpening =
    overdraft.opening +
    relatedPartyLoans.opening +
    directorLoans.opening +
    bodyCorporateLoans.opening +
    currentDebentures.opening +
    currentBanks.opening +
    currentNBFC.opening;

  const totalClosing =
    overdraft.closing +
    relatedPartyLoans.closing +
    directorLoans.closing +
    bodyCorporateLoans.closing +
    currentDebentures.closing +
    currentBanks.closing +
    currentNBFC.closing;

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "15(a)",
      title: "BORROWINGS",
      dates: {
       closing: closingDate ? formatDate(closingDate) : null,
        opening: openingDate ? formatDate(openingDate) : null
      },
      sections: {
        secured: { overdraft },
        unsecured: {
          relatedPartyLoans,
          directorLoans,
          bodyCorporateLoans
        },
        currentMaturities: {
          debentures: currentDebentures,
          banks: currentBanks,
          nbfc: currentNBFC
        }
      },
      totals: {
        opening: +totalOpening.toFixed(2),
        closing: +totalClosing.toFixed(2)
      }
    }
  });
}


// NOTE 15(b) >>>>>>>>>>>>>>>>>>>>>>>>

if (notePoint === "15(b)") {

  const sumRows = (rows) => {
    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += Number(r.netOpeningBalance) || 0;
      closing += Number(r.netClsBalance) || 0;
    });

    return {
      opening: divideByTenLakh(Math.abs(opening)),
      closing: +Math.abs(closing).toFixed(2)
    };
  };

  const msmeRows = finalMergedData.filter(r =>
    normalizeString(r.groupHead || "").includes("micro") ||
    normalizeString(r.groupHead || "").includes("msme")
  );

  const otherRows = finalMergedData.filter(r =>
    normalizeString(r.groupHead || "") ===
    normalizeString("Total outstanding dues of creditors other than micro enterprises and small enterprises")
  );

  const msme = sumRows(msmeRows);
  const others = sumRows(otherRows);

  const totalOpening = msme.opening + others.opening;
  const totalClosing = msme.closing + others.closing;

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "15(b)",
      title: "TRADE PAYABLES",
      dates: {
        closing: closingDate ? formatDate(closingDate) : null,
        opening: openingDate ? formatDate(openingDate) : null
      },
      particulars: [
        {
          name: "Total outstanding dues of micro enterprises and small enterprises",
          opening: msme.opening,
          closing: msme.closing
        },
        {
          name: "Total outstanding dues of creditors other than micro enterprises and small enterprises",
          opening: others.opening,
          closing: others.closing
        }
      ],
      totals: {
        opening: +totalOpening.toFixed(2),
        closing: +totalClosing.toFixed(2)
      }
    }
  });
}


// NOTE 15(c) >>>>>>>>>>>>>>>>>>>>>>>>

if (notePoint === "15(c)") {

  const sumRows = (rows) => {
    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += Number(r.netOpeningBalance) || 0;
      closing += Number(r.netClsBalance) || 0;  
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

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "15(c)",
      title: "OTHER FINANCIAL LIABILITIES",
      dates: {
       closing: closingDate ? formatDate(closingDate) : null,
        opening: openingDate ? formatDate(openingDate) : null
      },
      lineItems: [
        {
          name: "Security deposits",
          opening: security.opening,
          closing: security.closing
        },
        {
          name: "EDC / IDC payable",
          opening: edc.opening,
          closing: edc.closing
        },
        {
          name: "Interest accrued",
          opening: interest.opening,
          closing: interest.closing
        }
      ],
      totals: {
        opening: +totalOpening.toFixed(2),
        closing: +totalClosing.toFixed(2)
      }
    }
  });
}

// NOTE 16 >>>>>>>>>>>>>>>>>>>>>>>>


if (notePoint === "16") {

  const sumRows = (rows) => {
    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += Number(r.netOpeningBalance) || 0;
      closing += Number(r.netClsBalance) || 0;
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

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "16",
      title: "OTHER CURRENT LIABILITIES",
      dates: {
       closing: closingDate ? formatDate(closingDate) : null,
        opening: openingDate ? formatDate(openingDate) : null
      },
      lineItems: [
        { name: "Realisation under agreement to sell", ...realisation },
        { name: "Statutory dues", ...statutory },
        { name: "Employee payables", ...employee },
        { name: "Other liabilities", ...other }
      ],
      totals: {
        opening: +totalOpening.toFixed(2),
        closing: +totalClosing.toFixed(2)
      }
    }
  });
}

//  Note 17 >>>>>>>>>>>>>>>>>>>>>>>>

if (notePoint === "17") {

  const sumRows = (rows) => {
    let opening = 0;
    let closing = 0;

    rows.forEach(r => {
      opening += Number(r.netOpeningBalance) || 0;
      closing += Number(r.netClsBalance) || 0;  
    });

    return {
      opening: divideByTenLakh(Math.abs(opening)),
      closing: +Math.abs(closing).toFixed(2) 
    };
  };

  const employeeRows = finalMergedData.filter(r =>
    normalizeString(r.groupHead || "") === 
    normalizeString("Provision for employee benefits")
  );

  const currentTaxRows = finalMergedData.filter(r =>
    normalizeString(r.groupHead || "") === 
    normalizeString("Provision for current tax")
  );

  const bonusRows = finalMergedData.filter(r =>
    normalizeString(r.groupHead || "") === 
    normalizeString("Provision for Bonus")
  );

  const employee = sumRows(employeeRows);
  const currentTax = sumRows(currentTaxRows);
  const bonus = sumRows(bonusRows);

  const totalOpening =
    employee.opening +
    currentTax.opening +
    bonus.opening;

  const totalClosing =
    employee.closing +
    currentTax.closing +
    bonus.closing;

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "17",
      title: "PROVISIONS",
      dates: {
       closing: closingDate ? formatDate(closingDate) : null,
        opening: openingDate ? formatDate(openingDate) : null
      },
      lineItems: [
        { name: "Provision for employee benefits", ...employee },
        { name: "Provision for current tax", ...currentTax },
        { name: "Provision for Bonus", ...bonus }
      ],
      totals: {
        opening: +totalOpening.toFixed(2),
        closing: +totalClosing.toFixed(2)
      }
    }
  });
}


 if (notePoint === "18") {

  const sumIncome = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); // Make target lowercase
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += Number(row.netClsBalance) || 0;  
      }
    });
    return +(-total).toFixed(2); 
  };

  const revConstructed  = sumIncome("(a). Revenue from constructed properties");
  const rentalIncome    = sumIncome("Rental income");
  const camRecovery     = sumIncome("Recovery of CAM charges");
  const holdingCharges  = sumIncome("Holding and transfer charges from customer");

  const otherOpRevTotal = +(rentalIncome + camRecovery + holdingCharges).toFixed(2);
  const grandTotal      = +(revConstructed + otherOpRevTotal).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "18",
      title: "REVENUE FROM OPERATIONS",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        revenueFromProperties: {
          label: "(a). Revenue from constructed properties",
          value: revConstructed,
        },
        otherOperatingRevenues: {
          label: "(b). Other Operating Revenues",
          items: [
            { name: "Rental income",                              value: rentalIncome },
            { name: "Recovery of CAM charges",                   value: camRecovery },
            { name: "Holding and transfer charges from customer", value: holdingCharges },
          ],
          subtotal: otherOpRevTotal,
        },
      },
      total: grandTotal,
    },
  });
}


// ── NOTE 19 – OTHER INCOME ─────
if (notePoint === "19") {

  const sumIncome = (groupHead) => {
  let opening = 0;
  let closing = 0;

  finalMergedData.forEach((row) => {
    if (normalizeString(row.groupHead || "") === normalizeString(groupHead)) {
      opening += Number(row.netOpeningBalance) || 0;
      closing += Number(row.netClsBalance) || 0;
    }
  });

  return {
    opening: divideByTenLakh(Math.abs(opening)),
    closing: +Math.abs(closing).toFixed(2),  
  };
};

  const interestDebentures = sumIncome("Interest on debentures");
  const interestFD         = sumIncome("Interest on fixed deposits");
  const interestLoans      = sumIncome("Interest on loans");
  const interestDelayed    = sumIncome("Interest on delayed payments");
  const interestTaxRefund  = sumIncome("Interest on income tax refund");

  const dividendIncome     = sumIncome("b). Dividend Income");

  const profitFixedAssets  = sumIncome("Profit on sale of fixed assets");
  const projFacilitation   = sumIncome("Project facilitation charges");
  const scrapIncome        = sumIncome("Income from sale of scrap");
  const profitUnquotedInv  = sumIncome("Profit on sale of un-quoted investment");
  const miscIncome         = sumIncome("Miscellaneous income");

 const interestSubtotal = {
  opening: +(
    interestDebentures.opening +
    interestFD.opening +
    interestLoans.opening +
    interestDelayed.opening +
    interestTaxRefund.opening
  ).toFixed(2),

  closing: +(
    interestDebentures.closing +
    interestFD.closing +
    interestLoans.closing +
    interestDelayed.closing +
    interestTaxRefund.closing
  ).toFixed(2),
};
  const otherNonOpSubtotal = {
  opening: +(
    profitFixedAssets.opening +
    projFacilitation.opening +
    scrapIncome.opening +
    profitUnquotedInv.opening +
    miscIncome.opening
  ).toFixed(2),

  closing: +(
    profitFixedAssets.closing +
    projFacilitation.closing +
    scrapIncome.closing +
    profitUnquotedInv.closing +
    miscIncome.closing
  ).toFixed(2),
};
  const grandTotal = {
  opening: +(
    interestSubtotal.opening +
    dividendIncome.opening +
    otherNonOpSubtotal.opening
  ).toFixed(2),

  closing: +(
    interestSubtotal.closing +
    dividendIncome.closing +
    otherNonOpSubtotal.closing
  ).toFixed(2),
};
  console.log(interestDebentures, interestFD, interestLoans, interestDelayed, interestTaxRefund);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "19",
      title: "OTHER INCOME",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        interestIncome: {
          label: "a). Interest Income",
          items: [
            { name: "Interest on debentures",        ...interestDebentures },
            { name: "Interest on fixed deposits",    ...interestFD },
            { name: "Interest on loans",             ...interestLoans },
            { name: "Interest on delayed payments",  ...interestDelayed },
            { name: "Interest on income tax refund", ...interestTaxRefund },
          ],
          subtotal: interestSubtotal,
        },
        dividendIncome: {
          label: "b). Dividend Income",
          ...dividendIncome,
        },
        otherNonOperating: {
          label: "c). Other Non Operating Income",
          items: [
            { name: "Profit on sale of fixed assets",         ...profitFixedAssets },
            { name: "Project facilitation charges",           ...projFacilitation },
            { name: "Income from sale of scrap",              ...scrapIncome },
            { name: "Profit on sale of un-quoted investment", ...profitUnquotedInv },
            { name: "Miscellaneous income",                   ...miscIncome },
          ],
          subtotal: otherNonOpSubtotal,
        },
      },
      total: grandTotal,
    },
  });
}


// ── NOTE 22 – EMPLOYEE BENEFIT EXPENSE ───────────
if (notePoint === "22") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
      total += Number(row.netClsBalance) || 0; 
      }
    });
    return +total.toFixed(2);
  };

  const salary      = sumExpense("Salary, wages and bonus");
  const pf          = sumExpense("Contribution to provident fund");
  const staffWelf   = sumExpense("Staff welfare expenses");
  const esi         = sumExpense("Contribution to employees state insurance fund");
  const transferred = sumExpense("Less: Employee benefits expense transferred to project cost");

  const grossTotal  = +(salary + pf + esi + staffWelf).toFixed(2);
  const netTotal    = +(grossTotal - transferred).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "22",
      title: "EMPLOYEE BENEFIT EXPENSE",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      particulars: [
        { name: "Salary, wages and bonus",                             value: salary },
        { name: "Contribution to provident fund",                      value: pf },
        { name: "Staff welfare expenses",                              value: staffWelf },
         { name: "Less: Employee benefits expense transferred to project cost",     value: transferred },
      ],
      lessTransferredToProjectCost: transferred,
      total: netTotal,
    },
  });
}


// ── NOTE 23 – FINANCE COSTS ───────────

if (notePoint === "23") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += Number(row.netClsBalance) || 0; 
      }
    });
    return +total.toFixed(2); 
  };

  const interest           = sumExpense("Interest");
  const loanCharges        = sumExpense("Loan processing Charges");
  const bankCharges        = sumExpense("Bank charges");
  const finCostTransferred = sumExpense("Less: Finance cost\u00a0transferred to project cost");

  const grossTotal = +(interest + loanCharges + bankCharges).toFixed(2);
  const netTotal   = +(grossTotal - finCostTransferred).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "23",
      title: "FINANCE COSTS",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        interest: {
          name:  "Interest",
          value: interest,
        },
        otherBorrowingCost: {
          label: "Other Borrowing Cost",
          items: [
            { name: "Loan processing Charges", value: loanCharges },
            { name: "Bank charges",             value: bankCharges },
          ],
        },
      },
      lessFinanceCostTransferred: finCostTransferred,
      total: netTotal,
    },
  });
}


// ── NOTE 25 – OTHER EXPENSES ────────

if (notePoint === "25") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += Number(row.netClsBalance) || 0; 
      }
    });
     return +total.toFixed(2); 
  };

  const items = [
    { name: "Rent",                               value: sumExpense("Rent") },
    { name: "Business promotion",                 value: sumExpense("Business promotion") },
    { name: "Power, fuel and water",              value: sumExpense("Power, fuel and water") },
    { name: "Travelling and conveyance",          value: sumExpense("Travelling and conveyance") },
    { name: "Communication",                      value: sumExpense("Communication ") },
    { name: "Printing and stationery",            value: sumExpense("Printing and stationery") },
    { name: "Repair & maintenance",               value: sumExpense("Repair & maintenance") },
    { name: "Offer expenses",                     value: sumExpense("Offer expenses") },
    { name: "CAM charges",                        value: sumExpense("CAM charges") },
    { name: "Legal and professional",             value: sumExpense("Legal and professional") },
    { name: "Payment to auditor *",               value: sumExpense("Payment to auditor*") },
    { name: "Brokerage, discount and commission", value: sumExpense("Brokerage, discount and commission") },
    { name: "Rates and taxes",                    value: sumExpense("Rates and taxes") },
    { name: "Advertisement",                      value: sumExpense("Advertisement ") },
    { name: "Insurance charges",                  value: sumExpense("Insurance charges") },
    { name: "Social Welfare Expenses-CSR",        value: sumExpense("Social Welfare Expenses-CSR") },
    { name: "Miscellaneous expenses",             value: sumExpense("Miscellaneous expenses") },
  ];

  const total = +items.reduce((sum, i) => sum + i.value, 0).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "25",
      title: "OTHER EXPENSES",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      particulars: items,
      total,
    },
  });
}


// ── NOTE 27 – TAX EXPENSE ─────

if (notePoint === "26") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
       total += Number(row.netClsBalance) || 0; 
      }
    });
    return +total.toFixed(2); 
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "26",
      title: "TAX EXPENSE",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "a) Income Tax expense",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}


if (notePoint === "4") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += row.netClosingBalance; 
      }
    });
    return divideByTenLakh(total);
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "4",
      title: "PROPERTY, PLANT & EQUIPMENT AND OTHER INTANGIBLE ASSETS",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "PROPERTY, PLANT & EQUIPMENT AND OTHER INTANGIBLE ASSETS",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}


if (notePoint === "5") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += row.netClosingBalance; 
      }
    });
    return divideByTenLakh(total);
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "5",
      title: "CAPITAL WORK IN PROGRESS",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "CAPITAL WORK IN PROGRESS",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}

if (notePoint === "6(a)") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += row.netClosingBalance; 
      }
    });
    return divideByTenLakh(total);
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "6a",
      title: "Financial Assets",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "Financial Assets",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}

if (notePoint === "6(c)") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += row.netClosingBalance; 
      }
    });
    return divideByTenLakh(total);
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "6c",
      title: "Other Financial Assets",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "Other Financial Assets",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}


if (notePoint === "7") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += row.netClosingBalance; 
      }
    });
    return divideByTenLakh(total);
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "7",
      title: "DEFERRED TAX ASSETS (NET)",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "DEFERRED TAX ASSETS (NET)",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}


if (notePoint === "9") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += row.netClosingBalance; 
      }
    });
    return divideByTenLakh(total);
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "9",
      title: "Inventories",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "Inventories",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}


if (notePoint === "12(a)") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += row.netClosingBalance; 
      }
    });
    return divideByTenLakh(total);
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "12a",
      title: "Equity share capital",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "EQUITY SHARE CAPITAL",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}

if (notePoint === "12(a)") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += row.netClosingBalance; 
      }
    });
    return divideByTenLakh(total);
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "12a",
      title: "Equity share capital",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "EQUITY SHARE CAPITAL",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}


if (notePoint === "20") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += row.netClosingBalance; 
      }
    });
    return divideByTenLakh(total);
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "20",
      title: "COST OF MATERIAL CONSUMPTION",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "COST OF MATERIAL CONSUMPTION",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}

if (notePoint === "21") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += row.netClosingBalance; 
      }
    });
    return divideByTenLakh(total);
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "21",
      title: "CHANGE IN INVENTORIES OF RAW  MATERIAL, LAND STOCK, WORK IN PROGRESS AND FINISHED GOODS",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "CHANGE IN INVENTORIES OF RAW  MATERIAL, LAND STOCK, WORK IN PROGRESS AND FINISHED GOODS",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}
if (notePoint === "24") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += row.netClosingBalance; 
      }
    });
    return divideByTenLakh(total);
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "24",
      title: "DEPRECIATION AND AMORTIZATION",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "DEPRECIATION AND AMORTIZATION",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}

if (notePoint === "27") {

  const sumExpense = (targetGroupHead) => {
    let total = 0;
    const target = targetGroupHead.trim().toLowerCase(); 
    
    finalMergedData.forEach((row) => {
      
      if (row.groupHead?.trim().toLowerCase() === target) {
        total += row.netClosingBalance; 
      }
    });
    return divideByTenLakh(total);
  };

  const currentTax     = sumExpense("Current tax");
  const priorPeriodTax = sumExpense("Adjustment of tax relating to earlier periods");
  const deferredTax    = sumExpense("Deferred tax expenses");
  const total          = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

  return res.status(200).json({
    success: true,
    data: {
      notePoint: "27",
      title: "EARNING PER EQUITY SHARE",
      dates: {closing: closingDate ? formatDate(closingDate) : null, opening: openingDate ? formatDate(openingDate) : null },
      sections: {
        incomeTaxExpense: {
          label: "EARNING PER EQUITY SHARE",
          items: [
            { name: "Current tax",                                   value: currentTax },
            { name: "Adjustment of tax relating to earlier periods", value: priorPeriodTax },
            { name: "Deferred tax expenses",                         value: deferredTax },
          ],
        },
      },
      total,
    },
  });
}

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