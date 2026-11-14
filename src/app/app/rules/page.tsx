import Link from "next/link";
import { BookOpenCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDateTime, hhmmToMinutes } from "@/lib/dates";
import { hhmm } from "@/lib/domain/attendance-policy";
import { getPolicy, hasAcceptedRules, scheduleOf } from "@/lib/services/office-rules";
import { ActionButton } from "@/components/action-button";
import { Card, Notice, PageHeader } from "@/components/ui";
import { acceptRulesAction } from "./actions";

export const metadata = { title: "Office rules" };

/**
 * The firm's Leave, Timing and Office Decorum Rules and Regulations, written out with the values
 * set in Settings (so the page and the system never disagree), and the declaration to accept.
 */
export default async function RulesPage() {
  const ctx = await requireCapability("app.use");
  const policy = await getPolicy(ctx.organization.id);
  const p = policy.row;
  const n = policy.numbers;
  const tz = ctx.organization.timezone;
  const office = scheduleOf(policy, null);
  const lunchLen = hhmmToMinutes(p.lunchEnd) - hhmmToMinutes(p.lunchStart);
  const me = ctx.employee ? await prisma.employee.findUnique({ where: { id: ctx.employee.id }, select: { rulesAcknowledgedAt: true } }) : null;
  const accepted = hasAcceptedRules(me?.rulesAcknowledgedAt ?? null, p.updatedAt);
  const t = (v: string) => {
    const [h, m] = v.split(":").map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  };
  const otFrom = t(hhmm(hhmmToMinutes(p.leavingGraceUntil) + 1));

  const sections: { title: string; points: React.ReactNode[] }[] = [
    {
      title: "1. Attendance",
      points: [
        "Marking attendance in the ERP every day is mandatory for every employee. Regular attendance is a necessary condition of employment.",
        <>Attendance is a system-driven process. <strong>No human intervention is allowed</strong> in marking or changing attendance.</>,
        <>Attendance must be marked with the <strong>map location</strong> captured by the ERP. Attendance marked without the map will <strong>not be considered</strong> — the ERP does not accept a mark without it.</>,
        <>Any attendance not marked in the ERP at the time of salary calculation will <strong>not be considered</strong>. No exception will be made.</>,
        "Not every team member holds a senior position today, but every one is expected to be on the path to becoming a successful and sensible professional. An employee who cannot adopt small updates that build a disciplined working environment will find it difficult to adopt the many more that are in the pipeline, and this holds back the organisation too. The organisation cannot spend its energy again and again to make everyone understand why each rule is important. The ERP is the backbone of our organisation, and this has been communicated clearly. Nothing that creates a problem in implementing the ERP will be accepted. Every employee must adapt, so that the system is followed fully, has an impact on everyone, and its results can be measured.",
      ],
    },
    {
      title: "2. Daily ERP updates",
      points: [
        <><strong>Check-in and check-out:</strong> time-stamped in the ERP, with map location and work location ({p.officeName} / Client Office / Client Visit). <Link href="/app/attendance" className="text-brand-700 underline">Attendance</Link></>,
        <><strong>Morning plan:</strong> each employee enters the day&apos;s tasks (client, task, expected completion) by {t(p.morningPlanBy)}. The Team Lead can approve or edit it. <Link href="/app/timesheet?tab=plan" className="text-brand-700 underline">Plan &amp; EOD</Link></>,
        <><strong>EOD report (Timesheet):</strong> filling the EOD report in the ERP is <strong>mandatory</strong>. It is our timesheet and is part of the ERP. It records the status of old work and new work, marked Done / Pending / Carried Forward, with a reason for each pending item.</>,
        <><strong>Missed EOD report:</strong> if an employee forgets to fill the EOD report, the only option is to update the timesheet in the ERP <strong>before the next day&apos;s reporting time</strong>.</>,
        <><strong>Penalty for non-filing:</strong> if the timesheet is not updated, the employee is fined <strong>Rs. {p.eodPenaltyRupees}</strong> for non-filing of timesheet. If the Team Lead does not escalate the matter immediately the next day, the Team Lead is also penalised <strong>Rs. {p.leadPenaltyRupees}</strong>. Fines are deducted in Payroll.</>,
        <><strong>Team Lead responsibility:</strong> the Team Lead must check pending timesheets the next day, tell the employee to update them and escalate the matter immediately (Timesheet → Team plans &amp; EOD → Escalate). Every employee and Team Lead is expected to take the initiative and act with a sense of responsibility.</>,
        <><strong>Late or absent intimation:</strong> a form in the ERP, with reason and expected arrival time. <Link href="/app/attendance?tab=requests" className="text-brand-700 underline">Inform / request</Link></>,
        <><strong>Overtime request:</strong> a form in the ERP (see Sections 8 and 9).</>,
        <><strong>Auto-flags:</strong> a missing morning plan or EOD report is flagged to the Team Lead.</>,
      ],
    },
    {
      title: "3. Reporting on time",
      points: [
        <>Employees must report as scheduled. If you are going to be late, or have any issue, update it in the ERP <strong>before</strong> your reporting time. Do not wait for a senior to ask. <strong>At {t(p.autoAbsentAt)} the ERP marks the employee Absent automatically, and attendance cannot be changed to Present after that.</strong></>,
      ],
    },
    { title: "4. Team Lead reporting", points: ["It is mandatory to report to your Team Lead: the day's schedule in the morning, and the EOD report on old and new work."] },
    {
      title: "5. Office timings",
      points: [
        <>Office timing (in-office team): <strong>{t(p.officeStart)} – {t(p.officeEnd)}</strong>.</>,
        <>Grace period: till <strong>{t(p.reportingGraceUntil)}</strong>.</>,
        <>Client-site team: reporting time fixed by the Team Lead in the ERP, based on the client&apos;s timing and location. Total working time must be {p.onsiteRequiredMinutes / 60} hours.</>,
      ],
    },
    {
      title: "6. Late arrival",
      points: [
        `Up to ${office.graceUntil - office.start} minutes late: grace, no deduction.`,
        `${n.lateGracePerMonth === 1 ? "One late arrival" : `${n.lateGracePerMonth} late arrivals`} per month ${n.lateGracePerMonth === 1 ? "is" : "are"} permitted as a warning, if there is a genuine reason and the Team Lead is informed in the ERP beforehand.`,
        <>Late by more than {office.graceUntil - office.start} minutes but less than {n.veryLateAfterMinutes === 60 ? "1 hour" : `${n.veryLateAfterMinutes} minutes`}, <strong>on {n.lateArrivalsPerHalfDay} days in a month:</strong> counted as a half day leave.</>,
        `Late by more than ${n.veryLateAfterMinutes === 60 ? "1 hour" : `${n.veryLateAfterMinutes} minutes`}: counted as a half day leave.`,
        "One half day leave means half of one day's salary is deducted.",
      ],
    },
    { title: "7. Lunch", points: [`Lunch is ${t(p.lunchStart)}–${t(p.lunchEnd)}. The Team Lead may shift it for urgent work, but lunch is never more than ${lunchLen} minutes.`] },
    {
      title: "8. Leaving early and staying late",
      points: [
        `Leaving before the scheduled time needs the Team Lead's permission. Leaving before ${t(p.halfDayIfLeavingBefore)} counts as a half day leave.`,
        <>Staying after {t(p.leavingGraceUntil)} needs the Team Lead&apos;s prior permission. The request must state <strong>what task is being done and why it cannot wait till tomorrow.</strong></>,
        "The manager is answerable for any team member working late.",
        "Unless it is very urgent, there is no need to stay in the office after hours.",
      ],
    },
    {
      title: `9. Overtime (starts from ${otFrom})`,
      points: [
        <>Overtime is calculated on <strong>real time only</strong>, from {otFrom} to the actual leaving time recorded in the ERP. There are no half-day or full-day slabs.</>,
        "Overtime needs the Team Lead's prior approval (Section 8).",
        "It is counted only for approved requests in the ERP.",
      ],
    },
    {
      title: "10. Leave",
      points: [
        <>All leave is processed through the <strong>ERP only</strong>. Every employee must raise a leave request in the ERP, and the senior will approve or reject it there. Leave not requested in the ERP is not valid.</>,
        `${n.paidLeavesPerMonth === 1 ? "One leave" : `${n.paidLeavesPerMonth} leaves`} per month ${n.paidLeavesPerMonth === 1 ? "is" : "are"} allowed, with intimation (requested before your reporting time).`,
        `If no leave is taken in a month, ${n.noLeaveBonusDays} extra days are added to salary. (Any leave, absence or half day in the month — including half days for late arrival or leaving early — means no extra days that month.)`,
        `Leave without intimation (no request in the ERP) counts as ${n.unrequestedAbsenceDays === 2 ? "double" : `${n.unrequestedAbsenceDays} times`} absent.`,
        `Planned leave must be requested in the ERP and approved by the senior at least ${p.plannedLeaveNoticeDays} days in advance. It also shows your dedication and commitment to the office.`,
        "Sundays and office holidays that fall within a continuous leave period are counted as leave. For example, leave on Saturday and Monday makes Sunday a leave day too.",
      ],
    },
  ];

  return (
    <>
      <PageHeader icon={<BookOpenCheck />} title="Leave, timing and office decorum" description={`Rules and regulations of ${ctx.organization.tradeName}. The ERP applies them exactly as written here.`}
        actions={can(ctx, "org.manage") && <Link href="/app/settings?tab=policy" className="text-sm font-medium text-brand-700 hover:underline">Change the values</Link>} />
      <div className="max-w-3xl space-y-4">
        {ctx.employee && ctx.role !== "OWNER" && !accepted && (
          <Notice tone="warn">Please read the rules below and accept the declaration at the end.{me?.rulesAcknowledgedAt && " The rules changed since you last accepted them."}</Notice>
        )}
        {sections.map((s) => (
          <Card key={s.title} title={s.title}>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">
              {s.points.map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          </Card>
        ))}
        <Card title="11. Declaration">
          <p className="text-sm leading-relaxed">Every employee is expected to arrive on time, complete their work, leave at the scheduled time and enjoy their personal life.</p>
          {ctx.employee && ctx.role !== "OWNER" && (
            <div className="mt-4 border-t border-line pt-4">
              {accepted ? (
                <p className="text-sm text-ok">You accepted these rules on {formatDateTime(me!.rulesAcknowledgedAt, tz)}.</p>
              ) : (
                <ActionButton variant="primary" size="md" action={acceptRulesAction}>I have read and accept these rules</ActionButton>
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
