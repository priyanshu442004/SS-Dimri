import { infraBSRows, infraPLRows, INFRA_PL_COLS } from "../../src/formats/infraData.js";
import XLSX from "xlsx-js-style";
import { generateBSData, generatePLData, generateTBsummary } from "../services/financialServiceDownload.js";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { classifyAccounts } from "../services/classifierService.js";


const safe = (val) => (val !== undefined && val !== null ? val : "-");

let openingDate = null;
let closingDate = null;

const mergeDuplicateAccounts = (rows) => {
  const grouped = {};

  rows.forEach((row) => {
    const normalizedAccount = normalizeString(row.accountHead);

    if (!normalizedAccount) return;

    // 🔥 SAFER ACCOUNTING KEY (recommended)
   const key = [
  normalizedAccount,
  normalizeString(row.NATURE),
  normalizeString(row.balanceSheetHead || row["Balance Sheet Head"]),
  normalizeString(row.groupHead || row["Group heads"]),
].join("|");

    if (!grouped[key]) {
      grouped[key] = {
        ...row,
        netOpeningBalance: Number(row.netOpeningBalance) || 0,
        netFY: Number(row.netFY) || 0,
        netClosingBalance: Number(row.netClosingBalance) || 0,
      };
    } else {
      grouped[key].netOpeningBalance += Number(row.netOpeningBalance) || 0;
      grouped[key].netFY += Number(row.netFY) || 0;
      grouped[key].netClosingBalance += Number(row.netClosingBalance) || 0;
    }
  });

  return Object.values(grouped);
};

const normalizeString = (value) => {
  return value
    ?.toString()
    .normalize("NFKC") // normalize unicode
    .replace(/\s+/g, " ") // collapse multiple spaces
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

const generateNoteData = async (notePoint, rows) => {
  try {
    // let filePath;

    //     // ✅ CASE 1: Uploaded file
    //     if (req.file) {
    //       filePath = req.file.path;
    //     }
    //     else {
    //       const uploadPath = path.join(process.cwd(), "uploads");

    //       if (!fs.existsSync(uploadPath)) {
    //         return res.status(400).json({ message: "Uploads folder not found" });
    //       }

    //       const files = fs.readdirSync(uploadPath);

    //       if (!files.length) {
    //         return res.status(400).json({ message: "No file available in uploads folder" });
    //       }

    //       const latestFile = files
    //         .map(file => ({
    //           name: file,
    //           time: fs.statSync(path.join(uploadPath, file)).mtime.getTime()
    //         }))
    //         .sort((a, b) => b.time - a.time)[0].name;

    //       filePath = path.join(uploadPath, latestFile);
    //     }

    //     const ext = filePath.split(".").pop().toLowerCase();
    //    let rows = [];
    //     // ===== CSV =====
    //       if (ext === "csv") {
    //       rows = await new Promise((resolve, reject) => {
    //         const results = [];

    //         fs.createReadStream(filePath)
    //           .pipe(csv())
    //           .on("data", (data) => results.push(data))
    //           .on("end", () => resolve(results))
    //           .on("error", reject);
    //       });
    //     }

    //     // ===== EXCEL =====
    //      else if (ext === "xlsx" || ext === "xls") {

    //       const workbook = XLSX.readFile(filePath);
    //       const sheet = workbook.Sheets[workbook.SheetNames[0]];

    //       const sheetData = XLSX.utils.sheet_to_json(sheet, {
    //         header: 1,
    //         range: 0,
    //         blankrows: false
    //       });

    //       const headerText = sheetData.flat().join(" ");

    //       // Extract full opening and closing dates
    // const dateMatch = headerText.match(
    //     /From\s+\w+\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+To\s+\w+\s+(\d{1,2}\/\d{1,2}\/\d{2})/i
    //   );

    //  if (dateMatch) {
    //     console.log("Date match found:", dateMatch);

    //     const parseDate = (dateStr) => {
    //       const [day, month, year2] = dateStr.split("/");
    //       const fullYear = 2000 + parseInt(year2); // 25 → 2025
    //       return new Date(fullYear, month - 1, day);
    //     };

    //     openingDate = parseDate(dateMatch[1]); // "1/4/25"
    //     closingDate = parseDate(dateMatch[2]); // "30/9/25"

    //     console.log("Parsed dates:", openingDate, closingDate);
    //   } else {
    //     console.log("No date match");
    //   }

    //       rows = XLSX.utils.sheet_to_json(sheet, {
    //         range: 4,
    //         defval: "",
    //         raw: false
    //       });
    //     }

    //     else {
    //       return res.status(400).json({ message: "Unsupported file type" });
    //     }

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
  NATURE: row["NATURE"] || row["Nature"] || "",
  "Balance Sheet Head": row["Balance Sheet Head"] || "",
  groupHead: row["Group heads"],
  balanceSheetHead: row["Balance Sheet Head"],
  netOpeningBalance: debitOpening - creditOpening,
  netClosingBalance: debitClosing - creditClosing,
      };
    });

    const mergedData = mergeDuplicateAccounts(processed);

    const formatDate = (date) => {
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    // ===== HANDLE NOTE 6(b) =====
    if (notePoint === "6b") {
      const targetGroupHeads = ["Security deposits (assets)"];

      const filtered = mergedData.filter((row) =>
        targetGroupHeads.includes(row.groupHead),
      );

      let totalOpening = 0;
      let totalClosing = 0;

      filtered.forEach((row) => {
        totalOpening += row.netOpeningBalance;
        totalClosing += row.netClosingBalance;
      });

      return {
        notePoint: "6(b)",
        title: "LOANS",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        particulars: [
          {
            name: "Security deposits (assets)",
            opening: divideByTenLakh(totalOpening),
            closing: divideByTenLakh(totalClosing),
          },
        ],
        totalOpening: divideByTenLakh(totalOpening),
        totalClosing: divideByTenLakh(totalClosing),
      };

      return res.status(200).json({
        success: true,
        data: responseData,
      });
    }

    if (notePoint === "8") {
      const targetGroupHeads = [
        "Advance to subsidiary companies",
        "Advance to Other Parties",
        "Advances for Land",
        "Advance to Other Parties.",
        "Value Added Tax",
      ];

      const filtered = mergedData.filter((row) =>
        targetGroupHeads.includes(row.groupHead),
      );

      // Helper to sum by group head
      const sumByGroup = (groupName) => {
        const rows = filtered.filter((r) => r.groupHead === groupName);

        let opening = 0;
        let closing = 0;

        rows.forEach((r) => {
          opening += r.netOpeningBalance;
          closing += r.netClosingBalance;
        });

        return {
          opening: divideByTenLakh(opening),
          closing: divideByTenLakh(closing),
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
        notePoint: "8",
        title: "OTHER NON-CURRENT ASSETS",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        sections: {
          relatedParties: {
            subsidiary,
            otherParties: otherParties1,
          },
          others: {
            land,
            otherParties: otherParties2,
          },
          government: {
            vat,
          },
        },
        totalOpening: +totalOpening.toFixed(2),
        totalClosing: +totalClosing.toFixed(2),
      };

      return res.status(200).json({
        success: true,
        data: responseData,
      });
    }

    if (notePoint === "10a") {
      const targetGroupHead = "Sundry Debtors";

      const filtered = mergedData.filter(
        (row) =>
          row.groupHead?.trim().toLowerCase() === targetGroupHead.toLowerCase(),
      );

      let totalOpening = 0;
      let totalClosing = 0;

      filtered.forEach((row) => {
        totalOpening += row.netOpeningBalance;
        totalClosing += row.netClosingBalance;
      });

      return {
        notePoint: "10(a)",
        title: "TRADE RECEIVABLES",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        particulars: [
          {
            name: "Unsecured, considered good *",
            opening: divideByTenLakh(totalOpening),
            closing: divideByTenLakh(totalClosing),
          },
        ],
        totalOpening: divideByTenLakh(totalOpening),
        totalClosing: divideByTenLakh(totalClosing),
      };

      return res.status(200).json({
        success: true,
        data: responseData,
      });
    }

    if (notePoint === "10b") {
      const targetGroupHead = "- in current accounts";

      const filtered = mergedData.filter(
        (row) =>
          row.groupHead?.trim().toLowerCase() === targetGroupHead.toLowerCase(),
      );

      let totalOpening = 0;
      let totalClosing = 0;

      const lineItems = filtered.map((row) => {
        totalOpening += row.netOpeningBalance;
        totalClosing += row.netClosingBalance;

        return {
          name: row.accountHead, // show account head name
          opening: divideByTenLakh(row.netOpeningBalance),
          closing: divideByTenLakh(row.netClosingBalance),
        };
      });

      return {
        notePoint: "10(b)",
        title: "CASH AND CASH EQUIVALENTS",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        sectionTitle: "Balances with banks",
        lineItems,
        totals: {
          opening: divideByTenLakh(totalOpening),
          closing: divideByTenLakh(totalClosing),
        },
      };

      return res.status(200).json({
        success: true,
        data: responseData,
      });
    }

    if (notePoint === "10c") {
      const targetGroupHead =
        "Bank Deposit with maturity remaining less than 12 months";

      const filtered = mergedData.filter(
        (row) =>
          row.groupHead?.trim().toLowerCase() === targetGroupHead.toLowerCase(),
      );

      let totalOpening = 0;
      let totalClosing = 0;

      const lineItems = filtered.map((row) => {
        totalOpening += row.netOpeningBalance;
        totalClosing += row.netClosingBalance;

        return {
          name: row.accountHead,
          opening: divideByTenLakh(row.netOpeningBalance),
          closing: divideByTenLakh(row.netClosingBalance),
        };
      });

      return {
        notePoint: "10(c)",
        title: "BANK BALANCES OTHER THAN (II) ABOVE",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        sectionTitle: "Fixed Deposits",
        lineItems,
        totals: {
          opening: divideByTenLakh(totalOpening),
          closing: divideByTenLakh(totalClosing),
        },
      };

      return res.status(200).json({
        success: true,
        data: responseData,
      });
    }

    if (notePoint === "10d") {
      const targetGroupHeads = [
        "Interest accrued on bank deposits",
        "Advances recoverable in cash or in kind or for value to be received",
        "Earnest money deposits",
        "Retention money",
        "Interest accrued on debentures",
      ];

      const filtered = mergedData.filter((row) =>
        targetGroupHeads.includes(row.groupHead),
      );

      let totalOpening = 0;
      let totalClosing = 0;

      const lineItems = targetGroupHeads.map((groupName) => {
        const rows = filtered.filter((r) => r.groupHead === groupName);

        let opening = 0;
        let closing = 0;

        rows.forEach((r) => {
          opening += r.netOpeningBalance;
          closing += r.netClosingBalance;
        });

        totalOpening += opening;
        totalClosing += closing;

        return {
          name: groupName,
          opening: divideByTenLakh(opening),
          closing: divideByTenLakh(closing),
        };
      });

      return {
        notePoint: "10(d)",
        title: "OTHER FINANCIAL ASSETS",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        lineItems,
        totals: {
          opening: divideByTenLakh(totalOpening),
          closing: divideByTenLakh(totalClosing),
        },
      };

      return res.status(200).json({
        success: true,
        data: responseData,
      });
    }

    if (notePoint === "11") {
      const targetGroupHeads = [
        "Prepaid expenses",
        "-- GST Input Credit",
        "-- Advance tax (net of provision)",
      ];

      const filtered = mergedData.filter((row) =>
        targetGroupHeads.includes(row.groupHead),
      );

      let totalOpening = 0;
      let totalClosing = 0;

      const lineItems = targetGroupHeads.map((groupName) => {
        const rows = filtered.filter((r) => r.groupHead === groupName);

        let opening = 0;
        let closing = 0;

        rows.forEach((r) => {
          opening += r.netOpeningBalance;
          closing += r.netClosingBalance;
        });

        totalOpening += opening;
        totalClosing += closing;

        return {
          name: groupName,
          opening: divideByTenLakh(opening),
          closing: divideByTenLakh(closing),
        };
      });

      return {
        notePoint: "11",
        title: "OTHER CURRENT ASSETS",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        sectionTitle: "Considered good – Unsecured",
        lineItems,
        totals: {
          opening: divideByTenLakh(totalOpening),
          closing: divideByTenLakh(totalClosing),
        },
      };

      return res.status(200).json({
        success: true,
        data: responseData,
      });
    }
    // "13a"
    if (notePoint === "13a") {
      const getRowsByKeyword = (keyword) =>
        mergedData.filter((r) =>
          r.accountHead?.toLowerCase().includes(keyword.toLowerCase()),
        );

      const sumRows = (rows) => {
        let opening = 0;
        let closing = 0;

        rows.forEach((r) => {
          opening += r.netOpeningBalance;
          closing += r.netClosingBalance;
        });

        return {
          opening: divideByTenLakh(opening),
          closing: divideByTenLakh(closing),
        };
      };

      const debentures = sumRows(getRowsByKeyword("debenture"));

      const ancillaryCost = sumRows(getRowsByKeyword("ancillary"));

      const bankRows = mergedData.filter((r) =>
        r.accountHead?.toLowerCase().includes("bank"),
      );

      const bankNonCurrent = sumRows(
        bankRows.filter((r) =>
          r["Balance Sheet Head"]?.toLowerCase().includes("non"),
        ),
      );

      const bankCurrent = sumRows(
        bankRows.filter((r) =>
          r["Balance Sheet Head"]?.toLowerCase().includes("current"),
        ),
      );

      const nbfcRows = mergedData.filter((r) =>
        r.accountHead?.toLowerCase().includes("nbfc"),
      );

      const nbfcNonCurrent = sumRows(
        nbfcRows.filter((r) =>
          r["Balance Sheet Head"]?.toLowerCase().includes("non"),
        ),
      );

      const nbfcCurrent = sumRows(
        nbfcRows.filter((r) =>
          r["Balance Sheet Head"]?.toLowerCase().includes("current"),
        ),
      );

      const shortTermAdj = sumRows(getRowsByKeyword("short term"));

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

      return {
        notePoint: "13(a)",
        title: "BORROWINGS",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        sections: {
          debentures,
          ancillaryCost,
          banks: {
            nonCurrent: bankNonCurrent,
            current: bankCurrent,
          },
          nbfc: {
            nonCurrent: nbfcNonCurrent,
            current: nbfcCurrent,
          },
          shortTermAdj,
        },
        totals: {
          closing: +totalClosing.toFixed(2),
          opening: +totalOpening.toFixed(2),
        },
      };

      // return res.status(200).json({
      //   success: true,
      //   data: {
      //     notePoint: "13(a)",
      //     title: "BORROWINGS",
      //     dates: {
      //      closing: closingDate ? formatDate(closingDate) : null,
      //       opening: openingDate ? formatDate(openingDate) : null
      //     },
      //     sections: {
      //       debentures,
      //       ancillaryCost,
      //       banks: {
      //         nonCurrent: bankNonCurrent,
      //         current: bankCurrent
      //       },
      //       nbfc: {
      //         nonCurrent: nbfcNonCurrent,
      //         current: nbfcCurrent
      //       },
      //       shortTermAdj
      //     },
      //     totals: {
      //       closing: +totalClosing.toFixed(2),
      //       opening: +totalOpening.toFixed(2)
      //     }
      //   }
      // });
    }
    //14
    if (notePoint === "14") {
      const provisionRows = mergedData.filter((r) =>
        r.groupHead?.toLowerCase().includes("provision for employee benefits."),
      );

      let totalOpening = 0;
      let totalClosing = 0;

      provisionRows.forEach((r) => {
        totalOpening += Math.abs(r.netOpeningBalance);
        totalClosing += Math.abs(r.netClosingBalance);
      });
      console.log(totalOpening, totalClosing);
      return {
        notePoint: "14",
        title: "PROVISIONS",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        particulars: [
          {
            name: "Provision for employee benefits.",
            opening: divideByTenLakh(totalOpening),
            closing: divideByTenLakh(totalClosing),
          },
        ],
        totalOpening: divideByTenLakh(totalOpening),
        totalClosing: divideByTenLakh(totalClosing),
      };
    }
    // 15 >>>>>>>>>>>>>>>>>>>>>>>>
    if (notePoint === "15a") {
      const sumRows = (rows) => {
        let opening = 0;
        let closing = 0;

        rows.forEach((r) => {
          opening += r.netOpeningBalance;
          closing += r.netClosingBalance;
        });

        return {
          opening: divideByTenLakh(Math.abs(opening)),
          closing: divideByTenLakh(Math.abs(closing)),
        };
      };

      const contains = (keyword) =>
        mergedData.filter((r) =>
          normalizeString(r.groupHead).includes(normalizeString(keyword)),
        );

      const overdraft = sumRows(contains("overdraft"));
      const relatedPartyLoans = sumRows(contains("related"));
      const directorLoans = sumRows(contains("director"));
      const bodyCorporateLoans = sumRows(contains("body"));
      const currentMaturityRows = contains("current matur");

      const currentDebentures = sumRows(
        currentMaturityRows.filter((r) =>
          r.accountHead?.toLowerCase().includes("debenture"),
        ),
      );

      const currentBanks = sumRows(
        currentMaturityRows.filter((r) =>
          r.accountHead?.toLowerCase().includes("bank"),
        ),
      );

      const currentNBFC = sumRows(
        currentMaturityRows.filter((r) =>
          r.accountHead?.toLowerCase().includes("nbfc"),
        ),
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

      return {
        notePoint: "15(a)",
        title: "BORROWINGS",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        sections: {
          secured: { overdraft },
          unsecured: {
            relatedPartyLoans,
            directorLoans,
            bodyCorporateLoans,
          },
          currentMaturities: {
            debentures: currentDebentures,
            banks: currentBanks,
            nbfc: currentNBFC,
          },
        },
        totals: {
          opening: +totalOpening.toFixed(2),
          closing: +totalClosing.toFixed(2),
        },
      };
    }

    // NOTE 15(b) >>>>>>>>>>>>>>>>>>>>>>>>

    if (notePoint === "15b") {
      const sumRows = (rows) => {
        let opening = 0;
        let closing = 0;

        rows.forEach((r) => {
          opening += Number(r.netOpeningBalance) || 0;
          closing += Number(r.netClosingBalance) || 0;
        });

        return {
          opening: divideByTenLakh(Math.abs(opening)),
          closing: divideByTenLakh(Math.abs(closing)),
        };
      };

      const tradePayablesRows = mergedData.filter((r) => {
        const group = normalizeString(r.groupHead || "");
        const bsHead = normalizeString(r.balanceSheetHead || "");

        return group.includes("trade") || bsHead.includes("trade");
      });

      const msmeRows = tradePayablesRows.filter((r) => {
        const group = normalizeString(r.groupHead || "");
        return group.includes("micro") || group.includes("msme");
      });

      const otherRows = tradePayablesRows.filter((r) => {
        const group = normalizeString(r.groupHead || "");
        return !(group.includes("micro") || group.includes("msme"));
      });

      const msme = sumRows(msmeRows);
      const others = sumRows(otherRows);

      const totalOpening = msme.opening + others.opening;
      const totalClosing = msme.closing + others.closing;

      return {
        notePoint: "15(b)",
        title: "TRADE PAYABLES",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        particulars: [
          {
            name: "Total outstanding dues of micro enterprises and small enterprises",
            opening: msme.opening,
            closing: msme.closing,
          },
          {
            name: "Total outstanding dues of creditors other than micro enterprises and small enterprises",
            opening: others.opening,
            closing: others.closing,
          },
        ],
        totals: {
          opening: +totalOpening.toFixed(2),
          closing: +totalClosing.toFixed(2),
        },
      };
    }

    // NOTE 15(c) >>>>>>>>>>>>>>>>>>>>>>>>

    if (notePoint === "15c") {
      const sumRows = (rows) => {
        let opening = 0;
        let closing = 0;

        rows.forEach((r) => {
          opening += Number(r.netOpeningBalance) || 0;
          closing += Number(r.netClosingBalance) || 0;
        });

        return {
          opening: divideByTenLakh(Math.abs(opening)),
          closing: divideByTenLakh(Math.abs(closing)),
        };
      };

      const financialRows = mergedData.filter((r) =>
        normalizeString(r.balanceSheetHead || "").includes("financial"),
      );

      const securityRows = financialRows.filter((r) =>
        normalizeString(r.groupHead || "").includes("security"),
      );

      const edcRows = financialRows.filter(
        (r) =>
          normalizeString(r.groupHead || "") ===
          normalizeString("EDC/ IDC payable"),
      );

      const interestRows = financialRows.filter(
        (r) =>
          normalizeString(r.groupHead || "") ===
          normalizeString("Interest accrued"),
      );

      const security = sumRows(securityRows);
      const edc = sumRows(edcRows);
      const interest = sumRows(interestRows);

      const totalOpening = security.opening + edc.opening + interest.opening;

      const totalClosing = security.closing + edc.closing + interest.closing;

      return {
        notePoint: "15(c)",
        title: "OTHER FINANCIAL LIABILITIES",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        lineItems: [
          {
            name: "Security deposits",
            opening: security.opening,
            closing: security.closing,
          },
          {
            name: "EDC / IDC payable",
            opening: edc.opening,
            closing: edc.closing,
          },
          {
            name: "Interest accrued",
            opening: interest.opening,
            closing: interest.closing,
          },
        ],
        totals: {
          opening: +totalOpening.toFixed(2),
          closing: +totalClosing.toFixed(2),
        },
      };
    }

    // NOTE 16 >>>>>>>>>>>>>>>>>>>>>>>>

    if (notePoint === "16") {
      const sumRows = (rows) => {
        let opening = 0;
        let closing = 0;

        rows.forEach((r) => {
          opening += Number(r.netOpeningBalance) || 0;
          closing += Number(r.netClosingBalance) || 0;
        });

        return {
          opening: divideByTenLakh(Math.abs(opening)),
          closing: divideByTenLakh(Math.abs(closing)),
        };
      };

      const currentLiabilityRows = mergedData.filter(
        (r) =>
          normalizeString(r.balanceSheetHead || "") ===
          normalizeString("Other Current Liabilities"),
      );

      const realisation = sumRows(
        currentLiabilityRows.filter(
          (r) =>
            normalizeString(r.groupHead || "") ===
            normalizeString("Realisation under agreement to sell"),
        ),
      );

      const statutory = sumRows(
        currentLiabilityRows.filter((r) =>
          normalizeString(r.groupHead || "").includes("statutory"),
        ),
      );

      const employee = sumRows(
        currentLiabilityRows.filter((r) =>
          normalizeString(r.groupHead || "").includes("employee"),
        ),
      );

      const other = sumRows(
        currentLiabilityRows.filter((r) =>
          normalizeString(r.groupHead || "").includes("other"),
        ),
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
        notePoint: "16",
        title: "OTHER CURRENT LIABILITIES",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        lineItems: [
          { name: "Realisation under agreement to sell", ...realisation },
          { name: "Statutory dues", ...statutory },
          { name: "Employee payables", ...employee },
          { name: "Other liabilities", ...other },
        ],
        totals: {
          opening: +totalOpening.toFixed(2),
          closing: +totalClosing.toFixed(2),
        },
      };
    }

    //  Note 17 >>>>>>>>>>>>>>>>>>>>>>>>

    if (notePoint === "17") {
      const sumRows = (rows) => {
        let opening = 0;
        let closing = 0;

        rows.forEach((r) => {
          opening += Number(r.netOpeningBalance) || 0;
          closing += Number(r.netClosingBalance) || 0;
        });

        return {
          opening: divideByTenLakh(Math.abs(opening)),
          closing: divideByTenLakh(Math.abs(closing)),
        };
      };

      const employeeRows = mergedData.filter(
        (r) =>
          normalizeString(r.groupHead || "") ===
          normalizeString("Provision for employee benefits"),
      );

      const currentTaxRows = mergedData.filter(
        (r) =>
          normalizeString(r.groupHead || "") ===
          normalizeString("Provision for current tax"),
      );

      const bonusRows = mergedData.filter(
        (r) =>
          normalizeString(r.groupHead || "") ===
          normalizeString("Provision for Bonus"),
      );

      const employee = sumRows(employeeRows);
      const currentTax = sumRows(currentTaxRows);
      const bonus = sumRows(bonusRows);

      const totalOpening =
        employee.opening + currentTax.opening + bonus.opening;

      const totalClosing =
        employee.closing + currentTax.closing + bonus.closing;

      return {
        notePoint: "17",
        title: "PROVISIONS",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        lineItems: [
          { name: "Provision for employee benefits", ...employee },
          { name: "Provision for current tax", ...currentTax },
          { name: "Provision for Bonus", ...bonus },
        ],
        totals: {
          opening: +totalOpening.toFixed(2),
          closing: +totalClosing.toFixed(2),
        },
      };
    }

    if (notePoint === "18") {
      const sumIncome = (targetGroupHead) => {
        let total = 0;
        const target = targetGroupHead.trim().toLowerCase(); // Make target lowercase

        mergedData.forEach((row) => {
          if (row.groupHead?.trim().toLowerCase() === target) {
            total += row.netClosingBalance;
          }
        });
        return divideByTenLakh(-total);
      };

      const revConstructed = sumIncome(
        "(a). Revenue from constructed properties",
      );
      const rentalIncome = sumIncome("Rental income");
      const camRecovery = sumIncome("Recovery of CAM charges");
      const holdingCharges = sumIncome(
        "Holding and transfer charges from customer",
      );

      const otherOpRevTotal = +(
        rentalIncome +
        camRecovery +
        holdingCharges
      ).toFixed(2);
      const grandTotal = +(revConstructed + otherOpRevTotal).toFixed(2);

      return {
        notePoint: "18",
        title: "REVENUE FROM OPERATIONS",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        sections: {
          revenueFromProperties: {
            label: "(a). Revenue from constructed properties",
            value: revConstructed,
          },
          otherOperatingRevenues: {
            label: "(b). Other Operating Revenues",
            items: [
              { name: "Rental income", value: rentalIncome },
              { name: "Recovery of CAM charges", value: camRecovery },
              {
                name: "Holding and transfer charges from customer",
                value: holdingCharges,
              },
            ],
            subtotal: otherOpRevTotal,
          },
        },
        total: grandTotal,
      };
    }

    // ── NOTE 19 – OTHER INCOME ─────
    if (notePoint === "19") {
      const sumIncome = (groupHead) => {
        let opening = 0;
        let closing = 0;

        mergedData.forEach((row) => {
          if (
            normalizeString(row.groupHead || "") === normalizeString(groupHead)
          ) {
            opening += Number(row.netOpeningBalance) || 0;
            closing += Number(row.netClosingBalance) || 0;
          }
        });

        return {
          opening: divideByTenLakh(Math.abs(opening)),
          closing: divideByTenLakh(Math.abs(closing)),
        };
      };

      const interestDebentures = sumIncome("Interest on debentures");
      const interestFD = sumIncome("Interest on fixed deposits");
      const interestLoans = sumIncome("Interest on loans");
      const interestDelayed = sumIncome("Interest on delayed payments");
      const interestTaxRefund = sumIncome("Interest on income tax refund");

      const dividendIncome = sumIncome("b). Dividend Income");

      const profitFixedAssets = sumIncome("Profit on sale of fixed assets");
      const projFacilitation = sumIncome("Project facilitation charges");
      const scrapIncome = sumIncome("Income from sale of scrap");
      const profitUnquotedInv = sumIncome(
        "Profit on sale of un-quoted investment",
      );
      const miscIncome = sumIncome("Miscellaneous income");

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
      console.log(
        interestDebentures,
        interestFD,
        interestLoans,
        interestDelayed,
        interestTaxRefund,
      );

      return {
        notePoint: "19",
        title: "OTHER INCOME",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        sections: {
          interestIncome: {
            label: "a). Interest Income",
            items: [
              { name: "Interest on debentures", ...interestDebentures },
              { name: "Interest on fixed deposits", ...interestFD },
              { name: "Interest on loans", ...interestLoans },
              { name: "Interest on delayed payments", ...interestDelayed },
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
              { name: "Profit on sale of fixed assets", ...profitFixedAssets },
              { name: "Project facilitation charges", ...projFacilitation },
              { name: "Income from sale of scrap", ...scrapIncome },
              {
                name: "Profit on sale of un-quoted investment",
                ...profitUnquotedInv,
              },
              { name: "Miscellaneous income", ...miscIncome },
            ],
            subtotal: otherNonOpSubtotal,
          },
        },
        total: grandTotal,
      };
    }

    // ── NOTE 22 – EMPLOYEE BENEFIT EXPENSE ───────────
    if (notePoint === "22") {
      const sumExpense = (targetGroupHead) => {
        let total = 0;
        const target = targetGroupHead.trim().toLowerCase();

        mergedData.forEach((row) => {
          if (row.groupHead?.trim().toLowerCase() === target) {
            total += row.netClosingBalance;
          }
        });
        return divideByTenLakh(total);
      };

      const salary = sumExpense("Salary, wages and bonus");
      const pf = sumExpense("Contribution to provident fund");
      const staffWelf = sumExpense("Staff welfare expenses");
      const esi = sumExpense("Contribution to employees state insurance fund");
      const transferred = sumExpense(
        "Less: Employee benefits expense transferred to project cost",
      );

      const grossTotal = +(salary + pf + esi + staffWelf).toFixed(2);
      const netTotal = +(grossTotal - transferred).toFixed(2);

      return {
        notePoint: "22",
        title: "EMPLOYEE BENEFIT EXPENSE",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        particulars: [
          { name: "Salary, wages and bonus", value: salary },
          { name: "Contribution to provident fund", value: pf },
          { name: "Staff welfare expenses", value: staffWelf },
          {
            name: "Less: Employee benefits expense transferred to project cost",
            value: transferred,
          },
        ],
        lessTransferredToProjectCost: transferred,
        total: netTotal,
      };
    }

    // ── NOTE 23 – FINANCE COSTS ───────────

    if (notePoint === "23") {
      const sumExpense = (targetGroupHead) => {
        let total = 0;
        const target = targetGroupHead.trim().toLowerCase();

        mergedData.forEach((row) => {
          if (row.groupHead?.trim().toLowerCase() === target) {
            total += row.netClosingBalance;
          }
        });
        return divideByTenLakh(total);
      };

      const interest = sumExpense("Interest");
      const loanCharges = sumExpense("Loan processing Charges");
      const bankCharges = sumExpense("Bank charges");
      const finCostTransferred = sumExpense(
        "Less: Finance cost\u00a0transferred to project cost",
      );

      const grossTotal = +(interest + loanCharges + bankCharges).toFixed(2);
      const netTotal = +(grossTotal - finCostTransferred).toFixed(2);

      return {
        notePoint: "23",
        title: "FINANCE COSTS",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        sections: {
          interest: {
            name: "Interest",
            value: interest,
          },
          otherBorrowingCost: {
            label: "Other Borrowing Cost",
            items: [
              { name: "Loan processing Charges", value: loanCharges },
              { name: "Bank charges", value: bankCharges },
            ],
          },
        },
        lessFinanceCostTransferred: finCostTransferred,
        total: netTotal,
      };
    }

    // ── NOTE 25 – OTHER EXPENSES ────────

    if (notePoint === "25") {
      const sumExpense = (targetGroupHead) => {
        let total = 0;
        const target = targetGroupHead.trim().toLowerCase();

        mergedData.forEach((row) => {
          if (row.groupHead?.trim().toLowerCase() === target) {
            total += row.netClosingBalance;
          }
        });
        return divideByTenLakh(total);
      };

      const items = [
        { name: "Rent", value: sumExpense("Rent") },
        { name: "Business promotion", value: sumExpense("Business promotion") },
        {
          name: "Power, fuel and water",
          value: sumExpense("Power, fuel and water"),
        },
        {
          name: "Travelling and conveyance",
          value: sumExpense("Travelling and conveyance"),
        },
        { name: "Communication", value: sumExpense("Communication ") },
        {
          name: "Printing and stationery",
          value: sumExpense("Printing and stationery"),
        },
        {
          name: "Repair & maintenance",
          value: sumExpense("Repair & maintenance"),
        },
        { name: "Offer expenses", value: sumExpense("Offer expenses") },
        { name: "CAM charges", value: sumExpense("CAM charges") },
        {
          name: "Legal and professional",
          value: sumExpense("Legal and professional"),
        },
        {
          name: "Payment to auditor *",
          value: sumExpense("Payment to auditor*"),
        },
        {
          name: "Brokerage, discount and commission",
          value: sumExpense("Brokerage, discount and commission"),
        },
        { name: "Rates and taxes", value: sumExpense("Rates and taxes") },
        { name: "Advertisement", value: sumExpense("Advertisement ") },
        { name: "Insurance charges", value: sumExpense("Insurance charges") },
        {
          name: "Social Welfare Expenses-CSR",
          value: sumExpense("Social Welfare Expenses-CSR"),
        },
        {
          name: "Miscellaneous expenses",
          value: sumExpense("Miscellaneous expenses"),
        },
      ];

      const total = +items.reduce((sum, i) => sum + i.value, 0).toFixed(2);

      return {
        notePoint: "25",
        title: "OTHER EXPENSES",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        particulars: items,
        total,
      };
    }

    // ── NOTE 27 – TAX EXPENSE ─────

    if (notePoint === "26") {
      const sumExpense = (targetGroupHead) => {
        let total = 0;
        const target = targetGroupHead.trim().toLowerCase();

        mergedData.forEach((row) => {
          if (row.groupHead?.trim().toLowerCase() === target) {
            total += row.netClosingBalance;
          }
        });
        return divideByTenLakh(total);
      };

      const currentTax = sumExpense("Current tax");
      const priorPeriodTax = sumExpense(
        "Adjustment of tax relating to earlier periods",
      );
      const deferredTax = sumExpense("Deferred tax expenses");
      const total = +(currentTax + priorPeriodTax + deferredTax).toFixed(2);

      return {
        notePoint: "26",
        title: "TAX EXPENSE",
        dates: {
          closing: closingDate ? formatDate(closingDate) : null,
          opening: openingDate ? formatDate(openingDate) : null,
        },
        sections: {
          incomeTaxExpense: {
            label: "a) Income Tax expense",
            items: [
              { name: "Current tax", value: currentTax },
              {
                name: "Adjustment of tax relating to earlier periods",
                value: priorPeriodTax,
              },
              { name: "Deferred tax expenses", value: deferredTax },
            ],
          },
        },
        total,
      };
    }

    return res.status(400).json({ message: "Note not implemented yet" });
  } catch (err) {
    console.error("Notes Processing Error:", err);
    return res.status(500).json({
      success: false,
      message: "Processing failed",
      error: err.message,
    });
  }
};

export const downloadFinancialStatements = async (req, res) => {
  try {
 let filePath;
 const D = "-"

    if (req.file) {
      filePath = req.file.path;
    } else {
      const uploadPath = path.join(process.cwd(), "uploads");
      const files = fs.readdirSync(uploadPath);

      if (!files.length) {
        return res.status(400).json({ message: "No file found" });
      }

      filePath = path.join(uploadPath, files[0]);
    }

    const plData = await generatePLData(filePath);
    const bsData = await generateBSData(filePath);
    const tbData = await generateTBsummary(filePath);

    const workbook = XLSX.utils.book_new();

    // ======================
    // SHEET 1 - BALANCE SHEET
    // ======================


    const bs = bsData.notes;

const totalNonCurrentAssetsClosing =
  (bs["6b"]?.closing || 0) +
  (bs["8"]?.closing || 0);

const totalNonCurrentAssetsOpening =
  (bs["6b"]?.opening || 0) +
  (bs["8"]?.opening || 0);

const totalCurrentAssetsClosing =
  (bs["10a"]?.closing || 0) +
  (bs["10b"]?.closing || 0) +
  (bs["10c"]?.closing || 0) +
  (bs["10d"]?.closing || 0) +
  (bs["11"]?.closing || 0);

const totalCurrentAssetsOpening =
  (bs["10a"]?.opening || 0) +
  (bs["10b"]?.opening || 0) +
  (bs["10c"]?.opening || 0) +
  (bs["10d"]?.opening || 0) +
  (bs["11"]?.opening || 0);

const totalAssetsClosing =
  totalNonCurrentAssetsClosing + totalCurrentAssetsClosing;

const totalAssetsOpening =
  totalNonCurrentAssetsOpening + totalCurrentAssetsOpening;

const totalCurrentLiabilitiesClosing =
  (bs["15c"]?.closing || 0) +
  (bs["16"]?.closing || 0) +
  (bs["17"]?.closing || 0);

const totalCurrentLiabilitiesOpening =
  (bs["15c"]?.opening || 0) +
  (bs["16"]?.opening || 0) +
  (bs["17"]?.opening || 0);

const totalEquityLiabilitiesClosing =
  (bs["14"]?.closing || 0) +
  totalCurrentLiabilitiesClosing;

const totalEquityLiabilitiesOpening =
  (bs["14"]?.opening || 0) +
  totalCurrentLiabilitiesOpening;


const bsSheetData = [

  // HEADER
  ["XYZ INFRASTRUCTURE & PROPERTIES LIMITED"],
  ["STANDALONE BALANCE SHEET"],
  [`AS AT ${bsData.dates?.closing ?? "September 30, 2025"}`],
  ["(All amounts in INR millions)"],
  ["Particulars", "Notes", bsData.dates?.closing ?? "September 30, 2025", "March 31, 2025"],

  // Same audited figures as the on-screen Balance Sheet and the emailed Excel (src/formats/infraData.js)
  ...infraBSRows(),

  // FOOTER
  [],
  [],
  ["Summary of material accounting policies 1-3"],
  ["The accompanying notes (4 to 48) referred above form an integral part of the standalone financial statements."],
  [],
  ["As per our report of even date"],
  [],
  ["For Agarwal & Saxena"],
  ["Chartered Accountants"],
  ["Firm Registration No.: 002405C"],
  [],
  ["Akshay Sethi", "Partner", "Membership No.: 539439"],
  [],
  ["For and on behalf of the Board of Directors"],
  ["XYZ Infrastructure & Properties Limited"],
  ["CIN: U74899HR2000PLC043893"],
  [],
  ["Pankaj Bajaj", "Managing Director", "DIN: 00024735"],
  ["Ranjit Khattar", "Director", "DIN: 00726997"],
  ["Rajiv Khurana", "Chief Financial Officer", "ACA M.No.: 093132"],
  ["Swati Gupta", "Company Secretary", "ACS M.No.: A35294"],
  [],
  ["Place: New Delhi"],
  [`Date: ${new Date().toLocaleDateString("en-GB").replaceAll("/", "-")}`]
];

console.log("BS notes:", JSON.stringify(bsData.notes, null, 2));
console.log("BS dates:", bsData.dates);
console.log("Sample row:", bsSheetData[12]);

    const bsSheet = XLSX.utils.aoa_to_sheet(bsSheetData);

    // ================== BS STYLING START ==================

// Hide gridlines
bsSheet["!sheetView"] = [{
  showGridLines: false
}];

// Column Widths
bsSheet["!cols"] = [
  { wch: 40 },  // Particulars
  { wch: 15 },  // Notes
  { wch: 22 },  // Closing
  { wch: 22 },  // Opening
];

// Merge header rows
bsSheet["!merges"] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
  { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
  { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
];

// Header styling
["A1"].forEach(cell => {
  if (bsSheet[cell]) {
    bsSheet[cell].s = {
      font: { bold: true, sz: 16, color: { rgb: "008000" } },
      alignment: { horizontal: "left" }
    };
  }
});

["A2"].forEach(cell => {
  if (bsSheet[cell]) {
    bsSheet[cell].s = {
      font: { bold: true, sz: 14 }
    };
  }
});

["A3"].forEach(cell => {
  if (bsSheet[cell]) {
    bsSheet[cell].s = {
      font: { sz: 12 }
    };
  }
});

// Bold major section headings
["A6", "A7", "A20", "A27", "A33"].forEach(cell => {
  if (bsSheet[cell]) {
    if (!bsSheet[cell].s) bsSheet[cell].s = {};
    bsSheet[cell].s.font = { bold: true };
  }
});

// Right-align numeric columns (above footer)
Object.keys(bsSheet).forEach(cell => {
  const row = parseInt(cell.replace(/[A-Z]/g, ""), 10);

  if ((cell.startsWith("C") || cell.startsWith("D")) && row < 45) {
    if (!bsSheet[cell].s) bsSheet[cell].s = {};
    bsSheet[cell].s.alignment = { horizontal: "right" };
  }
});

// Double underline for TOTAL rows
const bsDoubleUnderlineRow = (rowNumber) => {
  for (let col = 2; col <= 3; col++) {
    const ref = XLSX.utils.encode_cell({ r: rowNumber, c: col });
    if (!bsSheet[ref]) continue;

    if (!bsSheet[ref].s) bsSheet[ref].s = {};

    bsSheet[ref].s.font = { bold: true };
    bsSheet[ref].s.border = {
      top: { style: "medium" },
      bottom: { style: "double" }
    };
    bsSheet[ref].s.alignment = { horizontal: "right" };
  }
};

// Adjust row numbers if slightly off
bsDoubleUnderlineRow(17);  // Total Non-Current Assets
bsDoubleUnderlineRow(29);  // Total Current Assets
bsDoubleUnderlineRow(31);  // TOTAL ASSETS
bsDoubleUnderlineRow(44);  // TOTAL EQUITY AND LIABILITIES

// Footer left alignment
const bsFooterStartRow = 48; // adjust if needed

for (let r = bsFooterStartRow; r < bsFooterStartRow + 20; r++) {
  for (let c = 0; c <= 3; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!bsSheet[ref]) continue;

    if (!bsSheet[ref].s) bsSheet[ref].s = {};
    bsSheet[ref].s.alignment = { horizontal: "left" };
  }
}

// ================== BS STYLING END ==================

    XLSX.utils.book_append_sheet(workbook, bsSheet, "Balance Sheet");


    // ======================
    // SHEET 2 - PROFIT & LOSS
    // ======================

   

const totalIncomeClosing =
  Number(plData.notes["18"]?.closing || 0) +
  Number(plData.notes["19"]?.closing || 0);

const totalIncomeOpening =
  Number(plData.notes["18"]?.opening || 0) +
  Number(plData.notes["19"]?.opening || 0);

const totalExpensesClosing =
  Number(plData.notes["22"]?.closing || 0) +
  Number(plData.notes["23"]?.closing || 0) +
  Number(plData.notes["25"]?.closing || 0);

const totalExpensesOpening =
  Number(plData.notes["22"]?.opening || 0) +
  Number(plData.notes["23"]?.opening || 0) +
  Number(plData.notes["25"]?.opening || 0);

const plSheetData = [

  // HEADER
  ["XYZ INFRASTRUCTURE & PROPERTIES LIMITED"],
  ["STANDALONE STATEMENT OF PROFIT & LOSS"],
  [`FOR THE PERIOD ENDED ${plData.dates?.closing ?? "September 30, 2025"}`],
  ["(All amounts in INR millions)"],
  INFRA_PL_COLS,

  // Same audited figures as the on-screen P&L and the emailed Excel (src/formats/infraData.js)
  ...infraPLRows(),

  // FOOTER
  [],
  [],
  ["Summary of material accounting policies 1-3"],
  ["The accompanying notes (4 to 48) referred above form an integral part of the standalone financial statement"],
  [],
  ["As per our report of even date."],
  [],
  ["For Agarwal & Saxena"],
  ["Chartered Accountants"],
  ["Firm Registration No.: 002405C"],
  [],
  ["For and on behalf of Board of Directors"],
  ["XYZ Infrastructure & Properties Limited"],
  ["CIN: U74899HR2000PLC043893"],
  [],
  ["Akshay Sethi", "Partner", "Membership No.: 539439"],
  ["Pankaj Bajaj", "Managing Director", "DIN: 00024735"],
  ["Ranjit Khattar", "Director", "DIN: 00726997"],
  [],
  ["Rajiv Khurana", "Chief Financial Officer", "ACA M.No.: 093132"],
  ["Swati Gupta", "Company Secretary", "ACS M.No.: A35294"],
  [],
  ["Place: New Delhi"],
  [`Date: ${new Date().toLocaleDateString("en-GB").replaceAll("/", "-")}`]
];

    const plSheet = XLSX.utils.aoa_to_sheet(plSheetData);
  plSheet["!sheetView"] = [{
  showGridLines: false
}];
// ================== STYLING START ==================

// Column Width
plSheet["!cols"] = [
  { wch: 40 },  // Particulars
  { wch: 15 },  // Notes
  { wch: 22 },  // Closing date column
  { wch: 22 },  // Opening date column
];

// Merge header rows
plSheet["!merges"] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
  { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
  { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
];

// Bold + Center company name
["A1"].forEach(cell => {
  if (plSheet[cell]) {
    plSheet[cell].s = {
      font: { bold: true, sz: 16, color: { rgb: "008000" } },
      alignment: { horizontal: "left" }
    };
  }
});

["A2"].forEach(cell => {
  if (plSheet[cell]) {
    plSheet[cell].s = {
      font: { bold: true, sz: 14 },
      alignment: { horizontal: "left" }
    };
  }
});

["A3"].forEach(cell => {
  if (plSheet[cell]) {
    plSheet[cell].s = {
      font: { sz: 12 },
      alignment: { horizontal: "left" }
    };
  }
});





["A6","A7","A11","A20","A28"].forEach(cell => {
  if (plSheet[cell]) {
    plSheet[cell].s = { font: { bold: true } };
  }
});

// Right align amount columns
Object.keys(plSheet).forEach(cell => {
  const row = parseInt(cell.replace(/[A-Z]/g, ""), 10);

  // Only align amount rows (above footer)
  if ((cell.startsWith("C") || cell.startsWith("D")) && row < 35) {
    if (!plSheet[cell].s) plSheet[cell].s = {};
    plSheet[cell].s.alignment = { horizontal: "right" };
  }
});


plSheet["!merges"].push(
  { s: { r: 42, c: 0 }, e: { r: 42, c: 3 } }
);


const doubleUnderlineRow = (rowNumber) => {
  for (let col = 2; col <= 3; col++) {
    const ref = XLSX.utils.encode_cell({ r: rowNumber, c: col });
    if (!plSheet[ref]) continue;

    if (!plSheet[ref].s) plSheet[ref].s = {};

    plSheet[ref].s.font = { bold: true };
    plSheet[ref].s.border = {
      top: { style: "medium" },
      bottom: { style: "double" }
    };
    plSheet[ref].s.alignment = { horizontal: "right" };
  }
};

doubleUnderlineRow(9);   // TOTAL INCOME
doubleUnderlineRow(18);  // TOTAL EXPENSES
doubleUnderlineRow(26);  // PROFIT FOR YEAR
doubleUnderlineRow(34);  // TOTAL COMPREHENSIVE INCOME

// Add bold + border to TOTAL rows


// ================== STYLING END ==================

const footerStartRow = 45; // adjust to your footer start row

for (let r = footerStartRow; r < footerStartRow + 20; r++) {
  for (let c = 0; c <= 3; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!plSheet[ref]) continue;

    if (!plSheet[ref].s) plSheet[ref].s = {};
    plSheet[ref].s.alignment = { horizontal: "left" };
  }
}

    XLSX.utils.book_append_sheet(workbook, plSheet, "Profit & Loss");



    // ======================
// SHEET 3 - TRIAL BALANCE SUMMARY
// ======================

const tbRows = tbData.tb || [];

const tbSheetData = [

  ["XYZ INFRASTRUCTURE & PROPERTIES LIMITED"],
  [`TRIAL BALANCE SUMMARY AS ON ${tbData.dates?.closing ?? "-"}`],
  [],

  [
    "Account Heads",
    "Nature",
    "Balance Sheet Head",
    "Group Heads",
    "Net Opening Balance",
    "Net Closing Balance"
  ],

  ...tbRows.map(r => [
    r.accountHead,
    r.nature,
    r.balanceSheetHead,
    r.groupHead,
    r.netOpeningBalance,
    r.netClosingBalance
  ])
];

const tbSheet = XLSX.utils.aoa_to_sheet(tbSheetData);


tbSheet["!sheetView"] = [{
  showGridLines: false
}];

tbSheet["!cols"] = [
  { wch: 40 },
  { wch: 10 },
  { wch: 25 },
  { wch: 35 },
  { wch: 18 },
  { wch: 18 }
];

// Merge headers
tbSheet["!merges"] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
  { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } }
];

// Bold headers
["A1","A2"].forEach(cell=>{
  if(tbSheet[cell]){
    tbSheet[cell].s = {
      font:{bold:true, sz:14},
      alignment:{horizontal:"left"}
    }
  }
})

// Column header bold
for(let c=0;c<=5;c++){
  const ref = XLSX.utils.encode_cell({r:3,c});
  if(tbSheet[ref]){
    tbSheet[ref].s = { font:{bold:true} };
  }
}

// Right align numbers
Object.keys(tbSheet).forEach(cell=>{
  const row = parseInt(cell.replace(/[A-Z]/g,''),10);

  if((cell.startsWith("E") || cell.startsWith("F")) && row>3){
    if(!tbSheet[cell].s) tbSheet[cell].s={};
    tbSheet[cell].s.alignment={horizontal:"right"};
  }
});

XLSX.utils.book_append_sheet(workbook, tbSheet, "TB Summary");

    let filePathtwo;

    // ✅ CASE 1: Uploaded file
    if (req.file) {
      filePathtwo = req.file.path;
    } else {
      const uploadPath = path.join(process.cwd(), "uploads");

      if (!fs.existsSync(uploadPath)) {
        return res.status(400).json({ message: "Uploads folder not found" });
      }

      const files = fs.readdirSync(uploadPath);

      if (!files.length) {
        return res
          .status(400)
          .json({ message: "No file available in uploads folder" });
      }

      const latestFile = files
        .map((file) => ({
          name: file,
          time: fs.statSync(path.join(uploadPath, file)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time)[0].name;

      filePathtwo = path.join(uploadPath, latestFile);
    }

    const ext = filePathtwo.split(".").pop().toLowerCase();
    let rowstwo = [];
    // ===== CSV =====
    if (ext === "csv") {
      rowstwo = await new Promise((resolve, reject) => {
        const results = [];

        fs.createReadStream(filePathtwo)
          .pipe(csv())
          .on("data", (data) => results.push(data))
          .on("end", () => resolve(results))
          .on("error", reject);
      });
    }

    // ===== EXCEL =====
    else if (ext === "xlsx" || ext === "xls") {
   const sourceWorkbook = XLSX.readFile(filePathtwo);
const sheet = sourceWorkbook.Sheets[sourceWorkbook.SheetNames[0]];

      const sheetData = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        range: 0,
        blankrows: false,
      });

      const headerText = sheetData.flat().join(" ");

      // Extract full opening and closing dates
      const dateMatch = headerText.match(
        /From\s+\w+\s+(\d{1,2}\/\d{1,2}\/\d{2})\s+To\s+\w+\s+(\d{1,2}\/\d{1,2}\/\d{2})/i,
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

      rowstwo = XLSX.utils.sheet_to_json(sheet, {
        range: 4,
        defval: "",
        raw: false,
      });
    } else {
      return res.status(400).json({ message: "Unsupported file type" });
    }

    const rowgan = rowstwo;
    const note6b = await generateNoteData("6b", rowgan);
    const note8 = await generateNoteData("8", rowgan);
    const note10a = await generateNoteData("10a", rowgan);
    const note10b = await generateNoteData("10b", rowgan);
    const note10c = await generateNoteData("10c", rowgan);
    const note10d = await generateNoteData("10d", rowgan);
    const note11 = await generateNoteData("11", rowgan);
    const note13a = await generateNoteData("13a", rowgan);
    const note14 = await generateNoteData("14", rowgan);
    const note15a = await generateNoteData("15a", rowgan);
    const note15b = await generateNoteData("15b", rowgan);
    const note15c = await generateNoteData("15c", rowgan);
    const note16 = await generateNoteData("16", rowgan);
    const note17 = await generateNoteData("17", rowgan);
    const note18 = await generateNoteData("18", rowgan);

    const note19 = await generateNoteData("19", rowgan);
    const note22 = await generateNoteData("22", rowgan);
    const note23 = await generateNoteData("23", rowgan);
    const note25 = await generateNoteData("25", rowgan);
    const note26 = await generateNoteData("26", rowgan);
    console.log("Adding Note4 sheet...");

    const notesSheet1 = [
      ["NOTES TO FINANCIAL STATEMENTS"],
      [],
      ["NOTE", "PARTICULARS", "OPENING", "CLOSING"],

      ["6(b)", "Loans", note6b.totalOpening, note6b.totalClosing],
      ["8", "Other Non Current Assets", note8.totalOpening, note8.totalClosing],
      [
        "10(a)",
        "Trade Receivables",
        note10a.totalOpening,
        note10a.totalClosing,
      ],
      [
        "10(b)",
        "Cash and Cash Equivalents",
        note10b.totals.opening,
        note10b.totals.closing,
      ],
      [
        "10(c)",
        "Bank balances",
        note10c.totals.opening,
        note10c.totals.closing,
      ],
      [
        "10(d)",
        "Other Financial Assets",
        note10d.totals.opening,
        note10d.totals.closing,
      ],
      [
        "11",
        "Other Current Assets",
        note11.totals.opening,
        note11.totals.closing,
      ],
      ["13(a)", "Borrowings", note13a.totals.opening, note13a.totals.closing],
      ["14", "Provisions", note14.totalOpening, note14.totalClosing],
      [
        "15(a)",
        "Borrowings Current",
        note15a.totals.opening,
        note15a.totals.closing,
      ],
      [
        "15(b)",
        "Trade Payables",
        note15b.totals.opening,
        note15b.totals.closing,
      ],
      [
        "15(c)",
        "Other Financial Liabilities",
        note15c.totals.opening,
        note15c.totals.closing,
      ],
      [
        "16",
        "Other Current Liabilities",
        note16.totals.opening,
        note16.totals.closing,
      ],
      ["17", "Provisions", note17.totals.opening, note17.totals.closing],
      ["18", "Revenue From Operations", "-", note18.total],
    ];

    const notesSheet2 = [
      ["NOTES TO FINANCIAL STATEMENTS"],
      [],
      ["NOTE", "PARTICULARS", "OPENING", "CLOSING"],

      ["19", "Other Income", note19.total.opening, note19.total.closing],
      ["22", "Employee Benefit Expense", "-", note22.total],
      ["23", "Finance Cost", "-", note23.total],
      ["25", "Other Expenses", "-", note25.total],
      ["26", "Tax Expense", "-", note26.total],
    ];

    const notesSheetA = XLSX.utils.aoa_to_sheet(notesSheet1);


    // Hide gridlines
notesSheetA["!sheetView"] = [{ showGridLines: false }];

// Column widths
notesSheetA["!cols"] = [
  { wch: 10 }, // Note
  { wch: 40 }, // Particulars
  { wch: 18 }, // Opening
  { wch: 18 }, // Closing
];

// Merge title
notesSheetA["!merges"] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }
];

// Title styling
if (notesSheetA["A1"]) {
  notesSheetA["A1"].s = {
    font: { bold: true, sz: 16 },
    alignment: { horizontal: "left" }
  };
}

// Header row styling
["A3","B3","C3","D3"].forEach(cell=>{
  if(notesSheetA[cell]){
    notesSheetA[cell].s = {
      font:{bold:true},
      alignment:{horizontal:"center"}
    }
  }
})

// Right align numbers
Object.keys(notesSheetA).forEach(cell=>{
  const row = parseInt(cell.replace(/[A-Z]/g,''),10)

  if((cell.startsWith("C") || cell.startsWith("D")) && row > 3){
    if(!notesSheetA[cell].s) notesSheetA[cell].s={}
    notesSheetA[cell].s.alignment = { horizontal:"right" }
  }
})

    XLSX.utils.book_append_sheet(workbook, notesSheetA, "Notes 4-18");

    const notesSheetB = XLSX.utils.aoa_to_sheet(notesSheet2);


notesSheetB["!sheetView"] = [{ showGridLines: false }];

notesSheetB["!cols"] = [
  { wch: 10 },
  { wch: 40 },
  { wch: 18 },
  { wch: 18 }
];

notesSheetB["!merges"] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }
];

if (notesSheetB["A1"]) {
  notesSheetB["A1"].s = {
    font: { bold: true, sz: 16 },
    alignment: { horizontal: "left" }
  };
}

["A3","B3","C3","D3"].forEach(cell=>{
  if(notesSheetB[cell]){
    notesSheetB[cell].s = {
      font:{bold:true},
      alignment:{horizontal:"center"}
    }
  }
})

Object.keys(notesSheetB).forEach(cell=>{
  const row = parseInt(cell.replace(/[A-Z]/g,''),10)

  if((cell.startsWith("C") || cell.startsWith("D")) && row > 3){
    if(!notesSheetB[cell].s) notesSheetB[cell].s={}
    notesSheetB[cell].s.alignment = { horizontal:"right" }
  }
})

    XLSX.utils.book_append_sheet(workbook, notesSheetB, "Notes 19-27");


    // ======================
    // Note 4
    // ======================


    console.log("Adding Note4 sheet..sada.");
      const YELLOW_FILL = { patternType: "solid", fgColor: { rgb: "FFFF00" } };

    const note4SheetData = [
      ["XYZ INFRASTRUCTURE & PROPERTIES LIMITED"],
      ["NOTES TO THE STANDALONE FINANCIAL STATEMENTS"],
      ["FOR THE PERIOD ENDED SEPTEMBER 30, 2025"],
      ["(All amounts are in ₹ millions, unless stated otherwise)"],
      [],
      ["4. PROPERTY, PLANT & EQUIPMENT AND OTHER INTANGIBLE ASSETS"],
      [],
      ["", "Property, plant & equipments", "", "", "", "", "", "", "", "", "", "", "Other Intangible Assets", "", ""],
      ["Particulars", "Office\nbuildings", "Temporary\nStructure", "Freehold\nland", "Leasehold\nimprovement", "Furniture\n& Fixtures", "Office\nequipments", "Computers", "Electrical\ninstallations", "Vehicles", "Total", "", "Trademark", "Software\nlicenses", "Total"],
      ["Gross Block"],
      ["As on April 01, 2023",     316.04, D,    0.20, 1.42, 15.54, 9.14, 29.99, 2.21, 15.14, 389.68, "", 91.80, 19.50, 111.30],
      ["Additions",                D,      D,    D,    D,    1.05,  0.28, 1.20,  D,    D,      2.53,   "", D,     0.14,  0.14],
      ["Disposals",                D,      D,    D,    D,    D,     D,    D,     "(8.54)", D,   "(8.54)","", D,   D,     D],
      ["As at March 31, 2024",     316.04, D,    0.20, 1.42, 16.59, 9.42, 31.19, 2.21, 6.61,  383.67, "", 91.80, 19.65, 111.45],
      ["Additions",                D,      1.06, D,    D,    1.08,  0.25, 2.39,  D,    D,      4.79,   "", D,     D,     D],
      ["Disposals",                D,      D,    D,    D,    D,     D,    D,     D,    D,      D,      "", D,     D,     D],
      ["As at March 31, 2025",     316.04, 1.06, 0.20, 1.42, 17.67, 9.67, 33.59, 2.21, 6.61,  388.46, "", 91.80, 19.65, 111.45],
      ["Additions",                D,      D,    D,    D,    D,     D,    1.36,  D,    D,      1.36,   "", D,     0.05,  0.05],
      ["Disposals",                D,      D,    D,    D,    D,     D,    D,     D,    D,      D,      "", D,     D,     D],
      ["As at September 30, 2025", 316.04, 1.06, 0.20, 1.42, 17.67, 9.67, 34.94, 2.21, 6.61,  389.82, "", 91.80, 19.70, 111.50],
      [],
      ["Accumulated Depreciation"],
      ["As on April 01, 2023",     73.35, D,    D,    1.42, 14.71, 8.08, 24.75, 2.10, 13.52, 137.91, "", 91.80, 16.95, 108.75],
      ["Charge for the period",    5.00,  D,    D,    D,    0.09,  0.24, 2.49,  0.00, 0.36,   8.19,  "", D,     0.68,  0.68],
      ["Disposals",                D,     D,    D,    D,    D,     D,    D,     "(8.11)", D,   "(8.11)","", D,   D,     D],
      ["As at March 31, 2024",     78.35, D,    D,    1.42, 14.79, 8.32, 27.24, 2.10, 5.77,  138.00, "", 91.80, 17.63, 109.43],
      ["Charge for the period",    5.00,  0.10, D,    D,    0.14,  0.28, 1.92,  0.00, 0.23,   7.68,  "", D,     0.69,  0.69],
      ["Disposals",                D,     D,    D,    D,    D,     D,    D,     D,    D,      D,      "", D,     D,     D],
      ["As at March 31, 2025",     83.35, 0.10, D,    1.42, 14.93, 8.60, 29.16, 2.11, 6.01,  145.67, "", 91.80, 18.32, 110.12],
      ["Charge for the period",    2.51,  0.17, D,    D,    0.10,  0.14, 0.93,  0.00, 0.10,   3.95,  "", D,     0.35,  0.35],
      ["Disposals",                D,     D,    D,    D,    D,     D,    D,     0.00, D,      0.00,   "", D,     D,     D],
      ["As at September 30, 2025", 85.86, 0.27, D,    1.42, 15.03, 8.73, 30.09, 2.11, 6.11,  149.62, "", 91.80, 18.67, 110.47],
      ["",                         D,     D,    D,    D,    D,     D,    D,     D,    D,      2.64,   "", D,     D,     D],
      [],
      ["Net book value"],
      ["As on April 01, 2023",     242.69, D,    0.20, D, 0.84, 1.06, 5.25, 0.11, 1.62, 251.77, "", D, 2.55, 2.55],
      ["As at March 31, 2024",     237.69, D,    0.20, D, 1.80, 1.10, 3.95, 0.11, 0.84, 245.68, "", D, 2.02, 2.02],
      ["As at March 31, 2025",     232.69, 0.96, 0.20, D, 2.74, 1.07, 4.42, 0.11, 0.60, 242.79, "", D, 1.33, 1.33],
      ["As at September 30, 2025", 230.18, 0.79, 0.20, D, 2.64, 0.94, 4.85, 0.10, 0.50, 240.20, "", D, 1.03, 1.03],
    ];

    const note4Sheet = XLSX.utils.aoa_to_sheet(note4SheetData);
    note4Sheet["!sheetView"] = [{ showGridLines: false }];
    note4Sheet["!cols"] = [
      { wch: 30 }, { wch: 8 },  { wch: 9 },  { wch: 8 },
      { wch: 9 },  { wch: 9 },  { wch: 9 },  { wch: 9 },
      { wch: 10 }, { wch: 8 },  { wch: 9 },  { wch: 2 },
      { wch: 9 },  { wch: 9 },  { wch: 9 },  { wch: 30 },
    ];
    note4Sheet["!merges"] = [
      { s: { r: 0,  c: 0 }, e: { r: 0,  c: 14 } },
      { s: { r: 1,  c: 0 }, e: { r: 1,  c: 14 } },
      { s: { r: 2,  c: 0 }, e: { r: 2,  c: 14 } },
      { s: { r: 3,  c: 0 }, e: { r: 3,  c: 14 } },
      { s: { r: 5,  c: 0 }, e: { r: 5,  c: 14 } },
      { s: { r: 7,  c: 1 }, e: { r: 7,  c: 10 } },
      { s: { r: 7,  c: 12 }, e: { r: 7, c: 14 } },
    ];

    // Apply yellow fill to all cells
    for (let r = 0; r < note4SheetData.length; r++) {
      for (let c = 0; c < 16; c++) {
        const ref = XLSX.utils.encode_cell({ r, c });
        if (!note4Sheet[ref]) note4Sheet[ref] = { t: "z", v: "" };
        if (!note4Sheet[ref].s) note4Sheet[ref].s = {};
        note4Sheet[ref].s.fill = YELLOW_FILL;
      }
    }

    // Header styles
    if (note4Sheet["A1"]) note4Sheet["A1"].s = { fill: YELLOW_FILL, font: { bold: true, sz: 13, color: { rgb: "008000" } }, alignment: { horizontal: "left" } };
    if (note4Sheet["A2"]) note4Sheet["A2"].s = { fill: YELLOW_FILL, font: { bold: true, sz: 11 }, alignment: { horizontal: "left" } };
    if (note4Sheet["A3"]) note4Sheet["A3"].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "left" } };
    if (note4Sheet["A4"]) note4Sheet["A4"].s = { fill: YELLOW_FILL, font: { sz: 8, italic: true }, alignment: { horizontal: "left" } };
    if (note4Sheet["A6"]) note4Sheet["A6"].s = { fill: YELLOW_FILL, font: { bold: true, sz: 10, underline: true }, alignment: { horizontal: "left" } };

    ["B8", "M8"].forEach(cell => {
      if (note4Sheet[cell]) note4Sheet[cell].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } };
    });

    ["A","B","C","D","E","F","G","H","I","J","K","M","N","O"].forEach(col => {
      const ref = `${col}9`;
      if (note4Sheet[ref]) note4Sheet[ref].s = { fill: YELLOW_FILL, font: { bold: true, sz: 8 }, alignment: { horizontal: col === "A" ? "left" : "center", vertical: "center", wrapText: true } };
    });

    // Row styling constants (0-based)
    const N4_UNDERLINE_ROWS   = [10, 13, 16, 19, 22, 25, 28, 31, 35, 36, 37, 38];
    const N4_SECTION_ROWS     = [9, 20, 33];
    const N4_ADDITIONS_ROWS   = [11, 14, 17, 23, 26, 29];
    const N4_NUM_COLS         = [1,2,3,4,5,6,7,8,9,10,12,13,14];

    Object.keys(note4Sheet).forEach(cellRef => {
      if (cellRef[0] === "!") return;
      const addr = XLSX.utils.decode_cell(cellRef);
      const r = addr.r;
      const c = addr.c;
      if (!note4Sheet[cellRef].s) note4Sheet[cellRef].s = {};
      note4Sheet[cellRef].s.fill = YELLOW_FILL;

      const isNum   = N4_NUM_COLS.includes(c);
      const isLabel = c === 0;

      if (isNum) note4Sheet[cellRef].s.alignment = { horizontal: "right", vertical: "center" };

      if (N4_UNDERLINE_ROWS.includes(r)) {
        if (isLabel) {
          note4Sheet[cellRef].s.font = { bold: true, sz: 9, underline: true, name: "Arial" };
          note4Sheet[cellRef].s.alignment = { horizontal: "left" };
        } else if (isNum && note4Sheet[cellRef].v !== D && note4Sheet[cellRef].v !== "" && note4Sheet[cellRef].v !== undefined) {
          note4Sheet[cellRef].s.font = { bold: true, sz: 9, name: "Arial" };
          note4Sheet[cellRef].s.border = { top: { style: "thin" }, bottom: { style: "thin" } };
        }
      }

      if (N4_SECTION_ROWS.includes(r) && isLabel) {
        note4Sheet[cellRef].s.font = { bold: true, sz: 9, name: "Arial" };
        note4Sheet[cellRef].s.alignment = { horizontal: "left" };
      }

      if (N4_ADDITIONS_ROWS.includes(r) && isLabel) {
        note4Sheet[cellRef].s.font = { sz: 9, color: { rgb: "0000FF" }, name: "Arial" };
      }
    });

    // FAR comment
    const farRef = XLSX.utils.encode_cell({ r: 17, c: 15 });
    note4Sheet[farRef] = { t: "s", v: "FAR Current period additions to be updated", s: { font: { sz: 8, color: { rgb: "FF0000" }, name: "Arial" }, fill: YELLOW_FILL } };

    XLSX.utils.book_append_sheet(workbook, note4Sheet, "4");
    console.log(workbook.SheetNames);




//     // ======================
// // SHEET - NOTE 5: CAPITAL WORK IN PROGRESS
// // ======================



// const note5SheetData = [
//   // Row 0: Company name
//   ["XYZ INFRASTRUCTURE & PROPERTIES LIMITED"],
//   // Row 1: Title
//   ["NOTES TO THE STANDALONE FINANCIAL STATEMENTS"],
//   // Row 2: Period
//   ["FOR THE PERIOD ENDED SEPTEMBER 30, 2025"],
//   // Row 3: Amount note
//   ["(All amounts are in ₹ millions, unless stated otherwise)"],
//   // Row 4: Empty
//   [],
//   // Row 5: Note heading
//   ["5. CAPITAL WORK IN PROGRESS"],
//   // Row 6: Empty
//   [],

//   // Row 7: Header row 1 - "As at" spanning cols 1-3
//   ["Particulars", "", "As at", "", ""],
//   // Row 8: Header row 2 - date columns
//   ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],

//   // Row 9: Section label
//   ["Gross Block"],
//   // Row 10: Opening work in progress
//   ["Opening work in progress", "", 52.00, 52.00, 52.00],
//   // Row 11: Additions
//   ["Additions", "", D, D, D],
//   // Row 12: Capitalized during the year
//   ["Capitalized during the year", "", D, D, D],
//   // Row 13: Closing work in progress (bold, underlined)
//   ["Closing work in progress", "", 52.00, 52.00, 52.00],

//   // Row 14: Empty
//   [],

//   // Row 15: CWIP Ageing heading
//   ["Capital Work in progress (CWIP) Ageing"],
//   // Row 16: Empty
//   [],

//   // Row 17: "As at September 30, 2025" + "Amount in CWIP for a period"
//   ["As at September 30, 2025", "", "Amount in CWIP for a period", "", "", ""],
//   // Row 18: Sub-headers for ageing
//   ["", "", "Less than 1 year", "1-2 years", "2-3 years", "More than 3 years", "Total"],
//   // Row 19: Projects in progress
//   ["Projects in progress", "", D, D, D, D, D],
//   // Row 20: Projects temporarily suspended
//   ["Projects temporarily suspended *", "", D, D, D, 52.00, 52.00],
//   // Row 21: Total
//   ["Total:", "", D, D, D, 52.00, 52.00],

//   // Row 22: Empty
//   [],

//   // Row 23: CWIP Ageing heading - March 31, 2025
//   ["Capital Work in progress (CWIP) Ageing"],
//   // Row 24: Empty
//   [],

//   // Row 25: "As at March 31, 2025" + "Amount in CWIP for a period"
//   ["As at March 31, 2025", "", "Amount in CWIP for a period", "", "", ""],
//   // Row 26: Sub-headers
//   ["", "", "Less than 1 year", "1-2 years", "2-3 years", "More than 3 years", "Total"],
//   // Row 27: Projects in progress
//   ["Projects in progress", "", D, D, D, D, D],
//   // Row 28: Projects temporarily suspended
//   ["Projects temporarily suspended *", "", D, D, D, 52.00, 52.00],
//   // Row 29: Total
//   ["Total:", "", D, D, D, 52.00, 52.00],

//   // Row 30: Empty
//   [],

//   // Row 31: CWIP Ageing heading - March 31, 2024
//   ["Capital Work in progress (CWIP) Ageing"],
//   // Row 32: Empty
//   [],

//   // Row 33: "As at March 31, 2024" + "Amount in CWIP for a period"
//   ["As at March 31, 2024", "", "Amount in CWIP for a period", "", "", ""],
//   // Row 34: Sub-headers
//   ["", "", "Less than 1 year", "1-2 years", "2-3 years", "More than 3 years", "Total"],
//   // Row 35: Projects in progress
//   ["Projects in progress", "", D, D, D, D, D],
//   // Row 36: Projects temporarily suspended
//   ["Projects temporarily suspended *", "", D, D, D, 52.00, 52.00],
//   // Row 37: Total
//   ["Total:", "", D, D, D, 52.00, 52.00],

//   // Row 38: Empty
//   [],
//   // Row 39: Footnote
//   ["* Note: Pertains to XYZ Green Meadows (Club house)"],
// ];

// const note5Sheet = XLSX.utils.aoa_to_sheet(note5SheetData);

// // Hide gridlines
// note5Sheet["!sheetView"] = [{ showGridLines: false }];

// // Column widths
// note5Sheet["!cols"] = [
//   { wch: 38 },  // A - Particulars
//   { wch: 2  },  // B - spacer
//   { wch: 18 },  // C
//   { wch: 14 },  // D
//   { wch: 14 },  // E
//   { wch: 18 },  // F
//   { wch: 12 },  // G - Total
// ];

// // Merges
// note5Sheet["!merges"] = [
//   // Header rows
//   { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
//   { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
//   { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
//   { s: { r: 3, c: 0 }, e: { r: 3, c: 6 } },
//   { s: { r: 5, c: 0 }, e: { r: 5, c: 6 } },

//   // Main table header "As at"
//   { s: { r: 7, c: 2 }, e: { r: 7, c: 4 } },

//   // Particulars spans rows 7-8 col 0
//   { s: { r: 7, c: 0 }, e: { r: 8, c: 0 } },

//   // CWIP Ageing section headings
//   { s: { r: 15, c: 0 }, e: { r: 15, c: 6 } },
//   { s: { r: 23, c: 0 }, e: { r: 23, c: 6 } },
//   { s: { r: 31, c: 0 }, e: { r: 31, c: 6 } },

//   // "Amount in CWIP for a period" spans
//   { s: { r: 17, c: 2 }, e: { r: 17, c: 6 } },
//   { s: { r: 25, c: 2 }, e: { r: 25, c: 6 } },
//   { s: { r: 33, c: 2 }, e: { r: 33, c: 6 } },

//   // "As at ..." label col 0 spans rows with sub-header
//   { s: { r: 17, c: 0 }, e: { r: 18, c: 0 } },
//   { s: { r: 25, c: 0 }, e: { r: 26, c: 0 } },
//   { s: { r: 33, c: 0 }, e: { r: 34, c: 0 } },

//   // Footnote
//   { s: { r: 39, c: 0 }, e: { r: 39, c: 6 } },
// ];

// // Apply yellow fill to ALL cells
// for (let r = 0; r < note5SheetData.length; r++) {
//   for (let c = 0; c < 7; c++) {
//     const ref = XLSX.utils.encode_cell({ r, c });
//     if (!note5Sheet[ref]) note5Sheet[ref] = { t: "z", v: "" };
//     if (!note5Sheet[ref].s) note5Sheet[ref].s = {};
//     note5Sheet[ref].s.fill = YELLOW_FILL;
//   }
// }

// // ---- Styling helpers ----
// const applyStyle = (sheet, cellRef, style) => {
//   if (!sheet[cellRef]) sheet[cellRef] = { t: "z", v: "" };
//   sheet[cellRef].s = { ...sheet[cellRef].s, ...style };
// };

// // Row 0: Company name - green bold large
// applyStyle(note5Sheet, "A1", {
//   fill: YELLOW_FILL,
//   font: { bold: true, sz: 13, color: { rgb: "008000" } },
//   alignment: { horizontal: "left" },
// });

// // Row 1: Title bold
// applyStyle(note5Sheet, "A2", {
//   fill: YELLOW_FILL,
//   font: { bold: true, sz: 11 },
//   alignment: { horizontal: "left" },
// });

// // Row 2: Period
// applyStyle(note5Sheet, "A3", {
//   fill: YELLOW_FILL,
//   font: { bold: true, sz: 10 },
//   alignment: { horizontal: "left" },
// });

// // Row 3: Italic small
// applyStyle(note5Sheet, "A4", {
//   fill: YELLOW_FILL,
//   font: { sz: 8, italic: true },
//   alignment: { horizontal: "left" },
// });

// // Row 5: Note heading - bold underline blue background style
// applyStyle(note5Sheet, "A6", {
//   fill: { patternType: "solid", fgColor: { rgb: "FFFF00" } },
//   font: { bold: true, sz: 11, color: { rgb: "1F3864" } },
//   alignment: { horizontal: "left" },
//   border: {
//     top: { style: "medium" },
//     bottom: { style: "medium" },
//     left: { style: "medium" },
//     right: { style: "medium" },
//   },
// });

// // Header row 7 "As at"
// applyStyle(note5Sheet, "C8", {
//   fill: YELLOW_FILL,
//   font: { bold: true, sz: 9 },
//   alignment: { horizontal: "center" },
//   border: { bottom: { style: "thin" } },
// });

// // Header row 8: date columns
// ["C9", "D9", "E9"].forEach(cell => {
//   applyStyle(note5Sheet, cell, {
//     fill: YELLOW_FILL,
//     font: { bold: true, sz: 9 },
//     alignment: { horizontal: "right" },
//     border: { bottom: { style: "thin" } },
//   });
// });

// // "Particulars" header cell (merged row 7-8)
// applyStyle(note5Sheet, "A8", {
//   fill: YELLOW_FILL,
//   font: { bold: true, sz: 9 },
//   alignment: { horizontal: "left", vertical: "center" },
//   border: { bottom: { style: "thin" } },
// });

// // Row 9: "Gross Block" bold
// applyStyle(note5Sheet, "A10", {
//   fill: YELLOW_FILL,
//   font: { bold: true, sz: 9 },
//   alignment: { horizontal: "left" },
// });

// // Row 13: "Closing work in progress" - bold with top+bottom border on numbers
// ["A14"].forEach(cell => {
//   applyStyle(note5Sheet, cell, {
//     fill: YELLOW_FILL,
//     font: { bold: true, sz: 9 },
//     alignment: { horizontal: "left" },
//   });
// });
// ["C14", "D14", "E14"].forEach(cell => {
//   applyStyle(note5Sheet, cell, {
//     fill: YELLOW_FILL,
//     font: { bold: true, sz: 9 },
//     alignment: { horizontal: "right" },
//     border: { top: { style: "thin" }, bottom: { style: "double" } },
//   });
// });

// // Row 15: CWIP Ageing heading - bold underline
// ["A16", "A24", "A32"].forEach(cell => {
//   applyStyle(note5Sheet, cell, {
//     fill: YELLOW_FILL,
//     font: { bold: true, sz: 10, underline: true },
//     alignment: { horizontal: "left" },
//   });
// });

// // "Amount in CWIP for a period" label rows 17, 25, 33
// ["C18", "C26", "C34"].forEach(cell => {
//   applyStyle(note5Sheet, cell, {
//     fill: YELLOW_FILL,
//     font: { bold: true, sz: 9 },
//     alignment: { horizontal: "center" },
//     border: { bottom: { style: "thin" } },
//   });
// });

// // Sub-header rows (18, 26, 34): Less than 1yr, 1-2yr, 2-3yr, More than 3yr, Total
// [18, 26, 34].forEach(rowIdx => {
//   ["C", "D", "E", "F", "G"].forEach(col => {
//     const cell = `${col}${rowIdx + 1}`;
//     applyStyle(note5Sheet, cell, {
//       fill: YELLOW_FILL,
//       font: { bold: true, sz: 8 },
//       alignment: { horizontal: "center", wrapText: true },
//       border: { bottom: { style: "thin" } },
//     });
//   });
// });

// // "As at ..." label cells - bold
// ["A18", "A26", "A34"].forEach(cell => {
//   applyStyle(note5Sheet, cell, {
//     fill: YELLOW_FILL,
//     font: { bold: true, sz: 9 },
//     alignment: { horizontal: "left", vertical: "center" },
//   });
// });

// // Total rows (21, 29, 37) - bold with borders on numeric cols
// [21, 29, 37].forEach(rowIdx => {
//   applyStyle(note5Sheet, `A${rowIdx + 1}`, {
//     fill: YELLOW_FILL,
//     font: { bold: true, sz: 9 },
//   });
//   ["C", "D", "E", "F", "G"].forEach(col => {
//     const cell = `${col}${rowIdx + 1}`;
//     applyStyle(note5Sheet, cell, {
//       fill: YELLOW_FILL,
//       font: { bold: true, sz: 9 },
//       alignment: { horizontal: "right" },
//       border: { top: { style: "thin" }, bottom: { style: "double" } },
//     });
//   });
// });

// // Right-align all numeric data cells
// [10, 11, 12, 13, 19, 20, 27, 28, 35, 36].forEach(rowIdx => {
//   ["C", "D", "E", "F", "G"].forEach(col => {
//     const cell = `${col}${rowIdx + 1}`;
//     if (note5Sheet[cell]) {
//       if (!note5Sheet[cell].s) note5Sheet[cell].s = {};
//       note5Sheet[cell].s.fill = YELLOW_FILL;
//       note5Sheet[cell].s.alignment = { horizontal: "right" };
//       note5Sheet[cell].s.font = { sz: 9 };
//     }
//   });
// });

// // Row heights for wrapped sub-headers
// note5Sheet["!rows"] = [];
// note5Sheet["!rows"][18] = { hpt: 28 };
// note5Sheet["!rows"][26] = { hpt: 28 };
// note5Sheet["!rows"][34] = { hpt: 28 };

// // Footnote italic
// applyStyle(note5Sheet, "A40", {
//   fill: YELLOW_FILL,
//   font: { sz: 8, italic: true },
//   alignment: { horizontal: "left" },
// });

// // Append to workbook
// XLSX.utils.book_append_sheet(workbook, note5Sheet, "Note5_CWIP");


// ======================
// SHEET - NOTE 5 + NOTE 6(a): COMBINED
// ======================

const note5and6aSheetData = [
  // ==================== NOTE 5 ====================
  // Row 0
  ["XYZ INFRASTRUCTURE & PROPERTIES LIMITED"],
  // Row 1
  ["NOTES TO THE STANDALONE FINANCIAL STATEMENTS"],
  // Row 2
  ["FOR THE PERIOD ENDED SEPTEMBER 30, 2025"],
  // Row 3
  ["(All amounts are in ₹ millions, unless stated otherwise)"],
  // Row 4
  [],
  // Row 5
  ["5. CAPITAL WORK IN PROGRESS"],
  // Row 6
  [],
  // Row 7: Header
  ["Particulars", "", "As at", "", ""],
  // Row 8: Date columns
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  // Row 9
  ["Gross Block"],
  // Row 10
  ["Opening work in progress", "", 52.00, 52.00, 52.00],
  // Row 11
  ["Additions", "", D, D, D],
  // Row 12
  ["Capitalized during the year", "", D, D, D],
  // Row 13: Bold closing
  ["Closing work in progress", "", 52.00, 52.00, 52.00],
  // Row 14
  [],
  // Row 15
  ["Capital Work in progress (CWIP) Ageing"],
  // Row 16
  [],
  // Row 17
  ["As at September 30, 2025", "", "Amount in CWIP for a period", "", "", ""],
  // Row 18
  ["", "", "Less than 1 year", "1-2 years", "2-3 years", "More than 3 years", "Total"],
  // Row 19
  ["Projects in progress", "", D, D, D, D, D],
  // Row 20
  ["Projects temporarily suspended *", "", D, D, D, 52.00, 52.00],
  // Row 21
  ["Total:", "", D, D, D, 52.00, 52.00],
  // Row 22
  [],
  // Row 23
  ["Capital Work in progress (CWIP) Ageing"],
  // Row 24
  [],
  // Row 25
  ["As at March 31, 2025", "", "Amount in CWIP for a period", "", "", ""],
  // Row 26
  ["", "", "Less than 1 year", "1-2 years", "2-3 years", "More than 3 years", "Total"],
  // Row 27
  ["Projects in progress", "", D, D, D, D, D],
  // Row 28
  ["Projects temporarily suspended *", "", D, D, D, 52.00, 52.00],
  // Row 29
  ["Total:", "", D, D, D, 52.00, 52.00],
  // Row 30
  [],
  // Row 31
  ["Capital Work in progress (CWIP) Ageing"],
  // Row 32
  [],
  // Row 33
  ["As at March 31, 2024", "", "Amount in CWIP for a period", "", "", ""],
  // Row 34
  ["", "", "Less than 1 year", "1-2 years", "2-3 years", "More than 3 years", "Total"],
  // Row 35
  ["Projects in progress", "", D, D, D, D, D],
  // Row 36
  ["Projects temporarily suspended *", "", D, D, D, 52.00, 52.00],
  // Row 37
  ["Total:", "", D, D, D, 52.00, 52.00],
  // Row 38
  [],
  // Row 39
  ["* Note: Pertains to XYZ Green Meadows (Club house)"],

  // Row 40: Spacer between Note 5 and Note 6a
  [],
  [],

  // ==================== NOTE 6(a) ====================
  // Row 42
  ["6. FINANCIAL ASSETS"],
  // Row 43
  ["6(a). INVESTMENTS"],
  // Row 44
  [],
  // Row 45: Header
  ["Particulars", "", "As at", "", ""],
  // Row 46: Date columns
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],

  // Row 47
  ["Quoted, carried at fair market value"],
  // Row 48
  ["(i)   In equity investments - quoted at fair market value, fully paid up"],
  // Row 49
  ["      XYZ Housing & Industries Limited", "", 41.02, 34.91, 39.85],
  // Row 50
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) equity shares of ₹2 each"],
  // Row 51: Subtotal quoted
  ["", "", 41.02, 34.91, 39.85],
  // Row 52
  [],
  // Row 53
  ["Unquoted, carried at cost less impairment"],
  // Row 54
  ["(i)   In equity investments - unquoted at cost, fully paid up"],
  // Row 55
  ["      (a) Investment in Subsidiary:"],
  // Row 56-57
  ["      A P Utility Services Limited", "", 1.00, 1.00, 1.00],
  ["      1,00,000 (March 31, 2025: 1,00,000, March 31, 2024: 1,00,000) Equity shares of ₹10 each"],
  // Row 58-59
  ["      XYZ Real Estate Limited", "", 0.15, 0.15, 0.15],
  ["      15,000 (March 31, 2025: 15,000, March 31, 2024: 15,000) Equity shares of ₹10 each"],
  // Row 60-61
  ["      Adhikari Properties Limited", "", 3.05, 3.05, 3.05],
  ["      5,19,720 (March 31, 2025: 5,19,720, March 31, 2024: 5,19,720) Equity shares of ₹10 each"],
  // Row 62-63
  ["      Amazon Infra Realtors Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 64-65
  ["      Amazon Infracon Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 66-67
  ["      Amazon Real Estate Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 68-69
  ["      AP Projects Limited", "", 7.79, 7.79, 7.79],
  ["      11,790 (March 31, 2025: 11,790, March 31, 2024: 11,790) Equity shares of ₹100 each"],
  // Row 70-71
  ["      XYZ Infrabuild Limited", "", 0.33, 0.33, 0.33],
  ["      33,327 (March 31, 2025: 33,327, March 31, 2024: 33,327) Equity shares of ₹10 each"],
  // Row 72-73
  ["      Best View Infracon Limited", "", 0.50, 0.50, 0.50],
  ["      50,010 (March 31, 2025: 50,010, March 31, 2024: 50,010) Equity shares of ₹10 each"],
  // Row 74-75
  ["      Chiranjiv Builders Limited", "", 0.50, 0.50, 0.50],
  ["      49,994 (March 31, 2025: 49,994, March 31, 2024: 49,994 ) Equity shares of ₹10 each"],
  // Row 76-77
  ["      XYZ County Limited", "", 95.33, 95.33, 95.33],
  ["      3,40,000 (March 31, 2025: 3,40,000, March 31, 2024: 3,40,000) Equity shares of ₹10 each"],
  // Row 78-79
  ["      XYZ Greens Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 80-81
  ["      XYZ Homes Projects Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 82-83
  ["      XYZ SIDCUL Industrial Park Limited", "", 2.50, 2.50, 2.50],
  ["      2,49,999 (March 31, 2025: 2,49,999, March 31, 2024: 2,49,999) Equity shares of ₹10 each"],
  // Row 84-85
  ["      XYZ Sohna Projects Limited", "", 710.44, 710.44, 710.44],
  ["      61,00,000 (March 31, 2025: 61,00,000, March 31, 2024: 61,00,000) Equity shares of ₹10 each"],
  // Row 86-87
  ["      XYZ Townships and Housing Limited", "", 25.39, 25.39, 25.39],
  ["      5,45,980 (March 31, 2025: 5,45,980, March 31, 2024: 5,45,980) Equity shares of ₹10 each"],
  // Row 88-89
  ["      Ethenic Projects Private Limited", "", 0.10, 0.10, 0.10],
  ["      10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each"],
  // Row 90-91
  ["      Ethenic Real Estate Private Limited", "", 0.10, 0.10, 0.10],
  ["      10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each"],
  // Row 92-93
  ["      Green Park Buildwell Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 94-95
  ["      Green Park Infracon Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 96-97
  ["      XYZ Green Park Infrastructure Limited", "", 50.00, 50.00, 50.00],
  ["      50,00,000 (March 31, 2025: 50,00,000, March 31, 2024: 50,00,000) Equity shares of ₹10 each"],
  // Row 98-99
  ["      Hi-Pride Infracon Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 100-101
  ["      Maksad Estate and Hardware Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 102-103
  ["      XYZ Maksad Properties Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 104-105
  ["      Mansarover Realtors Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 106-107
  ["      Pigeon Infrastructure Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 108-109
  ["      Pigeon Properties Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 110-111
  ["      S M Buildcon Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 112-113
  ["      Sayana Builders Company Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 114-115
  ["      Sayana Infrastructure & Properties Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 116-117
  ["      Sayana Realtors Company Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 118-119
  ["      Shri Ajitnath Buildcon Limited", "", 0.50, 0.50, 0.50],
  ["      50,000 (March 31, 2025: 50,000, March 31, 2024: 50,000) Equity shares of ₹10 each"],
  // Row 120-121
  ["      Alternative Habitat Private Limited", "", 0.10, 0.10, 0.10],
  ["      10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each"],
  // Row 122-123
  ["      Santur Builders Private Limited", "", D, D, 84.00],
  ["      Nil (March 31, 2025: Nil, March 31, 2024: 80,00,000) Equity shares of ₹10 each"],
  // Row 124-125
  ["      Blueridge Retails Private Limited", "", 0.07, 0.07, 0.07],
  ["      7,000 (March 31, 2025: 7,000, March 31, 2024: 7,000) Equity shares of ₹10 each"],
  // Row 126-127
  ["      Swarnim Nirman Private Limited", "", 0.10, 0.10, 0.10],
  ["      10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each"],
  // Row 128-129
  ["      XYZ Homes Developers Limited", "", 0.07, 0.07, 0.10],
  ["      7,000 (March 31, 2025: 7,000, March 31, 2024: 10,000) Equity shares of ₹10 each"],
  // Row 130-131
  ["      XYZ Serendipity Limited", "", 0.10, 0.10, 0.10],
  ["      10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each"],
  // Row 132-133
  ["      XYZ Infratech Realtors Limited", "", 0.10, 0.10, 0.10],
  ["      10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each"],
  // Row 134-135
  ["      XYZ Infracon Realtors Limited", "", 0.10, 0.10, 0.10],
  ["      10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each"],
  // Row 136-137
  ["      Villa Construction Private Limited", "", 0.10, 0.10, 0.10],
  ["      10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each"],
  // Row 138-139
  ["      Havenclass Homes Solutions Limited", "", 0.10, 0.10, 0.10],
  ["      10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each"],
  // Row 140-141
  ["      XYZ Abode Estates Solutions Limited", "", 0.10, 0.10, 0.10],
  ["      10,000 (March 31, 2025: 10,000, March 31, 2024: 10,000) Equity shares of ₹10 each"],
  // Row 142-143
  ["      XYZ Goodliving Properties Limited", "", 0.07, 0.07, D],
  ["      7,000 (March 31, 2025: 7,000, March 31, 2024: Nil) Equity shares of ₹10 each"],
  // Row 144-145
  ["      Subhagyam Constructions Limited", "", 0.10, 0.10, D],
  ["      10,000 (March 31, 2025: 10,000, March 31, 2024: Nil) Equity shares of ₹10 each"],
  // Row 146-147
  ["      Primula Luxury Homes Private Limited", "", 0.09, 0.09, D],
  ["      9,000 (March 31, 2025: 9,000, March 31, 2024: Nil) Equity shares of ₹10 each"],
  // Row 148: Subtotal (a)
  ["", "", 907.38, 907.38, 991.15],
  // Row 149
  [],
  // Row 150: (b) Joint Ventures
  ["      (b) Investment in Joint Ventures:"],
  // Row 151-152
  ["      Wondrous Buildmart Private Limited", "", 0.01, 0.01, 0.01],
  ["      1,120 (March 31, 2024: 1,120, March 31, 2024: 1,120) Equity shares of ₹10 each"],
  // Row 153: Subtotal (b)
  ["", "", 0.01, 0.01, 0.01],
  // Row 154
  [],
  // Row 155: (ii) Preference
  ["(ii)  In preference investments - unquoted at cost, fully paid up"],
  // Row 156-157
  ["      Best View Infracon Limited"],
  ["      2,34,57,036 (March 31, 2025: 2,34,57,036, March 31, 2024: Nil) Preference shares of ₹100 each", "", 2345.70, 2345.70, D],
  // Row 158: Subtotal preference
  ["", "", 2345.70, 2345.70, D],
  // Row 159
  [],
  // Row 160: (iii) Debentures
  ["(iii) In debenture investments"],
  // Row 161: (a)
  ["      (a) Investment in Subsidiary:"],
  // Row 162-163: NCDs
  ["      Fully Non-convertible debentures (NCDs) in Best View Infracon Limited"],
  ["      Nil (March 31, 2025: Nil, March 31, 2024: 203) Debentures of ₹10,00,000 each", "", D, D, 203.00],
  // Row 164-165: OCDs
  ["      Optional Convertible debentures (OCDs) in XYZ Green Park Infra. Ltd."],
  ["      Nil (March 31, 2025: 11,281, March 31, 2024: 30,536) Debentures of ₹10,000 each", "", D, 112.81, 305.36],
  // Row 166: Subtotal debentures
  ["", "", D, 112.81, 508.36],
  // Row 167
  [],
  // Row 168: TOTAL
  ["TOTAL:", "", 3294.12, 3400.82, 1539.37],
  // Row 169
  [],
  // Row 170-173: Footer italic lines
  ["      Aggregated cost of quoted investments", "", 1.40, 1.40, 1.40],
  ["      Aggregated market value of quoted investments", "", 41.02, 34.91, 39.85],
  ["      Aggregated cost of unquoted investment", "", 3253.10, 3365.91, 1499.52],
  ["      Aggregate amount of impairment in value of investments", "", D, D, D],
];

// ======== NOTE 6(b) ADD TO note5and6aSheetData ========
const safeVal = (v) => (v === undefined || v === null || v === "" ? D : v);

const note6bRows = (note6b.particulars || []).map(p => [
  `      ${p.name}`,
  "",
  safeVal(p.closing),
  safeVal(p.opening),
  safeVal(p.opening),
]);

note5and6aSheetData.push(
  [],
  [],
  ["6(b). LOANS"],
  [],
  ["Particulars", "", "As at", "", ""],
  ["", "", note6b.dates?.closing ?? "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  ["Loans Receivables considered good \u2013 Unsecured"],
  ...note6bRows,
  ["      (Parties other than related parties)"],
  ["TOTAL:", "", safeVal(note6b.totalClosing), safeVal(note6b.totalOpening), safeVal(note6b.totalOpening)]
);
// ======== END PUSH ========

// ======== NOTE 6(c) PUSH ========
note5and6aSheetData.push(
  [],
  [],
  ["6(c). OTHER FINANCIAL ASSETS"],
  [],
  ["Particulars", "", "As at", "", ""],
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  ["Fixed Deposits:"],
  ["Bank Deposit with maturity remaining more than 12 months", "", 51.12, 3.34, 43.60],
  ["TOTAL:", "", 51.12, 3.34, 43.60]
);

// ======== NOTE 7 PUSH ========
note5and6aSheetData.push(
  [],
  [],
  ["7. DEFERRED TAX ASSETS (NET)"],
  [],
  ["Particulars", "", "As at", "", ""],
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],

  // Deferred tax liabilities
  ["Deferred tax liabilities"],
  ["Property, plant and equipments, investment property & intangible assets", "", 42.65, 43.11, 43.92],
  ["Financial assets carried at FVTOCI and FVTPL", "", 1.07, "(0.86)", 1.95],
  ["Total Deferred tax liabilities", "", 43.71, 42.24, 45.87],

  [],

  // Deferred tax assets
  ["Deferred tax assets"],
  ["Impact of expenditure charged to the statement of profit and loss in the current year but allowable for tax purposes on payment basis", "", 0.57, 0.44, 1.10],
  ["Disallowances under section 40(a)(ia) of the Income Tax Act,1961", "", 0.27, "(1.46)", 1.63],
  ["Others", "", 90.10, 79.69, 137.57],
  ["Total Deferred tax assets", "", 90.94, 78.67, 140.30],

  [],

  ["DEFERRED TAX ASSETS (NET):", "", 47.23, 36.43, 94.43]
);
// ======== END NOTE 7 PUSH ========


// ======== NOTE 8 PUSH ========
const n8 = note8.sections;
const safeN8 = (v) => (v === undefined || v === null || v === "" || v === 0 ? D : v);

note5and6aSheetData.push(
  [],
  [],
  ["8. OTHER NON-CURRENT ASSETS"],
  [],
  ["Particulars", "", "As at", "", ""],
  ["", "", note8.dates?.closing ?? "September 30, 2025", "March 31, 2025", "March 31, 2024"],

  // Section heading static
  ["Advances other than capital advances- Unsecured"],

  // (a) Related parties
  ["(a). Advances to Related parties*"],
  ["Advance to subsidiary companies", "", safeN8(n8?.relatedParties?.subsidiary?.closing), safeN8(n8?.relatedParties?.subsidiary?.opening), safeN8(n8?.relatedParties?.subsidiary?.opening)],
  ["Advance to Other Parties", "", safeN8(n8?.relatedParties?.otherParties?.closing), safeN8(n8?.relatedParties?.otherParties?.opening), safeN8(n8?.relatedParties?.otherParties?.opening)],

  // (b) Others
  ["(b). Parties other than related parties"],
  ["Advances for Land", "", D, D, safeN8(n8?.others?.land?.opening)],
  ["Advance to Other Parties.", "", safeN8(n8?.others?.otherParties?.closing), safeN8(n8?.others?.otherParties?.opening), D],

  // (c) Government
  ["(c). Amount recoverable from government authorities:"],
  ["Value Added Tax", "", safeN8(n8?.government?.vat?.closing), safeN8(n8?.government?.vat?.opening), safeN8(n8?.government?.vat?.opening)],

  // TOTAL
  ["TOTAL:", "", safeVal(note8.totalClosing), safeVal(note8.totalOpening), safeVal(note8.totalOpening)],

  // Footnote
  ["*Rate of Interest from related parties ranging from 7% to 16.10% per annum."]
);
// ======== END NOTE 8 PUSH ========


// ======== NOTE 9 PUSH ========
note5and6aSheetData.push(
  [],
  [],
  ["9. INVENTORIES*"],
  [],
  ["Particulars", "", "As at", "", ""],
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  ["Raw materials",              "", 12.05,    11.05,    5.82],
  ["Finished goods",             "", 809.65,   372.66,   372.66],
  ["Project Units in progress",  "", 4794.29,  4564.15,  2998.96],
  ["TOTAL:",                     "", 5615.99,  4947.86,  3377.44],
  ["*All Inventories are valued at cost or net realizable value, whichever is lower."]
);
// ======== END NOTE 9 PUSH ========

// ======== NOTE 10(a) PUSH ========
const note10aRows = (note10a.particulars || []).map(p => [
  p.name, "", safeVal(p.closing), safeVal(p.opening), safeVal(p.opening)
]);

note5and6aSheetData.push(
  [],
  [],
  ["10. FINANCIAL ASSETS"],
  ["10(a). TRADE RECEIVABLES"],
  [],
  ["Particulars", "", "As at", "", ""],
  ["", "", note10a.dates?.closing ?? "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  ...note10aRows,
  [],
  ["TOTAL:", "", safeVal(note10a.totalClosing), safeVal(note10a.totalOpening), safeVal(note10a.totalOpening)],
  ["* The above includes ₹80.89 millions (March 31, 2025: ₹93.19 millions and March 31, 2024: ₹11.40 millions) to companies where Directors are interested."],
  []
);
// ======== END NOTE 10(a) PUSH ========

// ======== NOTE 10(b) PUSH ========
const note10bRows = [
  [
    "      - in current accounts",
    "",
    safeVal(note10b.totals?.closing),
    safeVal(note10b.totals?.opening),
    safeVal(note10b.totals?.opening)
  ]
];
note5and6aSheetData.push(
  [],
  [],
  ["10(b). CASH AND CASH EQUIVALENTS"],
  [],
  ["Particulars", "", "As at", "", ""],
  ["", "", note10b.dates?.closing ?? "September 30, 2025", note10b.dates?.opening ?? "March 31, 2025", "March 31, 2024"],
  ["Balances with banks"],
  ...note10bRows,
  // TOTAL row bhi rakhna hai bold ke liye:
  ["", "", safeVal(note10b.totals?.closing), safeVal(note10b.totals?.opening), safeVal(note10b.totals?.opening)]
);
// ======== END NOTE 10(b) PUSH ========

// ======== NOTE 10(c) PUSH ========
const note10cRows = (note10c.lineItems || []).map(item => [
  item.name, "", safeVal(item.closing), safeVal(item.opening), safeVal(item.opening)
]);

note5and6aSheetData.push(
  [],
  [],
  ["10(c). BANK BALANCES OTHER THAN (II) ABOVE"],
  [],
  ["Particulars", "", "As at", "", ""],
  ["", "", note10c.dates?.closing ?? "September 30, 2025", note10c.dates?.opening ?? "March 31, 2025", "March 31, 2024"],
  ["Fixed Deposits **"],
  ...note10cRows,
  [],
  ["TOTAL:", "", safeVal(note10c.totals?.closing), safeVal(note10c.totals?.opening), safeVal(note10c.totals?.opening)],
  ["** Note:"],
  ["(i) Fixed deposits held as margin money and lien marked for issuing bank guarantees and held with other authorities amounting to ₹131.79 millions (March 31, 2025: ₹123.92 millions and March 31, 2024: ₹34.56 millions)."],
  ["(ii) Fixed deposits held as margin money and lien marked for issuing bank overdraft facilities amounting to ₹376.11 millions (March 31, 2024: ₹296.50 millions and March 31, 2024: ₹382.14 millions)."]
);
// ======== END NOTE 10(c) PUSH ========


// ======== NOTE 10(d) PUSH ========
const note10dRows = (note10d.lineItems || []).map(item => [
  item.name, "", safeVal(item.closing), safeVal(item.opening), safeVal(item.opening)
]);

note5and6aSheetData.push(
  [],
  [],
  ["10(d). OTHER FINANCIAL ASSETS"],
  [],
  ["Particulars", "", "As at", "", ""],
  ["", "", note10d.dates?.closing ?? "September 30, 2025", note10d.dates?.opening ?? "March 31, 2025", "March 31, 2024"],
  ...note10dRows,
  ["TOTAL:", "", safeVal(note10d.totals?.closing), safeVal(note10d.totals?.opening), safeVal(note10d.totals?.opening)],
  ["**Interest accrued on debentures are from related parties at mutually agreed rate of interest."],
  ["* Retention money is wrt to Income of PFC from the Related Party."]
);
// ======== END NOTE 10(d) PUSH ========

// ======== NOTE 11 PUSH ========
note5and6aSheetData.push(
  [],
  [],
  ["11. OTHER CURRENT ASSETS"],
  [],
  ["Particulars", "", "As at", "", ""],
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  ["Considered good \u2013 Unsecured"],
  ["Prepaid expenses",                          "", 314.62, 5.49, 5.52],
  ["Balance with government authorities:", "", "", "", ""],
  ["   -- GST Input Credit",                    "", 18.45, 18.47, 43.59],
  ["   -- Advance tax (net of provision)",      "", 177.25, 367.91, 234.33],
  ["TOTAL:",                                    "", 510.31, 391.87, 283.44]
);
// ======== END NOTE 11 PUSH ========


const note5and6aSheet = XLSX.utils.aoa_to_sheet(note5and6aSheetData);

// Hide gridlines
note5and6aSheet["!sheetView"] = [{ showGridLines: false }];

// Column widths - wide enough for both sections
note5and6aSheet["!cols"] = [
  { wch: 70 },  // A
  { wch: 2  },  // B
  { wch: 18 },  // C
  { wch: 16 },  // D
  { wch: 16 },  // E
  { wch: 18 },  // F - used only in CWIP ageing
  { wch: 12 },  // G - Total col for CWIP ageing
];

// Merges
note5and6aSheet["!merges"] = [
  // ---- NOTE 5 Header ----
  { s: { r: 0,  c: 0 }, e: { r: 0,  c: 6 } },
  { s: { r: 1,  c: 0 }, e: { r: 1,  c: 6 } },
  { s: { r: 2,  c: 0 }, e: { r: 2,  c: 6 } },
  { s: { r: 3,  c: 0 }, e: { r: 3,  c: 6 } },
  { s: { r: 5,  c: 0 }, e: { r: 5,  c: 6 } },
  { s: { r: 7,  c: 2 }, e: { r: 7,  c: 4 } },
  { s: { r: 7,  c: 0 }, e: { r: 8,  c: 0 } },
  { s: { r: 15, c: 0 }, e: { r: 15, c: 6 } },
  { s: { r: 23, c: 0 }, e: { r: 23, c: 6 } },
  { s: { r: 31, c: 0 }, e: { r: 31, c: 6 } },
  { s: { r: 17, c: 2 }, e: { r: 17, c: 6 } },
  { s: { r: 25, c: 2 }, e: { r: 25, c: 6 } },
  { s: { r: 33, c: 2 }, e: { r: 33, c: 6 } },
  { s: { r: 17, c: 0 }, e: { r: 18, c: 0 } },
  { s: { r: 25, c: 0 }, e: { r: 26, c: 0 } },
  { s: { r: 33, c: 0 }, e: { r: 34, c: 0 } },
  { s: { r: 39, c: 0 }, e: { r: 39, c: 6 } },
  // ---- NOTE 6(a) Header ----
  { s: { r: 42, c: 0 }, e: { r: 42, c: 6 } },
  { s: { r: 43, c: 0 }, e: { r: 43, c: 6 } },
  { s: { r: 45, c: 2 }, e: { r: 45, c: 4 } },
  { s: { r: 45, c: 0 }, e: { r: 46, c: 0 } },
  { s: { r: 47, c: 0 }, e: { r: 47, c: 6 } },
  { s: { r: 48, c: 0 }, e: { r: 48, c: 6 } },
  { s: { r: 53, c: 0 }, e: { r: 53, c: 6 } },
  { s: { r: 54, c: 0 }, e: { r: 54, c: 6 } },
  { s: { r: 55, c: 0 }, e: { r: 55, c: 6 } },
  { s: { r: 150, c: 0 }, e: { r: 150, c: 6 } },
  { s: { r: 155, c: 0 }, e: { r: 155, c: 6 } },
  { s: { r: 160, c: 0 }, e: { r: 160, c: 6 } },
  { s: { r: 161, c: 0 }, e: { r: 161, c: 6 } },
];

// Apply yellow fill to ALL cells
for (let r = 0; r < note5and6aSheetData.length; r++) {
  for (let c = 0; c < 7; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    if (!note5and6aSheet[ref].s) note5and6aSheet[ref].s = {};
    note5and6aSheet[ref].s.fill = YELLOW_FILL;
  }
}

// Style helper
const s56 = (cellRef, style) => {
  if (!note5and6aSheet[cellRef]) note5and6aSheet[cellRef] = { t: "z", v: "" };
  note5and6aSheet[cellRef].s = { fill: YELLOW_FILL, ...style };
};

// ======== NOTE 5 STYLES ========
s56("A1",  { font: { bold: true, sz: 13, color: { rgb: "008000" } }, alignment: { horizontal: "left" } });
s56("A2",  { font: { bold: true, sz: 11 }, alignment: { horizontal: "left" } });
s56("A3",  { font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } });
s56("A4",  { font: { sz: 8, italic: true }, alignment: { horizontal: "left" } });
s56("A6",  { font: { bold: true, sz: 11 }, alignment: { horizontal: "left" }, border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } } });
s56("C8",  { font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } });
s56("A8",  { font: { bold: true, sz: 9 }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: { style: "thin" } } });
["C9","D9","E9"].forEach(c => s56(c, { font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } }));
s56("A10", { font: { bold: true, sz: 9 }, alignment: { horizontal: "left" } });
s56("A14", { font: { bold: true, sz: 9 }, alignment: { horizontal: "left" } });
["C14","D14","E14"].forEach(c => s56(c, { font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { top: { style: "thin" }, bottom: { style: "double" } } }));
["A16","A24","A32"].forEach(c => s56(c, { font: { bold: true, sz: 10, underline: true }, alignment: { horizontal: "left" } }));
["C18","C26","C34"].forEach(c => s56(c, { font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } }));
[18,26,34].forEach(rowIdx => {
  ["C","D","E","F","G"].forEach(col => {
    s56(`${col}${rowIdx+1}`, { font: { bold: true, sz: 8 }, alignment: { horizontal: "center", wrapText: true }, border: { bottom: { style: "thin" } } });
  });
});
["A18","A26","A34"].forEach(c => s56(c, { font: { bold: true, sz: 9 }, alignment: { horizontal: "left", vertical: "center" } }));
[21,29,37].forEach(r => {
  s56(`A${r+1}`, { font: { bold: true, sz: 9 } });
  ["C","D","E","F","G"].forEach(col => {
    s56(`${col}${r+1}`, { font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { top: { style: "thin" }, bottom: { style: "double" } } });
  });
});
s56("A40", { font: { sz: 8, italic: true }, alignment: { horizontal: "left" } });
[10,11,12,13].forEach(r => {
  ["C","D","E"].forEach(col => {
    const ref = `${col}${r+1}`;
    if (note5and6aSheet[ref]) {
      note5and6aSheet[ref].s = { fill: YELLOW_FILL, alignment: { horizontal: "right" }, font: { sz: 9 } };
    }
  });
});

// ======== NOTE 6(a) STYLES ========
s56("A43", { font: { bold: true, sz: 11 }, alignment: { horizontal: "left" }, border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } } });
s56("A44", { font: { bold: true, sz: 11 }, alignment: { horizontal: "left" }, border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } } });
s56("C46", { font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } });
s56("A46", { font: { bold: true, sz: 9 }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: { style: "thin" } } });
["C47","D47","E47"].forEach(c => s56(c, { font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } }));
s56("A48", { font: { bold: true, sz: 9 }, alignment: { horizontal: "left" } });
s56("A49", { font: { bold: true, sz: 9, underline: true }, alignment: { horizontal: "left" } });
s56("A54", { font: { bold: true, sz: 9 }, alignment: { horizontal: "left" } });
s56("A55", { font: { bold: true, sz: 9, underline: true }, alignment: { horizontal: "left" } });
s56("A56", { font: { sz: 9, italic: true, underline: true }, alignment: { horizontal: "left" } });
s56("A151", { font: { sz: 9, italic: true, underline: true }, alignment: { horizontal: "left" } });
s56("A156", { font: { bold: true, sz: 9, underline: true }, alignment: { horizontal: "left" } });
s56("A161", { font: { bold: true, sz: 9 }, alignment: { horizontal: "left" } });
s56("A162", { font: { sz: 9, italic: true, underline: true }, alignment: { horizontal: "left" } });
Object.keys(note5and6aSheet).forEach(cell => {
  if (cell[0] === "!") return;
  const col = cell[0];
  if (col === "C" || col === "D" || col === "E") {
    const row = parseInt(cell.slice(1), 10);
    if (row > 46) {
      if (!note5and6aSheet[cell].s) note5and6aSheet[cell].s = {};
      note5and6aSheet[cell].s.fill = YELLOW_FILL;
      note5and6aSheet[cell].s.alignment = { horizontal: "right" };
      note5and6aSheet[cell].s.font = { sz: 9 };
    }
  }
});
const subtotalRows56 = [51, 148, 153, 158, 166];
subtotalRows56.forEach(r => {
  ["C","D","E"].forEach(col => {
    s56(`${col}${r+1}`, { font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { top: { style: "thin" }, bottom: { style: "thin" } } });
  });
});
s56("A169", { font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } });
["C169","D169","E169"].forEach(c => s56(c, { font: { bold: true, sz: 10 }, alignment: { horizontal: "right" }, border: { top: { style: "medium" }, bottom: { style: "double" } } }));
[170,171,172,173].forEach(r => {
  const ref = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[ref]) {
    note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { sz: 9, italic: true }, alignment: { horizontal: "left" } };
  }
});

// ======== NOTE 6(b) STYLES ========
const R_6B_HEADING = 176;
const R_6B_HEADER  = 178;
const R_6B_DATES   = 179;
const R_6B_SECTION = 180;
const R_6B_DYN_S   = 181;
const R_6B_DYN_E   = R_6B_DYN_S + note6bRows.length - 1;
const R_6B_ITALIC  = R_6B_DYN_E + 1;
const R_6B_TOTAL   = R_6B_DYN_E + 2;

// Merges for 6b
note5and6aSheet["!merges"].push(
  { s: { r: R_6B_HEADING, c: 0 }, e: { r: R_6B_HEADING, c: 4 } },
  { s: { r: R_6B_HEADER,  c: 2 }, e: { r: R_6B_HEADER,  c: 4 } },
  { s: { r: R_6B_HEADER,  c: 0 }, e: { r: R_6B_DATES,   c: 0 } },
  { s: { r: R_6B_SECTION, c: 0 }, e: { r: R_6B_SECTION, c: 4 } }
);

// Note heading box border
const ref6bH = XLSX.utils.encode_cell({ r: R_6B_HEADING, c: 0 });
note5and6aSheet[ref6bH].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 11 },
  alignment: { horizontal: "left" },
  border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } }
};

// "As at" header
const ref6bAsAt = XLSX.utils.encode_cell({ r: R_6B_HEADER, c: 2 });
note5and6aSheet[ref6bAsAt].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } };

// Particulars header
const ref6bPart = XLSX.utils.encode_cell({ r: R_6B_HEADER, c: 0 });
note5and6aSheet[ref6bPart].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: { style: "thin" } } };

// Date columns
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_6B_DATES, c });
  if (note5and6aSheet[ref]) note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } };
});

// Section heading bold
const ref6bSec = XLSX.utils.encode_cell({ r: R_6B_SECTION, c: 0 });
note5and6aSheet[ref6bSec].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left" } };

// Dynamic rows
for (let r = R_6B_DYN_S; r <= R_6B_DYN_E; r++) {
  const refA = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[refA]) note5and6aSheet[refA].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "left" } };
  [2, 3, 4].forEach(c => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (note5and6aSheet[ref]) note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "right" } };
  });
}

// Italic row
const ref6bItalic = XLSX.utils.encode_cell({ r: R_6B_ITALIC, c: 0 });
if (note5and6aSheet[ref6bItalic]) note5and6aSheet[ref6bItalic].s = { fill: YELLOW_FILL, font: { sz: 9, italic: true }, alignment: { horizontal: "left" } };

// TOTAL row
const ref6bTotalA = XLSX.utils.encode_cell({ r: R_6B_TOTAL, c: 0 });
note5and6aSheet[ref6bTotalA].s = { fill: YELLOW_FILL, font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } };
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_6B_TOTAL, c });
  if (note5and6aSheet[ref]) note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "right" },
    border: { top: { style: "medium" }, bottom: { style: "double" } }
  };
});

// ======== NOTE 6(c) STYLES ========
// Row indices - 6c starts after 6b
// 6b structure: heading(176), blank(177), header(178), dates(179), section(180), 
//               dyn rows(181 to 181+note6bRows.length-1), italic, total
// 6c starts 2 rows after 6b TOTAL

const R_6C_START   = R_6B_TOTAL + 3 // 2 spacer rows baad
const R_6C_HEADING = R_6C_START;
const R_6C_HEADER  = R_6C_START + 2;
const R_6C_DATES   = R_6C_START + 3;
const R_6C_SECTION = R_6C_START + 4;
const R_6C_DATA    = R_6C_START + 5;
const R_6C_TOTAL   = R_6C_START + 6;

// Merges for 6c
note5and6aSheet["!merges"].push(
  { s: { r: R_6C_HEADING, c: 0 }, e: { r: R_6C_HEADING, c: 4 } },
  { s: { r: R_6C_HEADER,  c: 2 }, e: { r: R_6C_HEADER,  c: 4 } },
  { s: { r: R_6C_HEADER,  c: 0 }, e: { r: R_6C_DATES,   c: 0 } },
  { s: { r: R_6C_SECTION, c: 0 }, e: { r: R_6C_SECTION, c: 4 } }
);

// Note heading box border
const ref6cH = XLSX.utils.encode_cell({ r: R_6C_HEADING, c: 0 });
if (!note5and6aSheet[ref6cH]) note5and6aSheet[ref6cH] = { t: "z", v: "" };
note5and6aSheet[ref6cH].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 11 },
  alignment: { horizontal: "left" },
  border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } }
};

// "As at" header
const ref6cAsAt = XLSX.utils.encode_cell({ r: R_6C_HEADER, c: 2 });
if (!note5and6aSheet[ref6cAsAt]) note5and6aSheet[ref6cAsAt] = { t: "z", v: "" };
note5and6aSheet[ref6cAsAt].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 9 },
  alignment: { horizontal: "center" },
  border: { bottom: { style: "thin" } }
};

// Particulars header
const ref6cPart = XLSX.utils.encode_cell({ r: R_6C_HEADER, c: 0 });
if (!note5and6aSheet[ref6cPart]) note5and6aSheet[ref6cPart] = { t: "z", v: "" };
note5and6aSheet[ref6cPart].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 9 },
  alignment: { horizontal: "left", vertical: "center" },
  border: { bottom: { style: "thin" } }
};

// Date columns
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_6C_DATES, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { bold: true, sz: 9 },
    alignment: { horizontal: "right" },
    border: { bottom: { style: "thin" } }
  };
});

// "Fixed Deposits:" - bold italic underline
const ref6cSec = XLSX.utils.encode_cell({ r: R_6C_SECTION, c: 0 });
if (!note5and6aSheet[ref6cSec]) note5and6aSheet[ref6cSec] = { t: "z", v: "" };
note5and6aSheet[ref6cSec].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 9, italic: true, underline: true },
  alignment: { horizontal: "left" }
};

// Data row - "Bank Deposit with maturity..."
const ref6cData = XLSX.utils.encode_cell({ r: R_6C_DATA, c: 0 });
if (!note5and6aSheet[ref6cData]) note5and6aSheet[ref6cData] = { t: "z", v: "" };
note5and6aSheet[ref6cData].s = {
  fill: YELLOW_FILL,
  font: { sz: 9 },
  alignment: { horizontal: "left" }
};
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_6C_DATA, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { sz: 9 },
    alignment: { horizontal: "right" }
  };
});

// TOTAL row - bold double underline
const ref6cTotalA = XLSX.utils.encode_cell({ r: R_6C_TOTAL, c: 0 });
if (!note5and6aSheet[ref6cTotalA]) note5and6aSheet[ref6cTotalA] = { t: "z", v: "" };
note5and6aSheet[ref6cTotalA].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 10 },
  alignment: { horizontal: "left" }
};
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_6C_TOTAL, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "right" },
    border: { top: { style: "medium" }, bottom: { style: "double" } }
  };
});

// Yellow fill spacer rows between 6b and 6c
[R_6B_TOTAL + 1, R_6B_TOTAL + 2].forEach(r => {
  for (let c = 0; c < 7; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    note5and6aSheet[ref].s = { fill: YELLOW_FILL };
  }
});


// ======== NOTE 7 STYLES ========
// Row indices dynamically calculate
const R_7_START    = R_6C_TOTAL + 3;   // 2 spacers + heading
const R_7_HEADING  = R_7_START;
const R_7_HEADER   = R_7_START + 2;
const R_7_DATES    = R_7_START + 3;
const R_7_DL_SEC   = R_7_START + 4;    // "Deferred tax liabilities"
const R_7_DL_ROW1  = R_7_START + 5;    // Property plant...
const R_7_DL_ROW2  = R_7_START + 6;    // Financial assets...
const R_7_DL_TOTAL = R_7_START + 7;    // Total Deferred tax liabilities
const R_7_BLANK    = R_7_START + 8;    // []
const R_7_DA_SEC   = R_7_START + 9;    // "Deferred tax assets"
const R_7_DA_ROW1  = R_7_START + 10;   // Impact of expenditure...
const R_7_DA_ROW2  = R_7_START + 11;   // Disallowances...
const R_7_DA_ROW3  = R_7_START + 12;   // Others
const R_7_DA_TOTAL = R_7_START + 13;   // Total Deferred tax assets
const R_7_BLANK2   = R_7_START + 14;   // []
const R_7_NET      = R_7_START + 15;   // DEFERRED TAX ASSETS (NET):

// Yellow fill for all Note 7 rows
for (let r = R_7_START - 2; r <= R_7_NET + 1; r++) {
  for (let c = 0; c < 7; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    if (!note5and6aSheet[ref].s) note5and6aSheet[ref].s = {};
    note5and6aSheet[ref].s.fill = YELLOW_FILL;
  }
}

// Merges for Note 7
note5and6aSheet["!merges"].push(
  { s: { r: R_7_HEADING, c: 0 }, e: { r: R_7_HEADING, c: 4 } },
  { s: { r: R_7_HEADER,  c: 2 }, e: { r: R_7_HEADER,  c: 4 } },
  { s: { r: R_7_HEADER,  c: 0 }, e: { r: R_7_DATES,   c: 0 } },
  { s: { r: R_7_DL_SEC,  c: 0 }, e: { r: R_7_DL_SEC,  c: 4 } },
  { s: { r: R_7_DA_SEC,  c: 0 }, e: { r: R_7_DA_SEC,  c: 4 } },
  { s: { r: R_7_DA_ROW1, c: 0 }, e: { r: R_7_DA_ROW1, c: 1 } }
);

// Note 7 heading - box border bold
const ref7H = XLSX.utils.encode_cell({ r: R_7_HEADING, c: 0 });
note5and6aSheet[ref7H].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 11 },
  alignment: { horizontal: "left" },
  border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } }
};

// "As at" header
const ref7AsAt = XLSX.utils.encode_cell({ r: R_7_HEADER, c: 2 });
note5and6aSheet[ref7AsAt].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } };

// Particulars header
const ref7Part = XLSX.utils.encode_cell({ r: R_7_HEADER, c: 0 });
note5and6aSheet[ref7Part].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: { style: "thin" } } };

// Date columns
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_7_DATES, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } };
});

// "Deferred tax liabilities" - bold underline
const ref7DlSec = XLSX.utils.encode_cell({ r: R_7_DL_SEC, c: 0 });
note5and6aSheet[ref7DlSec].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9, underline: true }, alignment: { horizontal: "left" } };

// DL data rows - right align numbers
[R_7_DL_ROW1, R_7_DL_ROW2].forEach(r => {
  const refA = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[refA]) note5and6aSheet[refA].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "left" } };
  [2, 3, 4].forEach(c => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "right" } };
  });
});

// "Total Deferred tax liabilities" - bold with borders
const ref7DlTotal = XLSX.utils.encode_cell({ r: R_7_DL_TOTAL, c: 0 });
note5and6aSheet[ref7DlTotal].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left" } };
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_7_DL_TOTAL, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { top: { style: "thin" }, bottom: { style: "thin" } } };
});

// "Deferred tax assets" - bold underline
const ref7DaSec = XLSX.utils.encode_cell({ r: R_7_DA_SEC, c: 0 });
note5and6aSheet[ref7DaSec].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9, underline: true }, alignment: { horizontal: "left" } };

// DA data rows - right align numbers
[R_7_DA_ROW1, R_7_DA_ROW2, R_7_DA_ROW3].forEach(r => {
  const refA = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[refA]) note5and6aSheet[refA].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "left" } };
  [2, 3, 4].forEach(c => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "right" } };
  });
});

// "Total Deferred tax assets" - bold with borders
const ref7DaTotal = XLSX.utils.encode_cell({ r: R_7_DA_TOTAL, c: 0 });
note5and6aSheet[ref7DaTotal].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left" } };
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_7_DA_TOTAL, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { top: { style: "thin" }, bottom: { style: "thin" } } };
});

// "DEFERRED TAX ASSETS (NET):" - bold double underline
const ref7Net = XLSX.utils.encode_cell({ r: R_7_NET, c: 0 });
note5and6aSheet[ref7Net].s = { fill: YELLOW_FILL, font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } };
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_7_NET, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "right" },
    border: { top: { style: "medium" }, bottom: { style: "double" } }
  };
});
// ======== END NOTE 7 STYLES ========

// ======== NOTE 8 STYLES ========
const R_8_START    = R_7_NET + 3;       // 2 spacers + heading
const R_8_HEADING  = R_8_START;
const R_8_HEADER   = R_8_START + 2;
const R_8_DATES    = R_8_START + 3;
const R_8_MAIN_SEC = R_8_START + 4;    // "Advances other than capital advances..."
const R_8_A_HEAD   = R_8_START + 5;    // "(a). Advances to Related parties*"
const R_8_A_ROW1   = R_8_START + 6;    // Advance to subsidiary
const R_8_A_ROW2   = R_8_START + 7;    // Advance to Other Parties
const R_8_B_HEAD   = R_8_START + 8;    // "(b). Parties other than related parties"
const R_8_B_ROW1   = R_8_START + 9;    // Advances for Land
const R_8_B_ROW2   = R_8_START + 10;   // Advance to Other Parties.
const R_8_C_HEAD   = R_8_START + 11;   // "(c). Amount recoverable..."
const R_8_C_ROW1   = R_8_START + 12;   // Value Added Tax
const R_8_TOTAL    = R_8_START + 13;   // TOTAL:
const R_8_FOOTNOTE = R_8_START + 14;   // *Rate of Interest...

// Yellow fill for all Note 8 rows
for (let r = R_8_START - 2; r <= R_8_FOOTNOTE + 1; r++) {
  for (let c = 0; c < 7; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    if (!note5and6aSheet[ref].s) note5and6aSheet[ref].s = {};
    note5and6aSheet[ref].s.fill = YELLOW_FILL;
  }
}

// Merges for Note 8
note5and6aSheet["!merges"].push(
  { s: { r: R_8_HEADING,  c: 0 }, e: { r: R_8_HEADING,  c: 4 } },
  { s: { r: R_8_HEADER,   c: 2 }, e: { r: R_8_HEADER,   c: 4 } },
  { s: { r: R_8_HEADER,   c: 0 }, e: { r: R_8_DATES,    c: 0 } },
  { s: { r: R_8_MAIN_SEC, c: 0 }, e: { r: R_8_MAIN_SEC, c: 4 } },
  { s: { r: R_8_A_HEAD,   c: 0 }, e: { r: R_8_A_HEAD,   c: 4 } },
  { s: { r: R_8_B_HEAD,   c: 0 }, e: { r: R_8_B_HEAD,   c: 4 } },
  { s: { r: R_8_C_HEAD,   c: 0 }, e: { r: R_8_C_HEAD,   c: 4 } },
  { s: { r: R_8_FOOTNOTE, c: 0 }, e: { r: R_8_FOOTNOTE, c: 4 } }
);

// Note 8 heading - box border bold
const ref8H = XLSX.utils.encode_cell({ r: R_8_HEADING, c: 0 });
note5and6aSheet[ref8H].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 11 },
  alignment: { horizontal: "left" },
  border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } }
};

// "As at" header
const ref8AsAt = XLSX.utils.encode_cell({ r: R_8_HEADER, c: 2 });
note5and6aSheet[ref8AsAt].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } };

// Particulars header
const ref8Part = XLSX.utils.encode_cell({ r: R_8_HEADER, c: 0 });
note5and6aSheet[ref8Part].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: { style: "thin" } } };

// Date columns
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_8_DATES, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } };
});

// "Advances other than capital advances- Unsecured" - bold
const ref8MainSec = XLSX.utils.encode_cell({ r: R_8_MAIN_SEC, c: 0 });
note5and6aSheet[ref8MainSec].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left" } };

// "(a). Advances to Related parties*" - bold underline
const ref8AHead = XLSX.utils.encode_cell({ r: R_8_A_HEAD, c: 0 });
note5and6aSheet[ref8AHead].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9, underline: true }, alignment: { horizontal: "left" } };

// "(b). Parties other than related parties" - underline
const ref8BHead = XLSX.utils.encode_cell({ r: R_8_B_HEAD, c: 0 });
note5and6aSheet[ref8BHead].s = { fill: YELLOW_FILL, font: { sz: 9, underline: true }, alignment: { horizontal: "left" } };

// "(c). Amount recoverable from government authorities:" - underline
const ref8CHead = XLSX.utils.encode_cell({ r: R_8_C_HEAD, c: 0 });
note5and6aSheet[ref8CHead].s = { fill: YELLOW_FILL, font: { sz: 9, underline: true }, alignment: { horizontal: "left" } };

// Data rows - right align numbers
[R_8_A_ROW1, R_8_A_ROW2, R_8_B_ROW1, R_8_B_ROW2, R_8_C_ROW1].forEach(r => {
  const refA = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[refA]) note5and6aSheet[refA].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "left" } };
  [2, 3, 4].forEach(c => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "right" } };
  });
});

// TOTAL row - bold double underline
const ref8TotalA = XLSX.utils.encode_cell({ r: R_8_TOTAL, c: 0 });
note5and6aSheet[ref8TotalA].s = { fill: YELLOW_FILL, font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } };
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_8_TOTAL, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "right" },
    border: { top: { style: "medium" }, bottom: { style: "double" } }
  };
});

// Footnote - italic small
const ref8Foot = XLSX.utils.encode_cell({ r: R_8_FOOTNOTE, c: 0 });
if (note5and6aSheet[ref8Foot]) note5and6aSheet[ref8Foot].s = { fill: YELLOW_FILL, font: { sz: 8, italic: true, underline: true }, alignment: { horizontal: "left" } };
// ======== END NOTE 8 STYLES ========


// ======== NOTE 9 STYLES ========
const R_9_START    = R_8_FOOTNOTE + 3;
const R_9_HEADING  = R_9_START;
const R_9_HEADER   = R_9_START + 2;
const R_9_DATES    = R_9_START + 3;
const R_9_ROW1     = R_9_START + 4;   // Raw materials
const R_9_ROW2     = R_9_START + 5;   // Finished goods
const R_9_ROW3     = R_9_START + 6;   // Project Units in progress
const R_9_TOTAL    = R_9_START + 7;   // TOTAL:
const R_9_FOOTNOTE = R_9_START + 8;   // *All Inventories...

// Yellow fill
for (let r = R_9_START - 2; r <= R_9_FOOTNOTE + 1; r++) {
  for (let c = 0; c < 7; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    if (!note5and6aSheet[ref].s) note5and6aSheet[ref].s = {};
    note5and6aSheet[ref].s.fill = YELLOW_FILL;
  }
}

// Merges
note5and6aSheet["!merges"].push(
  { s: { r: R_9_HEADING,  c: 0 }, e: { r: R_9_HEADING,  c: 4 } },
  { s: { r: R_9_HEADER,   c: 2 }, e: { r: R_9_HEADER,   c: 4 } },
  { s: { r: R_9_HEADER,   c: 0 }, e: { r: R_9_DATES,    c: 0 } },
  { s: { r: R_9_FOOTNOTE, c: 0 }, e: { r: R_9_FOOTNOTE, c: 4 } }
);

// Heading - box border bold
const ref9H = XLSX.utils.encode_cell({ r: R_9_HEADING, c: 0 });
note5and6aSheet[ref9H].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 11 },
  alignment: { horizontal: "left" },
  border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } }
};

// "As at" header
const ref9AsAt = XLSX.utils.encode_cell({ r: R_9_HEADER, c: 2 });
note5and6aSheet[ref9AsAt].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } };

// Particulars header
const ref9Part = XLSX.utils.encode_cell({ r: R_9_HEADER, c: 0 });
note5and6aSheet[ref9Part].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: { style: "thin" } } };

// Date columns
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_9_DATES, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } };
});

// Data rows
[R_9_ROW1, R_9_ROW2, R_9_ROW3].forEach(r => {
  const refA = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[refA]) note5and6aSheet[refA].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "left" } };
  [2, 3, 4].forEach(c => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "right" } };
  });
});

// TOTAL - bold double underline
const ref9TotalA = XLSX.utils.encode_cell({ r: R_9_TOTAL, c: 0 });
note5and6aSheet[ref9TotalA].s = { fill: YELLOW_FILL, font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } };
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_9_TOTAL, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "right" },
    border: { top: { style: "medium" }, bottom: { style: "double" } }
  };
});

// Footnote - italic small
const ref9Foot = XLSX.utils.encode_cell({ r: R_9_FOOTNOTE, c: 0 });
if (note5and6aSheet[ref9Foot]) note5and6aSheet[ref9Foot].s = { fill: YELLOW_FILL, font: { sz: 8, italic: true }, alignment: { horizontal: "left" } };
// ======== END NOTE 9 STYLES ========


// ======== NOTE 10(a) STYLES ========
const R_10A_START    = R_9_FOOTNOTE + 3;
const R_10A_HEAD1    = R_10A_START;          // "10. FINANCIAL ASSETS"
const R_10A_HEAD2    = R_10A_START + 1;      // "10(a). TRADE RECEIVABLES"
const R_10A_HEADER   = R_10A_START + 3;      // Particulars / As at
const R_10A_DATES    = R_10A_START + 4;      // Date row
const R_10A_DYN_S    = R_10A_START + 5;      // Dynamic rows start
const R_10A_DYN_E    = R_10A_DYN_S + note10aRows.length - 1;
const R_10A_BLANK    = R_10A_DYN_E + 1;      // blank row
const R_10A_TOTAL    = R_10A_DYN_E + 2;      // TOTAL:
const R_10A_FOOTNOTE = R_10A_DYN_E + 3;      // * footnote

// Yellow fill
for (let r = R_10A_START - 2; r <= R_10A_FOOTNOTE + 2; r++) {
  for (let c = 0; c < 7; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    if (!note5and6aSheet[ref].s) note5and6aSheet[ref].s = {};
    note5and6aSheet[ref].s.fill = YELLOW_FILL;
  }
}

// Merges
note5and6aSheet["!merges"].push(
  { s: { r: R_10A_HEAD1,    c: 0 }, e: { r: R_10A_HEAD1,    c: 4 } },
  { s: { r: R_10A_HEAD2,    c: 0 }, e: { r: R_10A_HEAD2,    c: 4 } },
  { s: { r: R_10A_HEADER,   c: 2 }, e: { r: R_10A_HEADER,   c: 4 } },
  { s: { r: R_10A_HEADER,   c: 0 }, e: { r: R_10A_DATES,    c: 0 } },
  { s: { r: R_10A_FOOTNOTE, c: 0 }, e: { r: R_10A_FOOTNOTE, c: 4 } }
);

// "10. FINANCIAL ASSETS" - box border bold
const ref10H1 = XLSX.utils.encode_cell({ r: R_10A_HEAD1, c: 0 });
note5and6aSheet[ref10H1].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 11 },
  alignment: { horizontal: "left" },
  border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } }
};

// "10(a). TRADE RECEIVABLES" - box border bold
const ref10H2 = XLSX.utils.encode_cell({ r: R_10A_HEAD2, c: 0 });
note5and6aSheet[ref10H2].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 11 },
  alignment: { horizontal: "left" },
  border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } }
};

// "As at" header
const ref10AsAt = XLSX.utils.encode_cell({ r: R_10A_HEADER, c: 2 });
note5and6aSheet[ref10AsAt].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } };

// Particulars header
const ref10Part = XLSX.utils.encode_cell({ r: R_10A_HEADER, c: 0 });
note5and6aSheet[ref10Part].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: { style: "thin" } } };

// Date columns
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_10A_DATES, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } };
});

// Dynamic rows
for (let r = R_10A_DYN_S; r <= R_10A_DYN_E; r++) {
  const refA = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[refA]) note5and6aSheet[refA].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "left" } };
  [2, 3, 4].forEach(c => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "right" } };
  });
}

// TOTAL - bold double underline
const ref10TotalA = XLSX.utils.encode_cell({ r: R_10A_TOTAL, c: 0 });
note5and6aSheet[ref10TotalA].s = { fill: YELLOW_FILL, font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } };
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_10A_TOTAL, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "right" },
    border: { top: { style: "medium" }, bottom: { style: "double" } }
  };
});

// Footnote - italic small
const ref10Foot = XLSX.utils.encode_cell({ r: R_10A_FOOTNOTE, c: 0 });
if (note5and6aSheet[ref10Foot]) note5and6aSheet[ref10Foot].s = {
  fill: YELLOW_FILL,
  font: { sz: 8, italic: true },
  alignment: { horizontal: "left", wrapText: true }
};
// ======== END NOTE 10(a) STYLES ========


// ======== NOTE 10(b) STYLES ========
const R_10B_START   = R_10A_FOOTNOTE + 4;
const R_10B_HEADING = R_10B_START;
const R_10B_HEADER  = R_10B_START + 2;
const R_10B_DATES   = R_10B_START + 3;
const R_10B_SEC     = R_10B_START + 4;    // "Balances with banks"
const R_10B_DYN_S   = R_10B_START + 5;
const R_10B_DYN_E   = R_10B_DYN_S + note10bRows.length - 1;
const R_10B_TOTAL   = R_10B_DYN_E + 1;

// Yellow fill
for (let r = R_10B_START - 2; r <= R_10B_TOTAL + 2; r++) {
  for (let c = 0; c < 7; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    if (!note5and6aSheet[ref].s) note5and6aSheet[ref].s = {};
    note5and6aSheet[ref].s.fill = YELLOW_FILL;
  }
}

// Merges
note5and6aSheet["!merges"].push(
  { s: { r: R_10B_HEADING, c: 0 }, e: { r: R_10B_HEADING, c: 4 } },
  { s: { r: R_10B_HEADER,  c: 2 }, e: { r: R_10B_HEADER,  c: 4 } },
  { s: { r: R_10B_HEADER,  c: 0 }, e: { r: R_10B_DATES,   c: 0 } },
  { s: { r: R_10B_SEC,     c: 0 }, e: { r: R_10B_SEC,     c: 4 } }
);

// Heading - box border bold
const ref10bH = XLSX.utils.encode_cell({ r: R_10B_HEADING, c: 0 });
note5and6aSheet[ref10bH].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 11 },
  alignment: { horizontal: "left" },
  border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } }
};

// "As at" header
const ref10bAsAt = XLSX.utils.encode_cell({ r: R_10B_HEADER, c: 2 });
note5and6aSheet[ref10bAsAt].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } };

// Particulars header
const ref10bPart = XLSX.utils.encode_cell({ r: R_10B_HEADER, c: 0 });
note5and6aSheet[ref10bPart].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: { style: "thin" } } };

// Date columns
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_10B_DATES, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } };
});

// "Balances with banks" - bold
const ref10bSec = XLSX.utils.encode_cell({ r: R_10B_SEC, c: 0 });
note5and6aSheet[ref10bSec].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left" } };

// Dynamic rows
for (let r = R_10B_DYN_S; r <= R_10B_DYN_E; r++) {
  const refA = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[refA]) note5and6aSheet[refA].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "left" } };
  [2, 3, 4].forEach(c => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "right" } };
  });
}

// TOTAL - bold double underline
const ref10bTotalA = XLSX.utils.encode_cell({ r: R_10B_TOTAL, c: 0 });
note5and6aSheet[ref10bTotalA].s = { fill: YELLOW_FILL, font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } };
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_10B_TOTAL, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "right" },
    border: { top: { style: "medium" }, bottom: { style: "double" } }
  };
});
// ======== END NOTE 10(b) STYLES ========

// ======== NOTE 10(c) STYLES ========
const R_10C_START    = R_10B_TOTAL + 4;
const R_10C_HEADING  = R_10C_START;
const R_10C_HEADER   = R_10C_START + 2;
const R_10C_DATES    = R_10C_START + 3;
const R_10C_SEC      = R_10C_START + 4;    // "Fixed Deposits **"
const R_10C_DYN_S    = R_10C_START + 5;
const R_10C_DYN_E    = R_10C_DYN_S + note10cRows.length - 1;
const R_10C_BLANK    = R_10C_DYN_E + 1;
const R_10C_TOTAL    = R_10C_DYN_E + 2;
const R_10C_NOTE     = R_10C_DYN_E + 3;   // "** Note:"
const R_10C_FOOT1    = R_10C_DYN_E + 4;   // (i) footnote
const R_10C_FOOT2    = R_10C_DYN_E + 5;   // (ii) footnote

// Yellow fill
for (let r = R_10C_START - 2; r <= R_10C_FOOT2 + 1; r++) {
  for (let c = 0; c < 7; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    if (!note5and6aSheet[ref].s) note5and6aSheet[ref].s = {};
    note5and6aSheet[ref].s.fill = YELLOW_FILL;
  }
}

// Merges
note5and6aSheet["!merges"].push(
  { s: { r: R_10C_HEADING, c: 0 }, e: { r: R_10C_HEADING, c: 4 } },
  { s: { r: R_10C_HEADER,  c: 2 }, e: { r: R_10C_HEADER,  c: 4 } },
  { s: { r: R_10C_HEADER,  c: 0 }, e: { r: R_10C_DATES,   c: 0 } },
  { s: { r: R_10C_SEC,     c: 0 }, e: { r: R_10C_SEC,     c: 4 } },
  { s: { r: R_10C_NOTE,    c: 0 }, e: { r: R_10C_NOTE,    c: 4 } },
  { s: { r: R_10C_FOOT1,   c: 0 }, e: { r: R_10C_FOOT1,   c: 4 } },
  { s: { r: R_10C_FOOT2,   c: 0 }, e: { r: R_10C_FOOT2,   c: 4 } }
);

// Heading - box border bold
const ref10cH = XLSX.utils.encode_cell({ r: R_10C_HEADING, c: 0 });
note5and6aSheet[ref10cH].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 11 },
  alignment: { horizontal: "left" },
  border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } }
};

// "As at" header
const ref10cAsAt = XLSX.utils.encode_cell({ r: R_10C_HEADER, c: 2 });
note5and6aSheet[ref10cAsAt].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } };

// Particulars header
const ref10cPart = XLSX.utils.encode_cell({ r: R_10C_HEADER, c: 0 });
note5and6aSheet[ref10cPart].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: { style: "thin" } } };

// Date columns
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_10C_DATES, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } };
});

// "Fixed Deposits **" - bold italic
const ref10cSec = XLSX.utils.encode_cell({ r: R_10C_SEC, c: 0 });
note5and6aSheet[ref10cSec].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9, italic: true }, alignment: { horizontal: "left" } };

// Dynamic rows
for (let r = R_10C_DYN_S; r <= R_10C_DYN_E; r++) {
  const refA = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[refA]) note5and6aSheet[refA].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "left" } };
  [2, 3, 4].forEach(c => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "right" } };
  });
}

// TOTAL - bold double underline
const ref10cTotalA = XLSX.utils.encode_cell({ r: R_10C_TOTAL, c: 0 });
note5and6aSheet[ref10cTotalA].s = { fill: YELLOW_FILL, font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } };
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_10C_TOTAL, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "right" },
    border: { top: { style: "medium" }, bottom: { style: "double" } }
  };
});

// "** Note:" - bold
const ref10cNote = XLSX.utils.encode_cell({ r: R_10C_NOTE, c: 0 });
if (note5and6aSheet[ref10cNote]) note5and6aSheet[ref10cNote].s = { fill: YELLOW_FILL, font: { bold: true, sz: 8 }, alignment: { horizontal: "left" } };

// Footnotes (i) and (ii) - italic small
[R_10C_FOOT1, R_10C_FOOT2].forEach(r => {
  const ref = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[ref]) note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { sz: 8, italic: true },
    alignment: { horizontal: "left", wrapText: true }
  };
});
// ======== END NOTE 10(c) STYLES ========

// ======== NOTE 10(d) STYLES ========
const R_10D_START   = R_10C_FOOT2 + 4;
const R_10D_HEADING = R_10D_START;
const R_10D_HEADER  = R_10D_START + 2;
const R_10D_DATES   = R_10D_START + 3;
const R_10D_DYN_S   = R_10D_START + 4;
const R_10D_DYN_E   = R_10D_DYN_S + note10dRows.length - 1;
const R_10D_TOTAL   = R_10D_DYN_E + 1;
const R_10D_FOOT1   = R_10D_DYN_E + 2;
const R_10D_FOOT2   = R_10D_DYN_E + 3;

// Yellow fill
for (let r = R_10D_START - 2; r <= R_10D_FOOT2 + 1; r++) {
  for (let c = 0; c < 7; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    if (!note5and6aSheet[ref].s) note5and6aSheet[ref].s = {};
    note5and6aSheet[ref].s.fill = YELLOW_FILL;
  }
}

// Merges
note5and6aSheet["!merges"].push(
  { s: { r: R_10D_HEADING, c: 0 }, e: { r: R_10D_HEADING, c: 4 } },
  { s: { r: R_10D_HEADER,  c: 2 }, e: { r: R_10D_HEADER,  c: 4 } },
  { s: { r: R_10D_HEADER,  c: 0 }, e: { r: R_10D_DATES,   c: 0 } },
  { s: { r: R_10D_FOOT1,   c: 0 }, e: { r: R_10D_FOOT1,   c: 4 } },
  { s: { r: R_10D_FOOT2,   c: 0 }, e: { r: R_10D_FOOT2,   c: 4 } }
);

// Heading - box border bold
const ref10dH = XLSX.utils.encode_cell({ r: R_10D_HEADING, c: 0 });
note5and6aSheet[ref10dH].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 11 },
  alignment: { horizontal: "left" },
  border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } }
};

// "As at" header
const ref10dAsAt = XLSX.utils.encode_cell({ r: R_10D_HEADER, c: 2 });
note5and6aSheet[ref10dAsAt].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } };

// Particulars header
const ref10dPart = XLSX.utils.encode_cell({ r: R_10D_HEADER, c: 0 });
note5and6aSheet[ref10dPart].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: { style: "thin" } } };

// Date columns
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_10D_DATES, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } };
});

// Dynamic rows
for (let r = R_10D_DYN_S; r <= R_10D_DYN_E; r++) {
  const refA = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[refA]) note5and6aSheet[refA].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "left" } };
  [2, 3, 4].forEach(c => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "right" } };
  });
}

// TOTAL - bold double underline
const ref10dTotalA = XLSX.utils.encode_cell({ r: R_10D_TOTAL, c: 0 });
note5and6aSheet[ref10dTotalA].s = { fill: YELLOW_FILL, font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } };
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_10D_TOTAL, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "right" },
    border: { top: { style: "medium" }, bottom: { style: "double" } }
  };
});

// Footnotes - italic small
[R_10D_FOOT1, R_10D_FOOT2].forEach(r => {
  const ref = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[ref]) note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { sz: 8, italic: true },
    alignment: { horizontal: "left", wrapText: true }
  };
});
// ======== END NOTE 10(d) STYLES ========

// ======== NOTE 11 STYLES ========
const R_11_START    = R_10D_FOOT2 + 3;
const R_11_HEADING  = R_11_START;
const R_11_HEADER   = R_11_START + 2;
const R_11_DATES    = R_11_START + 3;
const R_11_SEC      = R_11_START + 4;   // "Considered good – Unsecured"
const R_11_ROW1     = R_11_START + 5;   // Prepaid expenses
const R_11_ROW2     = R_11_START + 6;   // Balance with government authorities:
const R_11_ROW3     = R_11_START + 7;   // -- GST Input Credit
const R_11_ROW4     = R_11_START + 8;   // -- Advance tax
const R_11_TOTAL    = R_11_START + 9;   // TOTAL:

// Yellow fill
for (let r = R_11_START - 2; r <= R_11_TOTAL + 1; r++) {
  for (let c = 0; c < 7; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    if (!note5and6aSheet[ref].s) note5and6aSheet[ref].s = {};
    note5and6aSheet[ref].s.fill = YELLOW_FILL;
  }
}

// Merges
note5and6aSheet["!merges"].push(
  { s: { r: R_11_HEADING, c: 0 }, e: { r: R_11_HEADING, c: 4 } },
  { s: { r: R_11_HEADER,  c: 2 }, e: { r: R_11_HEADER,  c: 4 } },
  { s: { r: R_11_HEADER,  c: 0 }, e: { r: R_11_DATES,   c: 0 } },
  { s: { r: R_11_SEC,     c: 0 }, e: { r: R_11_SEC,     c: 4 } },
  { s: { r: R_11_ROW2,    c: 0 }, e: { r: R_11_ROW2,    c: 4 } }
);

// Heading - box border bold
const ref11H = XLSX.utils.encode_cell({ r: R_11_HEADING, c: 0 });
note5and6aSheet[ref11H].s = {
  fill: YELLOW_FILL,
  font: { bold: true, sz: 11 },
  alignment: { horizontal: "left" },
  border: { top: { style: "medium" }, bottom: { style: "medium" }, left: { style: "medium" }, right: { style: "medium" } }
};

// "As at" header
const ref11AsAt = XLSX.utils.encode_cell({ r: R_11_HEADER, c: 2 });
note5and6aSheet[ref11AsAt].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } };

// Particulars header
const ref11Part = XLSX.utils.encode_cell({ r: R_11_HEADER, c: 0 });
note5and6aSheet[ref11Part].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "left", vertical: "center" }, border: { bottom: { style: "thin" } } };

// Date columns
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_11_DATES, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9 }, alignment: { horizontal: "right" }, border: { bottom: { style: "thin" } } };
});

// "Considered good – Unsecured" - bold underline
const ref11Sec = XLSX.utils.encode_cell({ r: R_11_SEC, c: 0 });
note5and6aSheet[ref11Sec].s = { fill: YELLOW_FILL, font: { bold: true, sz: 9, underline: true }, alignment: { horizontal: "left" } };

// "Balance with government authorities:" - normal
const ref11Row2 = XLSX.utils.encode_cell({ r: R_11_ROW2, c: 0 });
note5and6aSheet[ref11Row2].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "left" } };

// Data rows - right align numbers
[R_11_ROW1, R_11_ROW3, R_11_ROW4].forEach(r => {
  const refA = XLSX.utils.encode_cell({ r, c: 0 });
  if (note5and6aSheet[refA]) note5and6aSheet[refA].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "left" } };
  [2, 3, 4].forEach(c => {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
    note5and6aSheet[ref].s = { fill: YELLOW_FILL, font: { sz: 9 }, alignment: { horizontal: "right" } };
  });
});

// TOTAL - bold double underline
const ref11TotalA = XLSX.utils.encode_cell({ r: R_11_TOTAL, c: 0 });
note5and6aSheet[ref11TotalA].s = { fill: YELLOW_FILL, font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } };
[2, 3, 4].forEach(c => {
  const ref = XLSX.utils.encode_cell({ r: R_11_TOTAL, c });
  if (!note5and6aSheet[ref]) note5and6aSheet[ref] = { t: "z", v: "" };
  note5and6aSheet[ref].s = {
    fill: YELLOW_FILL,
    font: { bold: true, sz: 10 },
    alignment: { horizontal: "right" },
    border: { top: { style: "medium" }, bottom: { style: "double" } }
  };
});
// ======== END NOTE 11 STYLES ========

// Row heights
note5and6aSheet["!rows"] = [];
note5and6aSheet["!rows"][18] = { hpt: 28 };
note5and6aSheet["!rows"][26] = { hpt: 28 };
note5and6aSheet["!rows"][34] = { hpt: 28 };

XLSX.utils.book_append_sheet(workbook, note5and6aSheet, "5-11");



// ======================
// SHEET - NOTE 30-44
// ======================

const note3044SheetData = [
  // Row 0: Company name
  ["XYZ INFRASTRUCTURE & PROPERTIES LIMITED"],
  // Row 1
  ["NOTES TO THE STANDALONE FINANCIAL STATEMENTS"],
  // Row 2
  ["FOR THE PERIOD ENDED SEPTEMBER 30, 2025"],
  // Row 3
  ["(All amounts are in ₹ millions, unless stated otherwise)"],
  // Row 4
  [],
  // Row 5
  ["30. INTEREST IN OTHER ENTITIES"],
  // Row 6
  [],
  // Row 7
  ["a. Subsidiaries"],
  // Row 8
  ["The Company's interest and share in subsidiaries (Including fellow Subsidiaries) are set out below. Unless otherwise stated, the proportion of ownership interests held equals the voting rights held by the Company, directly or indirectly, and the country of incorporation or registration is also their principal place of business."],
  // Row 9: Header
  ["Name of entities", "Country of\nIncorporation", "Ownership interest as at", "", ""],
  // Row 10: Date sub-header
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  // Row 11-onwards: Subsidiary data
  ["A P Utility Services Limited",                    "India", "100%", "100%", "100%"],
  ["XYZ Real Estate Limited#",                     "India", "30%",  "30%",  "30%"],
  ["Adhikari Properties Limited",                     "India", "100%", "100%", "100%"],
  ["Amazon Infra Realtors Limited",                   "India", "100%", "100%", "100%"],
  ["Amazon Infracon Limited",                         "India", "100%", "100%", "100%"],
  ["Amazon Real Estate Limited",                      "India", "100%", "100%", "100%"],
  ["AP Projects Limited",                             "India", "100%", "100%", "100%"],
  ["Chiranjiv Builders Limited",                      "India", "100%", "100%", "100%"],
  ["XYZ County Limited",                           "India", "100%", "100%", "100%"],
  ["XYZ Greens Limited",                           "India", "100%", "100%", "100%"],
  ["XYZ Homes Projects Limited",                   "India", "100%", "100%", "100%"],
  ["Ethenic Projects Private Limited",                "India", "100%", "100%", "100%"],
  ["Ethenic Real Estate Private Limited",             "India", "100%", "100%", "100%"],
  ["Green Park Buildwell Limited",                    "India", "100%", "100%", "100%"],
  ["Green Park Infracon Limited",                     "India", "100%", "100%", "100%"],
  ["XYZ Green Park Infrastructure Limited",        "India", "100%", "100%", "100%"],
  ["Hi Pride Infracon Limited",                       "India", "100%", "100%", "100%"],
  ["Shri Ajitnath Buildcon Limited",                  "India", "100%", "100%", "100%"],
  ["Maksad Estate and Hardware Limited",              "India", "100%", "100%", "100%"],
  ["XYZ Maksad Properties Limited",                "India", "100%", "100%", "100%"],
  ["Mansarover Realtors Limited",                     "India", "100%", "100%", "100%"],
  ["Pigeon Infrastructure Limited",                   "India", "100%", "100%", "100%"],
  ["Pigeon Properties Limited",                       "India", "100%", "100%", "100%"],
  ["S M Buildcon Limited",                            "India", "100%", "100%", "100%"],
  ["Sayana Builders Company Limited",                 "India", "100%", "100%", "100%"],
  ["Sayana Infrastructure & Properties limited",      "India", "100%", "100%", "100%"],
  ["Sayana Realtors Company Limited",                 "India", "100%", "100%", "100%"],
  ["Swarnim Nirman Private Limited",                  "India", "100%", "100%", "100%"],
  ["Alternative Habitat Private Limited",             "India", "100%", "100%", "100%"],
  ["XYZ Sohna Projects Limited",                   "India", "100%", "100%", "100%"],
  ["Mehak Realtors Private Limited**",                "India", "100%", "100%", "100%"],
  ["Shramika Infrastructure Private Limited**",       "India", "100%", "100%", "100%"],
  ["Kedarnath Buildwell Private Limited**",           "India", "100%", "100%", "100%"],
  ["Ethenic Buildwell Private Limited**",             "India", "100%", "100%", "100%"],
  ["Ethenic Realtors Private Limited **",             "India", "100%", "100%", "100%"],
  ["Santur Builders Private Limited",                 "India", "0%",   "0%",   "100%"],
  ["XYZ Homes Developers Limited",                 "India", "70%",  "70%",  "100%"],
  ["XYZ Serendipity Limited",                      "India", "100%", "100%", "100%"],
  ["XYZ Infratech Realtors Limited",               "India", "100%", "100%", "100%"],
  ["XYZ Infracon Realtors Limited",                "India", "100%", "100%", "100%"],
  ["XYZ Townships & Housing Limited",              "India", "100%", "100%", "100%"],
  ["Ability Constructions Private Limited***",        "India", "100%", "100%", "100%"],
  ["Villa Construction Private Limited",              "India", "100%", "100%", "100%"],
  ["Best View Infracon Limited",                      "India", "100%", "100%", "100%"],
  ["XYZ Sidcul Industrial Park Limited",           "India", "89%",  "89%",  "89%"],
  ["Blueridge Retails Private Limited",               "India", "70%",  "70%",  "70%"],
  ["XYZ Infrabuild Limited",                       "India", "67%",  "67%",  "67%"],
  ["Popular Infratech Private Limited*",              "India", "67%",  "67%",  "67%"],
  ["Welcome Infra Developers Private Limited *",      "India", "67%",  "67%",  "67%"],
  ["Mars Buildtech Private Limited*",                 "India", "67%",  "67%",  "67%"],
  ["Welcome Infrabuild Private Limited *",            "India", "67%",  "67%",  "67%"],
  ["Coolcorp Real Infra Private Limited*",            "India", "67%",  "67%",  "67%"],
  ["Hope Valley Infrastructure Private Limited*",    "India", "67%",  "67%",  "67%"],
  ["XYZ Abode Estates Solution Limited",           "India", "100%", "100%", "100%"],
  ["Havenclass Homes Solutions Limited",              "India", "100%", "100%", "100%"],
  ["XYZ Goodliving Properties Limited",            "India", "70%",  "70%",  "0%"],
  ["Subhagyam Constructions Limited",                 "India", "100%", "100%", "0%"],
  ["Primula Luxury Homes Private Limited",            "India", "90%",  "90%",  "0%"],
  ["JITF ESIPL CETP (Sitarganj) Limited ^",           "India", "43.61%", "43.61%", "43.61%"],
  [],
  ["#Subsidiary of Sayana Builders Company Limited"],
  ["*Subsidiary of XYZ Infrabuild Limited"],
  ["**Subsidiary of XYZ Sohna Projects Limited"],
  ["***Subsidiary of XYZ Townships & Housing Limited"],
  ["^ Joint Venture of XYZ Sidcul Industrial Park Limited"],
  [],
  // Joint Ventures
  ["b. Joint ventures"],
  [],
  ["Name of entities", "Country of\nIncorporation", "Ownership interest as at", "", ""],
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  ["Wondrous Buildmart Private Limited", "India", "10%", "10%", "10%"],
  [],
  // NOTE 31
  ["31. RELATED PARTY DISCLOSURES"],
  [],
  ["Related party disclosure as required by Ind-AS 24 \"Related Party Disclosures\" for the period ended September 31, 2025 are given below:"],
  [],
  ["Names of related parties and nature of related party relationship:"],
  [],
  ["(i)  Parties over which the Company has control"],
  ["Interest in subsidiaries, including associates and joint ventures, are set out in Note 30."],
  [],
  ["(ii) Key management personnel (KMP):"],
  ["      a.   Mr. Pankaj Bajaj",          "", "", "", "Managing Director"],
  ["      b.   Mr. Manish Jaiswal",         "", "", "", "Chief Executive Officer"],
  ["      c.   Mr. Rajiv Khurana",          "", "", "", "Chief Financial Officer [w.e.f. 16 July 2025]"],
  ["      d.   Mr. Sanjay Kumar Aggarwal",  "", "", "", "Chief Financial Officer [Upto: 15 July 2025]"],
  ["      e.   Ms. Swati Gupta",            "", "", "", "Company Secretary and Complience Officer"],
  [],
  ["(iii) Relatives of key management personnel (KMP) (with whom transactions are entered during the period and Balances as at September 30, 2025):"],
  ["      a.   Mrs. Asha Bajaj",    "", "", "", "Mother of Mr. Pankaj Bajaj, Managing Director"],
  ["      b.   Mrs. Bandana Kohli", "", "", "", "Wife of Mr. Pankaj Bajaj, Managing Director"],
  [],
  ["(iv)  Enterprises under significant influence of key management personnel, directors and their relatives (with whom transactions are entered during the year):"],
  ["      a.   Mannat Homes Private Limited"],
  ["      b.   Kohltec Constructions"],
  ["      c.   XYZ Housing & Industries Limited"],
  ["      d.   Omni Farms Private Limited"],
];

const note3044Sheet = XLSX.utils.aoa_to_sheet(note3044SheetData);

// Hide gridlines
note3044Sheet["!sheetView"] = [{ showGridLines: false }];

// Column widths
note3044Sheet["!cols"] = [
  { wch: 48 },  // A - Name of entities
  { wch: 14 },  // B - Country
  { wch: 20 },  // C - Sep 30, 2025
  { wch: 16 },  // D - Mar 31, 2025
  { wch: 40 },  // E - Mar 31, 2024 / Designation
];

// Merges
note3044Sheet["!merges"] = [
  // Header rows
  { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
  { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
  { s: { r: 3, c: 0 }, e: { r: 3, c: 4 } },
  { s: { r: 5, c: 0 }, e: { r: 5, c: 4 } },  // Note 30 heading
  { s: { r: 7, c: 0 }, e: { r: 7, c: 4 } },  // a. Subsidiaries
  { s: { r: 8, c: 0 }, e: { r: 8, c: 4 } },  // paragraph
  { s: { r: 9, c: 2 }, e: { r: 9, c: 4 } },  // "Ownership interest as at"
];

// ---- STYLING ----
const s30 = (cellRef, style) => {
  if (!note3044Sheet[cellRef]) note3044Sheet[cellRef] = { t: "z", v: "" };
  note3044Sheet[cellRef].s = style;
};

// Company name - green bold
s30("A1", { font: { bold: true, sz: 13, color: { rgb: "008000" } }, alignment: { horizontal: "left" } });
s30("A2", { font: { bold: true, sz: 11 }, alignment: { horizontal: "left" } });
s30("A3", { font: { bold: true, sz: 10 }, alignment: { horizontal: "left" } });
s30("A4", { font: { sz: 8, italic: true }, alignment: { horizontal: "left" } });

// Note 30 heading - bold underline
s30("A6", { font: { bold: true, sz: 11 }, alignment: { horizontal: "left" } });

// "a. Subsidiaries" - bold italic
s30("A8", { font: { bold: true, sz: 10, italic: true }, alignment: { horizontal: "left" } });

// Paragraph - small wrap
s30("A9", { font: { sz: 9 }, alignment: { horizontal: "left", wrapText: true } });

// Table header row 9 (0-based = row index 9)
const R_SUB_HEAD = 9;
const R_SUB_DATES = 10;

["A","B","C","D","E"].forEach(col => {
  const ref = `${col}${R_SUB_HEAD + 1}`;
  if (note3044Sheet[ref]) note3044Sheet[ref].s = {
    font: { bold: true, sz: 9 },
    alignment: { horizontal: col === "A" || col === "B" ? "left" : "center", wrapText: true },
    border: { bottom: { style: "thin" }, top: { style: "thin" } }
  };
});

// Date sub-header
["C","D","E"].forEach(col => {
  const ref = `${col}${R_SUB_DATES + 1}`;
  if (note3044Sheet[ref]) note3044Sheet[ref].s = {
    font: { bold: true, sz: 9 },
    alignment: { horizontal: "center" },
    border: { bottom: { style: "thin" } }
  };
});

// Subsidiary data rows (11 to 68 approx) - center align % cols
for (let r = 11; r <= 68; r++) {
  ["C","D","E"].forEach(col => {
    const ref = `${col}${r + 1}`;
    if (note3044Sheet[ref]) {
      if (!note3044Sheet[ref].s) note3044Sheet[ref].s = {};
      note3044Sheet[ref].s = { font: { sz: 9 }, alignment: { horizontal: "center" } };
    }
  });
  const refA = `A${r + 1}`;
  if (note3044Sheet[refA]) note3044Sheet[refA].s = { font: { sz: 9 }, alignment: { horizontal: "left" } };
  const refB = `B${r + 1}`;
  if (note3044Sheet[refB]) note3044Sheet[refB].s = { font: { sz: 9 }, alignment: { horizontal: "center" } };
}

// Footnotes after subsidiaries - italic small
const footRows = [70, 71, 72, 73, 74];
footRows.forEach(r => {
  const ref = `A${r + 1}`;
  if (note3044Sheet[ref]) note3044Sheet[ref].s = { font: { sz: 8, italic: true }, alignment: { horizontal: "left" } };
});

// "b. Joint ventures" heading
const R_JV = 76;
s30(`A${R_JV + 1}`, { font: { bold: true, sz: 10, italic: true }, alignment: { horizontal: "left" } });

// JV table headers
note3044Sheet["!merges"].push(
  { s: { r: R_JV + 2, c: 2 }, e: { r: R_JV + 2, c: 4 } }
);
["A","B","C","D","E"].forEach(col => {
  const ref = `${col}${R_JV + 3}`;
  if (note3044Sheet[ref]) note3044Sheet[ref].s = {
    font: { bold: true, sz: 9 },
    alignment: { horizontal: col === "A" || col === "B" ? "left" : "center", wrapText: true },
    border: { bottom: { style: "thin" }, top: { style: "thin" } }
  };
});
["C","D","E"].forEach(col => {
  const ref = `${col}${R_JV + 4}`;
  if (note3044Sheet[ref]) note3044Sheet[ref].s = { font: { bold: true, sz: 9 }, alignment: { horizontal: "center" }, border: { bottom: { style: "thin" } } };
});

// Note 31 heading
const R_31 = R_JV + 7;
note3044Sheet["!merges"].push(
  { s: { r: R_31, c: 0 }, e: { r: R_31, c: 4 } },
  { s: { r: R_31 + 2, c: 0 }, e: { r: R_31 + 2, c: 4 } },
  { s: { r: R_31 + 4, c: 0 }, e: { r: R_31 + 4, c: 4 } },
  { s: { r: R_31 + 6, c: 0 }, e: { r: R_31 + 6, c: 4 } },
  { s: { r: R_31 + 7, c: 0 }, e: { r: R_31 + 7, c: 4 } },
  { s: { r: R_31 + 14, c: 0 }, e: { r: R_31 + 14, c: 4 } },
  { s: { r: R_31 + 18, c: 0 }, e: { r: R_31 + 18, c: 4 } }
);

s30(`A${R_31 + 1}`, { font: { bold: true, sz: 11 }, alignment: { horizontal: "left" } });
s30(`A${R_31 + 3}`, { font: { sz: 9 }, alignment: { horizontal: "left", wrapText: true } });
s30(`A${R_31 + 5}`, { font: { bold: true, sz: 9 }, alignment: { horizontal: "left" } });

// (i)(ii)(iii)(iv) headings - bold italic underline
[R_31+7, R_31+9, R_31+15, R_31+19].forEach(r => {
  const ref = `A${r + 1}`;
  if (note3044Sheet[ref]) note3044Sheet[ref].s = { font: { bold: true, sz: 9, italic: true, underline: true }, alignment: { horizontal: "left", wrapText: true } };
});

// (i) body text
s30(`A${R_31 + 8 + 1}`, { font: { sz: 9 }, alignment: { horizontal: "left" } });

// KMP list rows - sz 9
for (let r = R_31 + 10; r <= R_31 + 15; r++) {
  const refA = `A${r + 1}`;
  const refE = `E${r + 1}`;
  if (note3044Sheet[refA]) note3044Sheet[refA].s = { font: { sz: 9 }, alignment: { horizontal: "left" } };
  if (note3044Sheet[refE]) note3044Sheet[refE].s = { font: { sz: 9 }, alignment: { horizontal: "left" } };
}

// Relatives list rows
for (let r = R_31 + 16; r <= R_31 + 19; r++) {
  const refA = `A${r + 1}`;
  const refE = `E${r + 1}`;
  if (note3044Sheet[refA]) note3044Sheet[refA].s = { font: { sz: 9 }, alignment: { horizontal: "left" } };
  if (note3044Sheet[refE]) note3044Sheet[refE].s = { font: { sz: 9 }, alignment: { horizontal: "left" } };
}

// Row heights
note3044Sheet["!rows"] = [];
note3044Sheet["!rows"][8]  = { hpt: 50 };  // paragraph row
note3044Sheet["!rows"][9]  = { hpt: 28 };  // header row
note3044Sheet["!rows"][R_31 + 14] = { hpt: 35 }; // (iii) long heading

XLSX.utils.book_append_sheet(workbook, note3044Sheet, "30-31");


// ============================================================
// NEW WORKSHEET: Note32_41
// ============================================================

const YELLOW_FILL_3241 = { patternType: "solid", fgColor: { rgb: "FFFF00" } };

const note3241Data = [
  // 0
  [],
  // 1
  ["32. CONTINGENT LIABILITIES"],
  // 2
  ["Contingent liabilities not provided for in respect of:"],
  // 3
  [],
  // 4
  ["Particulars", "", "For the year ended", "", ""],
  // 5
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  // 6
  ["i. Guarantees"],
  // 7
  ["Bank guarantees given on behalf of the subsidiary", "", 247.28, 43.29, 31.09],
  // 8
  ["Corporate guarantee given on behalf of the subsidiary", "", 14400.70, 14400.70, 10000.70],
  // 9
  [],
  // 10
  ["ii. Tax Matters"],
  // 11
  ["Demand Raised by income tax Authorities for the Assessment Year 2008-09 in assessment framed u/sec. 143(3) of the Act, making addition based on special audit,creating liability of \u20B946.55 millions, which was reduced in appeal to \u20B932.88 millions. The same has been challenged before ITAT. In current period, the case is closed in Vivad se Vishwas Scheme 2024.", "", D, D, 32.88],
  // 12
  ["Demand Raised by income tax Authorities for the Assessment Year 2009-10 in assessment framed u/sec. 143(3) of the Act, making addition based on special audit,creating liability of \u20B9323.09 millions, which was reduced in appeal to \u20B976.27 millions. The same has been challenged before ITAT.", "", 111.79, 111.79, 76.27],
  // 13
  ["Demand Raised by income tax Authorities for the Assessment Year 2016-17 in assessment framed u/sec. 143(3) of the Act making additions of \u20B9335.45 millions (tax demand \u20B9211.66 millions), which was been challenged in appeal before CIT (Appeal). Eventually, CIT(A) deleted additions of \u20B9155.63 millions. For remaining additions, company filed appeal in ITAT.", "", 113.46, 113.46, 211.66],
  // 14
  ["Demand of \u20B93.02 millions alongwith interest & penalty of \u20B93.114 millions raised by Delhi GST Authorities for financial year (2018-19) u/s 73 of CGST Act against which appeal has been filed before Appellate Authority, Department of Trade & Taxes, New Delhi (amount deposited by the Company is \u20B90.30 millions).", "", 6.14, 6.14, 6.14],
  // 15
  [],
  // 16
  ["iii. Claims against the company not acknowledged as debts", "", 303.39, 188.14, 130.60],
  // 17
  [],
  // 18
  ["Based on the advice from independent tax experts, the Company is confident that the additional demand so created will not be sustained. Pending the final order, no provision has been made in the current year standalone financial statements for the additional tax so demanded and the same has been disclosed as contingent liability."],
  // 19
  [],
  // 20
  ["33. LEASES"],
  // 21
  ["The Company has taken various commercial premises under cancelable operating leases. Terms of the lease include terms for renewal, increase in rents in future periods and terms of cancellation. The total lease rental recognised as an expense during the year under the above lease agreements amounts to \u20B94.33 millions (March 31, 2024: \u20B93.90 millions)."],
  // 22
  [],
  // 23
  ["34. EXPENDITURE IN FOREIGN CURRENCY (ON ACCRUAL BASIS)"],
  // 24
  [],
  // 25
  ["Particulars", "", "For the year ended", "", ""],
  // 26
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  // 27
  ["Travelling expenses", "", D, D, D],
  // 28
  ["Project consultancy fees*", "", D, 16.69, D],
  // 29
  [],
  // 30
  ["* incurred on behalf of XYZ Homes Developers Limited ( Refer note 31 )"],
  // 31
  [],
  // 32
  ["35. CAPITAL AND OTHER COMMITMENTS"],
  // 33
  [],
  // 34
  ["i) Estimated number of contracts remaining to be executed on capital account and not provided for (net of advances) \u20B9 Nil (March 31, 2025: \u20B9 Nil, March 31, 2024: \u20B9 Nil)."],
  // 35
  [],
  // 36
  ["ii) The Company has undertaken to provide continued financial support to its certain subsidiaries as and when required."],
  // 37
  [],
  // 38
  ["36. The company has not entered into any derivative instrument during the year. The company does not have any foreign currency exposures towards receivables, payables or any other derivative instrument that have not been hedged."],
  // 39
  [],
  // 40
  ["37. DISCLOSURE UNDER THE MICRO, SMALL AND MEDIUM ENTERPRISES DEVELOPMENT ACT,2006 (\u201CMSMED Act, 2006\u201D) AS BELOW:"],
  // 41
  [],
  // 42
  ["Particulars", "", "For the year ended", "", ""],
  // 43
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  // 44
  ["i.  the principal amount and the interest due thereon remaining unpaid to any supplier as at the end of each accounting year", "", 12.07, 26.05, 18.25],
  // 45
  ["ii.  the amount of interest paid by the buyer of Section 16, along with the amounts payment made to the supplier beyond the appointment day during each accounting year.", "", D, D, D],
  // 46
  ["iii.  the amount of interest due and payable for the period of delay in making payment (which has been paid but beyond the appointment day during the year) but without adding interest specified under MSMED Act, 2006.", "", D, D, D],
  // 47
  ["iv.  the amount of interest accrued and remaining unpaid at the end of each accounting year: and", "", 5.55, 5.01, D],
  // 48
  ["v.  the amount of further interest remaining due and payable even in succeeding years, until such date when the interest dues as above are actually paid to the small enterprises, for the purpose of disallowance as a deductible expenditure under Section 23.", "", D, D, D],
  // 49
  [],
  // 50
  ["38. All loans, guarantees, investments and securities as disclosed in respective notes are provided for business purposes."],
  // 51
  [],
  // 52
  ["39. In the opinion of the Board of Directors, current assets, loans and advances have a value on realization in the ordinary course of business at least equal to the amount at which they are stated in the balance sheet and provisions for all known/expected liabilities have been made."],
  // 53
  [],
  // 54
  ["40. Investment includes:"],
  // 55
  [],
  // 56
  ["i). Investment of \u20B9 Nil (March 31, 2025: Nil, March 31, 2024: \u20B9 203.00 millions) In series C debenture of Best View Infracon Limited. In terms of the Debenture Trust deed agreement, the Company is entitled to redemption premium subject to a maximum XIRR of 22% subject to availability of revenue generated by the Company after payment of taxes, construction and other related expenditure and other designated payments. In view of the uncertainty involved in the quantum of net revenue being generated, the Company was accordingly not recording the premium /interest income upto the end of the March 31, 2024. In year ended march 31, 2025, the debentures along with the outstanding interest was converted into Preference share."],
  // 57
  [],
  // 58
  ["ii). Investment of \u20B9 Nil (March 31, 2025: \u20B9 112.81 millions, March 31, 2024: \u20B9 305.36 millions) In series B unsecured optionally convertible debentures (OCDs) of XYZ Green Park Infrastructure Limited. In terms of the Debenture Trust deed agreement, the Company is entitled to interest and shall be calculated at 16% IRR and are redeemable at 22% IRR subject to the availability of distributable cash. These debentures are redeemable after 6 years and 6 months. If the outstanding OCDs can\u2019t be redeemed in full then the promotors OCDs will be converted into equity shares of the Company, at a price which shall not be less than the fair market value of the equity shares at the time of such conversion."],
  // 59
  [],
  // 60
  ["41. CORPORATE SOCIAL RESPONSIBILITY (CSR)"],
  // 61
  [],
  // 62
  ["As per section 135 of the Companies Act, 2013 read with relevant rules thereon, for FY 2025-26 the Company was required to spend \u20B917.38 million (March 31, 2025: \u20B99.62 million, March 31 2024: \u20B9 6.99 million) on Corporate Social Responsibility (CSR) activities. The same has been approved by the Board to be spent during the year."],
  // 63
  [],
  // 64
  ["Amount spent during the year on :"],
  // 65
  [],
  // 66 - CSR Table 1 Header
  ["Particulars", "", "Amount Spent in Cash", "Amount yet to be paid/(excess) paid in Cash", "Total Amount"],
  // 67
  [],
  // 68
  ["As at September 30, 2025"],
  // 69
  ["   (i) Construction/acquisition of any asset", "", D, D, D],
  // 70
  ["   (ii) On purposes other than (i) above", "", 3.85, 24.87, 28.71],
  // 71
  [],
  // 72
  ["   Protection of flora and fauna, maintenance of ecological balance", "", 1.70, D, 1.70],
  // 73
  ["   Livelihood enhancement", "", 1.90, D, 1.90],
  // 74
  ["   Promoting health care", "", 0.25, D, 0.25],
  // 75
  ["   Unspent Corporate Social Responsibility Account", "", D, 24.87, 24.87],
  // 76
  [],
  // 77 - CSR Table 2 Header
  ["Particulars", "", "Amount Spent in Cash", "Amount yet to be paid/(excess) paid in Cash", "Total Amount"],
  // 78
  [],
  // 79
  ["As at March 31, 2025"],
  // 80
  ["   (i) Construction/acquisition of any asset", "", D, D, D],
  // 81
  ["   (ii) On purposes other than (i) above", "", 2.13, 15.48, 17.61],
  // 82
  [],
  // 83
  ["   Protection of flora and fauna, maintenance of ecological balance", "", 0.02, D, 0.02],
  // 84
  ["   Livelihood enhancement", "", 1.51, D, 1.51],
  // 85
  ["   Promoting health care", "", 0.60, D, 0.60],
  // 86
  ["   Unspent Corporate Social Responsibility Account", "", D, 15.48, 15.48],
  // 87
  [],
  // 88 - CSR Table 3 Header
  ["Particulars", "", "Amount Spent in Cash", "Amount yet to be paid/(excess) paid in Cash", "Total Amount"],
  // 89
  [],
  // 90
  ["As at March 31, 2024"],
  // 91
  ["   (i) Construction/acquisition of any asset", "", D, D, D],
  // 92
  ["   (ii) On purposes other than (i) above", "", 0.16, 6.83, 6.99],
  // 93
  [],
  // 94
  ["   Purposes other than (i)", "", 0.16, D, 0.16],
  // 95
  ["   Transfer to PM cares fund", "", D, "(0.01)", "(0.01)"],
  // 96
  ["   Unspent Corporate Social Responsibility Account", "", D, 6.82, 6.82],
  // 97
  [],
  // 98
  ["Details of Unspent Corporate Social Responsibility on ongoing projects as required under section 135(6) are disclosed below :-"],
  // 99
  [],
  // 100 - CSR Details Header Row 1
  ["Balance as at Preceding financial year(s)", "With the Company", "In Separate CSR Unspent Account *", "Amount required to be spent during the year", "Amount spent during the year", "", "Balance as at March 31, 2025", ""],
  // 101 - CSR Details Header Row 2
  ["", "", "", "", "From the Company's Bank Account", "From Separate CSR Unspent Account", "With the Company", "In Separate CSR Unspent Account *"],
  // 102
  ["Sept-25",  D, 11.34, 17.38, 1.90, 1.95, 15.48, 9.38],
  // 103
  ["2024-25",  D, 6.82,  9.62,  2.13, 2.97, 7.49,  3.85],
  // 104
  ["2023-24",  D, D,     6.82,  D,    D,    6.82,  D],
  // 105
  ["2022-23",  D, 1.78,  D,     D,    1.78, D,     D],
  // 106
  [],
  // 107
  ["* The unspent CSR amount (including excess provisioning of Rs. 0.015 million) of the financial year of FY 2024-25 shall be transferred to the Unspent CSR Account as per Section 135(6) of the Companies Act within 30 days of the reporting date."],
  // 108
  [],
  // 109
  ["* In FY 23-24 amount of Rs. 0.01 million is tranferred to PM cares fund due to shortfall in transferring amount to Unspent CSR Account as per Section 135(6) of Companies Act, 2013"],
];

const note3241Sheet = XLSX.utils.aoa_to_sheet(note3241Data);
note3241Sheet["!sheetView"] = [{ showGridLines: false }];
note3241Sheet["!merges"] = [];
note3241Sheet["!rows"] = [];
note3241Sheet["!cols"] = [
  { wch: 42 }, { wch: 12 }, { wch: 18 }, { wch: 18 },
  { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 18 }
];

// ---- helpers ----
const sy = (r, c, style) => {
  const ref = XLSX.utils.encode_cell({ r, c });
  if (!note3241Sheet[ref]) note3241Sheet[ref] = { t: "z", v: "" };
  note3241Sheet[ref].s = { fill: YELLOW_FILL_3241, ...style };
};
const sw = (r, c, style) => {   // white background (no fill)
  const ref = XLSX.utils.encode_cell({ r, c });
  if (!note3241Sheet[ref]) note3241Sheet[ref] = { t: "z", v: "" };
  note3241Sheet[ref].s = style;
};
const fillRow = (r, cols) => cols.forEach(c => sy(r, c, {}));
const mg = (r1,c1,r2,c2) => note3241Sheet["!merges"].push({ s:{r:r1,c:c1}, e:{r:r2,c:c2} });
const BOX = { border: { top:{style:"medium"}, bottom:{style:"medium"}, left:{style:"medium"}, right:{style:"medium"} } };
const TH_BORDER = { border: { bottom:{style:"thin"} } };
const TH_TOP_BORDER = { border: { top:{style:"thin"}, bottom:{style:"thin"} } };

// ================================================================
// NOTE 32
// ================================================================
// Yellow rows
[4,5,6,7,8,10,11,12,13,14,16].forEach(r => fillRow(r, [0,1,2,3,4]));

mg(1,0, 1,4);   // 32 heading
mg(2,0, 2,4);   // subheading
mg(4,2, 4,4);   // "For the year ended"
mg(4,0, 5,0);   // Particulars rowspan
mg(6,0, 6,4);   // i. Guarantees
mg(10,0,10,4);  // ii. Tax Matters
mg(11,0,11,1);  mg(12,0,12,1);  mg(13,0,13,1);  mg(14,0,14,1);  // tax text cols
mg(16,0,16,1);  // iii claims text
mg(18,0,18,4);  // footnote

// Heading styles
sw(1, 0, { font:{bold:true,sz:11}, alignment:{horizontal:"left"}, ...BOX });
sy(2, 0, { font:{bold:true,sz:9}, alignment:{horizontal:"left"} });
sy(4, 0, { font:{bold:true,sz:9}, alignment:{horizontal:"left",vertical:"center"}, ...TH_BORDER });
sy(4, 2, { font:{bold:true,sz:9}, alignment:{horizontal:"center"}, ...TH_BORDER });
[2,3,4].forEach(c => sy(5, c, { font:{bold:true,sz:9}, alignment:{horizontal:"right"}, ...TH_BORDER }));
sy(6, 0, { font:{bold:true,sz:9,italic:true}, alignment:{horizontal:"left"} });
// Guarantee rows
[7,8].forEach(r => {
  sy(r, 0, { font:{sz:9}, alignment:{horizontal:"left"} });
  [2,3,4].forEach(c => sy(r, c, { font:{sz:9}, alignment:{horizontal:"right"} }));
});
sy(10, 0, { font:{bold:true,sz:9,italic:true}, alignment:{horizontal:"left"} });
// Tax rows - wrapText
[11,12,13,14].forEach(r => {
  sy(r, 0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true,vertical:"top"} });
  [2,3,4].forEach(c => sy(r, c, { font:{sz:9}, alignment:{horizontal:"right",vertical:"top"} }));
  note3241Sheet["!rows"][r] = { hpt: 80 };
});
// iii. Claims - bold + double underline on numbers
sy(16, 0, { font:{bold:true,sz:9,italic:true}, alignment:{horizontal:"left"} });
[2,3,4].forEach(c => sy(16, c, {
  font:{bold:true,sz:9},
  alignment:{horizontal:"right"},
  border:{ top:{style:"thin"}, bottom:{style:"double"} }
}));
sw(18, 0, { font:{sz:8}, alignment:{horizontal:"left",wrapText:true} });
note3241Sheet["!rows"][18] = { hpt: 35 };

// ================================================================
// NOTE 33
// ================================================================
mg(20,0,20,4);  mg(21,0,21,4);
sw(20, 0, { font:{bold:true,sz:11}, alignment:{horizontal:"left"}, ...BOX });
sw(21, 0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} });
note3241Sheet["!rows"][21] = { hpt: 40 };

// ================================================================
// NOTE 34
// ================================================================
[25,26,27,28].forEach(r => fillRow(r, [0,1,2,3,4]));
mg(23,0,23,4);  mg(25,2,25,4);  mg(25,0,26,0);  mg(30,0,30,4);
sw(23, 0, { font:{bold:true,sz:11}, alignment:{horizontal:"left"}, ...BOX });
sy(25, 0, { font:{bold:true,sz:9}, alignment:{horizontal:"left",vertical:"center"}, ...TH_BORDER });
sy(25, 2, { font:{bold:true,sz:9}, alignment:{horizontal:"center"}, ...TH_BORDER });
[2,3,4].forEach(c => sy(26, c, { font:{bold:true,sz:9}, alignment:{horizontal:"right"}, ...TH_BORDER }));
[27,28].forEach(r => {
  sy(r, 0, { font:{sz:9}, alignment:{horizontal:"left"} });
  [2,3,4].forEach(c => sy(r, c, { font:{sz:9}, alignment:{horizontal:"right"} }));
});
sw(30, 0, { font:{sz:8,italic:true}, alignment:{horizontal:"left"} });

// ================================================================
// NOTE 35
// ================================================================
mg(32,0,32,4);  mg(34,0,34,4);  mg(36,0,36,4);
sw(32, 0, { font:{bold:true,sz:11}, alignment:{horizontal:"left"}, ...BOX });
[34,36].forEach(r => { sw(r, 0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} }); note3241Sheet["!rows"][r] = { hpt: 30 }; });

// ================================================================
// NOTE 36
// ================================================================
mg(38,0,38,4);
sw(38, 0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} });
note3241Sheet["!rows"][38] = { hpt: 35 };

// ================================================================
// NOTE 37
// ================================================================
[42,43,44,45,46,47,48].forEach(r => fillRow(r, [0,1,2,3,4]));
mg(40,0,40,4);  mg(42,2,42,4);  mg(42,0,43,0);
[44,45,46,47,48].forEach(r => mg(r,0,r,1));

sw(40, 0, { font:{bold:true,sz:11}, alignment:{horizontal:"left",wrapText:true}, ...BOX });
note3241Sheet["!rows"][40] = { hpt: 35 };
sy(42, 0, { font:{bold:true,sz:9}, alignment:{horizontal:"left",vertical:"center"}, ...TH_BORDER });
sy(42, 2, { font:{bold:true,sz:9}, alignment:{horizontal:"center"}, ...TH_BORDER });
[2,3,4].forEach(c => sy(43, c, { font:{bold:true,sz:9}, alignment:{horizontal:"right"}, ...TH_BORDER }));
[44,45,46,47,48].forEach(r => {
  sy(r, 0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true,vertical:"top"} });
  [2,3,4].forEach(c => sy(r, c, { font:{sz:9}, alignment:{horizontal:"right",vertical:"top"} }));
  note3241Sheet["!rows"][r] = { hpt: 45 };
});

// ================================================================
// NOTE 38, 39
// ================================================================
mg(50,0,50,4);  mg(52,0,52,4);
sw(50, 0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} });
sw(52, 0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} });
note3241Sheet["!rows"][50] = { hpt: 25 };
note3241Sheet["!rows"][52] = { hpt: 35 };

// ================================================================
// NOTE 40
// ================================================================
mg(54,0,54,4);  mg(56,0,56,4);  mg(58,0,58,4);
sw(54, 0, { font:{bold:true,sz:11}, alignment:{horizontal:"left"}, ...BOX });
[56,58].forEach(r => { sw(r, 0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} }); note3241Sheet["!rows"][r] = { hpt: 100 }; });

// ================================================================
// NOTE 41 - CSR
// ================================================================
mg(60,0,60,4);  mg(62,0,62,4);  mg(64,0,64,4);
sw(60, 0, { font:{bold:true,sz:11}, alignment:{horizontal:"left"}, ...BOX });
sw(62, 0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} });
sw(64, 0, { font:{sz:9}, alignment:{horizontal:"left"} });
note3241Sheet["!rows"][62] = { hpt: 40 };

// CSR Tables x3 — same structure
[
  { hdr:66, lbl:68, d1:69, d2:70, subs:[72,73,74,75] },
  { hdr:77, lbl:79, d1:80, d2:81, subs:[83,84,85,86] },
  { hdr:88, lbl:90, d1:91, d2:92, subs:[94,95,96]    },
].forEach(({ hdr, lbl, d1, d2, subs }) => {
  // Yellow fill
  [hdr, d1, d2, ...subs].forEach(r => fillRow(r, [0,1,2,3,4]));
  mg(hdr,0,hdr,1);
  mg(lbl,0,lbl,4);
  // Header
  sy(hdr, 0, { font:{bold:true,sz:9}, alignment:{horizontal:"left",vertical:"center"}, ...TH_TOP_BORDER });
  [2,3,4].forEach(c => sy(hdr, c, { font:{bold:true,sz:9}, alignment:{horizontal:"center",wrapText:true}, ...TH_TOP_BORDER }));
  note3241Sheet["!rows"][hdr] = { hpt: 35 };
  // Label bold
  sy(lbl, 0, { font:{bold:true,sz:9}, alignment:{horizontal:"left"} });
  // (i) and (ii) rows
  [d1,d2].forEach(r => {
    sy(r, 0, { font:{sz:9}, alignment:{horizontal:"left"} });
    [2,3,4].forEach(c => sy(r, c, { font:{sz:9}, alignment:{horizontal:"right"} }));
  });
  // Sub rows italic bold
  subs.forEach(r => {
    sy(r, 0, { font:{sz:9,italic:true,bold:true}, alignment:{horizontal:"left"} });
    [2,3,4].forEach(c => sy(r, c, { font:{sz:9,italic:true,bold:true}, alignment:{horizontal:"right"} }));
  });
});

// CSR Details table
[98,100,101,102,103,104,105].forEach(r => {
  for(let c=0; c<8; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note3241Sheet[ref]) note3241Sheet[ref] = { t: "z", v: "" };
    note3241Sheet[ref].s = { fill: YELLOW_FILL_3241 };
  }
});
mg(98,0,98,7);
mg(100,4,100,5);  // "Amount spent during the year" header span
mg(100,6,100,7);  // "Balance as at March 31, 2025" header span
mg(107,0,107,7);
mg(109,0,109,7);

sw(98, 0, { font:{bold:true,sz:9}, alignment:{horizontal:"left",wrapText:true} });
note3241Sheet["!rows"][98] = { hpt: 30 };

// Details header rows styling
[100,101].forEach(r => {
  for(let c=0; c<8; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note3241Sheet[ref]) note3241Sheet[ref] = { t: "z", v: "" };
    note3241Sheet[ref].s = { fill: YELLOW_FILL_3241, font:{bold:true,sz:8}, alignment:{horizontal:"center",wrapText:true}, border:{top:{style:"thin"},bottom:{style:"thin"}} };
  }
  note3241Sheet["!rows"][r] = { hpt: 45 };
});

// Data rows
[102,103,104,105].forEach(r => {
  const ref0 = XLSX.utils.encode_cell({ r, c:0 });
  if (!note3241Sheet[ref0]) note3241Sheet[ref0] = { t:"z", v:"" };
  note3241Sheet[ref0].s = { fill: YELLOW_FILL_3241, font:{sz:9}, alignment:{horizontal:"left"} };
  for(let c=1; c<8; c++) {
    const ref = XLSX.utils.encode_cell({ r, c });
    if (!note3241Sheet[ref]) note3241Sheet[ref] = { t:"z", v:"" };
    note3241Sheet[ref].s = { fill: YELLOW_FILL_3241, font:{sz:9}, alignment:{horizontal:"right"} };
  }
});

// Footnotes
[107,109].forEach(r => {
  sw(r, 0, { font:{sz:8,italic:true}, alignment:{horizontal:"left",wrapText:true} });
  note3241Sheet["!rows"][r] = { hpt: 35 };
});

XLSX.utils.book_append_sheet(workbook, note3241Sheet, "32_41");
// ============================================================
// END Note32_41
// ============================================================



// ============================================================
// NEW WORKSHEET: Note42_44  (NO YELLOW - pure white)
// ============================================================
// const D = "-";
const F = "-";

const note4244Data = [
  // 0
  ["42. FINANCIAL INSTRUMENTS"],
  // 1
  ["(a) Financial instruments by category"],
  // 2
  [],
  // 3
  ["Particulars", "", "For the year ended", "", ""],
  // 4
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  // 5
  ["Financial assets"],
  // 6
  ["i. FVTOCI"],
  // 7
  ["   Investments in equity share instruments", "", 948.41, 942.30, 1031.01],
  // 8
  ["ii. FVTPL"],
  // 9
  ["   Investments in preference share instruments", "", 2345.70, 2345.70, F],
  // 10
  ["   Investments in mutual fund", "", F, F, F],
  // 11
  ["iii. Amortized cost"],
  // 12
  ["   Investments in Bonds/Debentures", "", F, 112.81, 508.36],
  // 13
  ["   Trade receivables", "", 146.77, 138.58, 98.04],
  // 14
  ["   Loans", "", 28.31, 27.09, 25.51],
  // 15
  ["   Cash and cash equivalents", "", 44.34, 161.37, 38.90],
  // 16
  ["   Other bank balances", "", 643.12, 706.93, 465.63],
  // 17
  ["   Other financial assets", "", 816.36, 441.50, 503.44],
  // 18
  ["Total financial assets", "", 4973.02, 4876.29, 2670.89],
  // 19
  ["Amortized Cost", "", F, F, F],
  // 20
  [],
  // 21
  ["Financial liabilities"],
  // 22
  ["   Borrowings", "", 4808.61, 5120.30, 3015.11],
  // 23
  ["   Trade payables", "", 135.85, 129.10, 110.94],
  // 24
  ["   Other financial liabilities", "", 126.87, 124.13, 105.10],
  // 25
  ["Total financial liabilities", "", 5071.33, 5373.53, 3231.15],
  // 26
  [],
  // 27
  ["Investment of \u20B9907.39 millions (March 31, 2025: \u20B9907.39, March 31, 2024: \u20B9991.16 millions) in subsidiaries and associates are measured at cost as per Ind AS 27, \u2018Separate Financial Statements\u2019 and are not required to be disclosed here."],
  // 28
  [],
  // 29
  ["(b) Fair value hierarchy"],
  // 30
  ["Financial instruments are classified into three levels in order to provide an indication about the reliability of the inputs used in determining the fair values."],
  // 31
  ["The categories used are as follows:"],
  // 32
  ["Level 1: Where fair value is based on quoted prices from active market."],
  // 33
  ["Level 2: Where fair value is based on significant direct or indirect observable market inputs."],
  // 34
  ["Level 3: Where fair value is based on one or more significant input that is not based on observable market data."],
  // 35
  [],
  // 36 - Fair value hierarchy table header
  ["Particulars", "Level 1", "Level 2", "Level 3", "Total"],
  // 37
  ["As at September 30, 2025"],
  // 38
  ["   Investments in equity share instruments", 41.02, F, 907.39, 948.41],
  // 39
  ["   Investments in preference share instruments", F, F, 2345.70, 2345.70],
  // 40
  ["   Investments in mutual fund", F, F, F, F],
  // 41
  ["As at March 31, 2025"],
  // 42
  ["   Investments in equity share instruments", 34.91, F, 907.39, 942.30],
  // 43
  ["   Investments in preference share instruments", F, F, 2345.70, 2345.70],
  // 44
  ["   Investments in mutual fund", F, F, F, F],
  // 45
  ["As at March 31, 2024"],
  // 46
  ["   Investments in equity share instruments", 39.85, F, 991.16, 1031.01],
  // 47
  ["   Investments in preference share instruments", F, F, F, F],
  // 48
  ["   Investments in mutual fund", F, F, F, F],
  // 49
  ["There are no transfers between any levels during the year."],
  // 50
  [],
  // 51
  ["(c) Fair value of financial instruments measured at amortized cost :"],
  // 52
  ["The carrying amounts of the financial instruments measured at amortized cost, disclosed in note (a) above, approximate to their fair values. Accordingly, the fair values of such financial instruments have not been disclosed separately."],
  // 53
  [],
  // 54
  ["(d) Valuation techniques and processes used to determine fair value :"],
  // 55
  ["Fair value of quoted investments is based on the quotation as at the reporting date."],
  // 56
  [],
  // 57
  ["43. FINANCIAL RISK MANAGEMENT OBJECTIVE AND POLICIES"],
  // 58
  ["The Company\u2019s principal financial instruments are as follows:"],
  // 59
  ["Financial assets: Investments, Cash and bank balance, Loans, Trade and other receivables"],
  // 60
  ["Financial liabilities: Borrowings, Trade and other payables."],
  // 61
  [],
  // 62
  ["A. Credit risk"],
  // 63
  ["Credit risk is the risk that a counterparty fails to discharge its obligation to the Company. The Company\u2019s exposure to credit risk is influenced mainly by cash and cash equivalents, trade receivables and financial assets measured at amortised cost. The Company continuously monitors defaults of customers and other counterparties and incorporates this information into its credit risk controls."],
  // 64
  [],
  // 65
  ["A.1. Trade and Other Receivables"],
  // 66
  ["The Company operates as a Real Estate developer primarily covering residential and commercial projects, and others at various locations. Trade receivables are contractual amounts due from these customers for after works completion. Trade receivables are non-interest bearing and are generally on 30 to 45 days credit, depending upon contractual terms. The management evaluates the outstanding receivables on a periodic basis and provides for the impairment loss based on the established policy."],
  // 67
  [],
  // 68
  ["The Company follows a \u2018simplified approach\u2019 (i.e. based on lifetime ECL) for recognition of impairment loss allowance on its trade receivables. For the purpose of measuring lifetime ECL allowance for trade receivables, the Company estimates irrecoverable amounts based on the ageing of the receivable balances, clubbed with, historical experience with the customer and/or the industry in which the customer operates and assessment of litigation, if applicable. Receivables are written off when they are no more deemed collectible."],
  // 69
  [],
  // 70
  ["Though the Company executes projects with repeat customers but there is no significant customer level concentration of the credit risk as at any of the reported periods. Further, there is no concentrated risk based on the location where the Company operates."],
  // 71
  [],
  // 72
  ["A.2. Other financial assets"],
  // 73
  ["Loans and receivable from related parties are periodically reviewed by the management in conjunction with the re-measured fair values of the Company\u2019s investments in those parties. Where the carrying amount of any receivable exceeds the re-measured fair value of investment, an impairment loss, to that extent, is provided for in the financial statements."],
  // 74
  [],
  // 75
  ["Cash and bank balances are managed by the Company\u2019s treasury department. Concentration risk is constantly monitored to mitigate financial loss."],
  // 76
  [],
  // 77
  ["The Company\u2019s maximum exposure to credit risk for the components of the financial assets as at September 31, 2025, March 31, 2025 and March 31, 2024 is to the extent of their respective carrying amounts as disclosed in note 10."],
  // 78
  [],
  // 79
  ["A.3. Credit exposure"],
  // 80
  ["The Company provides for 12 month expected credit losses for following financial assets:"],
  // 81 - credit exposure table header
  ["Particulars", "Estimated gross carrying", "% of Expected credit loss", "Expected credit losses", "Net Carrying amount"],
  // 82
  ["As at September 30, 2025"],
  // 83
  ["   Investments", 3294.12, F, F, 3294.12],
  // 84
  ["   Trade receivables", 146.77, F, F, 146.77],
  // 85
  ["   Loans", 28.31, F, F, 28.31],
  // 86
  ["   Cash and cash equivalents", 44.34, F, F, 44.34],
  // 87
  ["   Other bank balances", 643.12, F, F, 643.12],
  // 88
  ["   Other financial assets", 816.36, F, F, 816.36],
  // 89
  ["   Total", 4973.02, F, F, 4973.02],
  // 90
  ["As at March 31, 2025"],
  // 91
  ["   Investments", 3400.82, F, F, 3400.82],
  // 92
  ["   Trade receivables", 138.58, F, F, 138.58],
  // 93
  ["   Loans", 27.09, F, F, 27.09],
  // 94
  ["   Cash and cash equivalents", 161.37, F, F, 161.37],
  // 95
  ["   Other bank balances", 706.93, F, F, 706.93],
  // 96
  ["   Other financial assets", 441.50, F, F, 441.50],
  // 97
  ["   Total", 4876.29, F, F, 4876.29],
  // 98
  ["As at March 31, 2024"],
  // 99
  ["   Investments", 1539.37, F, F, 1539.37],
  // 100
  ["   Trade receivables", 98.04, F, F, 98.04],
  // 101
  ["   Loans", 25.51, F, F, 25.51],
  // 102
  ["   Cash and cash equivalents", 38.90, F, F, 38.90],
  // 103
  ["   Other bank balances", 465.63, F, F, 465.63],
  // 104
  ["   Other financial assets", 503.44, F, F, 503.44],
  // 105
  ["   Total", 2670.89, F, F, 2670.89],
  // 106
  [],
  // 107
  ["B. Liquidity risk"],
  // 108
  ["Liquidity risk is the risk that the Company may not be able to meet its present and future cash and collateral obligations without incurring unacceptable losses. The Company\u2019s objective is to maintain optimum levels of liquidity to meet its cash and collateral requirements, both immediate and long-term. The finance needs are monitored and managed by the Company\u2019s treasury department, in consultation with the project teams and management. The Company takes support from its secured lenders to finance and support the Company\u2019s operations."],
  // 109
  [],
  // 110
  ["Maturities of financial liabilities"],
  // 111
  ["The tables below analyse the financial liabilities into relevant maturity pattern based on their contractual maturities."],
  // 112 - maturity table header
  ["Particulars", "Less than 1 Year", "1 - 2 years", "2 - 5 years", "Total"],
  // 113
  ["As at September 30, 2025"],
  // 114
  ["   Long term borrowings", F, 24.29, F, 24.29],
  // 115
  ["   Short term borrowings", 4784.31, F, F, 4784.31],
  // 116
  ["   Trade Payables", 135.85, F, F, 135.85],
  // 117
  ["   Other Financial Liabilities", 126.87, F, F, 126.87],
  // 118
  ["   Total", 5047.04, 24.29, F, 5071.33],
  // 119
  ["As at March 31, 2025"],
  // 120
  ["   Long term borrowings", F, 458.77, F, 458.77],
  // 121
  ["   Short term borrowings", 4661.53, F, F, 4661.53],
  // 122
  ["   Trade Payables", 129.10, F, F, 129.10],
  // 123
  ["   Other Financial Liabilities", 124.13, F, F, 124.13],
  // 124
  ["   Total", 4914.76, 458.77, F, 5373.53],
  // 125
  ["As at March 31, 2024"],
  // 126
  ["   Long term borrowings", F, 35.01, F, 35.01],
  // 127
  ["   Short term borrowings", 2980.10, F, F, 2980.10],
  // 128
  ["   Trade Payables", 110.94, F, F, 110.94],
  // 129
  ["   Other Financial Liabilities", 105.10, F, F, 105.10],
  // 130
  ["   Total", 3196.14, 35.01, F, 3231.15],
  // 131
  [],
  // 132
  ["C. Market risk"],
  // 133
  [],
  // 134
  ["C.1. Interest Rate risk"],
  // 135
  ["The Company\u2019s policy is to minimise interest rate cash flow risk exposures on long-term financing. The Company is exposed to changes in market interest rates through bank borrowings at variable interest rates. Other borrowings are at fixed interest rates."],
  // 136
  [],
  // 137 - box heading
  ["Company\u2019s exposure to interest rate risk on borrowings is as follows:"],
  // 138 - table header
  ["Particulars", "", "As at year ended", "", ""],
  // 139
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  // 140
  ["Variable rate", "", 332.98, 787.98, 406.21],
  // 141
  ["Fixed rate", "", 4475.62, 4345.44, 2608.90],
  // 142
  ["Total:", "", 4808.61, 5133.42, 3015.11],
  // 143
  [],
  // 144
  ["The following table illustrates the sensitivity of profit and equity to a possible change in interest rates of \u00B11% (March 31, 2024: \u00B11%). These changes are considered to be reasonably possible based on observation of current market conditions. The calculations are based on a change in the average market interest rate for each period, and the financial instruments held at each reporting date that are sensitive to changes in interest rates. All other variables are held constant."],
  // 145
  [],
  // 146 - sensitivity table header
  ["Particulars", "", "Profit for the year If - 1%", "Loss for the year if + 1%", ""],
  // 147
  ["As at September 30, 2025", "", 3.33, "(3.33)", ""],
  // 148
  ["As at March 31, 2025", "", 7.88, "(7.88)", ""],
  // 149
  [],
  // 150
  ["The Company does not account for any fixed rate financial assets and liabilities at fair value through profit or loss. Therefore, a change in interest rates at the reporting date would not affect profit or loss."],
  // 151
  [],
  // 152
  ["C.2. Other price risk"],
  // 153
  ["Company\u2019s exposure to equity securities price risk arises from quoted investments held and classified in the balance sheet as fair value through OCI. Company\u2019s exposure is insignificant, since Company\u2019s investment in such securities is immaterial."],
  // 154
  [],
  // 155
  ["44. CAPITAL MANAGEMENT"],
  // 156
  [],
  // 157
  ["The Company\u2019s capital management objectives are to ensure the Company\u2019s ability to continue as a going concern as well as to provide an adequate return to shareholders by pricing products and services commensurately with the level of risk."],
  // 158
  [],
  // 159
  ["The Company monitors capital on the basis of the carrying amount of equity plus its subordinated loan, less cash and cash equivalents as presented on the face of the statement of financial position."],
  // 160
  [],
  // 161
  ["The Company manages its capital structure and makes adjustments to it in the light of changes in economic conditions and the risk characteristics of the underlying assets. In order to maintain or adjust the capital structure, the Company may adjust the amount of dividends paid to shareholders, return capital to shareholders or issue new shares. The amounts managed as capital by the Company are summarised as follows:"],
  // 162
  [],
  // 163 - capital table header
  ["Particulars", "", "For the year ended", "", ""],
  // 164
  ["", "", "September 30, 2025", "March 31, 2025", "March 31, 2024"],
  // 165
  ["Borrowings"],
  // 166
  ["   Long term borrowings", "", 24.29, 458.77, 35.01],
  // 167
  ["   Short term borrowings", "", 4784.31, 4661.53, 2980.10],
  // 168
  ["   Less: Cash and cash equivalents", "", 44.34, "(161.37)", "(38.90)"],
  // 169
  ["Net debt", "", 4852.95, 4958.94, 2976.21],
  // 170
  ["Equity", "", 6578.39, 6505.16, 5740.72],
  // 171
  ["Gearing ratio (%)", "", "73.77%", "76.23%", "51.84%"],
];

const note4244Sheet = XLSX.utils.aoa_to_sheet(note4244Data);
note4244Sheet["!sheetView"] = [{ showGridLines: false }];
note4244Sheet["!merges"] = [];
note4244Sheet["!rows"] = [];
note4244Sheet["!cols"] = [
  { wch: 46 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 16 }
];

// ---- helpers (white bg) ----
const s44 = (r, c, style) => {
  const ref = XLSX.utils.encode_cell({ r, c });
  if (!note4244Sheet[ref]) note4244Sheet[ref] = { t: "z", v: "" };
  note4244Sheet[ref].s = style;
};
const mg44 = (r1,c1,r2,c2) => note4244Sheet["!merges"].push({ s:{r:r1,c:c1}, e:{r:r2,c:c2} });
const THIN  = { border: { bottom:{style:"thin"} } };
const TTHIN = { border: { top:{style:"thin"}, bottom:{style:"thin"} } };
const DBL   = { border: { top:{style:"thin"}, bottom:{style:"double"} } };
const BOX44 = { border: { top:{style:"medium"}, bottom:{style:"medium"}, left:{style:"medium"}, right:{style:"medium"} } };

// wrap helper
const wrapStyle = (extra={}) => ({ font:{sz:9}, alignment:{horizontal:"left",wrapText:true}, ...extra });
const numR = (extra={}) => ({ font:{sz:9}, alignment:{horizontal:"right"}, ...extra });
const boldL = (extra={}) => ({ font:{bold:true,sz:9}, alignment:{horizontal:"left"}, ...extra });
const boldR = (extra={}) => ({ font:{bold:true,sz:9}, alignment:{horizontal:"right"}, ...extra });

// ================================================================
// NOTE 42(a) - Financial instruments by category
// ================================================================
mg44(0,0, 0,4);  mg44(1,0, 1,4);
mg44(3,2, 3,4);  mg44(3,0, 4,0);
mg44(5,0, 5,4);  mg44(6,0, 6,4);  mg44(8,0, 8,4);  mg44(11,0,11,4);
mg44(19,0,19,4); mg44(21,0,21,4); mg44(27,0,27,4);

s44(0,0, { font:{bold:true,sz:12}, alignment:{horizontal:"left"}, ...BOX44 });
s44(1,0, { font:{bold:true,sz:9,italic:true}, alignment:{horizontal:"left"} });

// Table header
s44(3,0, { font:{bold:true,sz:9}, alignment:{horizontal:"left",vertical:"center"}, ...THIN });
s44(3,2, { font:{bold:true,sz:9}, alignment:{horizontal:"center"}, ...THIN });
[2,3,4].forEach(c => s44(4,c, { font:{bold:true,sz:9}, alignment:{horizontal:"right"}, ...THIN }));

// Section headings
s44(5,0,  boldL()); // Financial assets
s44(6,0,  { font:{bold:true,sz:9,underline:true}, alignment:{horizontal:"left"} }); // i. FVTOCI
s44(8,0,  { font:{bold:true,sz:9,underline:true}, alignment:{horizontal:"left"} }); // ii. FVTPL
s44(11,0, { font:{bold:true,sz:9,underline:true}, alignment:{horizontal:"left"} }); // iii. Amortized cost

// Data rows 7,9,10,12-17
[7,9,10,12,13,14,15,16,17].forEach(r => {
  s44(r,0, { font:{sz:9}, alignment:{horizontal:"left"} });
  [2,3,4].forEach(c => s44(r,c, numR()));
});

// Total financial assets - bold double underline
s44(18,0, boldL());
[2,3,4].forEach(c => s44(18,c, boldR(DBL)));

// Amortized Cost row
s44(19,0, boldL());
[2,3,4].forEach(c => s44(19,c, numR()));

// Financial liabilities
s44(21,0, boldL());
[22,23,24].forEach(r => {
  s44(r,0, { font:{sz:9}, alignment:{horizontal:"left"} });
  [2,3,4].forEach(c => s44(r,c, numR()));
});

// Total financial liabilities - bold double underline
s44(25,0, boldL());
[2,3,4].forEach(c => s44(25,c, boldR(DBL)));

// Investment note - small italic
s44(27,0, { font:{sz:8,italic:true}, alignment:{horizontal:"left",wrapText:true} });
note4244Sheet["!rows"][27] = { hpt: 35 };

// ================================================================
// NOTE 42(b) - Fair value hierarchy
// ================================================================
mg44(29,0,29,4); mg44(30,0,30,4); mg44(31,0,31,4);
mg44(32,0,32,4); mg44(33,0,33,4); mg44(34,0,34,4);

s44(29,0, { font:{bold:true,sz:9,italic:true}, alignment:{horizontal:"left"} });
[30,31,32,33,34].forEach(r => { s44(r,0, wrapStyle()); note4244Sheet["!rows"][r] = { hpt: 25 }; });

// Fair value table header row 36
[0,1,2,3,4].forEach(c => s44(36,c, { font:{bold:true,sz:9}, alignment:{horizontal: c===0?"left":"right"}, ...THIN }));

// Group labels (As at Sep/Mar...)
[37,41,45].forEach(r => { mg44(r,0,r,4); s44(r,0, boldL()); });

// Data rows
[38,39,40,42,43,44,46,47,48].forEach(r => {
  s44(r,0, { font:{sz:9}, alignment:{horizontal:"left"} });
  [1,2,3,4].forEach(c => s44(r,c, { font: r===38||r===39||r===42||r===43||r===46 ? {bold:true,sz:9} : {sz:9}, alignment:{horizontal:"right"} }));
});

// Italic footer
mg44(49,0,49,4);
s44(49,0, { font:{sz:8,italic:true}, alignment:{horizontal:"left"}, border:{top:{style:"thin"}} });

// ================================================================
// NOTE 42(c) and 42(d)
// ================================================================
mg44(51,0,51,4); mg44(52,0,52,4);
mg44(54,0,54,4); mg44(55,0,55,4);
s44(51,0, { font:{bold:true,sz:9,italic:true}, alignment:{horizontal:"left"} });
s44(52,0, wrapStyle()); note4244Sheet["!rows"][52] = { hpt: 35 };
s44(54,0, { font:{bold:true,sz:9,italic:true}, alignment:{horizontal:"left"} });
s44(55,0, wrapStyle());

// ================================================================
// NOTE 43 - Financial Risk Management
// ================================================================
mg44(57,0,57,4); mg44(58,0,58,4); mg44(59,0,59,4); mg44(60,0,60,4);
s44(57,0, { font:{bold:true,sz:12}, alignment:{horizontal:"left"}, ...BOX44 });
s44(58,0, wrapStyle());
s44(59,0, { font:{bold:true,sz:9}, alignment:{horizontal:"left"} }); // Financial assets: bold underline
s44(60,0, { font:{bold:true,sz:9}, alignment:{horizontal:"left"} }); // Financial liabilities: bold underline

// A. Credit risk
mg44(62,0,62,4);
s44(62,0, { font:{bold:true,sz:10}, alignment:{horizontal:"left"} });

mg44(63,0,63,4);
s44(63,0, wrapStyle()); note4244Sheet["!rows"][63] = { hpt: 50 };

// A.1 Trade and Other Receivables
mg44(65,0,65,4);
s44(65,0, { font:{bold:true,sz:9,italic:true,underline:true}, alignment:{horizontal:"left"} });
[66,68,70].forEach(r => { mg44(r,0,r,4); s44(r,0, wrapStyle()); note4244Sheet["!rows"][r] = { hpt: 60 }; });

// A.2 Other financial assets
mg44(72,0,72,4);
s44(72,0, { font:{bold:true,sz:9,italic:true,underline:true}, alignment:{horizontal:"left"} });
[73,75,77].forEach(r => { mg44(r,0,r,4); s44(r,0, wrapStyle()); note4244Sheet["!rows"][r] = { hpt: 40 }; });

// A.3 Credit exposure
mg44(79,0,79,4); mg44(80,0,80,4);
s44(79,0, { font:{bold:true,sz:9,italic:true,underline:true}, alignment:{horizontal:"left"}, border:{top:{style:"thin"}} });
s44(80,0, wrapStyle());

// Credit exposure table header row 81
[0,1,2,3,4].forEach(c => s44(81,c, { font:{bold:true,sz:9}, alignment:{horizontal:c===0?"left":"right",wrapText:true}, ...THIN }));
note4244Sheet["!rows"][81] = { hpt: 35 };

// Section labels
[82,90,98].forEach(r => { mg44(r,0,r,4); s44(r,0, boldL()); });

// Data rows - credit exposure
[83,84,85,86,87,88,92,93,94,95,96,99,100,101,102,103].forEach(r => {
  s44(r,0, { font:{sz:9}, alignment:{horizontal:"left"} });
  [1,2,3,4].forEach(c => s44(r,c, numR()));
});
// Totals
[89,97,105].forEach(r => {
  s44(r,0, boldL());
  [1,2,3,4].forEach(c => s44(r,c, boldR(DBL)));
});
// Mar24 data rows
[99,100,101,102,103,104].forEach(r => {
  s44(r,0, { font:{sz:9}, alignment:{horizontal:"left"} });
  [1,2,3,4].forEach(c => s44(r,c, numR()));
});

// ================================================================
// B. Liquidity risk
// ================================================================
mg44(107,0,107,4); mg44(108,0,108,4);
s44(107,0, { font:{bold:true,sz:10}, alignment:{horizontal:"left"} });
s44(108,0, wrapStyle()); note4244Sheet["!rows"][108] = { hpt: 60 };

mg44(110,0,110,4); mg44(111,0,111,4);
s44(110,0, { font:{bold:true,sz:9,underline:true}, alignment:{horizontal:"left"} });
s44(111,0, wrapStyle());

// Maturity table header row 112
[0,1,2,3,4].forEach(c => s44(112,c, { font:{bold:true,sz:9}, alignment:{horizontal:c===0?"left":"right",wrapText:true}, ...TTHIN }));
note4244Sheet["!rows"][112] = { hpt: 30 };

// Section labels
[113,119,125].forEach(r => { mg44(r,0,r,4); s44(r,0, boldL()); });

// Maturity data rows
[114,115,116,117,120,121,122,123,126,127,128,129].forEach(r => {
  s44(r,0, { font:{sz:9}, alignment:{horizontal:"left"} });
  [1,2,3,4].forEach(c => s44(r,c, numR()));
});
// Totals
[118,124,130].forEach(r => {
  s44(r,0, boldL());
  [1,2,3,4].forEach(c => s44(r,c, boldR(DBL)));
});

// ================================================================
// C. Market risk
// ================================================================
mg44(132,0,132,4);
s44(132,0, { font:{bold:true,sz:10}, alignment:{horizontal:"left"} });

// C.1 Interest Rate risk
mg44(134,0,134,4); mg44(135,0,135,4);
s44(134,0, { font:{bold:true,sz:9,italic:true,underline:true}, alignment:{horizontal:"left"} });
s44(135,0, wrapStyle()); note4244Sheet["!rows"][135] = { hpt: 35 };

// Box heading for interest rate table
mg44(137,0,137,4);
s44(137,0, { font:{bold:true,sz:9}, alignment:{horizontal:"left"}, border:{top:{style:"medium"},bottom:{style:"thin"},left:{style:"medium"},right:{style:"medium"}} });

// Interest rate table
mg44(138,2,138,4); mg44(138,0,139,0);
s44(138,0, { font:{bold:true,sz:9}, alignment:{horizontal:"left",vertical:"center"}, ...THIN });
s44(138,2, { font:{bold:true,sz:9}, alignment:{horizontal:"center"}, ...THIN });
[2,3,4].forEach(c => s44(139,c, { font:{bold:true,sz:9}, alignment:{horizontal:"right"}, ...THIN }));
[140,141].forEach(r => {
  s44(r,0, { font:{sz:9}, alignment:{horizontal:"left"} });
  [2,3,4].forEach(c => s44(r,c, numR()));
});
s44(142,0, { font:{bold:true,sz:9}, alignment:{horizontal:"left"} });
[2,3,4].forEach(c => s44(142,c, boldR(DBL)));

// Sensitivity paragraph
mg44(144,0,144,4);
s44(144,0, wrapStyle()); note4244Sheet["!rows"][144] = { hpt: 70 };

// Sensitivity table header row 146
[0,1,2,3,4].forEach(c => s44(146,c, { font:{bold:true,sz:9}, alignment:{horizontal:c===0?"left":"right",wrapText:true}, ...THIN }));
note4244Sheet["!rows"][146] = { hpt: 30 };

[147,148].forEach(r => {
  s44(r,0, { font:{sz:9}, alignment:{horizontal:"left"} });
  [2,3].forEach(c => s44(r,c, numR()));
});

// Fixed rate note
mg44(150,0,150,4);
s44(150,0, wrapStyle()); note4244Sheet["!rows"][150] = { hpt: 35 };

// C.2 Other price risk
mg44(152,0,152,4); mg44(153,0,153,4);
s44(152,0, { font:{bold:true,sz:9,italic:true,underline:true}, alignment:{horizontal:"left"} });
s44(153,0, wrapStyle()); note4244Sheet["!rows"][153] = { hpt: 35 };

// ================================================================
// NOTE 44 - Capital Management
// ================================================================
mg44(155,0,155,4);
s44(155,0, { font:{bold:true,sz:12}, alignment:{horizontal:"left"}, ...BOX44 });
[157,159,161].forEach(r => { mg44(r,0,r,4); s44(r,0, wrapStyle()); note4244Sheet["!rows"][r] = { hpt: r===161?55:35 }; });

// Capital table
mg44(163,2,163,4); mg44(163,0,164,0); mg44(165,0,165,4);
s44(163,0, { font:{bold:true,sz:9}, alignment:{horizontal:"left",vertical:"center"}, ...THIN });
s44(163,2, { font:{bold:true,sz:9}, alignment:{horizontal:"center"}, ...THIN });
[2,3,4].forEach(c => s44(164,c, { font:{bold:true,sz:9}, alignment:{horizontal:"right"}, ...THIN }));

s44(165,0, boldL()); // Borrowings heading
[166,167,168].forEach(r => {
  s44(r,0, { font:{sz:9}, alignment:{horizontal:"left"} });
  [2,3,4].forEach(c => s44(r,c, numR()));
});
// Net debt - bold
s44(169,0, boldL());
[2,3,4].forEach(c => s44(169,c, boldR(DBL)));
// Equity - bold
s44(170,0, boldL());
[2,3,4].forEach(c => s44(170,c, boldR()));
// Gearing ratio - bold
s44(171,0, boldL());
[2,3,4].forEach(c => s44(171,c, boldR(DBL)));

XLSX.utils.book_append_sheet(workbook, note4244Sheet, "42_44");
// ============================================================
// END Note42_44
// ============================================================

// ============================================================
// NEW WORKSHEET: Note45_48
// ============================================================
const note4548Data = [
  // 0
  ["XYZ INFRASTRUCTURE & PROPERTIES LIMITED"],
  // 1
  ["NOTES TO THE STANDALONE FINANCIAL STATEMENTS"],
  // 2
  ["FOR THE PERIOD ENDED SEPTEMBER 30, 2025"],
  // 3
  ["(All amounts are in \u20B9 millions, unless stated otherwise)"],
  // 4
  [],
  // 5
  ["45. RATIO ANALYSIS"],
  // 6 - table header
  ["Particulars", "Numerator", "Denominator", "September 30, 2025", "March 31, 2025", "March 31, 2024", "Variance (Sep. 25)**", "Variance (March 25)", "Reasons for Variances"],
  // 7
  ["Current ratio", "Total current assets", "Total current liabilities", 1.08, 1.05, 1.15, "0.03", "(9.01%)#", ""],
  // 8
  ["Debt-Equity ratio\n(in times)", "Debt Consists Long Term Borrowing, Lease Liability (Non-current & current) and current maturities", "Total equity", 0.73, 0.79, 0.53, "-7.13%", "49.87%", "Company has borrowed money in the current financial year which has resulted into increase in the Debt Equity ratio."],
  // 9
  ["Debt service coverage ratio\n(in times)", "Earning before Interest, Tax and Depreciation", "Debt service = Interest and lease payments + Principal repayments", 0.48, 2.12, 2.36, "-", "(9.98%)#", ""],
  // 10
  ["Return on equity ratio\n(in %)", "Profit for the year less Preference dividend (if any)", "Average total equity", "0.31%", "19.19%", "10.17%", "-", "88.72%", "Increase in other income of the Company has resulted into higher profits in the reported period that has resulted into the improved ratio."],
  // 11
  ["Inventory turnover ratio\n(in times)", "Revenue from Sale of Product", "Average inventory", 0.07, 0.29, 0.44, "-", "(33.46%)", "The decline is primarily due to an increase in average inventory levels maintained as the company has brought land for the upcoming projects."],
  // 12
  ["Trade receivables turnover ratio\n(in times)", "Revenue from Sale of Product", "Average trade receivables", 2.44, 10.23, 15.46, "-", "(33.82%)", "Increase in other income has resulted into higher Trade receivable in the reported period which has resulted into detioriation in ratio in the reported period."],
  // 13
  ["Trade payables turnover ratio\n(in times)", "Purchases", "Average trade payables", 7.19, 18.84, 15.14, "-", "24.45%#", ""],
  // 14
  ["Net capital turnover ratio\n(in times)", "Revenue from Sale of Product", "Working Capital = Total Current Asset - Total Current Liability", 0.64, 4.02, 4.42, "-", "(8.95%)#", ""],
  // 15
  ["Net profit ratio\n(in %)", "Total Comprehensive Income for the year", "Revenue from operations", "24.10%", "93.77%", "46.49%", "-", "101.71%", "Increase in other income of the Company has resulted into higher profits in the reported period that has resulted into the improved ratio."],
  // 16
  ["Return on capital employed\n(in %)", "Earning before Interest and Tax", "Average Capital Employed = Tangible Net Worth + Total Debt + Deferred Tax Laibility", "1.89%", "11.35%", "10.98%", "-", "3.34%", "Increase in other income of the Company has resulted into higher profits in the reported period that has resulted into the improved ratio."],
  // 17
  ["Return on investment\n(in %)", "Earning After Tax", "Total Assets", "0.58%", "8.46%", "5.45%", "-", "55.17%", "Increase in other income of the Company has resulted into higher profits in the reported period that has resulted into the improved ratio."],
  // 18
  ["*Variance not more than 25%"],
  // 19
  ["** Variance in realtion to earnings, expenses and profit for six months period ended 30th September, 2025 is not computed as the numbers for corresponding period in the previous year are not available."],
  // 20
  [],
  // 21
  ["46. OTHER STATUTORY INFORMATION"],
  // 22
  ["(i) The Company has not traded or invested in Crypto currency or Virtual Currency during the financial year."],
  // 23
  ["(ii) The Company has not been declared wilful defaulter by any bank or financial institution or government or any government authority."],
  // 24
  [],
  // 25
  ["(iii) The Company has not any such transaction which is not recorded in the books of accounts that has been surrendered or disclosed as income during the year in the tax assessments under the Income Tax Act, 1961 (such as, search or survey or any other relevant provisions of the Income Tax Act, 1961)."],
  // 26
  [],
  // 27
  ["(iv) The Company do not have any transactions with struck-off companies."],
  // 28
  [],
  // 29
  ["(v) The Company does not have any Benami Property, where any proceedings has been initiated or pending against the company for holding any benami property."],
  // 30
  [],
  // 31
  ["(vi) The Company has not advanced or loaned or invested funds to any other person(s) or entity(ies), including foreign entities (Intermediaries) with the understanding that the Intermediary shall:"],
  // 32
  ["(a) directly or indirectly lend or invest in other persons or entities identified in any manner whatsoever by or on behalf of the company (Ultimate Beneficiaries) or"],
  // 33
  ["    (b) provide any guarantee, security or the like to or on behalf of the Ultimate Beneficiaries"],
  // 34
  [],
  // 35
  ["(vii) The Company has not received any fund from any person(s) or entity(ies), including foreign entities (Funding Party) with the understanding (whether recorded in writing or otherwise) that the Company shall:"],
  // 36
  ["(a) directly or indirectly lend or invest in other persons or entities identified in any manner whatsoever by or on behalf of the Funding Party (Ultimate Beneficiaries) or"],
  // 37
  ["    (b) provide any guarantee, security or the like on behalf of the Ultimate Beneficiaries."],
  // 38
  [],
  // 39
  ["47. Cash and Cash Equivalents and Bank Balances includes balances in Escrow Account which shall be used only for specified purposes as defined under Real Estate (Regulation and Development) Act, 2016."],
  // 40
  [],
  // 41
  ["48. The figures for the previous year have been regrouped/ reclassified to correspond with current year's classification/ disclosures."],
  // 42
  [],
  // 43
  ["As per our report of even date"],
  // 44
  [],
  // 45 - two column signature block
  ["for Agarwal & Saxena", "", "", "", "for and on behalf of Board of Directors"],
  // 46
  ["Chartered Accountants", "", "", "", "XYZ Infrastructure & Properties Limited"],
  // 47
  ["Firm Registration No.: 002405C", "", "", "", "CIN: U74899HR2000PLC043893"],
  // 48
  [],
  // 49
  [],
  // 50
  [],
  // 51 - three column signatures
  ["Akshay Sethi", "", "", "Pankaj Bajaj", "", "Ranjit Khattar"],
  // 52
  ["Partner", "", "", "Managing Director", "", "Director"],
  // 53
  ["Membership No.: 539439", "", "", "DIN: 00024735", "", "DIN: 00726997"],
];

const note4548Sheet = XLSX.utils.aoa_to_sheet(note4548Data);
note4548Sheet["!sheetView"] = [{ showGridLines: false }];
note4548Sheet["!merges"] = [];
note4548Sheet["!rows"] = [];
note4548Sheet["!cols"] = [
  { wch: 16 }, // A - Particulars
  { wch: 22 }, // B - Numerator
  { wch: 22 }, // C - Denominator
  { wch: 10 }, // D - Sep 30 2025
  { wch: 10 }, // E - Mar 31 2025
  { wch: 10 }, // F - Mar 31 2024
  { wch: 10 }, // G - Variance Sep
  { wch: 10 }, // H - Variance Mar
  { wch: 28 }, // I - Reasons
];

// helpers
const s48 = (r, c, style) => {
  const ref = XLSX.utils.encode_cell({ r, c });
  if (!note4548Sheet[ref]) note4548Sheet[ref] = { t: "z", v: "" };
  note4548Sheet[ref].s = style;
};
const mg48 = (r1,c1,r2,c2) => note4548Sheet["!merges"].push({ s:{r:r1,c:c1}, e:{r:r2,c:c2} });
// // const THIN = { border: { bottom:{style:"thin"} } };
// const TTHIN = { border: { top:{style:"thin"}, bottom:{style:"thin"} } };
const BOX48 = { border: { top:{style:"medium"}, bottom:{style:"medium"}, left:{style:"medium"}, right:{style:"medium"} } };
const wrapC = (extra={}) => ({ font:{sz:9}, alignment:{horizontal:"center",wrapText:true,vertical:"top"}, ...extra });
const wrapL = (extra={}) => ({ font:{sz:9}, alignment:{horizontal:"left",wrapText:true,vertical:"top"}, ...extra });
const wrapR = (extra={}) => ({ font:{sz:9}, alignment:{horizontal:"right",wrapText:true,vertical:"top"}, ...extra });

// ================================================================
// HEADER
// ================================================================
mg48(0,0, 0,8); mg48(1,0, 1,8); mg48(2,0, 2,8); mg48(3,0, 3,8);
s48(0,0, { font:{bold:true,sz:13,color:{rgb:"008000"}}, alignment:{horizontal:"left"} });
s48(1,0, { font:{bold:true,sz:11}, alignment:{horizontal:"left"} });
s48(2,0, { font:{bold:true,sz:10}, alignment:{horizontal:"left"} });
s48(3,0, { font:{sz:8,italic:true}, alignment:{horizontal:"left"} });

// ================================================================
// NOTE 45 - RATIO ANALYSIS
// ================================================================
mg48(5,0, 5,8);
s48(5,0, { font:{bold:true,sz:11}, alignment:{horizontal:"left"}, ...BOX48 });

// Table header row 6
[0,1,2,3,4,5,6,7,8].forEach(c => {
  s48(6,c, { font:{bold:true,sz:9}, alignment:{horizontal:"center",wrapText:true,vertical:"center"}, border:{top:{style:"thin"},bottom:{style:"thin"},left:{style:"thin"},right:{style:"thin"}} });
});
note4548Sheet["!rows"][6] = { hpt: 35 };

// Ratio data rows 7-17
[7,8,9,10,11,12,13,14,15,16,17].forEach(r => {
  // All cells get borders + wrap
  [0,1,2].forEach(c => s48(r,c, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true,vertical:"top"}, border:{left:{style:"thin"},right:{style:"thin"},bottom:{style:"thin"}} }));
  [3,4,5,6,7].forEach(c => s48(r,c, { font:{sz:9}, alignment:{horizontal:"right",wrapText:true,vertical:"top"}, border:{left:{style:"thin"},right:{style:"thin"},bottom:{style:"thin"}} }));
  s48(r,8, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true,vertical:"top"}, border:{left:{style:"thin"},right:{style:"thin"},bottom:{style:"thin"}} });
  note4548Sheet["!rows"][r] = { hpt: 70 };
});

// Footnotes
mg48(18,0,18,8); mg48(19,0,19,8);
s48(18,0, { font:{sz:8,italic:true}, alignment:{horizontal:"left"} });
s48(19,0, { font:{sz:8,italic:true}, alignment:{horizontal:"left",wrapText:true} });
note4548Sheet["!rows"][19] = { hpt: 30 };

// ================================================================
// NOTE 46 - OTHER STATUTORY INFORMATION
// ================================================================
mg48(21,0,21,8);
s48(21,0, { font:{bold:true,sz:11}, alignment:{horizontal:"left"}, ...BOX48 });

// (i) and (ii) single line
mg48(22,0,22,8); mg48(23,0,23,8);
[22,23].forEach(r => s48(r,0, { font:{sz:9}, alignment:{horizontal:"left"} }));

// (iii) wrap
mg48(25,0,25,8);
s48(25,0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} });
note4548Sheet["!rows"][25] = { hpt: 35 };

// (iv) and (v)
mg48(27,0,27,8); mg48(29,0,29,8);
[27,29].forEach(r => { s48(r,0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} }); note4548Sheet["!rows"][r] = { hpt: 25 }; });

// (vi) and sub-items
mg48(31,0,31,8); mg48(32,0,32,8); mg48(33,0,33,8);
[31,32,33].forEach(r => { s48(r,0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} }); note4548Sheet["!rows"][r] = { hpt: 25 }; });

// (vii) and sub-items
mg48(35,0,35,8); mg48(36,0,36,8); mg48(37,0,37,8);
[35,36,37].forEach(r => { s48(r,0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} }); note4548Sheet["!rows"][r] = { hpt: 25 }; });
note4548Sheet["!rows"][35] = { hpt: 35 };

// ================================================================
// NOTE 47 and 48
// ================================================================
mg48(39,0,39,8); mg48(41,0,41,8);
s48(39,0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} });
s48(41,0, { font:{sz:9}, alignment:{horizontal:"left",wrapText:true} });
note4548Sheet["!rows"][39] = { hpt: 30 };

// ================================================================
// SIGNATURES
// ================================================================
mg48(43,0,43,8);
s48(43,0, { font:{sz:9}, alignment:{horizontal:"left"} });

// Two-column signature
mg48(45,0,45,3); mg48(45,4,45,8);
mg48(46,0,46,3); mg48(46,4,46,8);
mg48(47,0,47,3); mg48(47,4,47,8);

s48(45,0, { font:{sz:9}, alignment:{horizontal:"left"} });
s48(45,4, { font:{sz:9}, alignment:{horizontal:"left"} });
s48(46,0, { font:{sz:9}, alignment:{horizontal:"left"} });
s48(46,4, { font:{bold:true,sz:9}, alignment:{horizontal:"left"} });
s48(47,0, { font:{sz:9}, alignment:{horizontal:"left"} });
s48(47,4, { font:{sz:9}, alignment:{horizontal:"left"} });

// Three-column signatures
mg48(51,0,51,2); mg48(51,3,51,4); mg48(51,5,51,8);
mg48(52,0,52,2); mg48(52,3,52,4); mg48(52,5,52,8);
mg48(53,0,53,2); mg48(53,3,53,4); mg48(53,5,53,8);

[51,52,53].forEach(r => {
  [0,3,5].forEach(c => {
    const isBold = r===51;
    s48(r,c, { font:{bold:isBold,sz:9}, alignment:{horizontal:"left"} });
  });
});

XLSX.utils.book_append_sheet(workbook, note4548Sheet, "45_48");
// ============================================================
// END Note45_48
// ============================================================


    // ======================
    // SEND FILE
    // ======================

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=Financial_Statements.xlsx"
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(buffer);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error generating Excel" });
  }
};