import { Link } from "react-router";
import { motion } from "motion/react";
import { useApi } from "@shared/api";
import { Btn, Stat, Steps, Badge, Icon, rise, EASE } from "@shared/ui";
import { inr, ago } from "@shared/format";

export default function Overview() {
  const { data } = useApi("/runs");
  const runs = data?.runs || [];
  const last = runs[0];
  const open = runs.reduce((s, r) => s + (r.stats?.exceptions || 0), 0);

  return (
    <>
      <motion.section {...rise()} className="relative overflow-hidden rounded-3xl bg-ink px-6 py-10 text-paper sm:px-10 sm:py-14">
        <div className="grid-bg absolute inset-0" aria-hidden />
        <div className="relative grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="min-w-0 lg:col-span-7">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">Payroll Processing & Statutory Compliance</p>
            <h1 className="mt-4 text-[clamp(2.2rem,4.6vw,3.6rem)] font-medium leading-[1.02]">Gross to net for every employee, <span className="text-lime">checked before it's paid</span>.</h1>
            <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-mist">
              Upload the salary master, attendance, payroll inputs and rule configuration. Loss of pay, overtime, incentives and recoveries are
              computed, PF, ESI, PT and TDS gaps are flagged instead of guessed, and the summary goes to the team as soon as it's ready.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              <Btn to="/new" variant="lime" icon="plus" className="h-12 px-6">New payroll run</Btn>
              <Btn to="/help" variant="ghost" className="h-12 px-5 !text-mist hover:!text-paper hover:!bg-white/5">How it works</Btn>
            </div>
          </div>
          <PayVisual />
        </div>
      </motion.section>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat i={1} label="Payroll runs" value={runs.length} note={last ? `Last ${ago(last.createdAt)}` : "None yet"} />
        <Stat i={2} label="Employees (latest)" value={last ? last.stats?.employees : "—"} note={last ? last.period?.label : "No runs yet"} />
        <Stat i={3} label="Net before statutory (latest)" value={last ? inr(last.stats?.net, { dp: 0 }) : "—"} note={last ? `Gross ${inr(last.stats?.gross, { dp: 0 })}` : "No runs yet"} />
        <Stat i={4} label="Open exceptions" value={open} tone={open ? "warn" : "good"} note="Across all runs" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <motion.section {...rise(5)} className="card min-w-0 lg:col-span-7">
          <div className="flex items-baseline justify-between px-5 pt-5">
            <h2 className="text-lg font-medium">Recent payroll runs</h2>
            <Link to="/runs" className="text-sm text-teal-ink hover:underline">View all</Link>
          </div>
          <ul className="mt-3 divide-y divide-ink/6">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link to={`/runs/${r.id}`} className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-paper-2/40">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">Payroll · {r.period?.label}</span>
                    <span className="font-mono text-[11px] text-muted">{r.stats?.employees} employees · {ago(r.createdAt)}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="num hidden font-mono text-sm sm:inline">{inr(r.stats?.net, { dp: 0 })}</span>
                    <Badge tone={r.stats?.dataExceptions ? "bad" : "warn"} dot>{r.stats?.exceptions} checks</Badge>
                  </span>
                </Link>
              </li>
            ))}
            {!runs.length && <li className="px-5 py-10 text-center text-sm text-muted">No payroll runs yet — <Link to="/new" className="text-teal-ink underline">start one</Link>.</li>}
          </ul>
        </motion.section>
        <motion.section {...rise(6)} className="card min-w-0 p-5 lg:col-span-5">
          <h2 className="text-lg font-medium">What gets caught</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {[["Loss of pay", "Unpaid leave and days before joining or after exit"], ["Statutory gaps", "PF flags, ESI thresholds, PT state rules and TDS declarations not configured"],
              ["Data gaps", "Missing attendance, overtime without a rate, employees outside the master"], ["Joining & exit dates", "Joiners and leavers checked against the payroll month"]].map(([t, d]) => (
              <li key={t} className="flex gap-3"><span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-teal/12 text-teal-ink"><Icon name="check" className="size-3.5" strokeWidth={2.2} /></span><span><b className="font-medium">{t}.</b> <span className="text-muted">{d}</span></span></li>
            ))}
          </ul>
        </motion.section>
      </div>

      <div className="mt-6">
        <Steps items={[["Read", "Salary master, attendance, inputs and rules are recognised from their column headers."], ["Compute", "Fixed pay, loss of pay, overtime, incentives and recoveries for every employee."],
          ["Check", "Statutory settings and data gaps become exceptions with the action required."], ["Report", "PDF summary and Excel register; the PDF is emailed straight away."]]} />
      </div>
    </>
  );
}

/** One employee's pay flowing from fixed pay to net. */
function PayVisual() {
  const bars = [["Fixed", 59000, "#f3f5f1"], ["− LOP", -3933, "#b5d661"], ["Gross", 55067, "#4fb3ac"], ["− Advance", -2000, "#b5d661"], ["Net", 53067, "#4fb3ac"]];
  const max = 59000;
  return (
    <div className="relative hidden h-[230px] lg:col-span-5 lg:block" aria-hidden>
      <svg viewBox="0 0 360 230" className="h-full w-full">
        <text x="0" y="12" fill="#9aa7bd" fontSize="10" fontFamily="JetBrains Mono Variable, monospace">E002 · JUNE 2026</text>
        {bars.map(([l, v, c], i) => {
          const y = 26 + i * 40;
          const w = (Math.abs(v) / max) * 220;
          return (
            <g key={l}>
              <text x="0" y={y + 17} fill="#9aa7bd" fontSize="10.5" fontFamily="JetBrains Mono Variable, monospace">{l}</text>
              <motion.rect x="76" y={y + 4} height="18" rx="5" fill={c} fillOpacity={v < 0 ? 0.9 : 0.85} initial={{ width: 0 }} animate={{ width: Math.max(w, 6) }} transition={{ delay: 0.4 + i * 0.18, duration: 0.7, ease: EASE }} />
              <text x={76 + Math.max(w, 6) + 8} y={y + 17} fill="#f3f5f1" fontSize="10.5" fontFamily="JetBrains Mono Variable, monospace">{v < 0 ? "−" : ""}₹{Math.abs(v).toLocaleString("en-IN")}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
