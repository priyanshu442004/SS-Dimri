// Excel output — the client's reference workbook: Reconciliation, Summary, Actions
// (same sheet names, headers, column widths and header style).
const HEAD = { type: "pattern", pattern: "solid", fgColor: { argb: "FF244062" } };
const AMT = "#,##0;-#,##0";

function sheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map(([header, width, money]) => ({ header, width, style: { alignment: { wrapText: true, vertical: "top" }, ...(money ? { numFmt: AMT } : {}) } }));
  ws.getRow(1).eachCell((c) => { c.fill = HEAD; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.alignment = { wrapText: true, vertical: "middle" }; });
  rows.forEach((r) => ws.addRow(r));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: columns.length } };
  return ws;
}

export async function buildWorkbook(r) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Agarwal & Saxena Vendor Ledger Reconciliation";
  wb.created = new Date();

  sheet(wb, "Reconciliation",
    [["Reference", 12], ["Match_Status", 17], ["Books_INR", 12, true], ["Supplier_Statement_INR", 24, true], ["Difference_INR", 16, true], ["Explanation", 38]],
    r.rows.map((x) => [x.ref, x.status, x.books, x.statement, x.difference, x.explanation]));

  const s = sheet(wb, "Summary", [["Metric", 38], ["Count_or_INR", 38]], r.summary);
  s.getColumn(2).numFmt = AMT;
  s.getColumn(2).alignment = { horizontal: "left", wrapText: true, vertical: "top" };

  sheet(wb, "Actions", [["Reference", 12], ["Suggested_Action", 38], ["Owner_Status", 14]],
    r.actions.map((a) => [a.ref, a.action, a.status]));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
