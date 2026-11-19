import XLSX from "xlsx";
import { parse } from "csv-parse/sync";
import fs from "fs";
import csv from "csv-parser";
import { Readable } from "stream";
import { classifyAccounts } from "../services/classifierService.js";
import path from "path";

const AE_ALIAS_MAP = {
  "construction expenses-(unallocated)": "construction expense (project)",
  "tender fees-(unallocated)": "tender fees",
  "maintenance charges-(unallocated)": "maintenance charges - lko",
  "electricity charges-(unallocated)": "electricity charges",
  "legal & professional-(unallocated)": "legal & professional charges",
  "bank commision on bg-(unallocated)": "bank commision on bg",
  "architect fees (wip)-(unallocated)": "architect fees (wip)",
  "provision for current tax": "provision for income tax",
  "re-measurement gain/(loss) on defined benefit plans": "re-measurement gains/(losses) on defined ind as 115",
  "loan processing charges-pl": "loan processing charges",
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
    const classCell = sheet[XLSX.utils.encode_cell({ r: R, c: 1 })]; // col B = Classification
    const amountCell = sheet[XLSX.utils.encode_cell({ r: R, c: 3 })]; // col D = Amount



    if (!particularsCell) continue;

    let account = (particularsCell.v || "").toString().trim().toLowerCase();
    const type = (classCell?.v || "").toString().toLowerCase();
    if (type.includes("opening")) continue;
    const amount = parseAmount(amountCell?.v); // ✅ handles "1,23,456" and numbers

    if (!account) continue;

    // account = AE_ALIAS_MAP[account] ?? account;

    account = AE_ALIAS_MAP[account] ?? account;

    if (!aeMap[account]) {
      aeMap[account] = { adjustment: 0, regrouping: 0, indAS: 0 };
    }

    if (type.includes("adjust")) aeMap[account].adjustment += amount;
    else if (type.includes("regroup")) aeMap[account].regrouping += amount;
    else if (type.includes("ind")) aeMap[account].indAS += amount;
  }

  return aeMap;
};

export const checkUploadFolder = async (req, res) => {
  try {
    const uploadPath = path.join(process.cwd(), "uploads");

    // Create folder if not exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }

    const files = fs.readdirSync(uploadPath);

    if (files.length === 0) {
      return res.status(200).json({
        isEmpty: true,
      });
    }

    return res.status(200).json({
      isEmpty: false,
      fileName: files[0],
    });
  } catch (error) {
    console.error("Check Folder Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error checking uploads folder",
    });
  }
};

export const deleteTrialBalance = async (req, res) => {
  try {
    const uploadPath = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadPath)) {
      return res.status(200).json({ success: true, message: "Uploads folder is already empty" });
    }

    const files = fs.readdirSync(uploadPath);
    for (const file of files) {
      fs.unlinkSync(path.join(uploadPath, file));
    }

    return res.status(200).json({
      success: true,
      message: "Current Trial Balance deleted successfully",
    });
  } catch (error) {
    console.error("Delete Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting Trial Balance",
    });
  }
};

const detectCompany = (fileBuffer, fileName) => {
  let companyType = "INFRASTRUCTURE";
  let headerRowIndex = 4; // Default

  try {
    if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
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
    console.error("TB Detect Error:", e);
  }

  return { companyType, headerRowIndex };
};

// Store file in uploads folder
export const uploadTrialBalance = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    return res.status(200).json({
      success: true,
      fileName: req.file.filename,
    });

  } catch (error) {
    return res.status(500).json({
      message: "Upload failed",
    });
  }
};


export const downloadTrialBalance = async (req, res) => {
  try {
    const uploadDir = path.join(process.cwd(), "uploads");

    // Get latest file (simple version)
    const files = fs.readdirSync(uploadDir);

    if (!files || files.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No uploaded file found",
      });
    }

    // If only one file stored
    const fileName = files[0];

    const filePath = path.join(uploadDir, fileName);

    // Ensure file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: "File not found",
      });
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${fileName}"`
    );

    res.setHeader("Content-Type", "application/octet-stream");

    return res.sendFile(filePath);

  } catch (error) {
    console.error("Download Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error downloading file",
    });
  }
};

export const previewTrialBalance = async (req, res) => {
  try {
    let fileBuffer;
    let fileName;

    const uploadPath = path.join(process.cwd(), "uploads");

    // Ensure uploads folder exists
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath);
    }

    // ✅ CASE 1: If file uploaded in request
    if (req.file) {
      fileBuffer = req.file.buffer;
      fileName = req.file.originalname.toLowerCase();
    }

    // ✅ CASE 2: If no file uploaded, read from uploads folder
    else {
      const files = fs.readdirSync(uploadPath);

      if (files.length === 0) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded and upload folder is empty",
        });
      }

      fileName = files[0].toLowerCase();
      const filePath = path.join(uploadPath, files[0]);
      fileBuffer = fs.readFileSync(filePath);
    }

    const { companyType, headerRowIndex } = detectCompany(fileBuffer, fileName);

    let jsonData = [];

    // =========================
    // Handle Excel
    // =========================
    if (fileName.endsWith(".xlsx")) {
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      const rawData = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
      });

      // const headerRowIndex = 4;

      const headers = rawData[headerRowIndex]
        .map((h) => (h ? h.toString().trim() : ""))
        .filter((h) => h !== "");

      const rows = rawData.slice(headerRowIndex + 1);

      jsonData = rows.map((row) => {
        const obj = {};
        headers.forEach((header, index) => {
          obj[header] = row[index] ?? "";
        });
        return obj;
      });
    }

    // =========================
    // Handle CSV
    // =========================
    else if (fileName.endsWith(".csv")) {
      const csvString = fileBuffer.toString();

      jsonData = parse(csvString, {
        columns: true,
        skip_empty_lines: true,
      });
    }

    else {
      return res.status(400).json({
        success: false,
        message: "Invalid file type. Only .xlsx and .csv allowed.",
      });
    }

    // =========================
    // CLEAN DATA
    // =========================
    jsonData = jsonData.map((row) => {
      const cleanedRow = {};

      Object.keys(row).forEach((key) => {
        const trimmedKey = key.trim();

        if (
          trimmedKey !== "" &&
          !trimmedKey.toLowerCase().startsWith("_empty")
        ) {
          cleanedRow[trimmedKey] = row[key];
        }
      });

      return cleanedRow;
    });

    return res.status(200).json({
      success: true,
      totalRows: jsonData.length,
      data: jsonData,
      companyType,
    });

  } catch (error) {
    console.error("Preview Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error parsing file",
    });
  }
};

// export const previewTrialBalance = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ message: "No file uploaded" });
//     }

//     const fileBuffer = req.file.buffer;
//     const fileName = req.file.originalname.toLowerCase();

//     let jsonData = [];

//     // Handle Excel
//     if (fileName.endsWith(".xlsx")) {
//       const workbook = XLSX.read(fileBuffer, { type: "buffer" });
//       const sheetName = workbook.SheetNames[0];
//       const sheet = workbook.Sheets[sheetName];

//       const rawData = XLSX.utils.sheet_to_json(sheet, {
//         header: 1,
//         defval: "",
//       });
// const headerRowIndex = 4;

// // Extract headers
// const headers = rawData[headerRowIndex]
//   .map((h) => (h ? h.toString().trim() : ""))
//   .filter((h) => h !== "");

// // Extract actual data rows
// const rows = rawData.slice(headerRowIndex + 1);

// // Convert rows to objects
// jsonData = rows.map((row) => {
//   const obj = {};

//   headers.forEach((header, index) => {
//     obj[header] = row[index] ?? "";
//   });

//   return obj;
// });

//     }

//     // Handle CSV
//     else if (fileName.endsWith(".csv")) {
//       const csvString = fileBuffer.toString();

//       jsonData = parse(csvString, {
//         columns: true,
//         skip_empty_lines: true,
//       });
//     }

//     else {
//       return res.status(400).json({
//         message: "Invalid file type. Only .xlsx and .csv allowed.",
//       });
//     }

//     // ✅ ADD THIS CLEANING BLOCK HERE
//     jsonData = jsonData.map((row) => {
//       const cleanedRow = {};

//       Object.keys(row).forEach((key) => {
//         const trimmedKey = key.trim();

//         // Remove empty or _empty columns
//         if (
//           trimmedKey !== "" &&
//           !trimmedKey.toLowerCase().startsWith("_empty")
//         ) {
//           cleanedRow[trimmedKey] = row[key];
//         }
//       });

//       return cleanedRow;
//     });

//     // ✅ Now return cleaned data
//     return res.status(200).json({
//       success: true,
//       totalRows: jsonData.length,
//       data: jsonData,
//     });

//   } catch (error) {
//     console.error("Preview Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Error parsing file",
//     });
//   }
// };


const parseAmount = (value) => {
  if (!value) return 0;

  return Number(
    value
      .toString()
      .replace(/,/g, "")       // remove commas
      .replace(/\s/g, "")      // remove spaces
  ) || 0;
};


// const parseCSV = (filePath) => {
//   return new Promise((resolve, reject) => {
//     const results = [];
//     fs.createReadStream(filePath)
//       .pipe(csv())
//       .on("data", (data) => results.push(data))
//       .on("end", () => resolve(results))
//       .on("error", reject);
//   });
// };

// const parseExcel = (filePath) => {
//   const workbook = XLSX.readFile(filePath);
//   const sheet = workbook.Sheets[workbook.SheetNames[0]];
//   return XLSX.utils.sheet_to_json(sheet);
// };

// ===== MERGE DUPLICATE ACCOUNT HEADS =====
// ===== MERGE DUPLICATE ACCOUNT HEADS (ROBUST VERSION) =====
const normalizeString = (value) => {
  return value
    ?.toString()
    .normalize("NFKC")              // normalize unicode
    .replace(/\s+/g, " ")           // collapse multiple spaces
    .trim()
    .toLowerCase();
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



export const processTrialBalance = async (req, res) => {
  try {

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const ext = req.file.originalname.split(".").pop().toLowerCase();
    let rows = [];

    let { companyType, headerRowIndex } = detectCompany(req.file.buffer, req.file.originalname);

    // ===== CSV =====
    if (ext === "csv") {
      rows = await new Promise((resolve, reject) => {
        const results = [];
        const stream = Readable.from(req.file.buffer.toString());
        stream
          .pipe(csv())
          .on("data", (data) => results.push(data))
          .on("end", () => resolve(results))
          .on("error", reject);
      });
    }

    // ===== EXCEL =====
    else if (ext === "xlsx" || ext === "xls") {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];


      // Skip dynamic number of rows based on header detection
      rows = XLSX.utils.sheet_to_json(sheet, {
        range: headerRowIndex,
        defval: "",
        raw: false
      });
    }

    else {
      return res.status(400).json({ message: "Unsupported file type" });
    }

    console.log(`📥 Received ${rows.length} rows for processing`);

    // ===== CLASSIFY ACCOUNTS =====
    const classifiedRows = await classifyAccounts(rows, companyType);

    // ===== CALCULATE NET BALANCES (NO AE LOOKUP HERE) =====
    const processed = classifiedRows.map((row) => {
      const debitOpening = parseAmount(row["Debit Opening"]);
      const creditOpening = parseAmount(row["Credit Opening"]);
      const debit = parseAmount(row["Debit"]);
      const credit = parseAmount(row["Credit"]);
      const debitClosing = parseAmount(row["Debit Closing"]);
      const creditClosing = parseAmount(row["Credit Closing"]);

      return {
        accountHead: row["Account Head"],
        netOpeningBalance: debitOpening - creditOpening,
        netFY: debit - credit,
        netClosingBalance: debitClosing - creditClosing,
        NATURE: row.NATURE || "",
        "Balance Sheet Head": row["Balance Sheet Head"] || "",
        "Group heads": row["Group heads"] || "",
        match_type: row.match_type || "",
      };
    });

    // ===== MERGE FIRST =====
    const mergedData = mergeDuplicateAccounts(processed);
    console.log(`🔁 After merging duplicates: ${mergedData.length} rows`);

    // ===== THEN APPLY AE VALUES ONCE PER UNIQUE ACCOUNT =====
    const aeData = loadAESheet();
    const finalData = mergedData.map((row) => {
      const accountKey = (row.accountHead || "").trim().toLowerCase();
      const adjustment = aeData[accountKey]?.adjustment || 0;
      const regrouping = aeData[accountKey]?.regrouping || 0;
      const indAS = aeData[accountKey]?.indAS || 0;

      return {
        ...row,
        adjustment,
        regrouping,
        indAS,
        netClsBalance: (row.netClosingBalance + adjustment + regrouping + indAS) / 1000000,
      };
    });

    const stats = {
      total: processed.length,
      exact: processed.filter(r => r.match_type === 'exact').length,
      fuzzy: processed.filter(r => r.match_type === 'fuzzy').length,
      llm: processed.filter(r => r.match_type === 'llm-predicted').length,
      skipped: processed.filter(r => r.match_type === 'skipped').length,
    };

    return res.status(200).json({
      success: true,
      tableData: finalData,
      stats,
      companyType,
    });

  } catch (err) {
    console.error("Processing error:", err);
    return res.status(500).json({
      success: false,
      message: "Processing failed",
      error: err.message
    });
  }
};