// Excel output — the client's reference workbook: Payroll Register, Exceptions, Control Summary
// (same sheet names, headers, column widths and header style; amounts as plain numbers).
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
  wb.creator = "Payroll Processing";
  wb.created = new Date();

  sheet(wb, "Payroll Register",
    [["Employee_ID", 13], ["Employee_Name", 15], ["Salary_Days_Basis", 19], ["Unpaid_Leave_Days", 19], ["LOP_Deduction_INR", 19], ["Incentive_INR", 15], ["Reimbursement_INR", 19],
      ["OT_Hours", 12], ["OT_Pay_INR", 12], ["Gross_Pay_Before_Statutory_INR", 32], ["Advance_Recovery_INR", 22], ["Other_Deduction_INR", 21], ["Net_Before_Statutory_INR", 26], ["Status", 38]],
    r.register.map((x) => [x.id, x.name, x.daysBasis, x.unpaid, x.lop, x.incentive, x.reimbursement, x.otHours, x.otPay, x.gross, x.advance, x.otherDeduction, x.net, x.status]));

  sheet(wb, "Exceptions", [["Employee_ID", 13], ["Issue", 38], ["Required_Action", 38]],
    r.exceptions.map((x) => [x.employee, x.issue, x.action]));

  sheet(wb, "Control Summary", [["Metric", 38], ["Value", 38]], r.control);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
