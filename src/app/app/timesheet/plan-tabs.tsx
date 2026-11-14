import Link from "next/link";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { addDays, dateOnly, formatDate, formatDateTime, formatTime, isoDateInTz, minutesToHhmm, toIsoDate } from "@/lib/dates";
import { activeClientOptions, ownWorkClientOptions } from "@/lib/services/lookups";
import { dayView, finesForMonth, teamPlans, toEscalate, type PlanWithItems } from "@/lib/services/daily-plans";
import { getPolicy, leadsOf, plansApplyTo, reporteeIds } from "@/lib/services/office-rules";
import type { EodState } from "@/lib/domain/daily-plan";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, EmptyState, Notice, Stat, Table, Td, Th } from "@/components/ui";
import { approvePlanAction, escalateAction, leadPlanAction, saveEodAction, savePlanAction } from "./plan-actions";
import { PlanEditor, type EditorLine } from "./plan-editor";
import { AlarmClock, ClipboardCheck, FileWarning, IndianRupee, Send } from "lucide-react";

type SP = Record<string, string | string[] | undefined>;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const nameOf = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();
const STATUS_LABEL = { DONE: "Done", PENDING: "Pending", CARRIED_FORWARD: "Carried forward" } as const;

function EodBadge({ state }: { state: EodState }) {
  return state === "FILED" ? <Badge tone="ok">EOD filed</Badge>
    : state === "FILED_LATE" ? <Badge tone="danger">Filed late · fined</Badge>
    : state === "MISSED" ? <Badge tone="danger">Not filed · fined</Badge>
    : state === "DUE" ? <Badge tone="warn">EOD due</Badge>
    : <Badge tone="neutral">Not needed</Badge>;
}

const toLines = (plan: PlanWithItems | null): EditorLine[] =>
  (plan?.items ?? []).map((i) => ({
    id: i.id, clientId: i.clientId, clientName: i.clientName, task: i.task, expectedBy: i.expectedBy ? toIsoDate(i.expectedBy) : null,
    origin: i.origin, carriedFromId: i.carriedFromId, status: i.status, reason: i.reason,
  }));

function ItemsTable({ plan, withStatus }: { plan: PlanWithItems; withStatus: boolean }) {
  return (
    <Table minWidth={620}>
      <thead><tr><Th>#</Th><Th>Client</Th><Th>Task</Th><Th>Expected</Th>{withStatus && <><Th>Status</Th><Th>Reason</Th></>}</tr></thead>
      <tbody>
        {plan.items.map((i, n) => (
          <tr key={i.id}>
            <Td className="text-xs text-muted">{n + 1}</Td>
            <Td className="font-medium">{i.clientName ?? "Internal"}{i.origin === "CARRIED" && <div><Badge tone="info">Old work</Badge></div>}{i.origin === "NEW" && <div><Badge tone="brand">New work</Badge></div>}</Td>
            <Td className="max-w-sm">{i.task}</Td>
            <Td className="whitespace-nowrap text-xs">{i.expectedBy ? formatDate(i.expectedBy) : "—"}</Td>
            {withStatus && <><Td>{i.status ? <Badge tone={i.status === "DONE" ? "ok" : "warn"}>{STATUS_LABEL[i.status]}</Badge> : "—"}</Td><Td className="max-w-xs text-xs">{i.reason ?? ""}</Td></>}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/** The person's own day: morning plan by 10:30, then the EOD report. */
export async function MyPlanTab({ ctx, sp }: { ctx: AppContext; sp: SP }) {
  if (!ctx.employee || !plansApplyTo(ctx)) {
    return <EmptyState kind="people" title="No daily plan for you">The morning plan and EOD report are for staff who fill the timesheet{ctx.role === "OWNER" ? "; the firm owner is not asked for them" : ""}.</EmptyState>;
  }
  const tz = ctx.organization.timezone;
  const today = isoDateInTz(new Date(), tz);
  const iso = typeof sp.date === "string" && ISO.test(sp.date) ? sp.date : today;
  const me = ctx.employee.id;
  const [v, clients, leads, logged] = await Promise.all([
    dayView(ctx, me, iso),
    ownWorkClientOptions(ctx, dateOnly(iso)),
    leadsOf([me]),
    prisma.timesheetEntry.aggregate({ where: { employeeId: me, workDate: dateOnly(iso) }, _count: true, _sum: { approxMinutes: true } }),
  ]);
  const leadNames = (await prisma.employee.findMany({ where: { id: { in: leads.get(me) ?? [] } }, select: { firstName: true, lastName: true } })).map(nameOf);
  const now = new Date();
  const plan = v.plan;
  const submitted = !!plan?.planSubmittedAt;
  const eodFiled = !!plan?.eodSubmittedAt;
  const future = iso > today;
  const dayHref = (d: string) => `/app/timesheet?tab=plan&date=${d}`;
  const carryLines: EditorLine[] = v.carry.map((c) => ({ ...c, note: `From ${formatDate(dateOnly(c.from))}${c.lastStatus ? ` · ${STATUS_LABEL[c.lastStatus]}` : " · not reported"}${c.lastReason ? `: ${c.lastReason}` : ""}` }));
  const planLines = [...carryLines, ...toLines(plan)];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={dayHref(toIsoDate(addDays(dateOnly(iso), -1)))} className="rounded border border-line px-2 py-1 hover:bg-subtle">← Previous day</Link>
        <strong>{formatDate(dateOnly(iso))}{iso === today && " · today"}</strong>
        <Link href={dayHref(toIsoDate(addDays(dateOnly(iso), 1)))} className="rounded border border-line px-2 py-1 hover:bg-subtle">Next day →</Link>
        <span className="ml-auto text-muted">Your Team Lead: <strong className="text-ink">{leadNames.length ? leadNames.join(", ") : "the administrators"}</strong></span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Morning plan (by ${v.morningPlanBy})`} value={submitted ? formatTime(plan!.planSubmittedAt, tz) : "Not sent"} hint={submitted ? (v.planLate ? "Sent late" : "On time") : now > v.planDueBy && !future ? "Overdue: your Team Lead is told" : "Send it to your Team Lead"} icon={<Send />} tone={submitted ? (v.planLate ? "warn" : "ok") : now > v.planDueBy && !future ? "danger" : "warn"} />
        <Stat label="Team Lead" value={plan?.approvedAt ? "Approved" : submitted ? "Waiting" : "—"} hint={plan?.approvedBy ? `by ${plan.approvedBy.name}${plan.leadEditedAt ? " (with changes)" : ""}` : plan?.leadEditedAt ? "Edited by your Team Lead" : undefined} icon={<ClipboardCheck />} tone={plan?.approvedAt ? "ok" : "neutral"} />
        <Stat label="EOD report" value={eodFiled ? "Filed" : v.state === "MISSED" ? "Not filed" : v.state === "NOT_NEEDED" ? "Not needed" : "Due"} hint={eodFiled ? formatDateTime(plan!.eodSubmittedAt, tz) : v.state === "NOT_NEEDED" ? "No work day recorded" : `File by ${formatDateTime(v.deadlines.fileBy, tz)}`} icon={<AlarmClock />} tone={eodFiled ? (v.state === "FILED_LATE" ? "danger" : "ok") : v.state === "MISSED" ? "danger" : "warn"} />
        <Stat label="Daily log (detail)" value={minutesToHhmm(logged._sum.approxMinutes ?? 0)} hint={`${logged._count} entries · open the Daily Log`} href={`/app/timesheet?tab=daily&date=${iso}`} />
      </div>
      {v.fined && <Notice tone="danger">The EOD report for this day was not filed by {formatDateTime(v.deadlines.fileBy, tz)}: a fine of ₹{v.penalty} applies (office rule 2).{!eodFiled && " File it anyway so your Team Lead has the record."}</Notice>}
      {plan?.escalatedAt && <Notice tone="warn">Your Team Lead escalated this missing EOD on {formatDateTime(plan.escalatedAt, tz)}.</Notice>}
      {plan?.leadEditedAt && !eodFiled && <Notice tone="info">Your Team Lead edited this plan on {formatDateTime(plan.leadEditedAt, tz)}. The list below shows their version.</Notice>}

      {!eodFiled && (iso >= today || !submitted) && (
        <details open={!submitted} className="rounded-xl border border-line bg-surface">
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold">
            <Send className="size-4 text-muted" aria-hidden />
            {submitted ? `Morning plan sent at ${formatTime(plan!.planSubmittedAt, tz)} (${plan!.items.length} tasks) · change it` : future ? `Plan for ${formatDate(dateOnly(iso))}` : "Morning plan"}
          </summary>
          <div className="border-t border-line p-4">
            <p className="mb-3 text-sm text-muted">
              {submitted ? "Sending a changed plan asks your Team Lead to approve it again." : <>Enter the day&apos;s tasks — client, task and expected completion — by <strong className="text-ink">{v.morningPlanBy}</strong>. Your Team Lead can approve or edit it.</>}
              {!submitted && carryLines.length > 0 && " Work not finished on your last day is already listed as old work: keep, change or remove it."}
            </p>
            {iso < today ? <p className="text-sm text-muted">The morning plan is for today or a later day. Fill the EOD report below.</p> : (
              <PlanEditor action={savePlanAction.bind(null, iso)} mode="plan" lines={submitted ? toLines(plan) : planLines} clients={clients} today={iso}
                submitLabel={submitted ? "Send updated plan" : "Send plan to my Team Lead"} draftLabel={submitted ? undefined : "Save draft"} />
            )}
          </div>
        </details>
      )}

      {!future && (eodFiled ? (
        <Card title={`EOD report · filed ${formatDateTime(plan!.eodSubmittedAt, tz)}`} padded={false}>
          <ItemsTable plan={plan!} withStatus />
          {plan!.eodNote && <p className="border-t border-line p-3 text-sm"><span className="text-muted">Note: </span>{plan!.eodNote}</p>}
        </Card>
      ) : (iso < today || submitted || iso === today) && (
        <Card title="EOD report (your timesheet)" icon={<AlarmClock />}>
          <p className="mb-3 text-sm text-muted">
            Mark every line <strong className="text-ink">Done</strong>, <strong className="text-ink">Pending</strong> or <strong className="text-ink">Carried forward</strong>, with a reason for each one not done, and add new work you did.
            File it today, or at the latest before <strong className="text-ink">{formatDateTime(v.deadlines.fileBy, tz)}</strong>; after that a ₹{v.penalty} fine applies.
          </p>
          <PlanEditor action={saveEodAction.bind(null, iso)} mode="eod" lines={submitted || plan?.items.length ? toLines(plan) : planLines.map((l) => ({ ...l, status: null }))} clients={clients} today={iso} submitLabel="File EOD report" draftLabel="Save draft" note={plan?.eodNote} />
        </Card>
      ))}
    </div>
  );
}

/** The Team Lead's day: who sent a plan, approve or edit it, who filed the EOD, and what to escalate. */
export async function TeamPlansTab({ ctx, sp }: { ctx: AppContext; sp: SP }) {
  const tz = ctx.organization.timezone;
  const today = isoDateInTz(new Date(), tz);
  const iso = typeof sp.date === "string" && ISO.test(sp.date) ? sp.date : today;
  const admin = can(ctx, "org.manage");
  const mine = (await reporteeIds(ctx)).length > 0;
  const onlyMine = mine && (!admin || sp.scope !== "all");
  const [rows, escalate, policy, clients, fines] = await Promise.all([
    teamPlans(ctx, iso, onlyMine),
    toEscalate(ctx),
    getPolicy(ctx.organization.id),
    activeClientOptions(ctx.organization.id),
    finesForMonth(ctx.organization.id, tz, iso.slice(0, 7)),
  ]);
  if (!rows.length && !escalate.length && !admin) {
    return <EmptyState kind="people" title="Nobody reports to you">Plans and EOD reports appear here for the people who report to you (set on each employee&apos;s record).</EmptyState>;
  }
  const open = typeof sp.open === "string" ? rows.find((r) => r.plan?.id === sp.open) : undefined;
  const base = `/app/timesheet?tab=team-plans${onlyMine ? "" : "&scope=all"}`;
  const dayHref = (d: string) => `${base}&date=${d}`;
  const sent = rows.filter((r) => r.plan?.planSubmittedAt).length;
  const waiting = rows.filter((r) => r.plan?.planSubmittedAt && !r.plan.approvedAt).length;
  const atWork = rows.filter((r) => r.worked).length;
  const myFine = ctx.employee ? fines.get(ctx.employee.id) : undefined;
  const memberFines = rows.map((r) => ({ name: nameOf(r.employee), f: fines.get(r.employee.id) })).filter((x) => x.f?.eodMissed.length);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={dayHref(toIsoDate(addDays(dateOnly(iso), -1)))} className="rounded border border-line px-2 py-1 hover:bg-subtle">← Previous day</Link>
        <strong>{formatDate(dateOnly(iso))}{iso === today && " · today"}</strong>
        {iso < today && <Link href={dayHref(toIsoDate(addDays(dateOnly(iso), 1)))} className="rounded border border-line px-2 py-1 hover:bg-subtle">Next day →</Link>}
        {admin && mine && (
          <span className="ml-auto flex gap-1 rounded-lg border border-line p-0.5 text-xs">
            <Link href={`/app/timesheet?tab=team-plans&date=${iso}`} className={`rounded-md px-2 py-1 ${onlyMine ? "bg-ink text-paper" : "hover:bg-subtle"}`}>My team</Link>
            <Link href={`/app/timesheet?tab=team-plans&scope=all&date=${iso}`} className={`rounded-md px-2 py-1 ${!onlyMine ? "bg-ink text-paper" : "hover:bg-subtle"}`}>Everyone</Link>
          </span>
        )}
      </div>

      {escalate.length > 0 && (
        <Card title={`Escalate today (${escalate.length})`} icon={<FileWarning />}>
          <p className="mb-3 text-sm text-muted">These EOD reports were not filed by the reporting time. Tell the person to update the timesheet and escalate it the same day — otherwise a ₹{policy.row.leadPenaltyRupees} fine applies to you (office rule 2).</p>
          <ul className="divide-y divide-line text-sm">
            {escalate.map((r) => (
              <li key={`${r.employee.id}|${r.date}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span><strong>{nameOf(r.employee)}</strong> · EOD for {formatDate(dateOnly(r.date))} <span className="text-xs text-muted">· escalate by {formatDateTime(r.escalateBy, tz)}</span></span>
                <ActionButton action={escalateAction.bind(null, r.employee.id, r.date)} confirm={`Escalate ${nameOf(r.employee)}'s missing EOD? They are told to update it and the administrators are informed.`}>Escalate</ActionButton>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="At work" value={atWork} hint={`of ${rows.length} in the team`} />
        <Stat label="Plans sent" value={`${sent} / ${atWork || rows.length}`} hint={`Due by ${policy.row.morningPlanBy}`} tone={sent < atWork ? "warn" : "ok"} />
        <Stat label="Waiting for your approval" value={waiting} tone={waiting ? "info" : "neutral"} />
        <Stat label="Your fines this month" value={`₹${myFine?.leadMissed.length ? myFine.leadMissed.length * policy.row.leadPenaltyRupees : 0}`} hint={myFine?.leadMissed.length ? `${myFine.leadMissed.length} missing EOD not escalated` : "Nothing missed"} icon={<IndianRupee />} tone={myFine?.leadMissed.length ? "danger" : "ok"} />
      </div>

      {open?.plan && (
        <Card title={`${nameOf(open.employee)} · plan for ${formatDate(dateOnly(iso))}`} actions={<Link href={dayHref(iso)} className="text-xs text-muted hover:text-ink">Close</Link>}>
          {open.plan.eodSubmittedAt ? (
            <><p className="mb-3 text-sm text-muted">EOD filed {formatDateTime(open.plan.eodSubmittedAt, tz)}.</p><ItemsTable plan={open.plan} withStatus />{open.plan.eodNote && <p className="mt-3 text-sm"><span className="text-muted">Note: </span>{open.plan.eodNote}</p>}</>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">Sent {formatDateTime(open.plan.planSubmittedAt, tz)}{open.planLate ? " (late)" : ""}. Change any line and approve, or approve it as it is. The team member is notified.</p>
              <PlanEditor action={leadPlanAction.bind(null, open.plan.id)} mode="lead" lines={toLines(open.plan)} clients={clients} today={iso} submitLabel="Save changes & approve"
                extraButtons={[{ intent: "approve", label: "Approve as sent" }, { intent: "edit", label: "Save changes only", variant: "ghost" }]} />
            </>
          )}
        </Card>
      )}

      <Card title="Plans & EOD reports" padded={false}>
        {rows.length === 0 ? <p className="p-4 text-sm text-muted">Nobody in this view.</p> : (
          <Table minWidth={860}>
            <thead><tr><Th>Team member</Th><Th>Attendance</Th><Th>Morning plan</Th><Th>Team Lead</Th><Th>EOD report</Th><Th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee.id}>
                  <Td className="font-medium">{nameOf(r.employee)}</Td>
                  <Td className="text-xs">{r.attendance ? r.attendance.replace("_", " ").toLowerCase() : "not marked"}</Td>
                  <Td>{r.plan?.planSubmittedAt ? <><Badge tone={r.planLate ? "warn" : "ok"}>{r.planLate ? "Late" : "On time"} · {formatTime(r.plan.planSubmittedAt, tz)}</Badge><div className="text-xs text-muted">{r.plan.items.length} tasks</div></> : r.worked ? <Badge tone="danger">Missing</Badge> : <span className="text-xs text-muted">—</span>}</Td>
                  <Td>
                    {r.plan?.approvedAt ? <Badge tone="ok">Approved</Badge> : r.plan?.planSubmittedAt && !r.plan.eodSubmittedAt ? (
                      <ActionButton action={approvePlanAction.bind(null, r.plan.id)}>Approve</ActionButton>
                    ) : "—"}
                  </Td>
                  <Td><EodBadge state={r.state} />{r.state === "DUE" && <div className="text-xs text-muted">by {formatDateTime(r.fileBy, tz)}</div>}{r.plan?.escalatedAt && <div className="text-xs text-muted">Escalated {formatDateTime(r.plan.escalatedAt, tz)}</div>}</Td>
                  <Td>{r.plan?.items.length ? <Link href={`${dayHref(iso)}&open=${r.plan.id}`} className="whitespace-nowrap text-sm font-medium text-brand-700 hover:underline">{r.plan.eodSubmittedAt ? "View EOD" : "Open plan"}</Link> : null}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {memberFines.length > 0 && (
        <Card title={`EOD fines this month (₹${policy.row.eodPenaltyRupees} each)`} padded={false}>
          <Table minWidth={480}>
            <thead><tr><Th>Team member</Th><Th>Days not filed in time</Th><Th>Fine</Th></tr></thead>
            <tbody>
              {memberFines.map((m) => (
                <tr key={m.name}><Td className="font-medium">{m.name}</Td><Td className="text-xs">{m.f!.eodMissed.map((d) => formatDate(dateOnly(d))).join(", ")}</Td><Td>₹{m.f!.eodMissed.length * policy.row.eodPenaltyRupees}</Td></tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
