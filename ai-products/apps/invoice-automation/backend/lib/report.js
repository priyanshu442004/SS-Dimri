// Validation + report model for a batch of extracted invoices. All arithmetic
// is deterministic; exception wording follows the expected register format.
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const TOL = 0.5; // ₹ tolerance for rounding on printed amounts

/** 500 → "500", 12.5 → "12.50" (matches the register's "INR 500" style). */
const plain = (n) => (Number.isInteger(r2(n)) ? String(r2(n)) : r2(n).toFixed(2));
export const inr = (n) => (n == null ? "—" : `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export function validateBatch(invoices) {
  const seen = [];
  return invoices.map((inv, i) => {
    const index = i + 1;
    if (inv.error) return { ...inv, index, status: "error", exceptions: [inv.error], checks: {} };

    const items = inv.items?.length ? inv.items : [{ description: "", taxable: inv.taxableValue, ratePercent: null, quantity: null }];
    const taxable = inv.taxableValue ?? r2(items.reduce((s, x) => s + (x.taxable || 0), 0));
    const lineTaxable = r2(items.reduce((s, x) => s + (x.taxable || 0), 0));
    const printedTax = r2((inv.cgst || 0) + (inv.sgst || 0) + (inv.igst || 0));
    // rate per line; if absent, infer it from the printed tax
    const rates = items.map((x) => x.ratePercent ?? (taxable ? r2((printedTax / taxable) * 100) : 0));
    const calcTax = r2(items.reduce((s, x, k) => s + ((x.taxable || 0) * rates[k]) / 100, 0));
    const sameState = inv.supplierGstin && inv.recipientGstin ? inv.supplierGstin.slice(0, 2) === inv.recipientGstin.slice(0, 2) : !(inv.igst > 0);
    const calc = sameState ? { cgst: r2(calcTax / 2), sgst: r2(calcTax / 2), igst: 0 } : { cgst: 0, sgst: 0, igst: calcTax };
    const expectedTotal = r2(taxable + calcTax);
    const totalDiff = inv.invoiceTotal != null ? r2(inv.invoiceTotal - expectedTotal) : null;

    const ex = [];
    const key = `${(inv.supplierGstin || inv.supplierName || "").toLowerCase()}|${(inv.invoiceNumber || "").toLowerCase()}`;
    const dup = inv.invoiceNumber && seen.find((s) => s.key === key);
    if (dup) ex.push(`Duplicate invoice number candidate: same supplier and invoice number as invoice ${dup.index}`);
    if (totalDiff != null && Math.abs(totalDiff) >= TOL)
      ex.push(`Invoice total is INR ${plain(Math.abs(totalDiff))} ${totalDiff > 0 ? "higher" : "lower"} than taxable value plus calculated GST`);
    if (Math.abs(printedTax - calcTax) >= TOL)
      ex.push(`Printed GST INR ${plain(printedTax)} differs from calculated GST INR ${plain(calcTax)}`);
    if (sameState && inv.igst > 0) ex.push("IGST charged on an intra-state supply (expected CGST + SGST)");
    if (!sameState && (inv.cgst > 0 || inv.sgst > 0)) ex.push("CGST/SGST charged on an inter-state supply (expected IGST)");
    if (inv.items?.length && Math.abs(lineTaxable - taxable) >= TOL) ex.push(`Line items total INR ${plain(lineTaxable)} but taxable value shows INR ${plain(taxable)}`);
    if (inv.supplierGstin && !GSTIN_RE.test(inv.supplierGstin)) ex.push("Supplier GSTIN format is invalid");
    if (!inv.supplierGstin) ex.push("Supplier GSTIN missing");
    if (inv.missing?.length) ex.push(`Missing fields: ${inv.missing.join(", ")}`);
    seen.push({ key, index });

    const { text, ...clean } = inv;
    return {
      ...clean, index, items, taxableValue: taxable,
      rate: rates.length === 1 ? rates[0] : null, rates, supply: sameState ? "intra-state" : "inter-state",
      calc: { ...calc, tax: calcTax }, printedTax, expectedTotal, totalDiff,
      duplicateOf: dup ? dup.index : null,
      exceptions: ex, status: ex.length ? "exception" : "ok",
      textLength: text?.length || 0,
    };
  });
}

export function buildBatch(invoices, { batchName, files }) {
  const ok = invoices.filter((x) => x.status === "ok");
  const valid = invoices.filter((x) => x.status !== "error");
  const sum = (arr, f) => r2(arr.reduce((s, x) => s + (f(x) || 0), 0));
  // amounts payable exclude duplicate candidates (they would double count)
  const unique = valid.filter((x) => !x.duplicateOf);

  const totals = {
    invoices: invoices.length, passed: ok.length, exceptions: invoices.length - ok.length,
    suppliers: new Set(valid.map((x) => x.supplierGstin || x.supplierName)).size,
    taxable: sum(unique, (x) => x.taxableValue), cgst: sum(unique, (x) => x.calc.cgst), sgst: sum(unique, (x) => x.calc.sgst), igst: sum(unique, (x) => x.calc.igst),
    gst: sum(unique, (x) => x.calc.tax), expected: sum(unique, (x) => x.expectedTotal), printed: sum(unique, (x) => x.invoiceTotal),
    duplicates: valid.filter((x) => x.duplicateOf).length,
  };
  totals.variance = r2(totals.printed - totals.expected);

  const dates = valid.map((x) => x.invoiceDate).filter(Boolean).sort();
  const issues = [];
  for (const x of invoices) {
    if (x.status === "error") { issues.push({ index: x.index, kind: "unreadable", title: `File ${x.index} could not be read`, text: `${files[x.index - 1]}: ${x.exceptions[0]}`, next: "Upload a text-based PDF or enter the invoice manually." }); continue; }
    for (const e of x.exceptions) {
      const who = `${x.supplierName} ${x.invoiceNumber}`;
      if (e.startsWith("Duplicate"))
        issues.push({ index: x.index, kind: "duplicate", title: `Duplicate invoice — ${who}`, text: `Invoice ${x.index} repeats the supplier and invoice number of invoice ${x.duplicateOf} (${inr(x.invoiceTotal)}).`, next: "Confirm with the supplier; process only one copy for payment and input tax credit." });
      else if (e.startsWith("Invoice total"))
        issues.push({ index: x.index, kind: "total", title: `Total mismatch — ${who}`, text: `Printed total ${inr(x.invoiceTotal)} vs taxable value + calculated GST ${inr(x.expectedTotal)} — ${inr(Math.abs(x.totalDiff))} ${x.totalDiff > 0 ? "higher" : "lower"}.`, next: "Hold payment; request a corrected invoice or credit note." });
      else if (e.startsWith("Printed GST") || e.includes("charged on"))
        issues.push({ index: x.index, kind: "gst", title: `GST mismatch — ${who}`, text: `${e}.`, next: "Verify the GST rate and supply type with the supplier before claiming input tax credit." });
      else
        issues.push({ index: x.index, kind: "data", title: `Data check — ${who}`, text: `${e}.`, next: "Check the source PDF and correct the extracted fields." });
    }
  }

  // GST by rate
  const byRate = {};
  for (const x of unique) {
    const k = x.rate != null ? `${x.rate}%` : "Mixed";
    byRate[k] ||= { rate: k, invoices: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, gst: 0 };
    const b = byRate[k]; b.invoices++; b.taxable += x.taxableValue; b.cgst += x.calc.cgst; b.sgst += x.calc.sgst; b.igst += x.calc.igst; b.gst += x.calc.tax;
  }
  // suppliers
  const bySup = {};
  for (const x of unique) { // duplicates excluded, consistent with the batch totals
    const k = x.supplierGstin || x.supplierName;
    bySup[k] ||= { name: x.supplierName, gstin: x.supplierGstin, invoices: 0, taxable: 0, total: 0, exceptions: 0 };
    const s = bySup[k]; s.invoices++; s.taxable += x.taxableValue; s.total += x.invoiceTotal || 0; s.exceptions += x.exceptions.length ? 1 : 0;
  }

  const status = totals.exceptions === 0
    ? { ok: true, lead: "Overall status: ALL INVOICES PASSED.", text: `${totals.invoices} invoices from ${totals.suppliers} suppliers were extracted and validated (GST arithmetic, totals and duplicates). No exceptions were found. This is a system-generated report, not an accounting sign-off.` }
    : { ok: false, lead: `Overall status: ${totals.exceptions} INVOICE${totals.exceptions > 1 ? "S" : ""} NEED REVIEW.`,
        text: `${totals.invoices} invoices from ${totals.suppliers} suppliers were extracted and validated (GST arithmetic, totals and duplicates). ${totals.passed} passed every check; ${totals.exceptions} need review before payment or input tax credit. Totals below exclude ${totals.duplicates} duplicate candidate${totals.duplicates === 1 ? "" : "s"}. This is a system-generated report, not an accounting sign-off.` };

  return {
    batchName: batchName || "Invoice batch",
    period: dates.length ? { from: dates[0], to: dates.at(-1) } : null,
    status, totals, issues, invoices, files,
    gstByRate: Object.values(byRate).map((b) => ({ ...b, taxable: r2(b.taxable), cgst: r2(b.cgst), sgst: r2(b.sgst), igst: r2(b.igst), gst: r2(b.gst) })).sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate)),
    suppliers: Object.values(bySup).map((s) => ({ ...s, taxable: r2(s.taxable), total: r2(s.total) })).sort((a, b) => b.total - a.total),
  };
}

const dmy = (iso) => (iso ? iso.split("-").reverse().join("-") : "—");

export function pdfModel(b) {
  const t = b.totals;
  return {
    title: "INVOICE PROCESSING — REVIEW REPORT",
    subtitle: `${b.batchName} | ${t.invoices} invoices${b.period ? ` | ${dmy(b.period.from)} to ${dmy(b.period.to)}` : ""}`,
    footer: `Agarwal & Saxena Invoice Automation · ${b.batchName} · generated ${new Date().toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" }).replaceAll("/", "-")}`,
    statusLead: b.status.lead, statusText: b.status.text,
    summary: [
      ["Invoices processed", String(t.invoices)], ["Passed all checks", String(t.passed)], ["Need review", String(t.exceptions)],
      ["Suppliers", String(t.suppliers)], ["Duplicate candidates (excluded from totals)", String(t.duplicates)],
      ["Taxable value", inr(t.taxable)], ["Calculated GST (CGST + SGST + IGST)", inr(t.gst)],
      ["Expected payable (taxable + calculated GST)", inr(t.expected)], ["Invoice totals as printed", inr(t.printed)],
      ["Variance (printed − expected)", `${t.variance < 0 ? "−" : ""}${inr(Math.abs(t.variance))}`],
    ],
    exceptions: b.issues.map((x) => ({ title: x.title, text: x.text, next: x.next })),
    gstByRate: {
      rows: b.gstByRate.map((r) => [r.rate, String(r.invoices), inr(r.taxable), inr(r.cgst), inr(r.sgst), inr(r.igst), inr(r.gst)]),
      total: ["Total", String(b.gstByRate.reduce((s, r) => s + r.invoices, 0)), inr(t.taxable), inr(t.cgst), inr(t.sgst), inr(t.igst), inr(t.gst)],
    },
    suppliers: {
      rows: b.suppliers.map((s) => [s.name, s.gstin || "—", String(s.invoices), inr(s.taxable), inr(s.total)]),
      total: ["Total", "", String(b.suppliers.reduce((s, x) => s + x.invoices, 0)), inr(b.suppliers.reduce((s, x) => s + x.taxable, 0)), inr(b.suppliers.reduce((s, x) => s + x.total, 0))],
    },
    register: {
      rows: b.invoices.map((x) => x.status === "error"
        ? [String(x.index), "—", "—", b.files[x.index - 1], "—", "—", "—", "—", "—", "⚠ Error"]
        : [String(x.index), x.invoiceNumber || "—", dmy(x.invoiceDate), x.supplierName || "—", inr(x.taxableValue), x.rate != null ? `${x.rate}%` : "Mixed",
           inr(x.calc.cgst), inr(x.calc.sgst), inr(x.invoiceTotal), x.status === "ok" ? "OK" : "⚠ Review"]),
      flags: b.invoices.map((x) => x.status !== "ok"),
      total: ["", "", "", "Total (excl. duplicates)", inr(t.taxable), "", inr(t.cgst), inr(t.sgst), inr(t.printed), ""],
    },
    limitation: "Figures are read from the uploaded invoice PDFs and GST is recalculated from taxable value and rate. Exceptions are review suggestions, not verified accounting conclusions. Confirm with the source documents and the supplier before payment or claiming input tax credit.",
  };
}

/** Register as CSV (one row per invoice; same fields as the Excel register). */
export function registerCsv(b) {
  const head = ["file_index", "file_name", "invoice_number", "invoice_date", "supplier_name", "supplier_gstin", "description", "quantity", "taxable_value",
    "gst_rate_percent", "calculated_cgst", "calculated_sgst", "calculated_igst", "expected_total", "invoice_total", "difference", "status", "exception"];
  const q = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = b.invoices.map((x) => [x.index, b.files[x.index - 1], x.invoiceNumber, x.invoiceDate, x.supplierName, x.supplierGstin,
    x.items?.map((i) => i.description).join(" / "), x.items?.reduce((s, i) => s + (i.quantity || 0), 0) || "", x.taxableValue, x.rate,
    x.calc?.cgst, x.calc?.sgst, x.calc?.igst, x.expectedTotal, x.invoiceTotal, x.totalDiff, x.status, (x.exceptions || []).join("; ")]);
  return "﻿" + [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
}
