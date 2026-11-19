import * as XLSX from "xlsx";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** SheetJS workbook → Blob */
export const sheetjsToBlob = (wb) =>
  new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: XLSX_MIME });

/** Trigger a browser download for a Blob */
export const downloadBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
