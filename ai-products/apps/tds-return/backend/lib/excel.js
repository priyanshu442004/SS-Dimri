// Excel output — the client's reference workbook: Deduction Register, Challan Summary,
// Exceptions, Control Summary (same sheet names, headers, column widths and header style).
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
  wb.creator = "Agarwal & Saxena TDS Returns";
  wb.created = new Date();

  sheet(wb, "Deduction Register",
    [["Payment_ID", 12], ["Deductee", 24], ["PAN", 15], ["Section_As_Booked", 19], ["Gross_INR", 12, true], ["TDS_Booked_INR", 16, true], ["Net_Paid_INR", 14, true], ["System_Review_Note", 38]],
    r.payments.map((p) => [p.id, p.deductee, p.pan || null, p.section, p.gross, p.tds, p.net, p.note]));

  sheet(wb, "Challan Summary",
    [["Challan_ID", 12], ["Challan_Date", 14], ["Serial_No", 12], ["Amount_INR", 12, true]],
    r.challans.map((c) => [c.id, c.date, c.serial, c.amount]));

  sheet(wb, "Exceptions",
    [["Exception_ID", 14], ["Related_Record", 24], ["Issue", 28], ["Recommended_Action", 38], ["Status", 12]],
    r.exceptions.map((e) => [e.id, e.related, e.issue, e.action, e.status]));

  const cs = sheet(wb, "Control Summary", [["Metric", 38], ["Value", 35]], r.control);
  cs.getColumn(2).numFmt = AMT;
  cs.getColumn(2).alignment = { horizontal: "left", wrapText: true, vertical: "top" };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
