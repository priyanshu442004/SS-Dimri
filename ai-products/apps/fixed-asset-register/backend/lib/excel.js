// Excel output — the client's reference workbook: Asset Rollforward, Exceptions, Additions Extract
// (same sheet names, headers, column widths and header style; amounts as plain numbers, held calculations blank).
const HEAD = { type: "pattern", pattern: "solid", fgColor: { argb: "FF244062" } };

function sheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map(([header, width]) => ({ header, width, style: { alignment: { wrapText: true, vertical: "top" } } }));
  ws.getRow(1).eachCell((c) => { c.fill = HEAD; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; c.alignment = { wrapText: true, vertical: "middle" }; });
  rows.forEach((r) => ws.addRow(r));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, rows.length + 1), column: columns.length } };
  return ws;
}

export async function buildWorkbook(r) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Fixed Asset Register";
  wb.created = new Date();

  sheet(wb, "Asset Rollforward",
    [["Asset_ID", 12], ["Description", 21], ["Class", 18], ["Cost_INR", 12], ["Method_In_Register", 20], ["Useful_Life_Years", 19], ["Residual_Value_Percent", 24],
      ["Period_Start_or_Use_Date", 26], ["Status", 21], [r.period.column, 21], ["System_Note", 38]],
    r.rows.map((x) => [x.id, x.description, x.cls, x.cost, x.method, x.life, x.residualPct, x.start, x.status, x.dep ?? null, x.note]));

  sheet(wb, "Exceptions", [["Asset_ID", 12], ["Issue", 38], ["Required_Action", 38]],
    r.exceptions.map((x) => [x.asset, x.issue, x.action]));

  sheet(wb, "Additions Extract", [["Invoice_No", 12], ["Asset_ID", 12], ["Description", 21], ["Invoice_Cost_INR", 18], ["Document_Extract_Status", 38]],
    r.extract.map((x) => [x.invoiceNo, x.assetId, x.description, x.cost, x.status]));

  return Buffer.from(await wb.xlsx.writeBuffer());
}
