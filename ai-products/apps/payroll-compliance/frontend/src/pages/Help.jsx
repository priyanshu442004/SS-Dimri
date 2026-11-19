import { PageHeader, Section, Faq, Steps, Btn } from "@shared/ui";
import { SAMPLES } from "./NewRun";

const S = `${import.meta.env.BASE_URL}samples/`;

export default function Help() {
  return (
    <>
      <PageHeader eyebrow="Help & formats" title="How payroll processing works" actions={<Btn to="/new" icon="plus">New payroll run</Btn>}>
        What to upload, how pay is computed, and why statutory deductions are flagged rather than applied.
      </PageHeader>

      <Steps items={[["Upload", "Salary master and attendance (required), plus payroll inputs and the statutory rule configuration (Excel or CSV)."], ["Compute", "Fixed pay less loss of pay, plus incentives, reimbursements and overtime, gives gross; recoveries give net."],
        ["Check", "PF, ESI, professional tax and TDS settings are checked; anything not configured or not validated becomes an exception."], ["Report", "Payroll register, exceptions and control summary — PDF emailed, Excel to download."]]} />

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Section title="Input files" i={1}>
          <div className="space-y-4 p-5 text-sm">
            <Spec name="Employee salary master (required)" cols={["Employee_ID", "Employee_Name", "Joining_Date", "Department", "Pay_Frequency", "Basic_INR", "HRA_INR", "Special_Allowance_INR", "Other_Allowance_INR", "Monthly_PF_Basis_Input_INR", "PF_Applicability_Flag", "Exit_Date (optional)"]} />
            <Spec name="Attendance & leave (required)" cols={["Employee_ID", "Employee_Name", "Period", "Calendar_Days", "Weekly_Offs_Holidays", "Paid_Leave_Days", "Unpaid_Leave_Days", "Present_Days", "Overtime_Hours"]} />
            <Spec name="Payroll inputs" cols={["Employee_ID", "Period", "Incentive_INR", "Reimbursement_INR", "Advance_Recovery_INR", "Other_Deduction_INR", "Overtime_Rate_INR_Per_Hour"]} />
            <Spec name="Statutory rule configuration" cols={["Rule_Name", "Configured_Value", "Notes"]} />
            <Spec name="Payroll test notes (optional CSV)" cols={["Test_ID", "Scenario"]} />
            <p className="text-muted">Column order doesn't matter, files can go in any box, and close variations of these names are recognised; unfamiliar headers are mapped by AI. Extra allowance columns in the master (e.g. Conveyance_Allowance_INR) are added to fixed pay. Up to 10 MB per file.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {SAMPLES.map(([f, l]) => <Btn key={f} href={`${S}${f}`} download variant="line" icon="download">{l}</Btn>)}
            </div>
          </div>
        </Section>
        <Section title="How each figure is computed" i={2}>
          <ol className="space-y-3 p-5 text-sm">
            {[["Fixed pay", "Basic + HRA + Special allowance + Other allowance (+ any extra allowance columns)."],
              ["Loss of pay", "Fixed pay × unpaid leave days ÷ salary-days basis. The basis is the Salary_Proration_Denominator rule, otherwise the calendar days. Days before joining or after exit in the payroll month are added to the unpaid days."],
              ["Overtime", "Overtime hours from attendance × the overtime rate from payroll inputs."],
              ["Gross before statutory", "Fixed pay − loss of pay + incentive + reimbursement + overtime."],
              ["Net before statutory", "Gross − advance recovery − other deductions. Each employee is rounded to the paisa; totals are the sum of employees."]].map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[28px_1fr] gap-2"><span className="font-mono text-xs text-muted">0{i + 1}</span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ol>
        </Section>
      </div>

      <h2 className="mb-3 mt-10 text-xl font-medium">Questions</h2>
      <Faq items={[
        ["Why aren't PF, ESI, PT and TDS deducted?", "Statutory deductions depend on eligibility, wage ceilings, state slabs, current rates and each employee's tax declarations. The rule configuration supplies placeholder rates, so the register stops at gross and net before statutory deductions and lists each open item as an exception with the action required. Where a PF flag is 'Yes' or an ESI threshold is configured, the exception shows the illustrative figure."],
        ["How is a mid-month joiner handled?", "If the joining date falls inside the payroll month, the days before joining are treated as unpaid and the status shows the proration. If the employee joined in the previous month, the month is paid in full and an exception notes that mid-month proration isn't demonstrated by this period. Joining after the period, or exit before it, excludes the employee."],
        ["Is the output ready to pay?", "No. Every run is a draft: not payable and not bank-upload ready until the exceptions are resolved and a reviewer signs off."],
        ["What if an employee has no attendance row?", "No loss of pay is applied and an exception asks you to confirm attendance. Employees in attendance or inputs but not in the salary master are listed as exceptions and not paid."],
        ["Who receives the email?", "The recipients listed under Settings receive the PDF summary as soon as a report is generated. Each unique set of files is emailed once; you can resend from the run page."],
        ["Can I ask questions about the files?", "Yes — open Ask AI (or the button on a run). The assistant answers from the register, the exceptions and every file you uploaded."],
        ["Is an AI model computing the pay?", "No. Every figure comes from deterministic rules, so the same files always give the same result. AI is used only to read unfamiliar headers and for the chat."],
      ]} />
    </>
  );
}

function Spec({ name, cols }) {
  return (
    <div>
      <p className="font-medium">{name}</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">{cols.map((c) => <li key={c} className="rounded-md bg-paper-2 px-2 py-0.5 font-mono text-[11.5px] text-muted">{c}</li>)}</ul>
    </div>
  );
}
