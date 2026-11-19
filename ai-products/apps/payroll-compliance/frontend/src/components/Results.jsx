import { Fragment, useMemo, useState } from "react";
import { motion } from "motion/react";
import { inr, shortDate, dateTime } from "@shared/format";
import { fileUrl } from "@shared/api";
import { Stat as Kpi, MailStatus, Btn, Icon, EASE, rise } from "@shared/ui";

const KIND = {
  statutory: ["Statutory", "bg-amber-soft text-amber"],
  data: ["Data", "bg-rose-soft text-rose"],
  info: ["Review", "bg-paper-2 text-muted"],
};
const INPUT_LABELS = { master: "Employee salary master", attendance: "Attendance & leave", inputs: "Payroll inputs", rules: "Statutory rule configuration", notes: "Payroll test notes" };
const rupees = (n, o = {}) => inr(n, { dp: 2, ...o });
const r0 = (n, o = {}) => inr(n, { dp: 0, ...o });

export default function Results({ meta, result: r, onResend, resending }) {
  const st = r.stats;
  const pdf = fileUrl(`/runs/${meta.id}/pdf`);
  const xlsx = fileUrl(`/runs/${meta.id}/xlsx`);

  return (
    <div className="space-y-6">
      <motion.div {...rise()} className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] ${st.dataExceptions ? "bg-rose-soft text-rose" : "bg-amber-soft text-amber"}`}>
              <span className="size-1.5 rounded-full bg-current" />{st.exceptions} exception{st.exceptions === 1 ? "" : "s"} · draft
            </span>
            <span className="label">{r.period.code || "period not stated"}</span>
          </div>
          <h1 className="mt-3 text-[clamp(1.8rem,3.4vw,2.6rem)] font-medium leading-[1.05]">Payroll · {r.period.label}</h1>
          <p className="mt-1 text-muted">{r.title} · {r.subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MailStatus mail={meta.mail} onResend={onResend} busy={resending} />
          <Btn to={`/chat/${meta.id}`} variant="lime" icon="ai">Ask AI</Btn>
          <Btn href={pdf} target="_blank" variant="line" icon="file">View PDF</Btn>
          <Btn href={`${pdf}?download=1`} variant="line" icon="download">PDF</Btn>
          <Btn href={xlsx} icon="download">Excel</Btn>
        </div>
        <p className="w-full font-mono text-[11px] text-muted">Run {meta.id} · {dateTime(meta.createdAt)} · {Object.values(meta.inputs || {}).join(" + ")}</p>
      </motion.div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi i={1} label="Employees" value={st.employees} note={st.excluded ? `${st.excluded} excluded (joining / exit outside the period)` : `${st.withLop} with loss of pay · ${st.withOt} with overtime`} />
        <Kpi i={2} label="Gross before statutory" value={r0(r.totals.gross)} note={`Fixed ${r0(r.totals.fixed)} − LOP ${r0(r.totals.lop)} + variable pay`} />
        <Kpi i={3} label="Net before statutory" value={r0(r.totals.net)} note={`After ${r0(r.totals.advance + r.totals.otherDeduction)} recoveries & deductions`} tone="good" />
        <Kpi i={4} label="Exceptions" value={st.exceptions} note={`${st.exceptions - st.dataExceptions} statutory / review · ${st.dataExceptions} data`} tone={st.dataExceptions ? "bad" : "warn"} />
      </div>

      <motion.div {...rise(5)} className="rounded-2xl border border-ink/8 bg-white/60 px-5 py-4 text-[15px] leading-relaxed">
        <p><b>Open checks:</b> {r.openChecks}</p>
        <p className="mt-1 text-muted"><b className="text-ink">Approval:</b> {r.approval} PF, ESI, professional tax and salary TDS are not deducted until eligibility, current rates and declarations are validated.</p>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="min-w-0 space-y-6 lg:col-span-5">
          <Control r={r} />
          <Bridge r={r} />
        </div>
        <motion.section {...rise(7)} className="min-w-0 lg:col-span-7">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-medium">Exceptions</h2>
            <span className="label">{r.exceptions.length} to resolve</span>
          </div>
          <ul className="mt-3 space-y-2.5">
            {r.exceptions.map((x, i) => (
              <motion.li key={i} initial={{ y: 8 }} animate={{ y: 0 }} transition={{ delay: 0.25 + i * 0.03, ease: EASE, duration: 0.5 }} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-block rounded-md px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${KIND[x.kind]?.[1]}`}>{KIND[x.kind]?.[0]}</span>
                  <span className="font-mono text-[13px] font-semibold">{x.employee}</span>
                </div>
                <p className="mt-2 text-[15px] leading-snug">{x.issue}</p>
                <p className="mt-1.5 flex gap-1.5 text-sm leading-relaxed text-muted"><Icon name="arrow" className="mt-0.5 size-3.5 shrink-0" />{x.action}</p>
              </motion.li>
            ))}
          </ul>
          {r.reviewNotes?.length > 0 && <Notes r={r} />}
        </motion.section>
      </div>

      <Register r={r} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Rules r={r} />
        <Sources meta={meta} r={r} />
      </div>
    </div>
  );
}

function Control({ r }) {
  return (
    <motion.section {...rise(6)} className="card overflow-hidden">
      <h2 className="px-5 pt-5 text-lg font-medium">Control summary</h2>
      <table className="mt-3 w-full text-sm">
        <tbody className="num divide-y divide-ink/6 border-t border-ink/8">
          {r.control.map(([k, v]) => (
            <tr key={k}><td className="px-5 py-2.5 text-muted">{k}</td><td className="px-5 py-2.5 text-right font-mono">{typeof v === "number" && /total/i.test(k) ? rupees(v) : /status/i.test(k) ? <span className="font-sans text-amber">{v}</span> : v}</td></tr>
          ))}
        </tbody>
      </table>
    </motion.section>
  );
}

/** Fixed pay → gross → net for the whole payroll, as a bridge. */
function Bridge({ r }) {
  const t = r.totals;
  const steps = [
    ["Fixed pay", t.fixed, "total"], ["Loss of pay", -t.lop], ["Incentives", t.incentive], ["Reimbursements", t.reimbursement], ["Overtime", t.otPay],
    ["Gross before statutory", t.gross, "total"], ["Advance recovery", -t.advance], ["Other deductions", -t.otherDeduction], ["Net before statutory", t.net, "total"],
  ].filter(([, v, k]) => k || Math.abs(v) > 0.004);
  const max = Math.max(...steps.map(([, v]) => Math.abs(v)), 1);
  return (
    <motion.section {...rise(7)} className="card p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium">Gross to net</h2>
        <span className="label">All employees</span>
      </div>
      <ul className="num mt-4 space-y-2 text-[13px]">
        {steps.map(([l, v, k], i) => (
          <li key={l} className={`grid grid-cols-[minmax(0,1fr)_minmax(60px,38%)_auto] items-center gap-3 ${k ? "font-medium" : ""}`}>
            <span className={`truncate ${k ? "" : "pl-3 text-muted"}`}>{l}</span>
            <span className="relative h-2 rounded-full bg-ink/6">
              <motion.span className={`absolute inset-y-0 left-0 rounded-full ${k ? "bg-ink/70" : v >= 0 ? "bg-teal" : "bg-rose/70"}`}
                initial={{ width: 0 }} animate={{ width: `${Math.max(2, (Math.abs(v) / max) * 100)}%` }} transition={{ delay: 0.3 + i * 0.05, duration: 0.7, ease: EASE }} />
            </span>
            <span className={`text-right font-mono ${k ? "" : v < 0 ? "text-rose" : "text-teal-ink"}`}>{k ? r0(v) : r0(v, { sign: true })}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-ink/8 pt-3 text-[12.5px] text-muted">LOP = fixed pay × unpaid days ÷ {r.period.denominator || "calendar"}-day basis. Statutory deductions are not applied.</p>
    </motion.section>
  );
}

function Notes({ r }) {
  return (
    <div className="card mt-6 p-5">
      <h2 className="text-lg font-medium">Test notes vs result</h2>
      <p className="mt-1 text-sm text-muted">Each scenario from the uploaded notes, next to what the payroll run shows.</p>
      <ul className="mt-4 space-y-3 text-sm">
        {r.reviewNotes.map((n, i) => (
          <li key={i} className="grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-3">
            <span className="h-fit w-fit rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[11px]">{n.id}</span>
            <span>
              <span className="text-muted">{n.text}</span>
              {n.found.map((f) => (
                <span key={f.id} className="mt-1 flex items-start gap-1.5 text-[13px] text-teal-ink">
                  <Icon name="check" className="mt-0.5 size-3.5 shrink-0" />
                  <span>{f.id}: LOP {rupees(f.lop)} · gross {rupees(f.gross)} · net {rupees(f.net)}{f.exceptions.length ? ` — ${f.exceptions.join("; ")}` : ""}</span>
                </span>
              ))}
              {!n.found.length && <span className="mt-1 block font-mono text-[11px] text-muted">applies to the whole run — see exceptions</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const COLS = [["Employee", ""], ["Days basis", "r"], ["Unpaid", "r"], ["LOP", "r"], ["Incentive", "r"], ["Reimb.", "r"], ["OT", "r"], ["Gross", "r"], ["Advance", "r"], ["Other ded.", "r"], ["Net", "r"], ["Status", ""]];

function Register({ r }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return r.register.filter((x) => !n || `${x.id} ${x.name} ${x.department} ${x.status}`.toLowerCase().includes(n));
  }, [r.register, q]);
  const money = (v, cls = "") => <td className={`px-3 py-3 text-right font-mono ${cls}`}>{v ? rupees(v) : <span className="text-muted">—</span>}</td>;

  return (
    <motion.section {...rise(9)} className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-lg font-medium">Payroll register <span className="font-mono text-sm text-muted">{r.register.length}</span></h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee, department…" className="h-9 w-full rounded-full border border-ink/12 bg-white px-4 text-sm outline-none focus:border-teal sm:w-72" />
      </div>
      <p className="mt-1 px-5 text-sm text-muted">Select a row to see the salary components and attendance behind it.</p>
      <div className="mt-3 overflow-x-auto border-t border-ink/8">
        <table className="w-full min-w-[1100px] text-[13px]">
          <thead><tr className="text-left">{COLS.map(([h, a]) => <th key={h} className={`label px-3 py-3 font-medium ${a ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody className="num divide-y divide-ink/6">
            {rows.map((x) => (
              <Fragment key={x.id}>
                <tr onClick={() => setOpen(open === x.id ? null : x.id)} className={`cursor-pointer align-top hover:bg-paper-2/40 ${open === x.id ? "bg-paper-2/40" : ""}`}>
                  <td className="px-3 py-3"><span className="font-mono">{x.id}</span><span className="block whitespace-nowrap text-[12px] text-muted">{x.name}{x.department ? ` · ${x.department}` : ""}</span></td>
                  <td className="px-3 py-3 text-right font-mono">{x.daysBasis}</td>
                  <td className="px-3 py-3 text-right font-mono">{x.unpaid || <span className="text-muted">0</span>}{x.notEmployed ? <span className="block text-[11px] text-amber">+{x.notEmployed} not employed</span> : null}</td>
                  {money(x.lop, x.lop ? "text-rose" : "")}
                  {money(x.incentive)}
                  {money(x.reimbursement)}
                  <td className="px-3 py-3 text-right font-mono">{x.otPay ? rupees(x.otPay) : <span className="text-muted">—</span>}{x.otHours ? <span className="block text-[11px] text-muted">{x.otHours}h × {x.otRate}</span> : null}</td>
                  {money(x.gross, "font-medium")}
                  {money(x.advance)}
                  {money(x.otherDeduction)}
                  {money(x.net, "font-medium text-teal-ink")}
                  <td className="min-w-[200px] max-w-[260px] px-3 py-3 text-[12px] text-muted">{x.status}</td>
                </tr>
                {open === x.id && (
                  <tr className="bg-paper-2/30">
                    <td colSpan={COLS.length} className="px-5 py-4">
                      <div className="grid gap-6 text-[13px] sm:grid-cols-3">
                        <div>
                          <p className="label">Fixed pay</p>
                          <ul className="mt-2 space-y-1">{x.components.map(([k, v]) => <li key={k} className="flex justify-between gap-4"><span className="text-muted">{k}</span><span className="font-mono">{rupees(v)}</span></li>)}
                            <li className="flex justify-between gap-4 border-t border-ink/8 pt-1 font-medium"><span>Total</span><span className="font-mono">{rupees(x.fixed)}</span></li></ul>
                        </div>
                        <div>
                          <p className="label">Attendance</p>
                          {x.attendance ? (
                            <ul className="mt-2 space-y-1">{[["Calendar days", x.attendance.calendarDays], ["Weekly offs / holidays", x.attendance.offs], ["Paid leave", x.attendance.paidLeave], ["Unpaid leave", x.attendance.unpaidLeave], ["Present", x.attendance.present]].map(([k, v]) => <li key={k} className="flex justify-between gap-4"><span className="text-muted">{k}</span><span className="font-mono">{v}</span></li>)}</ul>
                          ) : <p className="mt-2 text-amber">No attendance record</p>}
                        </div>
                        <div>
                          <p className="label">Computation</p>
                          <ul className="mt-2 space-y-1 text-muted">
                            <li>LOP = {rupees(x.fixed)} × {x.unpaid + x.notEmployed} ÷ {x.daysBasis} = <b className="font-mono font-medium text-ink">{rupees(x.lop)}</b></li>
                            <li>Payable days {x.payableDays} of {x.daysBasis}</li>
                            {x.joiningDate && <li>Joined {shortDate(x.joiningDate)}{x.exitDate ? ` · exit ${shortDate(x.exitDate)}` : ""}</li>}
                          </ul>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {!rows.length && <tr><td colSpan={COLS.length} className="px-4 py-8 text-center text-muted">No employees for this search.</td></tr>}
          </tbody>
          <tfoot className="num border-t-2 border-ink/10 font-medium">
            <tr>
              <td className="px-3 py-3">Total</td><td /><td />
              {["lop", "incentive", "reimbursement", "otPay", "gross", "advance", "otherDeduction", "net"].map((k) => <td key={k} className="px-3 py-3 text-right font-mono">{rupees(r.totals[k])}</td>)}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {r.excluded?.length > 0 && <p className="border-t border-ink/8 px-5 py-3 text-sm text-amber">Not in this payroll: {r.excluded.map((e) => `${e.id} ${e.name} (${e.reason})`).join("; ")}.</p>}
    </motion.section>
  );
}

function Rules({ r }) {
  return (
    <motion.section {...rise(10)} className="card min-w-0 overflow-hidden">
      <h2 className="px-5 pt-5 text-lg font-medium">Rule configuration</h2>
      <p className="mt-1 px-5 text-sm text-muted">As supplied. Rates are used only for illustration in exceptions — nothing statutory is deducted.</p>
      {r.rules.length ? (
        <ul className="mt-3 divide-y divide-ink/6 border-t border-ink/8 text-[13px]">
          {r.rules.map((x) => (
            <li key={x.name} className="grid gap-1 px-5 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
              <span className="min-w-0"><span className="break-all font-mono text-[12px]">{x.name}</span>{x.notes && <span className="block text-[12px] text-muted">{x.notes}</span>}</span>
              <span className="font-mono sm:text-right">{x.value}</span>
            </li>
          ))}
        </ul>
      ) : <p className="px-5 py-5 text-sm text-amber">No rule configuration uploaded.</p>}
    </motion.section>
  );
}

function Sources({ meta, r }) {
  return (
    <motion.section {...rise(10)} className="card min-w-0 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">Source files</h2>
        <Btn to={`/chat/${meta.id}`} variant="ghost" icon="ai" className="-mr-2">Chat with these files</Btn>
      </div>
      <ul className="mt-4 grid gap-3">
        {Object.entries(meta.inputs || {}).map(([k, name]) => {
          const d = r.detection[k];
          return (
            <li key={k} className="min-w-0 rounded-xl border border-ink/8 bg-white/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="label">{INPUT_LABELS[k]}</p>
                  <p className="mt-1 truncate font-mono text-[13px]" title={name}>{name}</p>
                  <p className="text-[12px] text-muted">{d?.rows ?? 0} row{d?.rows === 1 ? "" : "s"}</p>
                </div>
                <a href={fileUrl(`/runs/${meta.id}/inputs/${k}`)} className="grid size-9 shrink-0 place-items-center rounded-full border border-ink/12 text-muted hover:border-ink/40 hover:text-ink" aria-label={`Download ${name}`}><Icon name="download" className="size-4" /></a>
              </div>
              {d?.columns && Object.keys(d.columns).length > 0 && (
                <p className="mt-2.5 flex flex-wrap gap-1">{Object.values(d.columns).map((c) => <span key={c} className="break-all rounded bg-paper-2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">{c}</span>)}</p>
              )}
            </li>
          );
        })}
      </ul>
    </motion.section>
  );
}
