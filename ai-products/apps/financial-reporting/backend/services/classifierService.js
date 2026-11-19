import XLSX from 'xlsx';
import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const MASTER_FILE = "./master_data.xlsx";
const MASTER_SHEET = "TB Summary";
// LLM provider: DeepSeek (OpenAI-compatible chat-completions API)
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-pro";

let masterData = {
  INFRASTRUCTURE: {},
  SOHNA: {}
};
let masterKeys = {
  INFRASTRUCTURE: [],
  SOHNA: []
};
let llmExamples = {
  INFRASTRUCTURE: "",
  SOHNA: ""
};

// ========== HELPER: INFER NATURE FROM BSH ==========
function inferNatureFromBSH(bsh) {
  if (!bsh) return "PL";
  const bshLower = bsh.toLowerCase();
  if (bshLower.includes('asset') || bshLower.includes('liability') || bshLower.includes('liabilities') || bshLower.includes('equity') || bshLower.includes('capital') || bshLower.includes('loan') || bshLower.includes('borrowing') || bshLower.includes('investment') || bshLower.includes('cash') || bshLower.includes('bank') || bshLower.includes('inventories') || bshLower.includes('receivable') || bshLower.includes('payable') || bshLower.includes('deposit') || bshLower.includes('advance')) {
    return "BS";
  }
  return "PL";
}

// ========== HELPER: SMART DEFAULT FILLING ==========
function smartDefaultFill(accountHead, classification) {
  let nature = classification.NATURE || "";
  let bsh = classification["Balance Sheet Head"] || "";
  let group = classification["Group heads"] || "";

  if (!nature || nature === "NA" || nature.trim() === "") {
    nature = inferNatureFromBSH(bsh);
  }

  if (!bsh || bsh === "NA") {
    const ahLower = accountHead.toLowerCase();
    if (ahLower.includes('cgst') || ahLower.includes('sgst') || ahLower.includes('igst') || ahLower.includes('gst')) {
      bsh = "Other current liabilities";
      group = group || "Statutory dues";
    } else if (ahLower.includes('salary') || ahLower.includes('wage')) {
      bsh = "Employee benefits";
      group = group || "Salaries";
      nature = "PL";
    } else if (ahLower.includes('rent') || ahLower.includes('lease')) {
      bsh = "Operating expenses";
      group = group || "Rent";
      nature = "PL";
    } else if (ahLower.includes('interest')) {
      if (ahLower.includes('received') || ahLower.includes('income')) {
        bsh = "Other income";
        group = group || "Interest on deposits";
        nature = "PL";
      } else {
        bsh = "Finance costs";
        group = group || "Interest";
        nature = "PL";
      }
    } else if (ahLower.includes('depreciation')) {
      bsh = "Other expenses";
      group = group || "Depreciation";
      nature = "PL";
    } else if (ahLower.includes('tax') && !ahLower.includes('advance')) {
      bsh = "Other expenses";
      group = group || "Tax expenses";
      nature = "PL";
    } else if (ahLower.includes('advance')) {
      bsh = "Other current assets";
      group = group || "Advances";
      nature = "BS";
    } else if (ahLower.includes('loan') || ahLower.includes('borrowing')) {
      bsh = "Borrowings";
      group = group || "Loans";
      nature = "BS";
    } else if (ahLower.includes('cash') || ahLower.includes('bank')) {
      bsh = "Cash and cash equivalents";
      group = group || "Cash & Bank";
      nature = "BS";
    } else if (ahLower.includes('sales') || ahLower.includes('revenue')) {
      bsh = "Revenue";
      group = group || "Operating Income";
      nature = "PL";
    } else if (ahLower.includes('purchase') || ahLower.includes('cost')) {
      bsh = "Cost of sales";
      group = group || "Direct costs";
      nature = "PL";
    } else {
      bsh = bsh || "Other expenses";
      group = group || "Miscellaneous";
    }
  }

  if (!group || group === "NA") {
    group = "General";
  }

  return { NATURE: nature, "Balance Sheet Head": bsh, "Group heads": group };
}

function loadCompanyMasterData(companyType, filePath, sheetName) {
  try {
    console.log(`📖 Loading ${companyType} master data from ${filePath}...`);
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[sheetName];

    if (!sheet) {
      console.warn(`⚠️ Sheet "${sheetName}" not found in ${filePath}`);
      return;
    }

    // Determine header range based on company type
    const rangeIndex = (companyType === "SOHNA") ? 3 : 5;
    
    const rows = XLSX.utils.sheet_to_json(sheet, {
      range: rangeIndex,
      defval: ""
    });

    rows.forEach(row => {
      // Support "GL Heads" for SOHNA and standard names for others
      const accountHead = (row["GL Heads"] || row["Account Head"] || row["Account heads"] || "").toString().trim();
      if (!accountHead || accountHead === "nan") return;

      let nature = (row["NATURE"] || "").toString().trim();
      let bsh = (row["Balance Sheet Head"] || "").toString().trim();
      // Support "Groupings" for SOHNA and standard names for others
      let group = (row["Groupings"] || row["Group Head"] || row["Group heads"] || "").toString().trim();
      
      if (!nature && bsh) {
        nature = inferNatureFromBSH(bsh);
      }
      
      masterData[companyType][accountHead.toLowerCase()] = {
        NATURE: nature || (companyType === "SOHNA" ? "BS" : ""),
        "Balance Sheet Head": bsh || (companyType === "SOHNA" ? group : ""),
        "Group heads": group || ""
      };
      masterKeys[companyType].push(accountHead);
    });

    const entriesCount = Object.keys(masterData[companyType]).length;
    console.log(`✅ Loaded ${entriesCount} entries for ${companyType} from ${sheetName}`);

    if (entriesCount > 0) {
      llmExamples[companyType] = masterKeys[companyType].slice(0, 20).map(k => {
        const v = masterData[companyType][k.toLowerCase()];
        return `"${k}" → NATURE:${v.NATURE}, BSH:${v["Balance Sheet Head"]}, Group:${v["Group heads"]}`;
      }).join("\n");
    }

  } catch (error) {
    console.warn(`⚠️ Failed to load ${companyType} master data:`, error.message);
  }
}

function loadMasterData() {
  loadCompanyMasterData("INFRASTRUCTURE", MASTER_FILE, MASTER_SHEET);

  // apps/financial-reporting/public/new_reports.xlsx, resolved from this file so it works on any machine
  const defaultSohnaPath = fileURLToPath(new URL("../../public/new_reports.xlsx", import.meta.url));
  const deployedSohnaPath = path.join(process.cwd(), "new_reports.xlsx");
  const SOHNA_FILE = fs.existsSync(deployedSohnaPath) ? deployedSohnaPath : defaultSohnaPath;

  const SOHNA_SHEET = "TB Sum_24-25";
  loadCompanyMasterData("SOHNA", SOHNA_FILE, SOHNA_SHEET);
}

function findExactMatch(accountHead, companyType = "INFRASTRUCTURE") {
  const key = accountHead.toLowerCase().trim();
  const data = masterData[companyType] || masterData.INFRASTRUCTURE;
  if (data[key]) {
    return { ...data[key], match_type: "exact" };
  }
  return null;
}

function findFuzzyMatch(accountHead, companyType = "INFRASTRUCTURE") {
  const input = accountHead.toLowerCase().trim();
  const keys = masterKeys[companyType] || masterKeys.INFRASTRUCTURE;
  const data = masterData[companyType] || masterData.INFRASTRUCTURE;
  for (const key of keys) {
    if (key.toLowerCase().includes(input) || input.includes(key.toLowerCase())) {
      return { ...data[key.toLowerCase()], match_type: "fuzzy" };
    }
  }
  return null;
}

async function predictWithLLM(accountHead, companyType = "INFRASTRUCTURE") {
  if (!DEEPSEEK_API_KEY) {
    return { NATURE: "", "Balance Sheet Head": "", "Group heads": "", match_type: "llm-disabled" };
  }

  const examples = llmExamples[companyType] || llmExamples.INFRASTRUCTURE;

  const prompt = `You are an accounting expert. Classify this account head based on Indian accounting standards for company type: ${companyType}.

Account Head: "${accountHead}"

Training Examples:
${examples}

Classification Rules:
- CGST/SGST/IGST/GST → NATURE: BS, Balance Sheet Head: Current liabilities OR Current assets, Group heads: Statutory dues
- Sales/Revenue/Income → NATURE: PL, Balance Sheet Head: Revenue, Group heads: Operating Income
- Cash/Bank/Petty Cash → NATURE: BS, Balance Sheet Head: Current assets, Group heads: Cash & Bank
- Salary/Wages → NATURE: PL, Balance Sheet Head: Employee costs, Group heads: Salaries
- Rent/Lease → NATURE: PL, Balance Sheet Head: Operating expenses, Group heads: Rent
- Purchase/Cost → NATURE: PL, Balance Sheet Head: Cost of sales, Group heads: Direct costs
- Loan/Borrowing → NATURE: BS, Balance Sheet Head: Borrowings, Group heads: Loans
- Maintenance/Repair → NATURE: PL, Balance Sheet Head: Other expenses, Group heads: Maintenance
- Profit/Loss → NATURE: BS, Balance Sheet Head: Other equity, Group heads: Retained Earnings

IMPORTANT: NEVER leave NATURE blank. Always classify as either "BS" (Balance Sheet) or "PL" (Profit & Loss).

Return ONLY valid JSON (no markdown, no explanation):
{"NATURE":"BS or PL","Balance Sheet Head":"category","Group heads":"subcategory"}`;

  try {
    console.log(`🤖 LLM Request: "${accountHead}" [${companyType}] via DeepSeek ${MODEL}`);
    const response = await axios.post(
      `${DEEPSEEK_BASE_URL}/chat/completions`,
      {
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        // Thinking off: this is a short classification; reasoning tokens would
        // eat the max_tokens budget and add latency for every ledger line.
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        temperature: 0.2,
        max_tokens: 150
      },
      {
        headers: {
          "Authorization": `Bearer ${DEEPSEEK_API_KEY?.trim()}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );

    const content = response.data.choices[0].message.content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(content);

    return {
      NATURE: (parsed.NATURE || "").trim(),
      "Balance Sheet Head": (parsed["Balance Sheet Head"] || "").trim(),
      "Group heads": (parsed["Group heads"] || "").trim(),
      match_type: "llm-predicted"
    };
  } catch (error) {
    console.error(`⚠️ LLM failed for "${accountHead}":`, error.message);
    return { NATURE: "", "Balance Sheet Head": "", "Group heads": "", match_type: "llm-failed" };
  }
}

export async function classifyAccounts(inputArray, companyType = "INFRASTRUCTURE") {
  if (!inputArray || inputArray.length === 0) return [];

  const results = [];
  let exactCount = 0, fuzzyCount = 0, llmCount = 0, skippedCount = 0, fixedCount = 0;

  console.log(`🔄 Classifying ${inputArray.length} accounts for ${companyType}...`);

  for (let i = 0; i < inputArray.length; i++) {
    const item = inputArray[i];
    const accountHead = (
      item["Account Head"] || item["account head"] || item["accountHead"] || ""
    ).toString().trim();

    if (!accountHead || accountHead === "nan") {
      skippedCount++;
      results.push({ ...item, NATURE: "", "Balance Sheet Head": "", "Group heads": "", match_type: "skipped" });
      continue;
    }

    let classification = findExactMatch(accountHead, companyType);
    if (classification) {
      exactCount++;
    } else {
      classification = findFuzzyMatch(accountHead, companyType);
      if (classification) {
        fuzzyCount++;
      } else {
        classification = await predictWithLLM(accountHead, companyType);
        if (classification.match_type === "llm-predicted") {
          llmCount++;
          console.log(`  🤖 [${i + 1}] "${accountHead}"`);
        }
      }
    }

    // ========== CRITICAL: SMART DEFAULT FILLING ==========
    const filled = smartDefaultFill(accountHead, classification);

    // Track if we auto-filled
    if (filled.NATURE !== classification.NATURE ||
      filled["Balance Sheet Head"] !== classification["Balance Sheet Head"]) {
      fixedCount++;
    }

    results.push({
      ...item,
      NATURE: filled.NATURE,
      "Balance Sheet Head": filled["Balance Sheet Head"],
      "Group heads": filled["Group heads"],
      match_type: classification.match_type
    });
  }

  console.log(`✅ ${exactCount} exact, ${fuzzyCount} fuzzy, ${llmCount} LLM, ${fixedCount} auto-filled, ${skippedCount} skipped\n`);
  return results;
}

loadMasterData();