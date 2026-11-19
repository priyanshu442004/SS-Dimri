// Excel register for a batch: Register, Line items, Exceptions, GST by rate, Suppliers.
const HEAD = { type: "pattern", pattern: "solid", fgColor: { argb: "FF233F62" } };
const FLAG = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8E4DF" } };
const INR = '"₹"#,##,##0.00;[Red]-"₹"#,##,##0.00';

function sheet(wb, name, columns, rows, flag) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.h, key: c.k, width: c.w || 14, style: c.money ? { numFmt: INR } : c.date ? { numFmt: "dd-mmm-yyyy" } : {} }));
  ws.getRow(1).eachCell((cell) => { cell.fill = HEAD; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
  rows.forEach((r, i) => {
    const row = ws.addRow(r);
    if (flag?.(r, i)) row.eachCell((c) => { c.fill = FLAG; });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}
const d = (iso) => (iso ? new Date(`${iso}T00:00:00Z`) : null);

export async function buildWorkbook(b) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Agarwal & Saxena Invoice Automation";

  sheet(wb, "Register", [
    { h: "#", k: "i", w: 5 }, { h: "File", k: "file", w: 22 }, { h: "Invoice no.", k: "no", w: 14 }, { h: "Invoice date", k: "date", w: 13, date: true },
    { h: "Supplier", k: "sup", w: 28 }, { h: "Supplier GSTIN", k: "gstin", w: 18 }, { h: "Recipient GSTIN", k: "rgstin", w: 18 }, { h: "Supply", k: "supply", w: 11 },
    { h: "Description", k: "desc", w: 28 }, { h: "Qty", k: "qty", w: 7 }, { h: "Taxable value", k: "tv", money: true }, { h: "GST rate %", k: "rate", w: 10 },
    { h: "Calc. CGST", k: "cgst", money: true }, { h: "Calc. SGST", k: "sgst", money: true }, { h: "Calc. IGST", k: "igst", money: true },
    { h: "Printed CGST", k: "pcgst", money: true }, { h: "Printed SGST", k: "psgst", money: true }, { h: "Printed IGST", k: "pigst", money: true },
    { h: "Expected total", k: "exp", money: true }, { h: "Invoice total", k: "tot", money: true }, { h: "Difference", k: "diff", money: true },
    { h: "Status", k: "status", w: 10 }, { h: "Exception", k: "ex", w: 70 }, { h: "Read by", k: "method", w: 10 },
  ], b.invoices.map((x) => ({
    i: x.index, file: b.files[x.index - 1], no: x.invoiceNumber, date: d(x.invoiceDate), sup: x.supplierName, gstin: x.supplierGstin, rgstin: x.recipientGstin, supply: x.supply,
    desc: x.items?.map((t) => t.description).join(" / "), qty: x.items?.reduce((s, t) => s + (t.quantity || 0), 0) || null, tv: x.taxableValue, rate: x.rate,
    cgst: x.calc?.cgst, sgst: x.calc?.sgst, igst: x.calc?.igst, pcgst: x.cgst, psgst: x.sgst, pigst: x.igst,
    exp: x.expectedTotal, tot: x.invoiceTotal, diff: x.totalDiff, status: x.status === "ok" ? "OK" : x.status === "error" ? "Error" : "Review",
    ex: (x.exceptions || []).join("; "), method: x.method,
  })), (r) => r.status !== "OK");

  sheet(wb, "Line items", [
    { h: "#", k: "i", w: 5 }, { h: "Invoice no.", k: "no", w: 14 }, { h: "Supplier", k: "sup", w: 28 }, { h: "Description", k: "desc", w: 32 }, { h: "HSN/SAC", k: "hsn", w: 10 },
    { h: "Qty", k: "qty", w: 7 }, { h: "Taxable value", k: "tv", money: true }, { h: "GST rate %", k: "rate", w: 10 }, { h: "Tax (printed)", k: "tax", money: true },
  ], b.invoices.flatMap((x) => (x.items || []).map((t) => ({ i: x.index, no: x.invoiceNumber, sup: x.supplierName, desc: t.description, hsn: t.hsn, qty: t.quantity, tv: t.taxable, rate: t.ratePercent, tax: t.tax }))));

  sheet(wb, "Exceptions", [{ h: "#", k: "i", w: 5 }, { h: "Type", k: "kind", w: 12 }, { h: "Item", k: "title", w: 46 }, { h: "Detail", k: "text", w: 70 }, { h: "Next step", k: "next", w: 60 }],
    b.issues.map((x) => ({ i: x.index, kind: x.kind, title: x.title, text: x.text, next: x.next })));

  sheet(wb, "GST by rate", [{ h: "GST rate", k: "rate", w: 10 }, { h: "Invoices", k: "invoices", w: 10 }, { h: "Taxable value", k: "taxable", money: true },
    { h: "CGST", k: "cgst", money: true }, { h: "SGST", k: "sgst", money: true }, { h: "IGST", k: "igst", money: true }, { h: "Total GST", k: "gst", money: true }],
    [...b.gstByRate, { rate: "Total", invoices: b.gstByRate.reduce((s, r) => s + r.invoices, 0), taxable: b.totals.taxable, cgst: b.totals.cgst, sgst: b.totals.sgst, igst: b.totals.igst, gst: b.totals.gst }]);

  sheet(wb, "Suppliers", [{ h: "Supplier", k: "name", w: 30 }, { h: "GSTIN", k: "gstin", w: 18 }, { h: "Invoices", k: "invoices", w: 10 },
    { h: "Taxable value", k: "taxable", money: true }, { h: "Invoice total", k: "total", money: true }, { h: "With exceptions", k: "exceptions", w: 14 }], b.suppliers);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
