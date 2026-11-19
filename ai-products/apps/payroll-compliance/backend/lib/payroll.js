// Payroll processing — deterministic engine (no AI in any figure).
// Salary master + attendance & leave + payroll inputs + statutory rule configuration →
// payroll register (gross / net BEFORE statutory deductions), exceptions and a control summary.
//   fixed pay   = Basic + HRA + Special + Other allowance (+ any extra allowance columns)
//   LOP         = fixed pay × (unpaid leave days + days not employed in the period) ÷ salary-days basis
//   OT pay      = overtime hours × overtime rate
//   gross       = fixed pay − LOP + incentive + reimbursement + OT pay
//   net         = gross − advance recovery − other deductions
// PF / ESI / PT / TDS are never deducted here: the configured rates are placeholders and
// eligibility, thresholds, state slabs and tax declarations must be validated first.
// Each open statutory item becomes an exception instead.
import { toDate, toNum, text } from "./parse.js";

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MON3 = Object.fromEntries(MONTHS.map((m, i) => [m.slice(0, 3).toLowerCase(), i + 1]));
const norm = (s) => text(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const idKey = (v) => text(v).toUpperCase().replace(/\s+/g, "");
/** Reference format for figures inside text: "INR 353,863.34". */
export const inrText = (n) => `INR ${Number(n).toLocaleString("en-US", { minimumFractionDigits: Number.isInteger(r2(n)) ? 0 : 2, maximumFractionDigits: 2 })}`;
const pct = (v) => `${r2(v * 100)}%`;
const yes = (v) => /^(y|yes|true|1|applicable)$/i.test(text(v));
const isNo = (v) => /^(n|no|false|0|not ?applicable|na|n\/a)$/i.test(text(v));

/** Any period-like cell → "YYYY-MM", or null. */
export function periodOf(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return toDate(v).slice(0, 7);
  const s = text(v);
  let m = s.match(/^(\d{4})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = s.match(/^([A-Za-z]{3})[A-Za-z]*[\s,'-]*(\d{2,4})$/);
  if (m && MON3[m[1].toLowerCase()]) return `${m[2].length === 2 ? "20" + m[2] : m[2]}-${String(MON3[m[1].toLowerCase()]).padStart(2, "0")}`;
  const d = toDate(v);
  return d ? d.slice(0, 7) : null;
}
const periodLabel = (p) => (p ? `${MONTHS[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}` : "Period not stated");
const monthDays = (p) => new Date(Date.UTC(+p.slice(0, 4), +p.slice(5, 7), 0)).getUTCDate();


export function processPayroll({ master: M, attendance: A, inputs: I, rules: R, notes: N }) {
  const exceptions = []; // { employee, issue, action, kind: "statutory" | "info" | "data" }
  const add = (employee, issue, action, kind = "data") => exceptions.push({ employee, issue, action, kind });

  // ---- statutory rule configuration (key/value)
  const rules = (R?.rows || []).map((r) => ({ name: text(r.name), value: text(r.value), notes: text(r.notes) })).filter((r) => r.name);
  const rule = (re) => rules.find((r) => re.test(norm(r.name)));
  const num = (r) => (r && r.value !== "" && Number.isFinite(+r.value.replace(/[,%₹\s]/g, "")) ? +r.value.replace(/[,%₹\s]/g, "") : null);
  const rate = (r) => { const n = num(r); return n == null ? null : /%/.test(r.value) || n > 1 ? n / 100 : n; };

  // ---- payroll period: rule → attendance → inputs (most common)
  const common = (vals) => { const c = {}; vals.filter(Boolean).forEach((v) => (c[v] = (c[v] || 0) + 1)); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null; };
  const period = periodOf(rule(/payrollperiod|^period$|^paymonth|^payrollmonth/)?.value) || common((A?.rows || []).map((r) => periodOf(r.period))) || common((I?.rows || []).map((r) => periodOf(r.period)));
  const pStart = period ? `${period}-01` : null;
  const pEnd = period ? `${period}-${String(monthDays(period)).padStart(2, "0")}` : null;
  const mDays = period ? monthDays(period) : 30;
  const denomRule = num(rule(/proration|denominator|salarydays|paydays|daysbasis/));

  const synthetic = rules.some((r) => /synthetic|test data|test period|dummy/i.test(`${r.value} ${r.notes}`)) || Boolean(N);

  if (!R) add("ALL", "Statutory rule configuration not supplied", "Upload the statutory rule configuration (period, proration basis, PF/ESI/PT/TDS settings)", "data");
  if (!I) add("ALL", "Payroll inputs not supplied; incentives, reimbursements, overtime rate and deductions taken as nil", "Upload payroll inputs if any variable pay or recoveries apply", "data");

  // ---- index attendance / inputs by employee for the period
  const index = (F, label) => {
    const map = new Map();
    for (const r of F?.rows || []) {
      const id = idKey(r.employeeId);
      if (!id) continue;
      const p = periodOf(r.period);
      if (period && p && p !== period) continue; // other periods are ignored
      if (map.has(id)) add(id, `Duplicate ${label} rows for the period; first row used`, `Remove the duplicate ${label} row`);
      else map.set(id, r);
    }
    return map;
  };
  const att = index(A, "attendance");
  const inp = index(I, "payroll input");
  const otherPeriods = [...new Set([...(A?.rows || []), ...(I?.rows || [])].map((r) => periodOf(r.period)).filter((p) => p && period && p !== period))];

  // ---- employees
  const seen = new Set();
  const register = [];
  const excluded = [];
  const statutory = [];
  for (const e of M.rows) {
    const id = idKey(e.employeeId);
    if (!id) continue;
    if (seen.has(id)) { add(id, "Duplicate employee in salary master; first row used", "Remove the duplicate master row"); continue; }
    seen.add(id);
    const name = text(e.employeeName) || text(att.get(id)?.employeeName) || id;
    const join = toDate(e.joiningDate);
    const exit = toDate(e.exitDate);

    if (period && join && join > pEnd) { excluded.push({ id, name, reason: `Joins ${join}, after the period` }); add(id, `Employee joins ${join}; after payroll period ${period}`, "Excluded from this payroll; include from the joining month"); continue; }
    if (period && exit && exit < pStart) { excluded.push({ id, name, reason: `Exited ${exit}, before the period` }); add(id, `Employee exited ${exit}; before payroll period ${period}`, "Excluded from this payroll; process full and final settlement separately"); continue; }

    const components = [["Basic", toNum(e.basic)], ["HRA", toNum(e.hra)], ["Special allowance", toNum(e.special)], ["Other allowance", toNum(e.otherAllowance)], ...(e.extraPay || []).map(([h, v]) => [h.replace(/_?INR$/i, "").replace(/_/g, " "), toNum(v)])];
    let fixed = r2(components.reduce((s, [, v]) => s + v, 0));
    if (!fixed && e.gross != null) fixed = r2(toNum(e.gross));

    const a = att.get(id);
    const x = inp.get(id);
    const denom = denomRule || toNum(a?.calendarDays) || mDays;

    // days in the month before joining / after exit (when the period is known)
    let before = 0, after = 0;
    if (period && join && join >= pStart && join <= pEnd) before = +join.slice(8, 10) - 1;
    if (period && exit && exit >= pStart && exit <= pEnd) after = mDays - +exit.slice(8, 10);
    const notEmployed = Math.min(denom, before + after);
    const unpaid = toNum(a?.unpaidLeave);
    const lop = r2((fixed * (unpaid + notEmployed)) / denom);
    const otHours = toNum(a?.otHours) || toNum(x?.otHours);
    const otRate = toNum(x?.otRate);
    const otPay = r2(otHours * otRate);
    const incentive = r2(toNum(x?.incentive));
    const reimbursement = r2(toNum(x?.reimbursement));
    const advance = r2(toNum(x?.advance));
    const otherDeduction = r2(toNum(x?.otherDeduction));
    const gross = r2(fixed - lop + incentive + reimbursement + otPay);
    const net = r2(gross - advance - otherDeduction);

    let status = "Draft; statutory deductions not computed";
    if (notEmployed) status = `Draft; prorated for ${denom - notEmployed} of ${denom} days (${before ? `joined ${join}` : ""}${before && after ? ", " : ""}${after ? `exit ${exit}` : ""}); statutory deductions not computed`;

    // employee-level checks
    if (period && join && join < pStart) {
      const prev = new Date(Date.UTC(+period.slice(0, 4), +period.slice(5, 7) - 2, 1)).toISOString().slice(0, 7);
      if (join.slice(0, 7) === prev && join.slice(8, 10) !== "01")
        add(id, `Employee joined ${join}; selected payroll period is ${period}`, `${MONTHS[+period.slice(5, 7) - 1]} is a full month after joining; mid-month proration is not demonstrated by this period`, "info");
    }
    if (before) add(id, `Employee joined ${join} within payroll period ${period}`, `Salary prorated for ${denom - notEmployed} of ${denom} days; confirm joining date and attendance`, "info");
    if (after) add(id, `Employee exit ${exit} within payroll period ${period}`, `Salary prorated to the exit date; process full and final settlement separately`, "info");
    if (A && !a) add(id, `No attendance record for ${period || "the period"}; no loss of pay applied`, "Confirm attendance before finalising");
    if (I && !x && inp.size) add(id, "No payroll input row; incentives, reimbursements, overtime and deductions taken as nil", "Confirm there are no variable pay items or recoveries");
    if (otHours && !otRate) add(id, `${otHours} overtime hours recorded but no overtime rate supplied; OT pay not computed`, "Supply the overtime rate per hour");
    if (a && toNum(a.calendarDays) && toNum(a.offs) + toNum(a.paidLeave) + unpaid + toNum(a.present) > toNum(a.calendarDays)) add(id, `Attendance days exceed calendar days (${toNum(a.offs) + toNum(a.paidLeave) + unpaid + toNum(a.present)} > ${toNum(a.calendarDays)})`, "Correct the attendance record");
    if (unpaid + notEmployed > denom) add(id, `Unpaid days (${unpaid + notEmployed}) exceed the salary-days basis (${denom})`, "Correct the attendance record");
    if (text(e.payFrequency) && !/month/i.test(text(e.payFrequency))) add(id, `Pay frequency '${text(e.payFrequency)}' is not monthly; computed as a monthly salary`, "Confirm pay frequency and salary basis");
    if (!fixed) add(id, "No fixed pay found in the salary master", "Complete the salary structure");
    if (net < 0) add(id, `Net pay is negative (${inrText(net)})`, "Review recoveries and deductions");

    statutory.push({ id, pfFlag: text(e.pfFlag), pfBasis: toNum(e.pfBasis), esiFlag: text(e.esiFlag), state: text(e.state), monthly: fixed });
    register.push({
      id, name, department: text(e.department), joiningDate: join, exitDate: exit, components: components.filter(([, v]) => v), fixed,
      daysBasis: denom, unpaid, notEmployed, payableDays: r2(denom - unpaid - notEmployed), lop, incentive, reimbursement, otHours, otRate, otPay,
      gross, advance, otherDeduction, net, status,
      attendance: a ? { calendarDays: toNum(a.calendarDays), offs: toNum(a.offs), paidLeave: toNum(a.paidLeave), unpaidLeave: unpaid, present: toNum(a.present) } : null,
    });
  }
  if (!register.length) throw new Error("No employees could be processed — check the Employee_ID column in the salary master.");

  for (const [label, map] of [["attendance", att], ["payroll inputs", inp]])
    for (const id of map.keys()) if (!seen.has(id)) add(id, `Employee in ${label} but not in the salary master; not paid`, "Add the employee to the salary master or remove the row");
  if (otherPeriods.length) add("ALL", `Rows for other periods (${otherPeriods.join(", ")}) ignored; payroll period is ${period}`, "Upload only the selected period's attendance and inputs");

  // ---- statutory items (never deducted; reported as open checks)
  const head = [];
  const pfEmp = rate(rule(/pfemployee|employeepf|pfee/));
  const flagged = statutory.filter((s) => s.pfFlag);
  const pfYes = statutory.filter((s) => yes(s.pfFlag));
  if (!flagged.length) head.push(["ALL", "PF applicability flags are not supplied in master; no PF deduction computed", "Confirm employee-wise eligibility and applicable rules"]);
  else if (!pfYes.length && flagged.every((s) => isNo(s.pfFlag))) head.push(["ALL", `PF applicability flags are 'No' in supplied master; no PF deduction computed`, "Confirm employee-wise eligibility and applicable rules"]);
  else {
    const illus = pfEmp != null ? `; illustrative employee PF at ${pct(pfEmp)} of PF basis = ${inrText(r2(pfYes.reduce((s, x) => s + x.pfBasis * pfEmp, 0)))}` : "";
    head.push([pfYes.map((s) => s.id).join(", "), `PF applicability flag is 'Yes' for ${pfYes.length} employee(s)${illus}; not deducted in this draft`, "Validate PF wage ceiling, rates and eligibility before deducting"]);
  }
  const esiTh = num(rule(/esi.*(threshold|ceiling|limit|wage|eligib)/));
  if (esiTh == null) head.push(["ALL", "ESI eligibility inputs and threshold configuration are not supplied", "Configure current eligibility/rates and validate before calculation"]);
  else {
    const within = statutory.filter((s) => s.monthly <= esiTh).map((s) => s.id); // monthly wages, not the prorated gross
    head.push(["ALL", `ESI threshold configured at ${inrText(esiTh)}; ${within.length ? `within threshold: ${within.join(", ")}` : "no employee within threshold"}; ESI not deducted in this draft`, "Validate current ESI rates and coverage before deducting"]);
  }
  head.push(["ALL", "Income-tax/TDS declarations and regime data are not supplied", "Do not compute salary TDS without employee declarations and applicable rules"]);
  const ptRule = rule(/professionaltax|^pt$|^ptamount/);
  const pt = num(ptRule);
  const tail = pt ? ["ALL", `Professional tax configured as ${inrText(pt)} without state slabs; not deducted in this draft`, "Confirm state-specific slab and deduct where applicable"]
    : ["ALL", "Professional tax state/rules not supplied", "Configure state-specific rules where applicable"];

  const ordered = [
    ...exceptions.filter((x) => x.employee === "ALL" && x.kind === "data"),
    ...head.map(([employee, issue, action]) => ({ employee, issue, action, kind: "statutory" })),
    ...exceptions.filter((x) => !(x.employee === "ALL" && x.kind === "data")),
    { employee: tail[0], issue: tail[1], action: tail[2], kind: "statutory" },
  ];

  // ---- totals and control summary
  const sum = (k) => r2(register.reduce((s, r) => s + r[k], 0));
  const totals = Object.fromEntries(["fixed", "lop", "incentive", "reimbursement", "otPay", "gross", "advance", "otherDeduction", "net"].map((k) => [k, sum(k)]));
  const status = "Draft only - not payable / not bank upload ready";
  const control = [["Employees", register.length], ["Payroll period", period || "Not stated"], ["Total gross before statutory deductions", totals.gross], ["Total net before statutory deductions", totals.net], ["Status", status]];

  // ---- PDF lines
  const open = ["PF/ESI eligibility", "salary TDS declarations", pt ? "state-specific professional tax slabs" : "professional tax and state-specific rules"];
  const data = ordered.filter((x) => x.kind === "data");
  const dataIds = [...new Set(data.map((x) => x.employee).filter((id) => id !== "ALL"))];
  const dataText = [...(data.some((x) => x.employee === "ALL") ? ["file-level"] : []), ...(dataIds.length ? [`${dataIds.join(", ")}`] : [])].join("; ");
  const openChecks = `${open.join(", ")} not configured.${data.length ? ` Data exceptions: ${dataText} (see Exceptions sheet).` : ""}`;
  const approval = "Not payable and not bank-upload ready.";

  // ---- test notes: what the engine shows for each employee a note mentions
  const ids = new Map(register.map((r) => [r.id, r]));
  const reviewNotes = (N?.rows || []).map((row) => {
    const vals = Object.values(row).filter(Boolean);
    const found = [...new Set((vals.join(" ").toUpperCase().match(/[A-Z]{1,5}-?\d{1,6}/g) || []))].map((t) => ids.get(t)).filter(Boolean);
    return { id: vals[0] || "", text: vals.slice(1).join(" · "), found: found.map((r) => ({ id: r.id, name: r.name, gross: r.gross, net: r.net, lop: r.lop, status: r.status, exceptions: ordered.filter((x) => x.employee === r.id).map((x) => x.issue) })) };
  });

  return {
    title: "Payroll Processing Summary",
    subtitle: `${periodLabel(period)} · ${synthetic ? "Synthetic draft only" : "Draft only"}`,
    period: { code: period, label: periodLabel(period), start: pStart, end: pEnd, days: mDays, denominator: denomRule || null },
    synthetic, status, approval, openChecks,
    register, excluded, totals, control,
    exceptions: ordered,
    rules,
    reviewNotes,
    stats: { employees: register.length, excluded: excluded.length, exceptions: ordered.length, dataExceptions: ordered.filter((x) => x.kind === "data").length, withLop: register.filter((r) => r.lop).length, withOt: register.filter((r) => r.otPay).length, gross: totals.gross, net: totals.net },
    pdfRows: [
      ["Employees", String(register.length)],
      ["Gross before statutory deductions", inrText(totals.gross)],
      ["Net before statutory deductions", inrText(totals.net)],
      ["Open checks", openChecks],
      ["Approval", approval],
    ],
    detection: Object.fromEntries([["master", M], ["attendance", A], ["inputs", I], ["rules", R], ["notes", N]].filter(([, F]) => F).map(([k, F]) => [k, { file: F.filename, columns: F.columns, rows: F.rows.length }])),
  };
}

export const pdfModel = (r) => ({ title: r.title, subtitle: r.subtitle, rows: r.pdfRows });
