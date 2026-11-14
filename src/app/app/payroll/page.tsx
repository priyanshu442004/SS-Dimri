import Link from "next/link";
import { IndianRupee, TrendingUp, Wallet } from "lucide-react";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { dateOnly, formatDate, formatDateTime, isoDateInTz, minutesToHhmm, toIsoDate } from "@/lib/dates";
import { payrollForMonth, salaryHistory, salaryOverview, salaryScope, validMonth, type PayrollRow } from "@/lib/services/payroll";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, DetailList, DownloadButton, EmptyState, Notice, PageHeader, Stat, TabNav, Table, Td, Th } from "@/components/ui";
import { deleteSalaryAction, editSalaryAction, setSalaryAction } from "./actions";
import { SalaryEditForm, SalaryForm } from "./forms";
import { PrintButton } from "./print-button";

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
  const tab = sp.tab === "team" && manage ? "team" : sp.tab === "salaries" && salaries ? "salaries" : "mine";

  return (
    <>
      <PageHeader
        icon={<Wallet />}
        title="Payroll"
        description="Monthly pay worked out from attendance, leave and the office rules: every deduction and addition is listed."
        actions={
          <span className="flex flex-wrap items-center gap-2">
            {tab === "team" && <DownloadButton href={`/app/payroll/export?month=${month}`}>Export to Excel</DownloadButton>}
            {tab === "mine" && <PrintButton />}
          </span>
        }
      />
      {(manage || salaries) && (
        <TabNav current={tab} tabs={[
          { key: "mine", label: "My payslip", href: `/app/payroll?month=${month}` },
          ...(manage ? [{ key: "team", label: "Team payroll", href: `/app/payroll?tab=team&month=${month}` }] : []),
          ...(salaries ? [{ key: "salaries", label: "Salaries", href: "/app/payroll?tab=salaries" }] : []),
        ]} />
      )}
      {tab !== "salaries" && (
        <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
          {tab === "team" && <input type="hidden" name="tab" value="team" />}
          <label className="text-sm">
            <span className="mb-1 block font-medium">Month</span>
            <input type="month" name="month" defaultValue={month} max={today.slice(0, 7)} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" />
          </label>
          <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show</button>
        </form>
      )}
      {tab === "team" ? <Team /> : tab === "salaries" ? <Salaries /> : <Mine />}
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
          [`No-leave bonus${r.pay.bonusDays ? ` (${days(r.pay.bonusDays)})` : ""}`, r.pay.bonus ? `+ ${inr(r.pay.bonus)}` : s.tookLeave ? "Not this month" : "Added when the month is complete"],
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
        <Card title={`Payslip · ${monthName(month)}`}>
          {r.monthlySalary === null && <div className="mb-4"><Notice tone="info">Your salary has not been entered yet. Ask your manager or administrator to add it.</Notice></div>}
          <DetailList items={[["Name", r.name], ["Employee ID", r.code], ["Designation", r.designation], ["Department", r.department]]} />
          <div className="mt-4"><Breakdown r={r} perDayLabel per={p.policy.numbers.lateArrivalsPerHalfDay} /></div>
          <p className="mt-4 text-xs text-muted print:hidden">How each rule works is on the <Link href="/app/rules" className="underline">office rules</Link> page; your day-by-day record is under <Link href={`/app/attendance?month=${month}`} className="underline">My attendance</Link>.</p>
        </Card>
        {history.length > 0 && (
          <Card title="My salary history" icon={<TrendingUp />} className="print:hidden" padded={false}>
            <Table minWidth={520}>
              <thead><tr><Th>From</Th><Th>Salary</Th><Th>Change</Th><Th>Note</Th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <Td className="whitespace-nowrap">{formatDate(h.effectiveFrom)}{h.effectiveFrom > dateOnly(today) && <div><Badge tone="info">Upcoming</Badge></div>}</Td>
                    <Td>{inr(h.monthly)} a month</Td>
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

  async function Team() {
    const p = await payrollForMonth(ctx, month);
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
          <Card title={`${open.name} · ${monthName(month)}`} actions={<Link href={`/app/payroll?tab=team&month=${month}`} className="text-xs text-muted hover:text-ink">Close</Link>}>
            <Breakdown r={open} per={p.policy.numbers.lateArrivalsPerHalfDay} />
          </Card>
        )}
        <Table minWidth={1260}>
          <thead><tr><Th>Team member</Th><Th>Monthly salary</Th><Th>Present</Th><Th>Leave (paid / unpaid)</Th><Th>Absent</Th><Th>Late</Th><Th>½ days (late / early)</Th><Th>Days deducted</Th><Th>Payable days</Th><Th>Overtime</Th><Th>Bonus</Th><Th>Fines</Th><Th>{p.complete ? "Net pay" : "Earned so far"}</Th></tr></thead>
          <tbody>
            {p.rows.map((r) => {
              const s = r.score;
              return (
                <tr key={r.employeeId}>
                  <Td><Link href={`/app/payroll?tab=team&month=${month}&person=${r.employeeId}`} className="font-medium hover:underline">{r.name}</Link><div className="font-mono text-xs text-muted">{r.code}{r.designation ? ` · ${r.designation}` : ""}</div></Td>
                  <Td>{r.monthlySalary === null ? <Link href={`/app/payroll?tab=salaries&person=${r.employeeId}`} className="text-xs font-medium text-warn underline">Not entered</Link> : inr(r.monthlySalary)}</Td>
                  <Td>{s.worked + s.halfDays * 0.5}</Td>
                  <Td>{s.paidLeave} / {s.unpaidLeave + s.excessLeave + s.sandwichDays}</Td>
                  <Td>{s.absent}{s.absentUnrequested > 0 && <div className="text-xs text-danger">{s.absentUnrequested} unrequested (×2)</div>}</Td>
                  <Td>{s.lateArrivals + s.veryLateArrivals}{s.lateExcused > 0 && <div className="text-xs text-muted">{s.lateExcused} excused</div>}</Td>
                  <Td>{s.lateHalfDays} / {s.earlyHalfDays}</Td>
                  <Td className={s.unpaidDays ? "font-medium text-danger" : ""}>{s.unpaidDays}</Td>
                  <Td>{s.payableDays}</Td>
                  <Td className="text-xs">{s.overtimeMinutes ? <>{minutesToHhmm(s.overtimeMinutes)}<div>{inr(r.pay.overtimePay)}</div></> : "—"}</Td>
                  <Td className="text-xs">{r.pay.bonus ? inr(r.pay.bonus) : "—"}</Td>
                  <Td className="text-xs">{r.fines.amount ? <span className="text-danger">{inr(r.fines.amount)}</span> : "—"}</Td>
                  <Td className="font-medium">{inr(r.pay.net)}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        <p className="text-xs text-muted">Click a name for the full breakdown. Payroll follows the office rules in Settings → Leave &amp; timing policy. The firm owner is not on the payroll.</p>
      </div>
    );
  }

  async function Salaries() {
    const [rows, scope] = await Promise.all([salaryOverview(ctx), salaryScope(ctx)]);
    const person = typeof sp.person === "string" && rows.some((r) => r.id === sp.person) ? sp.person : "";
    const editId = typeof sp.edit === "string" ? sp.edit : "";
    const history = person ? await salaryHistory(ctx, person) : [];
    const editing = history.find((h) => h.id === editId);
    const current = Object.fromEntries(rows.map((r) => [r.id, r.current ? { monthly: r.current.monthly, period: r.current.period } : null]));
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
              <Table minWidth={720}>
                <thead><tr><Th>Team member</Th><Th>Salary a month</Th><Th>Since</Th><Th>Next</Th><Th /></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.id === person ? "bg-paper" : undefined}>
                      <Td><span className="font-medium">{r.name}</span><div className="font-mono text-xs text-muted">{r.code}{r.designation ? ` · ${r.designation}` : ""}</div></Td>
                      <Td>{r.current ? <>{inr(r.current.monthly)}{r.current.period === "ANNUAL" && <div className="text-xs text-muted">{inr(r.current.amount)} a year</div>}{r.current.mode && <div className="text-xs text-muted">{r.current.mode === "CASH" ? "Cash" : "Bank transfer"}</div>}</> : <Badge tone="warn">Not entered</Badge>}</Td>
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
                            <span><strong>{inr(h.monthly)}</strong> a month from {formatDate(h.effectiveFrom)}{h.change && <> · <Badge tone={h.change.amount >= 0 ? "ok" : "warn"}>{h.change.amount >= 0 ? "+" : ""}{inr(h.change.amount)}{h.change.percent !== null && ` (${h.change.percent}%)`}</Badge></>}</span>
                            <span className="flex gap-1">
                              <Link href={`/app/payroll?tab=salaries&person=${person}&edit=${h.id}#edit`} className="rounded px-2 py-1 text-xs font-medium text-brand-700 hover:bg-subtle">Correct</Link>
                              <ActionButton variant="ghost" action={deleteSalaryAction.bind(null, h.id)} confirm="Remove this salary entry? Use this only for a mistake: the earlier salary applies again.">Remove</ActionButton>
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted">{h.notes ? `${h.notes} · ` : ""}by {h.by ?? "—"} on {formatDateTime(h.at, tz)}</p>
                          {editing?.id === h.id && (
                            <div id="edit" className="mt-3 scroll-mt-24 rounded-lg border border-line bg-paper p-3">
                              <SalaryEditForm action={editSalaryAction.bind(null, h.id)} d={{
                                agreedSalary: String(h.amount), salaryPeriod: h.period, effectiveFrom: toIsoDate(h.effectiveFrom), salaryMode: h.mode ?? "", incrementNotes: h.notes ?? "",
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
