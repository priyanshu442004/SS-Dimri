// Excel export of a reconciliation: Summary, Exceptions, Difference bridge,
// Matches and Unmatched rows — everything shown on the run page.
const HEAD = { type: "pattern", pattern: "solid", fgColor: { argb: "FF233F62" } };
const INR = '"₹"#,##,##0.00;[Red]-"₹"#,##,##0.00';

function sheet(wb, name, columns, rows) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.h, key: c.k, width: c.w || 16, style: c.money ? { numFmt: INR } : {} }));
  ws.getRow(1).eachCell((cell) => { cell.fill = HEAD; cell.font = { bold: true, color: { argb: "FFFFFFFF" } }; cell.alignment = { vertical: "middle" }; });
  ws.getRow(1).height = 20;
  rows.forEach((r) => ws.addRow(r));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return ws;
}

export async function buildWorkbook(result) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Agarwal & Saxena Bank Reconciliation";
  const s = result.summary;

  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 36 }, { width: 22 }, { width: 22 }];
  sum.addRow(["Bank Reconciliation — Final Review Report"]).font = { bold: true, size: 14 };
  sum.addRow([`${result.accountName} | Period: ${result.period.label}`]).font = { italic: true };
  sum.addRow([`${result.status.lead} ${result.status.text}`]);
  sum.getRow(3).alignment = { wrapText: true }; sum.mergeCells("A3:C3"); sum.getRow(3).height = 48;
  sum.addRow([]);
  const h = sum.addRow(["Metric", "Bank Statement", "Books / Cash Book"]);
  h.eachCell((c) => { c.fill = HEAD; c.font = { bold: true, color: { argb: "FFFFFFFF" } }; });
  [["Total credits", s.bank.credits, s.books.credits], ["Total debits", s.bank.debits, s.books.debits],
    ["Net movement", s.bank.net, s.books.net], ["Difference (Books − Bank)", "Books − Bank", s.difference]]
    .forEach((r) => { const row = sum.addRow(r); row.getCell(2).numFmt = INR; row.getCell(3).numFmt = INR; });
  sum.addRow([]);
  [["Bank rows", result.stats.bankRows], ["Book rows", result.stats.bookRows], ["Bank rows matched", result.stats.matchedBank],
    ["Book rows matched", result.stats.matchedBooks], ["Items for review", result.stats.exceptions], ["Explained difference", result.bridge.explained], ["Unexplained residual", result.bridge.residual]]
    .forEach(([k, v]) => { const row = sum.addRow([k, v]); if (/difference|residual/i.test(k)) row.getCell(2).numFmt = INR; });

  sheet(wb, "Exceptions", [
    { h: "#", k: "n", w: 5 }, { h: "Category", k: "cls", w: 18 }, { h: "Item", k: "title", w: 42 }, { h: "Amount", k: "amount", money: true },
    { h: "Detail", k: "text", w: 60 }, { h: "Next step", k: "next", w: 50 }, { h: "Source rows", k: "rows", w: 28 },
  ], result.exceptions.map((e, i) => ({ n: i + 1, cls: e.cls, title: e.title, amount: e.amount, text: e.text, next: e.next, rows: e.rows.join(", ") })));

  sheet(wb, "Difference bridge", [{ h: "Item", k: "label", w: 56 }, { h: "Effect (Books − Bank)", k: "amount", w: 22, money: true }, { h: "Rows", k: "rows", w: 24 }],
    [...result.bridge.items.map((b) => ({ label: b.label, amount: b.amount, rows: (b.rows || []).join(", ") })),
      {}, { label: "Explained", amount: result.bridge.explained }, { label: "Closing difference", amount: s.difference }, { label: "Unexplained residual", amount: result.bridge.residual }]);

  sheet(wb, "Matches", [
    { h: "Type", k: "type", w: 14 }, { h: "Bank rows", k: "bank", w: 22 }, { h: "Bank narration", k: "bn", w: 44 }, { h: "Book rows", k: "books", w: 22 },
    { h: "Book party / narration", k: "kn", w: 36 }, { h: "Bank amount", k: "ba", money: true }, { h: "Book amount", k: "ka", money: true },
    { h: "Δ amount", k: "da", money: true }, { h: "Δ days", k: "dd", w: 8 }, { h: "Confidence", k: "conf", w: 11 }, { h: "Timing", k: "timing", w: 8 },
  ], result.matches.map((m) => ({
    type: m.type, bank: m.bank.map((x) => x.id).join(", "), bn: m.bank.map((x) => x.narration).join(" | "),
    books: m.books.map((x) => x.id).join(", "), kn: m.books.map((x) => x.party || x.narration).join(" | "),
    ba: m.bankAmount, ka: m.bookAmount, da: m.amountDiff, dd: m.dateDiff, conf: m.confidence, timing: m.timing ? "yes" : "",
  })));

  const row = (x) => ({ id: x.id, date: x.date, ref: x.ref, narration: x.narration, party: x.party, amount: x.amount, cls: x.cls });
  const cols = [{ h: "Row", k: "id", w: 10 }, { h: "Date", k: "date", w: 12 }, { h: "Reference", k: "ref", w: 20 }, { h: "Narration", k: "narration", w: 46 },
    { h: "Party", k: "party", w: 28 }, { h: "Amount (+in / −out)", k: "amount", money: true, w: 20 }, { h: "Classification", k: "cls", w: 22 }];
  sheet(wb, "Bank only", cols, result.unmatched.bank.map(row));
  sheet(wb, "Books only", cols, [...result.unmatched.books.map(row), ...result.unmatched.duplicates.map((x) => ({ ...row(x), cls: "possible-duplicate" }))]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
