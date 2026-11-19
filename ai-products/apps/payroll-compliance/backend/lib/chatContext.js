// Document context for "chat with this payroll run": the processed output
// (payroll register, exceptions, control summary, rule configuration) + every uploaded source file as-is.
import fs from "fs";
import path from "path";
import { readTable } from "./parse.js";

const INPUT_LABELS = { master: "EMPLOYEE SALARY MASTER", attendance: "ATTENDANCE & LEAVE", inputs: "PAYROLL INPUTS", rules: "STATUTORY RULE CONFIGURATION", notes: "PAYROLL TEST NOTES" };

export async function payrollContext(dir) {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const r = JSON.parse(fs.readFileSync(path.join(dir, "result.json"), "utf8"));
  const parts = [
    `=== PAYROLL PROCESSING SUMMARY ===`,
    `${r.subtitle}. Payroll period ${r.period.code || "not stated"}; salary-days basis ${r.period.denominator ? `${r.period.denominator} days (from the rule configuration)` : "calendar days of the month"}. Status: ${r.status}. Approval: ${r.approval}`,
    `Open checks: ${r.openChecks}`,
    `Uploaded files: ${Object.entries(meta.inputs || {}).map(([k, v]) => `${k}: "${v}"`).join(", ")}`,
    `Method: fixed pay = Basic + HRA + Special + Other allowance (+ extra allowance columns); LOP = fixed pay × (unpaid leave days + days not employed) ÷ salary-days basis; OT pay = OT hours × OT rate; gross = fixed − LOP + incentive + reimbursement + OT pay; net = gross − advance recovery − other deductions. PF, ESI, professional tax and salary TDS are NOT deducted: configured rates are placeholders and eligibility/declarations must be validated first. All amounts INR, rounded to 2 decimals per employee.`,
    `\n=== PAYROLL REGISTER (Employee_ID | Name | Fixed pay (components) | Salary_Days_Basis | Unpaid_Leave_Days | Days not employed | LOP | Incentive | Reimbursement | OT hours × rate = OT pay | Gross before statutory | Advance recovery | Other deduction | Net before statutory | Status) ===`,
    ...r.register.map((x) => `${x.id} | ${x.name}${x.department ? ` (${x.department})` : ""}${x.joiningDate ? `, joined ${x.joiningDate}` : ""}${x.exitDate ? `, exit ${x.exitDate}` : ""} | ${x.fixed} (${x.components.map(([k, v]) => `${k} ${v}`).join(", ")}) | ${x.daysBasis} | ${x.unpaid} | ${x.notEmployed} | ${x.lop} | ${x.incentive} | ${x.reimbursement} | ${x.otHours} × ${x.otRate} = ${x.otPay} | ${x.gross} | ${x.advance} | ${x.otherDeduction} | ${x.net} | ${x.status}`),
    `TOTALS: fixed ${r.totals.fixed}, LOP ${r.totals.lop}, incentive ${r.totals.incentive}, reimbursement ${r.totals.reimbursement}, OT pay ${r.totals.otPay}, gross ${r.totals.gross}, advance ${r.totals.advance}, other deductions ${r.totals.otherDeduction}, net ${r.totals.net}`,
    ...(r.excluded.length ? [`Excluded employees: ${r.excluded.map((e) => `${e.id} ${e.name} (${e.reason})`).join("; ")}`] : []),
    `\n=== EXCEPTIONS (Employee_ID | Issue | Required_Action) ===`,
    ...r.exceptions.map((x) => `${x.employee} | ${x.issue} | ${x.action}`),
    `\n=== CONTROL SUMMARY ===`, ...r.control.map(([k, v]) => `${k}: ${v}`),
    `\n=== STATUTORY RULE CONFIGURATION (as supplied) ===`, ...(r.rules.length ? r.rules.map((x) => `${x.name} = ${x.value}${x.notes ? ` (${x.notes})` : ""}`) : ["Not supplied"]),
  ];
  if (r.reviewNotes?.length) parts.push(`\n=== TEST NOTES vs RESULT ===`, ...r.reviewNotes.map((n) => `${n.id}: ${n.text} → ${n.found.map((f) => `${f.id} gross ${f.gross}, LOP ${f.lop}, net ${f.net}; ${f.status}${f.exceptions.length ? `; exceptions: ${f.exceptions.join(" / ")}` : ""}`).join("; ") || "no specific employee referenced"}`));

  const inputs = path.join(dir, "inputs");
  for (const f of fs.existsSync(inputs) ? fs.readdirSync(inputs).sort() : []) {
    const kind = f.split(".")[0];
    try {
      const rows = await readTable(fs.readFileSync(path.join(inputs, f)), f);
      parts.push(`\n=== SOURCE FILE: ${INPUT_LABELS[kind] || kind} ("${meta.inputs?.[kind] || f}", as uploaded) ===`, rows.map((x) => x.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)).join(" | ")).join("\n"));
    } catch (e) { parts.push(`(${f} unavailable: ${e.message})`); }
  }
  return { title: `payroll for ${r.period.label}`, documents: parts.join("\n") };
}

export const PAYROLL_SUGGESTIONS = [
  "Summarise this payroll run in 5 points",
  "How was loss of pay calculated?",
  "Why are PF, ESI and TDS not deducted?",
  "Which employees need attention before payment?",
  "Break down gross to net for each employee",
  "Draft an email to HR listing the open checks",
];
