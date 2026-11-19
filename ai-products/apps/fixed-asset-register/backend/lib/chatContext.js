// Document context for "chat with this fixed asset run": the processed output
// (rollforward, exceptions, additions extract, policy, invoices) + every uploaded source file as-is.
import fs from "fs";
import path from "path";
import { readTable } from "./parse.js";
import { pdfToRows } from "./pdfText.js";

const INPUT_LABELS = { register: "EXISTING FIXED ASSET REGISTER", additions: "CURRENT YEAR ADDITIONS", disposals: "DISPOSALS", policy: "DEPRECIATION POLICY" };

export async function assetContext(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const r = JSON.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8"));
  const parts = [
    `=== FIXED ASSET PROCESSING SUMMARY ===`,
    `${r.subtitle}. Period ${r.period.start} to ${r.period.end}. Approval: ${r.approval}`,
    `Asset records: ${r.pdfRows[0][1]}. Document extraction: ${r.docText}. Held calculations: ${r.heldText} Next action: ${r.nextAction}`,
    `Uploaded files: ${Object.entries(meta.inputs || {}).map(([k, v]) => `${k}: "${v}"`).join(", ")}`,
    `Method: book depreciation per the class policy (SLM): depreciable amount = cost × (1 − residual %), monthly charge = depreciable ÷ (life × 12), full-month convention for assets in use before the quarter, capped at the depreciable amount. A calculation is HELD (blank) when the register method conflicts with the class policy, a disposal lacks opening accumulated depreciation, an addition starts after the quarter's first month with no partial-period convention configured, WDV lacks an opening WDV, or the class has no policy. Additions in the first month of the quarter get an illustrative full-quarter charge that needs approval of the convention. Tax depreciation is never inferred from the book policy. Figures are illustrative drafts.`,
    `\n=== ASSET ROLLFORWARD (Asset_ID | Description | Class | Cost_INR | Method_In_Register | Useful_Life_Years | Residual_Value_Percent | Period_Start_or_Use_Date | Status | ${r.period.column} | System_Note) ===`,
    ...r.rows.map((x) => `${x.id} | ${x.description} | ${x.cls} | ${x.cost} | ${x.method ?? "-"} | ${x.life ?? "-"} | ${x.residualPct ?? "-"} | ${x.start ?? "-"} | ${x.status} | ${x.dep ?? "held/blank"} | ${x.note}${x.calc?.monthly ? ` (monthly charge ${x.calc.monthly}${x.calc.accBefore != null ? `, accumulated before the quarter ${x.calc.accBefore}` : ""})` : ""}`),
    `Total cost in schedule ${r.totals.cost}; additions ${r.totals.additions}; ${r.period.column.replace("_INR", "")} computed ${r.totals.dep}; cost with held calculations ${r.totals.heldCost}`,
    `\n=== EXCEPTIONS (Asset_ID | Issue | Required_Action) ===`, ...r.exceptions.map((x) => `${x.asset} | ${x.issue} | ${x.action}`),
    `\n=== ADDITIONS EXTRACT (Invoice_No | Asset_ID | Description | Invoice_Cost_INR | Document_Extract_Status) ===`,
    ...r.extract.map((x) => `${x.invoiceNo} | ${x.assetId} | ${x.description} | ${x.cost} | ${x.status}${x.vendor ? ` | vendor ${x.vendor}` : ""}`),
    `\n=== DEPRECIATION POLICY (as supplied) ===`, ...r.policy.map((p) => `${p.cls}: ${p.method || "-"}, life ${p.life ?? "-"} years, residual ${p.residualPct ?? "-"}%${p.rate ? `, rate ${p.rate}` : ""}${p.convention ? `, convention ${p.convention}` : ""}${p.notes ? ` (${p.notes})` : ""}`),
    `\n=== DISPOSALS ===`, ...(r.disposals.length ? r.disposals.map((d) => `${d.id}: ${d.date || "no date"}, proceeds ${d.proceeds ?? "-"}, buyer ${d.buyer || "-"}, approval ${d.approval || "-"}`) : ["None"]),
    `\n=== CAPITAL INVOICES READ ===`, ...(r.invoices.length ? r.invoices.map((i) => i.readable ? `${i.file}: invoice ${i.invoiceNo}, date ${i.invoiceDate}, supplier ${i.supplier}, buyer ${i.buyer}, description ${i.description}, taxable ${i.taxable}, GST ${i.gst}, total ${i.total}, terms ${i.terms} (read by ${i.method})` : `${i.file}: unreadable — ${i.error}`) : ["None uploaded"]),
  ];

  const inputs = path.join(dir, "inputs");
  for (const f of fs.existsSync(inputs) ? fs.readdirSync(inputs).sort() : []) {
    const kind = f.split(".")[0];
    try {
      if (f.endsWith(".pdf")) { parts.push(`\n=== SOURCE FILE: CAPITAL INVOICE ("${meta.inputs?.[kind] || f}", text as uploaded) ===`, (await pdfToRows(fs.readFileSync(path.join(inputs, f)))).text); continue; }
      const rows = await readTable(fs.readFileSync(path.join(inputs, f)), f);
      parts.push(`\n=== SOURCE FILE: ${INPUT_LABELS[kind] || kind} ("${meta.inputs?.[kind] || f}", as uploaded) ===`, rows.map((x) => x.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)).join(" | ")).join("\n"));
    } catch (e) { parts.push(`(${f} unavailable: ${e.message})`); }
  }
  return { title: `fixed asset schedule for ${r.period.label}`, documents: parts.join("\n") };
}

export const ASSET_SUGGESTIONS = [
  "Summarise this fixed asset run in 5 points",
  "Why are some depreciation calculations held?",
  "How was each quarter's depreciation computed?",
  "What do we need to account for the disposal?",
  "Does the capital invoice agree with the additions?",
  "Draft an email to the client listing the information needed",
];
