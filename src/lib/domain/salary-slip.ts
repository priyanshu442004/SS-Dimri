// The salary slip in the firm's own format (SSDA sample "08_Vishal_Nagarwal_Salary_Slip_Oct-2026",
// 25 Nov 2026): firm header, employee block, attendance summary, earnings, deductions, net salary in
// figures and words, and the payment footer. Every figure comes from the month's payroll row (the same
// one the Payroll page shows), so the slip and the payroll never differ. Pure: builds the HTML that is
// printed to PDF (lib/pdf) or shown in the browser.

import { rupeesInWords } from "./amount-words";

export type SlipRow = {
  name: string;
  code: string;
  designation: string | null;
  department: string | null;
  dateOfJoining: Date | null;
  salaryMode: string | null;
  monthlySalary: number | null;
  fixedAllowance: number;
  conveyanceClaims: number;
  score: { leaveTaken: number; payableDays: number; countedDays: number; unpaidDays: number };
  pay: {
    payableDaysTotal: number; overtimeDays: number; bonusDays: number; extraDays: number; salaryForDays: number | null;
    fixedAllowance: number; conveyance: number; advanceDeduction: number; fines: number; net: number | null;
  };
  fines: { eodMissed: unknown[]; leadMissed: unknown[] };
};

export type SlipInput = {
  firm: { name: string; website: string | null; address: string | null };
  month: string; // YYYY-MM
  daysInMonth: number;
  complete: boolean;
  payDay: number;
  row: SlipRow;
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const signed = (n: number) => (n > 0 ? `+${num(n)}` : n < 0 ? `(${num(-n)})` : "0");
const monthLong = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const monthShort = (m: string) => { const d = new Date(`${m}-01T00:00:00Z`); return `${d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}-${String(d.getUTCFullYear()).slice(2)}`; };
const dmy = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const longDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** "3 yrs", "2 yrs 5 mths", "7 mths" at the end of the salary month. */
export function lengthOfService(joined: Date | null, month: string): string {
  if (!joined) return "—";
  const end = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  let months = (end.getUTCFullYear() - joined.getUTCFullYear()) * 12 + (end.getUTCMonth() - joined.getUTCMonth());
  if (end.getUTCDate() < joined.getUTCDate() - 1) months--;
  if (months < 0) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y && !m) return "Less than a month";
  return [y ? `${y} yr${y === 1 ? "" : "s"}` : "", m ? `${m} mth${m === 1 ? "" : "s"}` : ""].filter(Boolean).join(" ");
}

/** The website shown under the firm's name: the firm's own e-mail domain (not a public mail service). */
export function websiteFromEmail(email: string | null | undefined): string | null {
  const domain = (email ?? "").split("@")[1]?.trim().toLowerCase();
  if (!domain || /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|rediffmail|icloud|aol|proton|protonmail|zoho)\./.test(domain)) return null;
  return `www.${domain}`;
}

export type SlipLines = { earnings: { label: string; sub?: string; amount: number }[]; deductions: { label: string; sub?: string; amount: number }[]; totalEarnings: number; totalDeductions: number; net: number };

export function slipLines(i: SlipInput): SlipLines {
  const { row, daysInMonth, month } = i;
  const p = row.pay;
  const earnings: SlipLines["earnings"] = [];
  earnings.push({
    label: `Salary for ${num(p.payableDaysTotal)} payable days`,
    sub: row.monthlySalary !== null ? `Monthly salary ${money(row.monthlySalary)} ÷ ${daysInMonth} days × ${num(p.payableDaysTotal)} days` : "Salary not entered",
    amount: p.salaryForDays ?? 0,
  });
  if (p.fixedAllowance || row.fixedAllowance) earnings.push({ label: "Fixed allowance", amount: p.fixedAllowance });
  if (p.conveyance || row.conveyanceClaims) earnings.push({ label: "Conveyance reimbursement", sub: `As per verified ${monthShort(month)} claim${row.conveyanceClaims === 1 ? "" : "s"}`, amount: p.conveyance });
  const deductions: SlipLines["deductions"] = [];
  if (p.advanceDeduction) deductions.push({ label: "Advance recovered", amount: p.advanceDeduction });
  if (p.fines) deductions.push({ label: "Fines", sub: [row.fines.eodMissed.length && `EOD report not filed: ${row.fines.eodMissed.length}`, row.fines.leadMissed.length && `not escalated as Team Lead: ${row.fines.leadMissed.length}`].filter(Boolean).join(" · ") || undefined, amount: p.fines });
  if (!deductions.length) deductions.push({ label: "Advance / other deductions", amount: 0 });
  const totalEarnings = Math.round(earnings.reduce((t, l) => t + l.amount, 0) * 100) / 100;
  const totalDeductions = Math.round(deductions.reduce((t, l) => t + l.amount, 0) * 100) / 100;
  return { earnings, deductions, totalEarnings, totalDeductions, net: p.net ?? Math.max(0, Math.round((totalEarnings - totalDeductions) * 100) / 100) };
}

/** A complete, self-contained HTML document (A4) for one slip. */
export function salarySlipHtml(i: SlipInput): string {
  const { row, firm, month } = i;
  const l = slipLines(i);
  const [y, m] = month.split("-").map(Number);
  const paidOn = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, Math.min(i.payDay, 28)));
  const mode = row.salaryMode === "CASH" ? "Cash" : row.salaryMode === "TRANSFER" ? "Bank Transfer" : "—";
  const netWorking = Math.round((row.score.payableDays) * 100) / 100;
  const cell = (k: string, v: string) => `<td class="k">${esc(k)}</td><td class="v">${v}</td>`;
  const lines = (rows: { label: string; sub?: string; amount: number }[]) => rows.map((r) => `<tr><td>${esc(r.label)}${r.sub ? `<div class="sub">${esc(r.sub)}</div>` : ""}</td><td class="amt">${money(r.amount)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Salary slip ${esc(row.name)} ${esc(monthLong(month))}</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: "DejaVu Sans", "Segoe UI", Arial, sans-serif; color: #1f2937; font-size: 11.5px; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #1f3a5f; padding-bottom: 8px; }
  .firm { font-size: 22px; font-weight: 700; color: #1f3a5f; }
  .site { color: #6b7280; font-size: 11px; margin-top: 2px; }
  .title { text-align: right; } .title b { font-size: 17px; color: #1f3a5f; letter-spacing: .5px; } .title div { color: #6b7280; font-size: 11px; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; }
  .info { margin-top: 16px; } .info td { border: 1px solid #d5dbe3; padding: 7px 10px; }
  .info .k { color: #6b7280; } .info .v { text-align: right; font-weight: 700; }
  h2 { font-size: 11.5px; letter-spacing: 1px; color: #1f3a5f; margin: 18px 0 6px; text-transform: uppercase; }
  .att td { border: 1px solid #d5dbe3; padding: 7px 10px; } .att .k { color: #4b5563; width: 30%; } .att .v { font-weight: 700; width: 20%; }
  .lines th { background: #eef2f8; color: #1f3a5f; text-align: left; padding: 7px 10px; border: 1px solid #d5dbe3; }
  .lines th.amt, .lines td.amt { text-align: right; width: 32%; }
  .lines td { border: 1px solid #d5dbe3; padding: 7px 10px; } .lines .sub { color: #6b7280; font-size: 10px; margin-top: 2px; }
  .lines tr.total td { font-weight: 700; background: #f6f8fb; }
  .net { margin-top: 18px; border: 2px solid #1f3a5f; background: #f6f8fb; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
  .net span { font-weight: 700; letter-spacing: 1px; color: #1f3a5f; } .net b { font-size: 22px; color: #1f3a5f; }
  .words { font-style: italic; color: #4b5563; margin-top: 8px; }
  .foot { position: fixed; bottom: 0; left: 0; right: 0; border-top: 1px solid #d5dbe3; padding-top: 6px; text-align: center; color: #6b7280; font-size: 10px; }
  .note { color: #9a6700; font-size: 10.5px; margin-top: 10px; }
</style></head><body>
<div class="head"><div><div class="firm">${esc(firm.name)}</div>${firm.website || firm.address ? `<div class="site">${esc(firm.website ?? firm.address)}</div>` : ""}</div>
<div class="title"><b>SALARY SLIP</b><div>For the month of ${esc(monthLong(month))}</div></div></div>
<table class="info"><tr>${cell("Employee Name", esc(row.name))}${cell("Employee No.", esc(row.code))}</tr>
<tr>${cell("Date of Joining", row.dateOfJoining ? esc(dmy(row.dateOfJoining)) : "—")}${cell("Length of Service", esc(lengthOfService(row.dateOfJoining, month)))}</tr>
<tr>${cell("Salary Month", esc(monthLong(month)))}${cell("Mode of Payment", esc(mode))}</tr>
${row.designation || row.department ? `<tr>${cell("Designation", esc(row.designation ?? "—"))}${cell("Department", esc(row.department ?? "—"))}</tr>` : ""}</table>
<h2>Attendance Summary</h2>
<table class="att"><tr>${cell("Days in Month", String(i.daysInMonth))}${cell("Leave Taken", num(row.score.leaveTaken))}</tr>
<tr>${cell("Net Working Days", num(netWorking))}${cell("Overtime / (Short-hours) Days", signed(row.pay.overtimeDays))}</tr>
<tr>${cell("Attendance Bonus Days", num(row.pay.bonusDays))}${cell("Extra Days Worked", num(row.pay.extraDays))}</tr></table>
<h2>Earnings</h2>
<table class="lines"><tr><th>Particulars</th><th class="amt">Amount (₹)</th></tr>${lines(l.earnings)}<tr class="total"><td>Total Earnings</td><td class="amt">${money(l.totalEarnings)}</td></tr></table>
<h2>Deductions</h2>
<table class="lines"><tr><th>Particulars</th><th class="amt">Amount (₹)</th></tr>${lines(l.deductions)}<tr class="total"><td>Total Deductions</td><td class="amt">${money(l.totalDeductions)}</td></tr></table>
<div class="net"><span>NET SALARY ${i.complete ? "PAID" : "(MONTH NOT OVER)"}</span><b>₹ ${money(l.net)}</b></div>
<div class="words">${esc(rupeesInWords(l.net))}</div>
${i.complete ? "" : `<div class="note">The month is not over yet: the figures run up to today and the no-leave bonus is added when the month is complete.</div>`}
${row.monthlySalary === null ? `<div class="note">The salary is not entered in the ERP yet.</div>` : ""}
<div class="foot">Salary for ${esc(monthLong(month))}${i.complete ? `, paid on ${esc(longDate(paidOn))}` : ""}. This is a computer-generated salary slip and does not require a signature.</div>
</body></html>`;
}

/** "08_Vishal_Nagarwal_Salary_Slip_Oct-2026.pdf", as the firm names them. */
export function slipFileName(row: { code: string; name: string }, month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`);
  const mon = `${d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}-${d.getUTCFullYear()}`;
  const safe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${safe(row.code)}_${safe(row.name)}_Salary_Slip_${mon}.pdf`;
}
