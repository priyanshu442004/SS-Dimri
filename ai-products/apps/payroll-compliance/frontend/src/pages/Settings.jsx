import SettingsPage from "@shared/SettingsPage";

export default function Settings() {
  return (
    <SettingsPage productName="Payroll Processing & Statutory Compliance" rows={[
      ["Inputs", "Employee salary master, attendance & leave, payroll inputs, statutory rule configuration (+ optional test-notes CSV)"],
      ["Accepted files", (d) => `${d.limits.formats.join(", ")} · up to ${d.limits.maxFileMb} MB each`],
      ["Computation", "Gross = fixed pay − loss of pay + incentive + reimbursement + overtime; net = gross − advance recovery − other deductions"],
      ["Loss of pay", "Fixed pay × unpaid days ÷ salary-days basis (Salary_Proration_Denominator rule, else calendar days); joining / exit within the month prorated"],
      ["Statutory", "PF, ESI, professional tax and salary TDS are flagged as open checks, never deducted, until eligibility, current rates and declarations are validated"],
      ["Outputs", "PDF Payroll Processing Summary · Excel workbook (Payroll Register, Exceptions, Control Summary)"],
      ["Emailed", "The PDF summary, as soon as a report is generated"],
      ["AI", "Deterministic rules for every figure — AI only reads unfamiliar headers and answers chat questions"],
    ]} />
  );
}
