import ExcelJS from 'exceljs';

// Builds the file; downloads it unless { download: false }. Returns { blob, fileName }
// so the same workbook can also be emailed.
const saveWorkbook = async (workbook, fileName, { download = true } = {}) => {
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (!download) return { blob, fileName };
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return { blob, fileName };
};

// Reused helpers
const getVal = (notes, noteKey, type = 'closing') => {
  const d = notes[noteKey];
  if (!d) return 0;
  const val = type === 'closing' ? d.closing : d.opening;
  return parseFloat(String(val).replace('*', '')) || 0;
};

const setupSohnaHeader = (worksheet, title, dates) => {
  worksheet.columns = [
    { header: '', key: 'particulars', width: 55 },
    { header: '', key: 'notes', width: 15 },
    { header: '', key: 'closing', width: 25 },
    { header: '', key: 'opening', width: 25 },
  ];

  worksheet.addRow(['XYZ SOHNA PROJECTS LIMITED']).font = { bold: true, size: 14 };
  worksheet.addRow(['[CIN: U45200HR2006PLC073744]']).font = { italic: true };
  worksheet.addRow([]);
  worksheet.addRow([`${title} as at ${dates.closing}`]).font = { bold: true, size: 12 };
  worksheet.addRow(['(All amounts in Millions, unless otherwise stated)']).font = { size: 10, italic: true };
  worksheet.addRow([]);

  const headerRow = worksheet.addRow(['Particulars', 'Notes', `As at ${dates.closing}`, `As at ${dates.opening}`]);
  headerRow.font = { bold: true };
  headerRow.alignment = { horizontal: 'center' };
  
  // Headers styling
  headerRow.eachCell(cell => {
    cell.border = { bottom: { style: 'medium' } };
  });

  // Alignment specific overrides
  worksheet.getColumn(3).alignment = { horizontal: 'right' };
  worksheet.getColumn(4).alignment = { horizontal: 'right' };
  worksheet.getColumn(2).alignment = { horizontal: 'center' };
};

const formatRowData = (worksheet, particulars, notesKey, closing, opening, isBold = false, indent = 0) => {
  const row = worksheet.addRow([
    indent > 0 ? " ".repeat(indent) + particulars : particulars,
    notesKey || '',
    closing,
    opening
  ]);
  
  if (isBold) {
    row.font = { bold: true };
  }
  
  row.getCell(3).numFmt = '#,##0.00;[Red](#,##0.00);"-"';
  row.getCell(4).numFmt = '#,##0.00;[Red](#,##0.00);"-"';
  return row;
};

const addSectionHeader = (worksheet, title) => {
  const row = worksheet.addRow([title]);
  row.font = { bold: true };
  row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
};

const addSohnaFooter = (worksheet) => {
  worksheet.addRow([]);
  const polRow = worksheet.addRow(["Summary of material accounting policies", "1 to 4"]);
  polRow.getCell(2).alignment = { horizontal: 'center' };
  
  worksheet.addRow(["The notes (5 to 41) referred above form an integral part of the Standalone Financial Statements"]).font = { italic: true };
  worksheet.addRow([]);
  worksheet.addRow(["As per our report of even date"]).font = { bold: true, italic: true };
  
  const sign1 = worksheet.addRow(["For Agarwal & Saxena", "", "For and on behalf of the Board of Directors"]);
  sign1.font = { bold: true };
  worksheet.addRow(["Chartered Accountants", "", "XYZ Sohna Projects Limited"]);
  worksheet.addRow(["( FRN-002405C )"]).font = { bold: true };
  worksheet.addRow([]);
  
  const sign2 = worksheet.addRow(["Akshay Sethi", "Parag Gupta", "Anand Kumar Srivastava"]);
  sign2.font = { bold: true };
  worksheet.addRow(["Partner", "(Director)", "(Director)"]);
  worksheet.addRow(["M. No. : 539439", "DIN: 05179313", "DIN: 10676937"]);
  worksheet.addRow([]);
  worksheet.addRow(["Place: New Delhi"]);
  worksheet.addRow([`Date: ${new Date().toLocaleDateString("en-GB").replaceAll("/", "-")}`]);
  
  // Align the director columns nicely
  const mergeOrAlign = (rowOffset) => {
    worksheet.lastRow.number - rowOffset;
  };
};

export const exportSohnaBSToExcel = async (data, opts) => {
  const { notes, dates } = data;
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Balance Sheet');

  setupSohnaHeader(ws, 'Standalone Balance Sheet', dates);

  // Totals calculations
  const totals = {
    ncAssets: {
      c: getVal(notes, "5") + getVal(notes, "6a") + getVal(notes, "6b") + getVal(notes, "7") + getVal(notes, "8"),
      o: getVal(notes, "5", "o") + getVal(notes, "6a", "o") + getVal(notes, "6b", "o") + getVal(notes, "7", "o") + getVal(notes, "8", "o")
    },
    cAssets: {
      c: getVal(notes, "9") + getVal(notes, "10a") + getVal(notes, "10b") + getVal(notes, "10c") + getVal(notes, "10d") + getVal(notes, "11") + getVal(notes, "12"),
      o: getVal(notes, "9", "o") + getVal(notes, "10a", "o") + getVal(notes, "10b", "o") + getVal(notes, "10c", "o") + getVal(notes, "10d", "o") + getVal(notes, "11", "o") + getVal(notes, "12", "o")
    },
    equity: {
      c: getVal(notes, "13") + getVal(notes, "14"),
      o: getVal(notes, "13", "o") + getVal(notes, "14", "o")
    },
    ncLiab: {
      c: getVal(notes, "15a") + getVal(notes, "15b") + getVal(notes, "16"),
      o: getVal(notes, "15a", "o") + getVal(notes, "15b", "o") + getVal(notes, "16", "o")
    },
    cLiab: {
      c: getVal(notes, "17a") + getVal(notes, "17b") + getVal(notes, "17c") + getVal(notes, "17d") + getVal(notes, "18") + getVal(notes, "19"),
      o: getVal(notes, "17a", "o") + getVal(notes, "17b", "o") + getVal(notes, "17c", "o") + getVal(notes, "17d", "o") + getVal(notes, "18", "o") + getVal(notes, "19", "o")
    }
  };
  totals.assets = { c: totals.ncAssets.c + totals.cAssets.c, o: totals.ncAssets.o + totals.cAssets.o };
  totals.eqLiab = { c: totals.equity.c + totals.ncLiab.c + totals.cLiab.c, o: totals.equity.o + totals.ncLiab.o + totals.cLiab.o };

  // ASSETS
  addSectionHeader(ws, 'ASSETS');
  ws.addRow(['Non-Current Assets']).font = { italic: true };
  formatRowData(ws, "(a) Property, plant & equipment", "5", getVal(notes, "5"), getVal(notes, "5", "o"), false, 4);
  formatRowData(ws, "(b) Financial assets", "6", getVal(notes, "6"), getVal(notes, "6", "o"), true, 4);
  formatRowData(ws, "(i) Investments", "6a", getVal(notes, "6a"), getVal(notes, "6a", "o"), false, 8);
  formatRowData(ws, "(ii) Other financial assets", "6b", getVal(notes, "6b"), getVal(notes, "6b", "o"), false, 8);
  formatRowData(ws, "(c) Deferred tax assets (net)", "7", getVal(notes, "7"), getVal(notes, "7", "o"), false, 4);
  formatRowData(ws, "(d) Other non-current assets", "8", getVal(notes, "8"), getVal(notes, "8", "o"), false, 4);
  
  const subNCA = formatRowData(ws, "Sub-total (Non-current assets)", null, totals.ncAssets.c, totals.ncAssets.o, true, 8);
  subNCA.getCell(3).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  subNCA.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  ws.addRow([]);

  ws.addRow(['Current Assets']).font = { italic: true };
  formatRowData(ws, "(a) Inventories", "9", getVal(notes, "9"), getVal(notes, "9", "o"), false, 4);
  formatRowData(ws, "(b) Financial assets", "10", getVal(notes, "10"), getVal(notes, "10", "o"), true, 4);
  formatRowData(ws, "(i) Trade receivables", "10a", getVal(notes, "10a"), getVal(notes, "10a", "o"), false, 8);
  formatRowData(ws, "(ii) Cash and cash equivalents", "10b", getVal(notes, "10b"), getVal(notes, "10b", "o"), false, 8);
  formatRowData(ws, "(iii) Bank balances other than (ii) above", "10c", getVal(notes, "10c"), getVal(notes, "10c", "o"), false, 8);
  formatRowData(ws, "(iv) Other financial assets", "10d", getVal(notes, "10d"), getVal(notes, "10d", "o"), false, 8);
  formatRowData(ws, "(c) Current tax assets (net)", "11", getVal(notes, "11"), getVal(notes, "11", "o"), false, 4);
  formatRowData(ws, "(d) Other current assets", "12", getVal(notes, "12"), getVal(notes, "12", "o"), false, 4);

  const subCA = formatRowData(ws, "Sub-total (Current assets)", null, totals.cAssets.c, totals.cAssets.o, true, 8);
  subCA.getCell(3).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  subCA.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  ws.addRow([]);

  const totAssets = formatRowData(ws, "TOTAL ASSETS", null, totals.assets.c, totals.assets.o, true, 0);
  totAssets.getCell(1).font = { bold: true, color: { argb: 'FF0000FF' } };
  totAssets.getCell(3).border = { top: { style: 'medium' }, bottom: { style: 'double' } };
  totAssets.getCell(4).border = { top: { style: 'medium' }, bottom: { style: 'double' } };
  ws.addRow([]);


  // EQUITY AND LIAB
  addSectionHeader(ws, 'EQUITY AND LIABILITIES');
  ws.addRow(['Equity']).font = { italic: true };
  formatRowData(ws, "(a) Equity share capital", "13", getVal(notes, "13"), getVal(notes, "13", "o"), false, 4);
  formatRowData(ws, "(b) Other equity", "14", getVal(notes, "14"), getVal(notes, "14", "o"), false, 4);
  const subEQ = formatRowData(ws, "Sub-total (Total Equity)", null, totals.equity.c, totals.equity.o, true, 8);
  subEQ.getCell(3).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  subEQ.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  ws.addRow([]);

  addSectionHeader(ws, 'Liabilities');
  ws.addRow(['Non-current liabilities']).font = { italic: true };
  formatRowData(ws, "(a) Financial liabilities", "15", getVal(notes, "15"), getVal(notes, "15", "o"), true, 4);
  formatRowData(ws, "(i) Borrowings", "15a", getVal(notes, "15a"), getVal(notes, "15a", "o"), false, 8);
  formatRowData(ws, "(ii) Lease Liability", "15b", getVal(notes, "15b"), getVal(notes, "15b", "o"), false, 8);
  formatRowData(ws, "(b) Provisions", "16", getVal(notes, "16"), getVal(notes, "16", "o"), false, 4);
  const subNCL = formatRowData(ws, "Sub-total (Non-current liabilities)", null, totals.ncLiab.c, totals.ncLiab.o, true, 8);
  subNCL.getCell(3).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  subNCL.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  ws.addRow([]);

  ws.addRow(['Current liabilities']).font = { italic: true };
  formatRowData(ws, "(a) Financial liabilities", "17", getVal(notes, "17"), getVal(notes, "17", "o"), true, 4);
  formatRowData(ws, "(i) Borrowings", "17a", getVal(notes, "17a"), getVal(notes, "17a", "o"), false, 8);
  formatRowData(ws, "(ii) Lease Liability", "17b", getVal(notes, "17b"), getVal(notes, "17b", "o"), false, 8);
  formatRowData(ws, "(iii) Trade payables", "17c", getVal(notes, "17c"), getVal(notes, "17c", "o"), true, 8);
  formatRowData(ws, "- Total outstanding due of micro and small enterprises", null, 0, 0, false, 12);
  formatRowData(ws, "- Total outstanding due other than micro and small", null, 0, 0, false, 12);
  formatRowData(ws, "(iv) Other financial liabilities", "17d", getVal(notes, "17d"), getVal(notes, "17d", "o"), false, 8);
  formatRowData(ws, "(b) Other current liabilities", "18", getVal(notes, "18"), getVal(notes, "18", "o"), false, 4);
  formatRowData(ws, "(c) Provisions", "19", getVal(notes, "19"), getVal(notes, "19", "o"), false, 4);
  const subCL = formatRowData(ws, "Sub-total (Current liabilities)", null, totals.cLiab.c, totals.cLiab.o, true, 8);
  subCL.getCell(3).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  subCL.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  ws.addRow([]);

  const totEL = formatRowData(ws, "TOTAL EQUITY AND LIABILITIES", null, totals.eqLiab.c, totals.eqLiab.o, true, 0);
  totEL.getCell(1).font = { bold: true, color: { argb: 'FF0000FF' } };
  totEL.getCell(3).border = { top: { style: 'medium' }, bottom: { style: 'double' } };
  totEL.getCell(4).border = { top: { style: 'medium' }, bottom: { style: 'double' } };

  addSohnaFooter(ws);

  return saveWorkbook(workbook, 'XYZ_Sohna_Balance_Sheet.xlsx', opts);
};

export const exportSohnaPLToExcel = async (data, opts) => {
  const { notes, dates } = data;
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Profit and Loss');

  setupSohnaHeader(ws, 'Standalone Statement of Profit and Loss', dates);

  const totals = {
    income: {
      c: getVal(notes, "20") + getVal(notes, "21"),
      o: getVal(notes, "20", "o") + getVal(notes, "21", "o")
    },
    expenses: {
      c: getVal(notes, "22") + getVal(notes, "23") + getVal(notes, "24") + getVal(notes, "25") + getVal(notes, "5") + getVal(notes, "26"),
      o: getVal(notes, "22", "o") + getVal(notes, "23", "o") + getVal(notes, "24", "o") + getVal(notes, "25", "o") + getVal(notes, "5", "o") + getVal(notes, "26", "o")
    }
  };

  const pbit = { c: totals.income.c - totals.expenses.c, o: totals.income.o - totals.expenses.o };
  const tax = { c: getVal(notes, "19PL"), o: getVal(notes, "19PL", "o") };
  const pat = { c: pbit.c - tax.c, o: pbit.o - tax.o };
  const oci = { c: 0.04, o: 0.07 };
  const tci = { c: pat.c + oci.c, o: pat.o + oci.o };

  addSectionHeader(ws, 'Income');
  formatRowData(ws, "Revenue from operations", "20", getVal(notes, "20"), getVal(notes, "20", "o"));
  formatRowData(ws, "Other incomes", "21", getVal(notes, "21"), getVal(notes, "21", "o"));
  const totInc = formatRowData(ws, "Total Income", null, totals.income.c, totals.income.o, true);
  totInc.getCell(3).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  totInc.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  ws.addRow([]);

  addSectionHeader(ws, 'Expenses');
  formatRowData(ws, "Cost of material consumed", "22", getVal(notes, "22"), getVal(notes, "22", "o"));
  formatRowData(ws, "Changes in Inventories of raw materials, land stock, WIP", "23", getVal(notes, "23"), getVal(notes, "23", "o"));
  formatRowData(ws, "Employee benefits expense", "24", getVal(notes, "24"), getVal(notes, "24", "o"));
  formatRowData(ws, "Finance costs", "25", getVal(notes, "25"), getVal(notes, "25", "o"));
  formatRowData(ws, "Depreciation and amortization", "5", getVal(notes, "5"), getVal(notes, "5", "o"));
  formatRowData(ws, "Other expenses", "26", getVal(notes, "26"), getVal(notes, "26", "o"));
  const totExp = formatRowData(ws, "Total expenses", null, totals.expenses.c, totals.expenses.o, true);
  totExp.getCell(3).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  totExp.getCell(4).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
  ws.addRow([]);

  addSectionHeader(ws, 'Profit Before Tax');
  formatRowData(ws, "Profit before exceptional items and tax", null, pbit.c, pbit.o, true);
  formatRowData(ws, "Exceptional items", null, 0, 0);
  const pbtRow = formatRowData(ws, "Profit before tax", null, pbit.c, pbit.o, true);
  pbtRow.getCell(3).border = { top: { style: 'thin' } };
  pbtRow.getCell(4).border = { top: { style: 'thin' } };

  addSectionHeader(ws, 'Tax Expense');
  formatRowData(ws, "1) Current tax", null, 0, 0, false, 4);
  formatRowData(ws, "2) Previous year tax", null, 0, 0, false, 4);
  formatRowData(ws, "3) Deferred tax charge/ (credit)", null, 0, 0, false, 4);
  formatRowData(ws, "Total Tax Expense", "19PL", tax.c, tax.o, true, 2);

  const profitYear = formatRowData(ws, "Profit for the year", null, pat.c, pat.o, true);
  profitYear.getCell(1).font = { bold: true, color: { argb: 'FF0000FF' } };
  profitYear.getCell(3).border = { top: { style: 'medium' }, bottom: { style: 'double' } };
  profitYear.getCell(4).border = { top: { style: 'medium' }, bottom: { style: 'double' } };
  ws.addRow([]);

  addSectionHeader(ws, 'Other Comprehensive Income');
  formatRowData(ws, "(i) Re-measurement gain/(loss) on defined benefits plans", null, 0, 0, false, 4);
  formatRowData(ws, "Income tax effect on (i)", null, 0, 0, false, 4);
  const toci = formatRowData(ws, "Total other comprehensive income/ (loss), net of tax", null, oci.c, oci.o, true);
  toci.getCell(3).border = { top: { style: 'thin' } };
  toci.getCell(4).border = { top: { style: 'thin' } };

  const totTCI = formatRowData(ws, "Total comprehensive income for the year", null, tci.c, tci.o, true);
  totTCI.getCell(1).font = { bold: true, color: { argb: 'FF0000FF' } };
  totTCI.getCell(3).border = { top: { style: 'medium' }, bottom: { style: 'double' } };
  totTCI.getCell(4).border = { top: { style: 'medium' }, bottom: { style: 'double' } };
  ws.addRow([]);

  addSectionHeader(ws, 'Earnings per equity share');
  ws.addRow(['Equity shares of par value ₹ 10/- each']).font = { italic: true };
  formatRowData(ws, "Basic/ diluted (in ₹)", "27", getVal(notes, "27"), getVal(notes, "27", "o"), true, 4);

  addSohnaFooter(ws);

  return saveWorkbook(workbook, 'XYZ_Sohna_Profit_Loss.xlsx', opts);
};

export const exportSohnaNotesToExcel = async (matrix, titleText, fileName = 'XYZ_Sohna_Notes.xlsx') => {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet(titleText);

  // Initialize columns with generous width
  ws.columns = Array.from({ length: 15 }, (_, i) => ({ header: '', key: `col${i}`, width: 15 }));
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 40; 
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 20;

  ws.views = [{ showGridLines: false }];

  matrix.forEach((rowData, index) => {
    // skip completely empty rows entirely mapping
    if (!rowData || rowData.filter(c => c !== null && c !== '').length === 0) {
      ws.addRow([]);
      return;
    }

    const row = ws.addRow(rowData);
    const isHeading = rowData.filter(c => typeof c === 'string' && c.trim() !== '').length === 1 && typeof rowData[1] === 'string' && rowData[1].length > 10;
    
    if (isHeading) {
      row.getCell(2).font = { bold: true };
      row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      row.getCell(2).border = { top: { style: 'thin' }, bottom: { style: 'thin' } };
      
      try {
         // Merge B to F for headings
         ws.mergeCells(row.number, 2, row.number, 6);
      } catch(e) {}
    } else {
      // Setup alignment and borders for general cells
      row.eachCell((cell, colNumber) => {
        if (typeof cell.value === 'number') {
          cell.alignment = { horizontal: 'right' };
          cell.numFmt = '#,##0.00;[Red](#,##0.00);"-"';
        } else if (cell.value === 'Total') {
          row.font = { bold: true };
          cell.alignment = { horizontal: 'center' };
        }
      });
    }
  });

  await saveWorkbook(workbook, fileName);
};
