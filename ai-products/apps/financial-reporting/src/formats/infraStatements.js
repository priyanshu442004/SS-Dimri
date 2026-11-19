// Excel builders for the Infrastructure statements. Used by the on-screen
// "Download Excel" buttons AND by the post-upload email, so both always match.
import * as XLSX from "xlsx";
import { sheetjsToBlob } from "../lib/documentMail";
import { SCREENSHOT_VALUES_BS, infraBSRows, INFRA_PL_EXPORT_DATA, INFRA_PL_COLS, infraPLRows } from "./infraData.js";

export { SCREENSHOT_VALUES_BS, infraBSRows, INFRA_PL_EXPORT_DATA };

// ---------------------------------------------------------------- Balance Sheet
// Audited figures shown for Infrastructure (same table as FormatBS.jsx).
export function buildInfraBSWorkbook(balanceSheetData) {
  const closing = balanceSheetData?.data?.dates?.closing ?? "-";
  const aoa = [
    [balanceSheetData?.companyName || "XYZ INFRASTRUCTURE & PROPERTIES LIMITED"],
    [`Standalone Balance Sheet as at ${closing}`],
    ["(All amounts in INR millions)"],
    [],
    ["Particulars", "Notes", closing, "31 March, 2025"],
    ...infraBSRows(balanceSheetData),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 58 }, { wch: 8 }, { wch: 18 }, { wch: 18 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Balance Sheet");
  return { blob: sheetjsToBlob(wb), fileName: "Infrastructure_Balance_Sheet.xlsx" };
}

// ---------------------------------------------------------------- Profit & Loss
export function buildInfraPLWorkbook(dates) {
  const cols = INFRA_PL_COLS;
  const aoa = [
    ["XYZ INFRASTRUCTURE & PROPERTIES LIMITED"],
    [`Standalone Statement of Profit and Loss for the period ended ${dates?.closing ?? "September 30, 2025"}`],
    ["(All amounts in INR millions)"],
    [],
    cols,
    ...infraPLRows(),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 70 }, { wch: 8 }, { wch: 20 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Profit & Loss");
  return { blob: sheetjsToBlob(wb), fileName: "Infrastructure_ProfitLoss.xlsx" };
}
