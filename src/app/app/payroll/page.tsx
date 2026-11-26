import Link from "next/link";
import { DeleteFileButton } from "@/components/delete-file-button";
import { canDeleteFiles } from "@/lib/services/file-removal";
import { IndianRupee, TrendingUp, Wallet } from "lucide-react";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { dateOnly, formatDate, formatDateTime, isoDateInTz, minutesToHhmm, toIsoDate } from "@/lib/dates";
import { payrollForMonth, salaryHistory, salaryOverview, salaryScope, validMonth, type PayrollRow } from "@/lib/services/payroll";
import { advancesOf, conveyanceClientOptions, conveyanceForMonth, conveyanceSheet, isOwnVehicle, monthLabel, myConveyance } from "@/lib/services/claims";
import { prisma } from "@/lib/db";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, DetailList, DownloadButton, EmptyState, Notice, PageHeader, Stat, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { addAdvanceAction, cancelConveyanceAction, decideConveyanceAction, deleteAdvanceAction, deleteSalaryAction, editAdvanceAction, editSalaryAction, setSalaryAction, submitConveyanceAction } from "./actions";
import { AdvanceEditForm, AdvanceForm, ConveyanceDecisionForm, ConveyanceForm, SalaryEditForm, SalaryForm } from "./forms";
import { PrintButton } from "./print-button";
import { getPolicy } from "@/lib/services/office-rules";

const inr = (n: number | null) => (n === null ? "—" : `₹ ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

export default async function PayrollPage({ searchParams }: PageProps<"/app/payroll">) {
  const ctx = await requireCapability("payroll.view_own");
  const sp = await searchParams;
  const manage = can(ctx, "payroll.manage");
  const salaries = manage || can(ctx, "payroll.salaries");
  const tz = ctx.organization.timezone;
  const today = isoDateInTz(new Date(), tz);
  const month = validMonth(sp.month, today);
  const tab = sp.tab === "team" && manage ? "team" : sp.tab === "salaries" && salaries ? "salaries" : sp.tab === "conveyance" ? "conveyance" : sp.tab === "advances" && manage ? "advances" : "mine";
  // Employee search (tracker S.No. 102): by name or employee code, on every list of people.
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const matches = (name: string, code?: string | null) => !q || name.toLowerCase().includes(q.toLowerCase()) || (code ?? "").toLowerCase().includes(q.toLowerCase());
  const searchable = tab === "team" || tab === "salaries" || tab === "advances" || (tab === "conveyance" && manage);
  const requestLimit = (await getPolicy(ctx.organization.id)).row.requestMarksPerMonth;

  return (
    <>
      <PageHeader
        icon={<Wallet />}
        title="Payroll"
        description="Monthly pay worked out from attendance, leave and the office rules: every deduction and addition is listed."
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {tab === "team" && <DownloadButton href={`/app/payroll/slips?month=${month}`}>All salary slips (ZIP)</DownloadButton>}
            {tab === "team" && <DownloadButton href={`/app/payroll/export?month=${month}`}>Export to Excel</DownloadButton>}
            {tab === "conveyance" && <DownloadButton href={`/app/payroll/conveyance-export?month=${month}`}>Conveyance sheet (Excel)</DownloadButton>}
            {tab === "mine" && ctx.employee && <DownloadButton href={`/app/payroll/slip?month=${month}`}>Salary slip (PDF)</DownloadButton>}
            {tab === "mine" && <PrintButton />}
          </span>
        }
      />
      <TabNav current={tab} tabs={[
        { key: "mine", label: "My payslip", href: `/app/payroll?month=${month}` },
        ...(manage ? [{ key: "team", label: "Team payroll", href: `/app/payroll?tab=team&month=${month}` }] : []),
        ...(salaries ? [{ key: "salaries", label: "Salaries", href: "/app/payroll?tab=salaries" }] : []),
        { key: "conveyance", label: "Conveyance", href: `/app/payroll?tab=conveyance&month=${month}` },
        ...(manage ? [{ key: "advances", label: "Advances", href: `/app/payroll?tab=advances&month=${month}` }] : []),
      ]} />
      {(tab !== "salaries" || searchable) && (
        <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden" role="search">
          {tab !== "mine" && <input type="hidden" name="tab" value={tab} />}
          {tab !== "salaries" && (
            <label className="text-sm">
              <span className="mb-1 block font-medium">Month</span>
              <input type="month" name="month" defaultValue={month} max={today.slice(0, 7)} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
            </label>
          )}
          {searchable && (
            <label className="text-sm">
              <span className="mb-1 block font-medium">Employee</span>
              <input name="q" defaultValue={q} placeholder="Search name or employee code" className="h-10 w-64 rounded-md border border-line bg-surface px-3 text-sm" />
            </label>
          )}
          <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">{searchable ? "Search" : "Show"}</button>
          {q && <Link href={`/app/payroll?tab=${tab}&month=${month}`} className="flex h-10 items-center px-2 text-sm text-muted hover:text-ink">Clear</Link>}
        </form>
      )}
      {tab === "team" ? <Team /> : tab === "salaries" ? <Salaries /> : tab === "conveyance" ? <Conveyance /> : tab === "advances" ? <Advances /> : <Mine />}
    </>
  );

  function Running({ complete }: { complete: boolean }) {
    if (complete) return null;
    return <div className="mb-4 print:hidden"><Notice tone="info">This month is not over yet, so the figures run up to today. The no-leave bonus is added once the month is complete.</Notice></div>;
  }

  /** Every line of the pay: what was counted, deducted and added, in plain words. */
  function Breakdown({ r, perDayLabel, per }: { r: PayrollRow; perDayLabel?: boolean; per: number }) {
    const s = r.score;
    const lines: [string, string, string][] = [
      ["Paid leave (with intimation)", days(s.paidLeave), "paid"],
      ["Leave beyond the 1 a month", days(s.excessLeave), s.excessLeave ? `−${days(s.excessLeave)}` : "—"],
      ["Unpaid leave / leave without prior intimation", days(s.unpaidLeave), s.unpaidLeave ? `−${days(s.unpaidLeave)}` : "—"],
      ["Absent with a request", days(s.absent - s.absentUnrequested), s.absent - s.absentUnrequested ? `−${days(s.absent - s.absentUnrequested)}` : "—"],
      ["Absent without any request (counts double)", days(s.absentUnrequested), s.absentUnrequested ? `−${days(s.absentUnrequested * 2)}` : "—"],
      ["Sundays / holidays inside a leave", days(s.sandwichDays), s.sandwichDays ? `−${days(s.sandwichDays)}` : "—"],
      ["Half days marked", String(s.halfDays), s.halfDays ? `−${days(s.halfDays * 0.5)}` : "—"],
      [`Late 15 min – 1 h (every ${per} = ½ day)`, `${s.lateArrivals}${s.lateExcused ? ` (+${s.lateExcused} excused)` : ""}`, s.lateHalfDays - s.veryLateArrivals * 0.5 ? `−${days(s.lateHalfDays - s.veryLateArrivals * 0.5)}` : "—"],
      ["Late over 1 hour (½ day each)", String(s.veryLateArrivals), s.veryLateArrivals ? `−${days(s.veryLateArrivals * 0.5)}` : "—"],
      ["Left before the half-day time (½ day each)", String(s.earlyHalfDays * 2), s.earlyHalfDays ? `−${days(s.earlyHalfDays)}` : "—"],
      [`Attendance marked on request (over ${requestLimit} a month: ½ day each)`, `${s.requestMarked}${s.requestHalfDays ? ` (${s.requestHalfDays} over)` : ""}`, s.requestHalfDays ? `−${days(s.requestHalfDays * 0.5)}` : "—"],
    ];
    return (
      <div className="space-y-4">
        <Table minWidth={520}>
          <thead><tr><Th>Under the office rules</Th><Th>Count</Th><Th>Effect</Th></tr></thead>
          <tbody>
            {lines.map(([a, b, c]) => <tr key={a}><Td>{a}</Td><Td>{b}</Td><Td className={c.startsWith("−") ? "font-medium text-danger" : ""}>{c}</Td></tr>)}
            <tr className="bg-paper"><Td className="font-semibold">Days deducted</Td><Td /><Td className="font-semibold">{days(s.unpaidDays)}</Td></tr>
          </tbody>
        </Table>
        <DetailList items={[
          ["Monthly salary", inr(r.monthlySalary)],
          [perDayLabel ? "Per-day rate (salary ÷ days in month)" : "Per-day rate", inr(r.pay.perDay)],
          ["Days counted so far / payable", `${s.countedDays} / ${s.payableDays}`],
          ["Pay for payable days", inr(r.pay.basePay)],
          [`Approved overtime (${minutesToHhmm(s.overtimeMinutes)})`, r.pay.overtimePay ? `+ ${inr(r.pay.overtimePay)}` : "—"],
          [`No-leave bonus${r.pay.bonusDays ? ` (${days(r.pay.bonusDays)})` : ""}`, r.pay.bonus ? `+ ${inr(r.pay.bonus)}` : s.leaveTaken >= 2 ? "Not this month (2 or more days of leave)" : "Added when the month is complete (2 days with no leave, 1 day with one)"],
          [`Worked on Sunday / holiday (approved)${s.extraDays ? ` · ${days(s.extraDays)}` : ""}`, r.pay.extraPay ? `+ ${inr(r.pay.extraPay)}` : "—"],
          [`Salary for ${r.pay.payableDaysTotal} payable days (on the slip: payable + overtime + bonus + extra days)`, inr(r.pay.salaryForDays)],
          ["Fixed allowance", r.pay.fixedAllowance ? `+ ${inr(r.pay.fixedAllowance)}` : "—"],
          [`Any other: conveyance (${r.conveyanceClaims} approved claim${r.conveyanceClaims === 1 ? "" : "s"})`, r.pay.conveyance ? `+ ${inr(r.pay.conveyance)}` : "—"],
          [`Advance recovered${r.pay.advanceDeduction || r.advanceBalance ? ` · balance after this month ${inr(r.advanceBalance)}` : ""}`, r.pay.advanceDeduction ? `− ${inr(r.pay.advanceDeduction)}` : "—"],
          [`Fines: EOD not filed (${r.fines.eodMissed.length})${r.fines.leadMissed.length ? `, not escalated as Team Lead (${r.fines.leadMissed.length})` : ""}`, r.fines.amount ? `− ${inr(r.fines.amount)}` : "—"],
          ["Net pay", <strong key="n">{inr(r.pay.net)}</strong>],
        ]} />
        {(r.fines.eodMissed.length > 0 || r.fines.leadMissed.length > 0) && (
          <p className="text-xs text-muted">
            {r.fines.eodMissed.length > 0 && <>EOD not filed in time: {r.fines.eodMissed.map((d) => formatDate(dateOnly(d))).join(", ")}. </>}
            {r.fines.leadMissed.length > 0 && <>Not escalated: {r.fines.leadMissed.map((x) => `${x.employee} (${formatDate(dateOnly(x.date))})`).join(", ")}.</>}
          </p>
        )}
      </div>
    );
  }

  async function Mine() {
    if (!ctx.employee) {
      return <EmptyState kind="people" title="No staff record">Your login is not linked to an employee, so there is no payslip to show. Mark your attendance once to create your record.</EmptyState>;
    }
    const [p, history] = await Promise.all([payrollForMonth(ctx, month, ctx.employee.id), salaryHistory(ctx, ctx.employee.id, { own: true })]);
    const r = p.rows[0];
    if (!r) return <EmptyState kind="people" title="No payslip yet">Your payslip appears once your account is approved.</EmptyState>;
    if (p.isOwner) return <EmptyState kind="people" title="Not on the payroll">The office rules and payroll are not applied to the firm owner.</EmptyState>;
    const s = r.score;
    return (
      <div className="space-y-4">
        <Running complete={p.complete} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Days payable" value={s.payableDays} hint={`of ${s.countedDays} counted so far`} icon={<IndianRupee />} tone="ok" />
          <Stat label="Days deducted" value={s.unpaidDays} tone={s.unpaidDays ? "warn" : "ok"} hint={s.unpaidDays ? "See the breakdown below" : "Nothing deducted"} />
          <Stat label="Fines" value={inr(r.fines.amount)} tone={r.fines.amount ? "danger" : "neutral"} />
          <Stat label={p.complete ? "Net pay" : "Earned so far"} value={inr(r.pay.net)} tone="ok" />
        </div>
        <Card title={`Payslip · ${monthName(month)}`} actions={<span className="flex gap-3 text-sm print:hidden"><a href={`/app/payroll/slip?month=${month}&view=1`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">View salary slip</a><a href={`/app/payroll/slip?month=${month}`} className="font-medium text-brand-700 hover:underline">Download PDF</a></span>}>
          {r.monthlySalary === null && <div className="mb-4"><Notice tone="info">Your salary has not been entered yet. Ask your manager or administrator to add it.</Notice></div>}
          <DetailList items={[["Name", r.name], ["Employee ID", r.code], ["Designation", r.designation], ["Department", r.department]]} />
          <div className="mt-4"><Breakdown r={r} perDayLabel per={p.policy.numbers.lateArrivalsPerHalfDay} /></div>
          <p className="mt-4 text-xs text-muted print:hidden">How each rule works is on the <Link href="/app/rules" className="underline">office rules</Link> page; your day-by-day record is under <Link href={`/app/attendance?month=${month}`} className="underline">My attendance</Link>.</p>
        </Card>
        <MyAdvances />
        {history.length > 0 && (
          <Card title="My salary history" icon={<TrendingUp />} className="print:hidden" padded={false}>
            <Table minWidth={520}>
              <thead><tr><Th>From</Th><Th>Salary</Th><Th>Previous</Th><Th>Change</Th><Th>Note</Th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <Td className="whitespace-nowrap">{formatDate(h.effectiveFrom)}{h.effectiveFrom > dateOnly(today) && <div><Badge tone="info">Upcoming</Badge></div>}</Td>
                    <Td>{inr(h.monthly)} a month{h.allowance ? <div className="text-xs text-muted">+ {inr(h.allowance)} allowance</div> : null}</Td>
                    <Td className="text-xs">{h.previous !== null ? inr(h.previous) : "—"}</Td>
                    <Td>{h.change ? <Badge tone={h.change.amount >= 0 ? "ok" : "warn"}>{h.change.amount >= 0 ? "+" : ""}{inr(h.change.amount)}{h.change.percent !== null && ` (${h.change.percent}%)`}</Badge> : "First salary"}</Td>
                    <Td className="text-xs">{h.notes ?? ""}{h.committed.date && <div className="text-muted">Next increment due {formatDate(h.committed.date)}{h.committed.percent ? ` · ${h.committed.percent}%` : h.committed.amount ? ` · ${inr(h.committed.amount)}` : ""}</div>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        )}
      </div>
    );
  }

  async function MyAdvances() {
    if (!ctx.employee) return null;
    const rows = await advancesOf(ctx.organization.id, ctx.employee.id, month);
    if (!rows.length) return null;
    return (
      <Card title="My advances" className="print:hidden" padded={false}>
        <Table minWidth={520}>
          <thead><tr><Th>Given</Th><Th>Advance</Th><Th>Per month</Th><Th>{monthName(month)}</Th><Th>Balance</Th></tr></thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}><Td className="whitespace-nowrap">{formatDate(a.givenOn)}</Td><Td>{inr(a.amount)}</Td><Td>{inr(a.monthlyDeduction)}</Td><Td>{a.thisMonth ? `−${inr(a.thisMonth)}` : "—"}</Td><Td>{a.settled ? <Badge tone="ok">{a.closedMonth ? "Closed" : "Recovered"}</Badge> : inr(a.balanceAfter)}</Td></tr>
            ))}
          </tbody>
        </Table>
      </Card>
    );
  }

  async function Team() {
    const all = await payrollForMonth(ctx, month);
    const p = { ...all, rows: all.rows.filter((r) => matches(r.name, r.code)) };
    const total = p.rows.reduce((s, r) => s + (r.pay.net ?? 0), 0);
    const missing = p.rows.filter((r) => r.monthlySalary === null).length;
    const finesTotal = p.rows.reduce((s, r) => s + r.fines.amount, 0);
    const open = typeof sp.person === "string" ? p.rows.find((r) => r.employeeId === sp.person) : undefined;
    return (
      <div className="space-y-6">
        <Running complete={p.complete} />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={p.complete ? "Total net pay" : "Earned so far"} value={inr(total)} tone="ok" hint={monthName(month)} />
          <Stat label="Team members" value={p.rows.length} />
          <Stat label="Fines" value={inr(finesTotal)} tone={finesTotal ? "danger" : "neutral"} hint="EOD and escalation" />
          <Stat label="Salary not entered" value={missing} tone={missing ? "warn" : "neutral"} hint={missing ? "Fix it on the Salaries tab" : undefined} href={missing ? "/app/payroll?tab=salaries" : undefined} />
        </div>
        {open && (
          <Card title={`${open.name} · ${monthName(month)}`} actions={<span className="flex gap-3 text-xs"><a href={`/app/payroll/slip?month=${month}&person=${open.employeeId}&view=1`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">View slip</a><a href={`/app/payroll/slip?month=${month}&person=${open.employeeId}`} className="font-medium text-brand-700 hover:underline">Slip PDF</a><Link href={`/app/payroll?tab=team&month=${month}`} className="text-muted hover:text-ink">Close</Link></span>}>
            <Breakdown r={open} per={p.policy.numbers.lateArrivalsPerHalfDay} />
          </Card>
        )}
        <Table minWidth={1480}>
          <thead><tr><Th>Team member</Th><Th>Monthly salary</Th><Th>Present</Th><Th>Leave (paid / unpaid)</Th><Th>Absent</Th><Th>Late</Th><Th>½ days (late / early)</Th><Th>Days deducted</Th><Th>Payable days</Th><Th>Overtime</Th><Th>Bonus / extra days</Th><Th>Conveyance</Th><Th>Advance</Th><Th>Fines</Th><Th>{p.complete ? "Net pay" : "Earned so far"}</Th></tr></thead>
          <tbody>
            {p.rows.map((r) => {
              const s = r.score;
              return (
                <tr key={r.employeeId}>
                  <Td><Link href={`/app/payroll?tab=team&month=${month}&person=${r.employeeId}`} className="font-medium hover:underline">{r.name}</Link><div className="font-mono text-xs text-muted">{r.code}{r.designation ? ` · ${r.designation}` : ""}</div><a href={`/app/payroll/slip?month=${month}&person=${r.employeeId}`} className="text-xs font-medium text-brand-700 hover:underline">Salary slip</a></Td>
                  <Td>{r.monthlySalary === null ? <Link href={`/app/payroll?tab=salaries&person=${r.employeeId}`} className="text-xs font-medium text-warn underline">Not entered</Link> : inr(r.monthlySalary)}</Td>
                  <Td>{s.worked + s.halfDays * 0.5}</Td>
                  <Td>{s.paidLeave} / {s.unpaidLeave + s.excessLeave + s.sandwichDays}</Td>
                  <Td>{s.absent}{s.absentUnrequested > 0 && <div className="text-xs text-danger">{s.absentUnrequested} unrequested (×2)</div>}</Td>
                  <Td>{s.lateArrivals + s.veryLateArrivals}{s.lateExcused > 0 && <div className="text-xs text-muted">{s.lateExcused} excused</div>}</Td>
                  <Td>{s.lateHalfDays} / {s.earlyHalfDays}</Td>
                  <Td className={s.unpaidDays ? "font-medium text-danger" : ""}>{s.unpaidDays}</Td>
                  <Td>{s.payableDays}</Td>
                  <Td className="text-xs">{s.overtimeMinutes ? <>{minutesToHhmm(s.overtimeMinutes)}<div>{inr(r.pay.overtimePay)}</div></> : "—"}</Td>
                  <Td className="text-xs">{r.pay.bonus ? inr(r.pay.bonus) : "—"}{r.pay.extraPay ? <div>+{inr(r.pay.extraPay)} ({r.pay.extraDays} d)</div> : null}</Td>
                  <Td className="text-xs">{r.pay.conveyance ? inr(r.pay.conveyance) : "—"}</Td>
                  <Td className="text-xs">{r.pay.advanceDeduction ? <span className="text-danger">−{inr(r.pay.advanceDeduction)}</span> : "—"}{r.advanceBalance ? <div className="text-muted">bal. {inr(r.advanceBalance)}</div> : null}</Td>
                  <Td className="text-xs">{r.fines.amount ? <span className="text-danger">{inr(r.fines.amount)}</span> : "—"}</Td>
                  <Td className="font-medium">{inr(r.pay.net)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        {q && p.rows.length === 0 && <p className="text-sm text-muted">Nobody matches “{q}”.</p>}
        <p className="text-xs text-muted">Click a name for the full breakdown and the salary slip. Payroll follows the office rules in Settings → Leave &amp; timing policy. The firm owner is not on the payroll.</p>
      </div>
    );
  }

  /** Conveyance claims (tracker S.No. 84): everyone claims; administrators approve; approved claims are paid with that month's salary. */
  async function Conveyance() {
    const [mine, clients, everyone, policyRow, me, sheet] = await Promise.all([
      myConveyance(ctx),
      conveyanceClientOptions(ctx),
      manage ? conveyanceForMonth(ctx, month) : Promise.resolve([]),
      prisma.attendancePolicy.findUnique({ where: { organizationId: ctx.organization.id }, select: { conveyanceRatePerKm: true, salaryPayDay: true } }),
      ctx.employee ? prisma.employee.findUnique({ where: { id: ctx.employee.id }, select: { commuteKm: true } }) : Promise.resolve(null),
      ctx.employee ? conveyanceSheet(ctx, month, ctx.employee.id) : Promise.resolve([]),
    ]);
    const all = everyone.filter((c) => matches(`${c.employee.firstName} ${c.employee.lastName ?? ""}`));
    const waiting = all.filter((c) => c.status === "PENDING");
    const decided = all.filter((c) => c.status !== "PENDING");
    const rate = policyRow ? Number(policyRow.conveyanceRatePerKm) : 4.5;
    const monthBack = toIsoDate(new Date(Date.now() - 62 * 86_400_000));
    const place = (c: { client: { tradeName: string } | null; place: string | null }) => [c.client?.tradeName, c.place].filter(Boolean).join(" · ") || "—";
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {ctx.employee && (
            <Card title="Claim conveyance">
              <p className="mb-3 text-sm text-muted">Claim each day&apos;s travel for office work. Once an administrator approves it, it is added to that month&apos;s salary as &ldquo;Any other&rdquo; — no separate sheet needed.</p>
              <ConveyanceForm action={submitConveyanceAction} clients={clients} today={today} minDate={monthBack} rate={rate} commute={me?.commuteKm ? Number(me.commuteKm) : null} />
            </Card>
          )}
          {ctx.employee && (
            <Card title={`My conveyance sheet · ${monthName(month)}`} padded={false} actions={<a href={`/app/payroll/conveyance-export?month=${month}&mine=1`} className="text-xs font-medium text-brand-700 hover:underline">Excel</a>}>
              <ConveyanceSheetTable rows={sheet} rate={rate} />
            </Card>
          )}
          <Card title="My claims" padded={false}>
            {mine.length === 0 ? <p className="p-4 text-sm text-muted">No claims yet.</p> : (
              <Table minWidth={560}>
                <thead><tr><Th>Date</Th><Th>Where</Th><Th>Amount</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {mine.map((c) => (
                    <tr key={c.id}>
                      <Td className="whitespace-nowrap">{formatDate(c.claimDate)}</Td>
                      <Td className="text-xs">{place(c)}{c.km ? ` · ${Number(c.km)} km` : ""}{c.mode ? ` · ${c.mode}` : ""}{c.billFileId && <> · <a href={`/api/files/${c.billFileId}`} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">bill</a>{canDeleteFiles(ctx) && <DeleteFileButton fileId={c.billFileId} what="bill" compact />}</>}{c.decisionNote && <div className="text-muted">{c.decidedBy?.name}: {c.decisionNote}</div>}</Td>
                      <Td>{inr(Number(c.amount))}</Td>
                      <Td><StatusBadge status={c.status} />{c.status === "APPROVED" && <div className="text-xs text-muted">paid with {monthLabel(toIsoDate(c.claimDate).slice(0, 7))}</div>}</Td>
                      <Td>{c.status === "PENDING" && <ActionButton variant="ghost" action={cancelConveyanceAction.bind(null, c.id)} confirm="Withdraw this claim?">Withdraw</ActionButton>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </div>
        {manage && (
          <div className="space-y-6">
            <Card title={`Waiting for approval (${waiting.length})`}>
              {waiting.length === 0 ? <p className="text-sm text-muted">No claim is waiting.</p> : (
                <ul className="space-y-4">
                  {waiting.map((c) => (
                    <li key={c.id} className="rounded-md border border-line p-3 text-sm">
                      <p className="font-medium">{c.employee.firstName} {c.employee.lastName ?? ""} · {formatDate(c.claimDate)} · {inr(Number(c.amount))}</p>
                      <p className="text-xs text-muted">{place(c)}{c.mode ? ` · ${c.mode}` : ""}{c.totalRunKm ? ` · total run ${Number(c.totalRunKm)} km − home ↔ office ${Number(c.commuteKm ?? 0)} km = ${Number(c.km ?? 0)} km × ₹${Number(c.ratePerKm ?? 0)}` : c.km ? ` · ${Number(c.km)} km` : ""}{c.purpose ? ` · ${c.purpose}` : ""}{c.remark ? ` · ${c.remark}` : ""}</p>
                      {c.billFileId ? <><a href={`/api/files/${c.billFileId}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand-700 hover:underline">View bill</a>{canDeleteFiles(ctx) && <DeleteFileButton fileId={c.billFileId} what="bill" className="ml-2" />}</> : <p className="text-xs text-warn">No bill attached</p>}
                      <div className="mt-2"><ConveyanceDecisionForm action={decideConveyanceAction.bind(null, c.id)} amount={Number(c.amount)} /></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={`Decided · ${monthName(month)}`} padded={false}>
              {decided.length === 0 ? <p className="p-4 text-sm text-muted">Nothing decided for this month.</p> : (
                <Table minWidth={560}>
                  <thead><tr><Th>Team member</Th><Th>Date</Th><Th>Amount</Th><Th>Status</Th></tr></thead>
                  <tbody>
                    {decided.map((c) => (
                      <tr key={c.id}><Td>{c.employee.firstName} {c.employee.lastName ?? ""}</Td><Td className="whitespace-nowrap">{formatDate(c.claimDate)}</Td><Td>{inr(Number(c.amount))}</Td><Td><StatusBadge status={c.status} /></Td></tr>
                    ))}
                  </tbody>
                </Table>
              )}
              <p className="p-3 text-xs text-muted">Approved: {inr(decided.filter((c) => c.status === "APPROVED").reduce((t, c) => t + Number(c.amount), 0))} — added to {monthName(month)} salaries.</p>
            </Card>
          </div>
        )}
      </div>
    );
  }

  /** Salary advances (tracker S.No. 85): recorded with a monthly deduction; the balance updates every month. */
  async function Advances() {
    const [allRows, employees] = await Promise.all([
      advancesOf(ctx.organization.id, null, month),
      prisma.employee.findMany({ where: { organizationId: ctx.organization.id, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } }, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    const rows = allRows.filter((r) => matches(`${r.employee.firstName} ${r.employee.lastName ?? ""}`));
    const open = rows.filter((r) => !r.settled);
    const editId = typeof sp.edit === "string" ? sp.edit : "";
    return (
      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Card title={`Advances · ${monthName(month)}`} padded={false}>
          {rows.length === 0 ? <p className="p-4 text-sm text-muted">No advance recorded.</p> : (
            <Table minWidth={760}>
              <thead><tr><Th>Team member</Th><Th>Given</Th><Th>Advance</Th><Th>Per month</Th><Th>Deducted in {monthName(month)}</Th><Th>Balance after</Th><Th /></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <Td><span className="font-medium">{a.employee.firstName} {a.employee.lastName ?? ""}</span>{a.note && <div className="text-xs text-muted">{a.note}</div>}</Td>
                    <Td className="whitespace-nowrap text-xs">{formatDate(a.givenOn)}<div className="text-muted">from {monthLabel(a.startMonth)}</div></Td>
                    <Td>{inr(a.amount)}</Td>
                    <Td>{inr(a.monthlyDeduction)}</Td>
                    <Td>{a.thisMonth ? <span className="text-danger">−{inr(a.thisMonth)}</span> : "—"}</Td>
                    <Td>{a.settled ? <Badge tone="ok">{a.closedMonth ? "Closed" : "Recovered"}</Badge> : inr(a.balanceAfter)}</Td>
                    <Td>
                      <span className="flex gap-1">
                        <Link href={`/app/payroll?tab=advances&month=${month}&edit=${a.id}`} className="rounded px-2 py-1 text-xs font-medium text-brand-700 hover:bg-subtle">Change</Link>
                        <ActionButton variant="ghost" action={deleteAdvanceAction.bind(null, a.id)} confirm="Remove this advance? Use this only for a mistake: its deductions disappear from payroll.">Remove</ActionButton>
                      </span>
                      {editId === a.id && <div className="mt-2 rounded-md border border-line bg-paper p-2"><AdvanceEditForm action={editAdvanceAction.bind(null, a.id, month)} emi={a.monthlyDeduction} closed={!!a.closedMonth} /></div>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          <p className="p-3 text-xs text-muted">{open.length} open · recovered in {monthName(month)}: {inr(rows.reduce((t, r) => t + r.thisMonth, 0))}. Each month&apos;s deduction appears on the payslip with the balance left; the team member sees it on their payslip.</p>
        </Card>
        <Card title="Record an advance">
          <AdvanceForm action={addAdvanceAction} employees={employees.map((e) => ({ value: e.id, label: `${e.firstName} ${e.lastName ?? ""}`.trim() }))} today={today} month={month} />
        </Card>
      </div>
    );
  }

  async function Salaries() {
    const [allRows, scope] = await Promise.all([salaryOverview(ctx), salaryScope(ctx)]);
    const rows = allRows.filter((r) => matches(r.name, r.code) || r.id === sp.person);
    const person = typeof sp.person === "string" && rows.some((r) => r.id === sp.person) ? sp.person : "";
    const editId = typeof sp.edit === "string" ? sp.edit : "";
    const history = person ? await salaryHistory(ctx, person) : [];
    const editing = history.find((h) => h.id === editId);
    const current = Object.fromEntries(rows.map((r) => [r.id, r.current ? { monthly: r.current.monthly, period: r.current.period, allowance: r.current.allowance } : null]));
    const without = rows.filter((r) => !r.current).length;
    const dueSoon = rows.filter((r) => r.committed?.date && r.committed.date <= dateOnly(toIsoDate(new Date(Date.now() + 31 * 86_400_000)))).length;
    const selected = rows.find((r) => r.id === person);
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted">{scope === "ALL" ? "You can fix and change the salary of everyone in the firm." : "You can fix and change the salary of the people in your team (directly or through their team leads)."} Every change is kept as dated history, the person is notified, and past months keep the salary that applied to them.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="People" value={rows.length} />
          <Stat label="Salary not entered" value={without} tone={without ? "warn" : "ok"} />
          <Stat label="Increments due (31 days)" value={dueSoon} tone={dueSoon ? "info" : "neutral"} />
          <Stat label="Monthly salary bill" value={inr(rows.reduce((s, r) => s + (r.current?.monthly ?? 0), 0))} />
        </div>
        {rows.length === 0 ? <EmptyState kind="people" title="Nobody to show">People appear here once they report to you.</EmptyState> : (
          <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
            <Card title="Current salaries" padded={false}>
              <Table minWidth={900}>
                <thead><tr><Th>Team member</Th><Th>Last salary</Th><Th>Current salary</Th><Th>Increment</Th><Th>Since</Th><Th>Next</Th><Th /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.id === person ? "bg-paper" : undefined}>
                      <Td><span className="font-medium">{r.name}</span><div className="font-mono text-xs text-muted">{r.code}{r.designation ? ` · ${r.designation}` : ""}</div></Td>
                      <Td className="text-xs">{r.previous ? <>{inr(r.previous.monthly)}<div className="text-muted">till {formatDate(r.previous.until)}</div></> : "—"}</Td>
                      <Td>{r.current ? <>{inr(r.current.monthly)}{r.current.allowance ? <div className="text-xs text-muted">+ {inr(r.current.allowance)} allowance</div> : null}{r.current.period === "ANNUAL" && <div className="text-xs text-muted">{inr(r.current.amount)} a year</div>}{r.current.mode && <div className="text-xs text-muted">{r.current.mode === "CASH" ? "Cash" : "Bank transfer"}</div>}</> : <Badge tone="warn">Not entered</Badge>}</Td>
                      <Td className="whitespace-nowrap text-xs">{r.increment ? <Badge tone={r.increment.amount >= 0 ? "ok" : "warn"}>{r.increment.amount >= 0 ? "+" : ""}{inr(r.increment.amount)}{r.increment.percent !== null && ` · ${r.increment.percent}%`}</Badge> : "—"}</Td>
                      <Td className="whitespace-nowrap text-xs">{r.current ? formatDate(r.current.from) : "—"}</Td>
                      <Td className="text-xs">
                        {r.upcoming && <div><Badge tone="info">{inr(r.upcoming.monthly)} from {formatDate(r.upcoming.from)}</Badge></div>}
                        {r.committed?.date && <div className="text-muted">Increment due {formatDate(r.committed.date)}{r.committed.percent ? ` · ${r.committed.percent}%` : r.committed.amount ? ` · ${inr(r.committed.amount)}` : ""}</div>}
                        {!r.upcoming && !r.committed?.date && "—"}
                      </Td>
                      <Td><Link href={`/app/payroll?tab=salaries&person=${r.id}#change`} className="whitespace-nowrap text-sm font-medium text-brand-700 hover:underline">{r.current ? "Change / history" : "Fix salary"}</Link></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <div className="space-y-6">
              <section id="change" className="scroll-mt-24">
                <Card title={selected ? `Change ${selected.name}'s salary` : "Fix or change a salary"} icon={<TrendingUp />}>
                  <SalaryForm key={person} action={setSalaryAction} employees={rows.map((r) => ({ value: r.id, label: r.name }))} today={today} current={current} defaultEmployee={person || undefined} />
                </Card>
              </section>
              {selected && (
                <Card title={`${selected.name} · salary history`} padded={false}>
                  {history.length === 0 ? <p className="p-4 text-sm text-muted">No salary entered yet.</p> : (
                    <ul className="divide-y divide-line text-sm">
                      {history.map((h) => (
                        <li key={h.id} className="p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span><strong>{inr(h.monthly)}</strong> a month from {formatDate(h.effectiveFrom)}{h.previous !== null && <span className="text-muted"> (was {inr(h.previous)})</span>}{h.change && <> · <Badge tone={h.change.amount >= 0 ? "ok" : "warn"}>{h.change.amount >= 0 ? "+" : ""}{inr(h.change.amount)}{h.change.percent !== null && ` (${h.change.percent}%)`}</Badge></>}{h.allowance ? <span className="text-xs text-muted"> · allowance {inr(h.allowance)}</span> : null}</span>
                            <span className="flex gap-1">
                              <Link href={`/app/payroll?tab=salaries&person=${person}&edit=${h.id}#edit`} className="rounded px-2 py-1 text-xs font-medium text-brand-700 hover:bg-subtle">Correct</Link>
                              <ActionButton variant="ghost" action={deleteSalaryAction.bind(null, h.id)} confirm="Remove this salary entry? Use this only for a mistake: the earlier salary applies again.">Remove</ActionButton>
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted">{h.notes ? `${h.notes} · ` : ""}by {h.by ?? "—"} on {formatDateTime(h.at, tz)}</p>
                          {editing?.id === h.id && (
                            <div id="edit" className="mt-3 scroll-mt-24 rounded-lg border border-line bg-paper p-3">
                              <SalaryEditForm action={editSalaryAction.bind(null, h.id)} d={{
                                agreedSalary: String(h.amount), salaryPeriod: h.period, effectiveFrom: toIsoDate(h.effectiveFrom), salaryMode: h.mode ?? "", incrementNotes: h.notes ?? "", fixedAllowance: h.allowance ? String(h.allowance) : "",
                                committedIncrementDate: h.committed.date ? toIsoDate(h.committed.date) : "", committedIncrementPercent: h.committed.percent?.toString() ?? "", committedIncrementAmount: h.committed.amount?.toString() ?? "",
                              }} />
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
}

type SheetRow = Awaited<ReturnType<typeof conveyanceSheet>>[number];

/** One person's month, in the columns of the SSDA conveyance sheet, with the month's total. */
function ConveyanceSheetTable({ rows, rate }: { rows: SheetRow[]; rate: number }) {
  if (!rows.length) return <p className="p-4 text-sm text-muted">No claim this month.</p>;
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const approved = rows.filter((r) => r.status === "APPROVED").reduce((t, r) => t + Number(r.amount), 0);
  const claimed = rows.filter((r) => r.status !== "REJECTED").reduce((t, r) => t + Number(r.amount), 0);
  return (
    <>
      <Table minWidth={900}>
        <thead><tr><Th>Date</Th><Th>Name of client</Th><Th>Total run</Th><Th>Mode</Th><Th>Home ↔ office</Th><Th>KM for office</Th><Th>Rate / km</Th><Th>Amount</Th><Th>Remark</Th><Th>Status</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-nowrap">{formatDate(r.claimDate)}</Td>
              <Td className="text-xs">{r.client?.tradeName ?? r.place ?? "—"}{r.client && r.place ? <div className="text-muted">{r.place}</div> : null}</Td>
              <Td className="text-xs">{isOwnVehicle(r.mode) ? (n(r.totalRunKm) ?? n(r.km) ?? "—") : r.mode ?? "—"}</Td>
              <Td className="text-xs">{r.mode ?? "—"}</Td>
              <Td className="text-xs">{n(r.commuteKm) ?? (isOwnVehicle(r.mode) ? 0 : "—")}</Td>
              <Td className="text-xs">{n(r.km) ?? "—"}</Td>
              <Td className="text-xs">{isOwnVehicle(r.mode) ? `₹${n(r.ratePerKm) ?? rate}` : "—"}</Td>
              <Td className="font-medium">{inr(Number(r.amount))}</Td>
              <Td className="text-xs">{[r.purpose, r.remark].filter(Boolean).join(" · ") || "—"}</Td>
              <Td><StatusBadge status={r.status} /></Td>
            </tr>
          ))}
          <tr className="bg-paper"><Td className="font-semibold" >Total</Td><Td /><Td /><Td /><Td /><Td className="font-semibold">{rows.reduce((t, r) => t + (n(r.km) ?? 0), 0)}</Td><Td /><Td className="font-semibold">{inr(claimed)}</Td><Td /><Td /></tr>
        </tbody>
      </Table>
      <p className="p-3 text-xs text-muted">Approved {inr(approved)} — paid with this month&apos;s salary as “Conveyance reimbursement”. Own vehicle: (total run − home ↔ office km) × ₹{rate} a km.</p>
    </>
  );
}
