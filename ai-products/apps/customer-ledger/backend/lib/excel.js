// Excel output — the client's reference workbook: Reconciliation, Ageing Input, Actions
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
  wb.creator = "Agarwal & Saxena Customer Ledger Reconciliation";
  wb.created = new Date();

  sheet(wb, "Reconciliation",
    [["Reference", 12], ["Match_Status", 20], ["Company_Books_INR", 19, true], ["Customer_Statement_INR", 24, true], ["Difference_INR", 16, true], ["Explanation", 38]],
    r.rows.map((x) => [x.ref, x.status, x.books, x.statement, x.difference, x.explanation]));

  sheet(wb, "Ageing Input",
    [["Invoice_Reference", 19], ["Invoice_Date", 14], ["Invoice_Amount_INR", 20, true], ["Due_Date", 14], ["Ageing_Status", 38]],
    r.ageing.map((a) => [a.ref, a.date, a.amount, a.dueDate, a.status]));

  sheet(wb, "Actions", [["Reference", 12], ["Suggested_Action", 38], ["Owner_Status", 14]],
    r.actions.map((a) => [a.ref, a.action, a.status]));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
