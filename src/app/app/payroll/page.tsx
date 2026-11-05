import { IndianRupee, Wallet } from "lucide-react";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { isoDateInTz } from "@/lib/dates";
import { employeeOptions } from "@/lib/services/lookups";
import { payrollForMonth, validMonth, type PayrollRow } from "@/lib/services/payroll";
import { Card, DetailList, DownloadButton, EmptyState, Notice, PageHeader, Stat, TabNav, Table, Td, Th } from "@/components/ui";
import { setSalaryAction } from "./actions";
import { SalaryForm } from "./forms";
import { PrintButton } from "./print-button";

const inr = (n: number | null) => (n === null ? "—" : `₹ ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export default async function PayrollPage({ searchParams }: PageProps<"/app/payroll">) {
  const ctx = await requireCapability("payroll.view_own");
  const sp = await searchParams;
  const manage = can(ctx, "payroll.manage");
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const month = validMonth(sp.month, today);
  const tab = sp.tab === "team" && manage ? "team" : "mine";

  return (
    <>
      <PageHeader
        icon={<Wallet />}
        title="Payroll"
        description="Monthly pay worked out from attendance and approved leave."
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {tab === "team" && <DownloadButton href={`/app/payroll/export?month=${month}`}>Export to Excel</DownloadButton>}
            {tab === "mine" && <PrintButton />}
          </span>
        }
      />
      {manage && (
        <TabNav current={tab} tabs={[
          { key: "mine", label: "My payslip", href: `/app/payroll?month=${month}` },
          { key: "team", label: "Team payroll", href: `/app/payroll?tab=team&month=${month}` },
        ]} />
      )}
      <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        {tab === "team" && <input type="hidden" name="tab" value="team" />}
        <label className="text-sm">
          <span className="mb-1 block font-medium">Month</span>
          <input type="month" name="month" defaultValue={month} max={today.slice(0, 7)} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
        </label>
        <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show</button>
      </form>
      {tab === "team" ? <Team /> : <Mine />}
    </>
  );

  function Provisional({ confirmed, complete }: { confirmed: boolean; complete: boolean }) {
    if (confirmed && complete) return null;
    return (
      <div className="mb-4 print:hidden">
        <Notice tone="warn">
          {!complete && <>This month is not over yet, so the figures run up to today. </>}
          {!confirmed && <>These figures are provisional until the firm confirms the Leave &amp; Timing Policy in Settings.</>}
        </Notice>
      </div>
    );
  }

  async function Mine() {
    if (!ctx.employee) {
      return <EmptyState kind="people" title="No staff record">Your login is not linked to an employee, so there is no payslip to show. Mark your attendance once to create your record.</EmptyState>;
    }
    const p = await payrollForMonth(ctx, month, ctx.employee.id);
    const r = p.rows[0];
    if (!r) return <EmptyState kind="people" title="No payslip yet">Your payslip appears once your account is approved.</EmptyState>;
    return (
      <div className="space-y-4">
        <Provisional confirmed={p.policyConfirmed} complete={p.complete} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Present days" value={r.present + r.halfDays * 0.5} icon={<IndianRupee />} tone="ok" />
          <Stat label="Paid leave" value={r.paidLeave} hint={`${p.paidLeaveAllowance} a month allowed`} tone="info" />
          <Stat label="Unpaid days" value={r.unpaidDays} tone={r.unpaidDays ? "warn" : "neutral"} />
          <Stat label={p.complete ? "Net pay" : "Earned so far"} value={r.gross === null ? "—" : inr(r.gross)} tone="ok" />
        </div>
        <Card title={`Payslip · ${monthName(month)}`}>
          {r.monthlySalary === null && <div className="mb-4"><Notice tone="info">Your salary has not been entered yet. Ask your administrator to add it.</Notice></div>}
          <DetailList items={[
            ["Name", r.name],
            ["Employee ID", r.code],
            ["Designation", r.designation],
            ["Department", r.department],
            ["Monthly salary", inr(r.monthlySalary)],
            ["Per-day rate", inr(r.perDay)],
            ["Days in month", p.daysInMonth],
            ["Days counted so far", p.elapsedDays],
            ["Present", r.present],
            ["Half days", r.halfDays],
            ["Paid leave", r.paidLeave],
            ["Leave beyond the allowance", r.excessLeave],
            ["Unpaid leave", r.unpaidLeave],
            ["Absent", r.absent],
            ["Not marked", r.unmarked],
            ["Unpaid days", r.unpaidDays],
            ["Payable days", r.payableDays],
            [p.complete ? "Net pay" : "Earned so far", <strong key="g">{inr(r.gross)}</strong>],
          ]} />
        </Card>
      </div>
    );
  }

  async function Team() {
    const [p, employees] = await Promise.all([payrollForMonth(ctx, month), employeeOptions(ctx.organization.id)]);
    const total = p.rows.reduce((s, r) => s + (r.gross ?? 0), 0);
    const missing = p.rows.filter((r) => r.monthlySalary === null).length;
    return (
      <div className="space-y-6">
        <Provisional confirmed={p.policyConfirmed} complete={p.complete} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Stat label={p.complete ? "Total pay" : "Earned so far"} value={inr(total)} tone="ok" hint={monthName(month)} />
          <Stat label="Team members" value={p.rows.length} />
          <Stat label="Salary not entered" value={missing} tone={missing ? "warn" : "neutral"} hint={missing ? "Add it below" : undefined} />
        </div>
        <Table minWidth={1140}>
          <thead><tr><Th>Team member</Th><Th>Monthly salary</Th><Th>Present</Th><Th>Half days</Th><Th>Paid leave</Th><Th>Unpaid leave</Th><Th>Absent</Th><Th>Not marked</Th><Th>Unpaid days</Th><Th>Payable days</Th><Th>{p.complete ? "Net pay" : "Earned so far"}</Th></tr></thead>
          <tbody>
            {p.rows.map((r: PayrollRow) => (
              <tr key={r.employeeId}>
                <Td><span className="font-medium">{r.name}</span><div className="font-mono text-xs text-muted">{r.code}{r.designation ? ` · ${r.designation}` : ""}</div></Td>
                <Td>{r.monthlySalary === null ? <span className="text-xs text-warn">Not entered</span> : inr(r.monthlySalary)}</Td>
                <Td>{r.present}</Td>
                <Td>{r.halfDays}</Td>
                <Td>{r.paidLeave}{r.excessLeave > 0 && <div className="text-xs text-warn">{r.excessLeave} over the allowance</div>}</Td>
                <Td>{r.unpaidLeave}</Td>
                <Td>{r.absent}</Td>
                <Td>{r.unmarked}</Td>
                <Td>{r.unpaidDays}</Td>
                <Td>{r.payableDays}</Td>
                <Td className="font-medium">{inr(r.gross)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Card title="Enter or change a salary">
          <p className="mb-3 text-sm text-muted">Each change is kept as dated history; past months keep the salary that applied to them.</p>
          <SalaryForm action={setSalaryAction} employees={employees} today={today} />
        </Card>
      </div>
    );
  }
}
