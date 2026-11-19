// Document context for "chat with this TDS run": the processed output (register, exceptions,
// challan reconciliation, section / deductee / month workings) + every uploaded source file as-is.
import fs from "fs";
import path from "path";
import { readTable } from "./parse.js";

const INPUT_LABELS = { payments: "PAYMENT LEDGER", vendors: "VENDOR MASTER", challans: "TDS CHALLAN REGISTER", notes: "REVIEW NOTES / RULES" };

export async function tdsContext(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const r = JSON.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8"));
  const parts = [
    `=== TDS PROCESSING SUMMARY ===`,
    `${r.subtitle}. Status: ${r.status}. ${r.approval}`,
    `Payments ${r.totals.payments} · gross ₹${r.totals.gross} · TDS booked ₹${r.totals.tds} · net paid ₹${r.totals.net} · challans ₹${r.totals.challans} (${r.totals.challanCount}) · difference (TDS − challans) ₹${r.totals.difference}`,
    `Key exceptions: ${r.keyExceptions}`,
    `Uploaded files: ${Object.entries(meta.inputs || {}).map(([k, v]) => `${k}: "${v}"`).join(", ")}`,
    `\n=== DEDUCTION REGISTER (Payment_ID | date | deductee | PAN | deductee type | section | nature | gross | TDS | net | effective rate % | configured rate % | deposit date | quarter | system review note) ===`,
    ...r.payments.map((p) => [p.id, p.date, p.deductee, p.pan || "PAN MISSING", p.vendorType || "-", p.section, p.nature, p.gross, p.tds, p.net, p.rate, p.expectedRate ?? "n/a", p.depositDate || "-", `${p.q} FY ${p.fy}`, p.note].join(" | ")),
    `\n=== EXCEPTIONS ===`,
    ...r.exceptions.map((e) => `${e.id} | ${e.related} | ${e.issue} | ${e.action} | ${e.status}`),
    `\n=== CONTROL SUMMARY ===`, ...r.control.map(([k, v]) => `${k}: ${v}`),
    `\n=== CHALLAN SUMMARY (id | date | BSR | serial | amount | minor head | FY | quarter | month settled) ===`,
    ...r.challans.map((c) => [c.id, c.date, c.bsr, c.serial, c.amount, c.minorHead, c.fy, c.q, c.month].join(" | ")),
    `\n=== QUARTER-WISE CHALLAN RECONCILIATION ===`,
    ...r.quarters.map((q) => `${q.label}: TDS ₹${q.tds} vs challans ₹${q.challans} (${q.challanIds.join(", ") || "none"}) → difference ₹${q.difference}`),
    `\n=== MONTH-WISE ALLOCATION (deductions of the month vs challan that settles it; due date = 7th of next month, 30 April for March) ===`,
    ...r.months.map((m) => `${m.label}: TDS ₹${m.tds} (${m.payments.join(", ") || "none"}) vs challans ₹${m.challanAmount} (${m.challans.join(", ") || "none"}) → difference ₹${m.difference}; due ${m.due}`),
    `\n=== SECTION-WISE SUMMARY ===`,
    ...r.sections.map((s) => `${s.section} (${s.nature}; configured rate ${s.basis}): ${s.count} payments, ${s.deductees} deductees, gross ₹${s.gross}, TDS ₹${s.tds}`),
    `\n=== DEDUCTEE-WISE (per section and quarter) ===`,
    ...r.deductees.map((d) => `${d.deductee} (${d.pan || "no PAN"}, ${d.type || "type n/a"}) · ${d.section} · ${d.quarter}: ${d.payments.join(" + ")} · gross ₹${d.gross} · TDS ₹${d.tds} · rates ${d.rates.join("%, ")}%`),
    `\n=== CONFIGURED RATE RULES (indicative, used only to flag for review) ===`,
    ...r.rules.map((x) => `${x.section} ${x.label}: ${x.basis}`),
  ];
  if (r.reviewNotes?.length) parts.push(`\n=== REVIEW NOTES COVERAGE ===`, ...r.reviewNotes.map((n) => `${n.id}: ${n.text} → covered by ${n.covered.join(", ") || "no exception"}`));

  const inputs = path.join(dir, "inputs");
  for (const f of fs.existsSync(inputs) ? fs.readdirSync(inputs).sort() : []) {
    const kind = f.split(".")[0];
    try {
      const rows = await readTable(fs.readFileSync(path.join(inputs, f)), f);
      parts.push(`\n=== SOURCE FILE: ${INPUT_LABELS[kind] || kind} ("${meta.inputs?.[kind] || f}", as uploaded) ===`, rows.map((x) => x.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c)).join(" | ")).join("\n"));
    } catch (e) { parts.push(`(${f} unavailable: ${e.message})`); }
  }
  return { title: `TDS working for ${r.period.label}`, documents: parts.join("\n") };
}

export const TDS_SUGGESTIONS = [
  "Summarise this TDS working in 5 points",
  "Why don't the challans match the TDS deducted?",
  "Which payments need a rate review, and why?",
  "What should be done about the missing-PAN payment?",
  "Show deductee-wise totals for the quarter",
  "Is this data ready for filing Form 26Q?",
];
