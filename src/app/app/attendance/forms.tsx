"use client";

import { useState } from "react";
import { ActionForm, SelectField, SubmitButton, TextArea, TextField, type FormState } from "@/components/form";
import { ClientPlacePicker, type PlaceClient } from "./client-place-picker";

type Act = (p: FormState, fd: FormData) => Promise<FormState>;
type Option = { value: string; label: string };

export function LeaveRequestForm({ action, today, plannedNotice, earliestPlanned }: { action: Act; today: string; plannedNotice: number; earliestPlanned: string }) {
  const [type, setType] = useState("CASUAL");
  const [duration, setDuration] = useState("FULL");
  const [from, setFrom] = useState(today);
  const changeType = (t: string) => { setType(t); if (t === "PLANNED" && from < earliestPlanned) setFrom(earliestPlanned); };
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Type" name="leaveType" placeholder={null} value={type} onChange={(e) => changeType(e.target.value)} options={[
          { value: "CASUAL", label: "Casual" }, { value: "SICK", label: "Sick" }, { value: "PLANNED", label: `Planned (${plannedNotice}+ days ahead)` }, { value: "UNPAID", label: "Unpaid" }, { value: "OTHER", label: "Other" },
        ]} />
        <SelectField label="Duration" name="duration" placeholder={null} value={duration} onChange={(e) => setDuration(e.target.value)} options={[
          { value: "FULL", label: "Full day(s)" }, { value: "FIRST", label: "Half day – first half (morning)" }, { value: "SECOND", label: "Half day – second half (afternoon)" },
        ]} />
        <TextField label={duration === "FULL" ? "From" : "Date"} name="fromDate" type="date" required value={from} onChange={(e) => setFrom(e.target.value)} min={type === "PLANNED" ? earliestPlanned : undefined} />
        {duration === "FULL" ? (
          <TextField label="To" name="toDate" type="date" required defaultValue={from} min={from} key={`t-${type}-${from}`} />
        ) : (
          <input type="hidden" name="toDate" value={from} />
        )}
      </div>
      {duration !== "FULL" && <p className="text-xs text-muted">{duration === "FIRST" ? "You come in after lunch: mark in when you reach; arriving for the second half is not counted as late." : "You leave at lunch: leaving then is not counted as leaving early."} A half-day leave is half a day of leave.</p>}
      {type === "PLANNED" && <p className="text-xs text-muted">Planned leave must be requested and approved at least {plannedNotice} days ahead, so the earliest date is {earliestPlanned}.</p>}
      <TextArea label="Reason" name="reason" rows={2} />
      <SubmitButton>Request leave</SubmitButton>
    </ActionForm>
  );
}

export function LeaveDecisionForm({ action }: { action: Act }) {
  return (
    <ActionForm action={action}>
      <TextField label="Note (optional)" name="note" />
      <div className="flex gap-2">
        <SubmitButton name="decision" value="approve" size="sm">Approve</SubmitButton>
        <SubmitButton name="decision" value="reject" variant="danger" size="sm">Reject</SubmitButton>
      </div>
    </ActionForm>
  );
}

const KINDS = [
  { value: "MARK_ATTENDANCE", label: "Please mark my attendance", hint: "Forgot to mark in, or could not (phone, location, network)? Say when you reached and where you are. All your seniors are told and any of them can mark it — only until the absent cut-off (12:00); after that nobody can. If they don't, send it to the admin. Up to 3 days a month count normally; after that each one is a half day." },
  { value: "LATE_ARRIVAL", label: "I'll be late / half day", hint: "Before your reporting time: your reason and when you expect to arrive (for a half day, your second-half arrival time). Mark in with your location when you reach. One late arrival a month informed in advance is a warning only." },
  { value: "ABSENT", label: "I can't come today", hint: "Raises a leave request for the day for your Team Lead to decide. Without a request in the ERP an absence counts double." },
  { value: "EARLY_LEAVE", label: "Leave early", hint: "Your Team Lead's permission to leave before your scheduled time. Leaving before the half-day time still counts as a half day." },
  { value: "OVERTIME", label: "Stay late (overtime)", hint: "Prior permission to stay after 6:45 PM: what task, and why it cannot wait till tomorrow. Only approved overtime is counted, in real minutes." },
  { value: "WEEKLY_OFF", label: "Weekly off on another day", hint: "For clients without a fixed weekly off: take this day as your weekly off (one a week). Once approved the day is a weekly off — not leave, not absent." },
  { value: "OFF_DAY_WORK", label: "Worked on Sunday / holiday", hint: "Mark in and out as usual on the Sunday or holiday, then send this (or send it beforehand). Once approved, the day is paid as an extra day in that month's salary (half a day for a half day)." },
] as const;

/** One form for everything the rules ask to be raised in the ERP; the fields follow the choice. */
export function RequestForm({ action, today, initialKind, defaults, clients = [], officeLabel = "Office", firmStart = "09:30", markInfo, places = ["OFFICE", "CLIENT_OFFICE", "CLIENT_VISIT"] }: {
  action: Act; today: string; initialKind?: string;
  defaults: { arrival: string; leaving: string; overtimeUntil: string; monthBack?: string; reachedAt?: string };
  clients?: PlaceClient[]; officeLabel?: string; firmStart?: string;
  /** Mark-attendance: cut-off today and how many days were already marked on request this month. */
  markInfo?: { cutoff: string; used: number; limit: number; pastCutoff: boolean; markedIn: boolean };
  /** Where the Team Lead lets them work (Team timings); all three when nothing is set. */
  places?: string[];
}) {
  const [kind, setKind] = useState<string>(KINDS.some((k) => k.value === initialKind) ? initialKind! : "LATE_ARRIVAL");
  const [where, setWhere] = useState(places[0] ?? "OFFICE");
  const info = KINDS.find((k) => k.value === kind)!;
  return (
    <ActionForm action={action}>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">What do you want to tell your Team Lead?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {KINDS.map((k) => (
            <label key={k.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${kind === k.value ? "border-ink bg-paper font-medium" : "border-line hover:border-ink/30"}`}>
              <input type="radio" name="kind" value={k.value} checked={kind === k.value} onChange={() => setKind(k.value)} className="accent-ink" />
              {k.label}
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{info.hint}</p>
      </fieldset>
      {kind === "MARK_ATTENDANCE" ? (
        <>
          {markInfo && (
            <p className={`rounded-md border px-3 py-2 text-xs ${markInfo.pastCutoff || markInfo.markedIn ? "border-danger/30 bg-danger-bg text-danger" : markInfo.used >= markInfo.limit ? "border-warn/30 bg-warn-bg text-warn" : "border-line bg-paper text-muted"}`}>
              {markInfo.markedIn ? "You are already marked in today." : markInfo.pastCutoff ? `It is past ${markInfo.cutoff}: attendance can no longer be marked for today by anyone.` : <>Today only · must be marked before <strong>{markInfo.cutoff}</strong>. Marked on request this month: <strong>{markInfo.used} of {markInfo.limit}</strong>{markInfo.used >= markInfo.limit ? " — this one would count as a half day." : "."}</>}
            </p>
          )}
          <input type="hidden" name="requestDate" value={today} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="I reached at" name="atTime" type="time" required defaultValue={defaults.reachedAt ?? defaults.arrival} key="reached" hint="The time you actually reached" />
            <SelectField label="Where are you working today?" name="workLocation" placeholder={null} value={where} onChange={(e) => setWhere(e.target.value)} options={[
              { value: "OFFICE", label: officeLabel }, { value: "CLIENT_OFFICE", label: "Client office" }, { value: "CLIENT_VISIT", label: "Client visit" },
            ].filter((o) => places.includes(o.value))} />
          </div>
          {where !== "OFFICE" && <ClientPlacePicker clients={clients} label={where === "CLIENT_OFFICE" ? "Which client's office?" : "Which client are you visiting?"} firmStart={firmStart} />}
        </>
      ) : (
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Date" name="requestDate" type="date" required defaultValue={today} min={kind === "WEEKLY_OFF" || kind === "OFF_DAY_WORK" ? defaults.monthBack : today} key={`d-${kind}`} />
        {kind === "LATE_ARRIVAL" && <TextField label="Expected arrival" name="atTime" type="time" required defaultValue={defaults.arrival} key="arr" />}
        {kind === "EARLY_LEAVE" && <TextField label="Leaving at" name="atTime" type="time" required defaultValue={defaults.leaving} key="leave" />}
        {kind === "OVERTIME" && <TextField label="Expected to finish by" name="atTime" type="time" defaultValue={defaults.overtimeUntil} key="ot" />}
      </div>
      )}
      {kind === "OVERTIME" && (
        <>
          <TextArea label="What task will you be doing?" name="task" rows={2} required />
          <TextArea label="Why can it not wait till tomorrow?" name="whyNotTomorrow" rows={2} required />
        </>
      )}
      <TextArea label={kind === "OVERTIME" ? "Anything else" : kind === "OFF_DAY_WORK" ? "What work, for which client" : kind === "MARK_ATTENDANCE" ? "Why could you not mark it yourself?" : "Reason"} name="reason" rows={2} required={kind !== "OVERTIME"} key={`r-${kind}`} defaultValue={kind === "OVERTIME" ? "Urgent work" : undefined} />
      <SubmitButton>{kind === "MARK_ATTENDANCE" ? "Ask my seniors to mark it" : kind === "LATE_ARRIVAL" || kind === "ABSENT" ? "Inform my Team Lead" : "Ask my Team Lead"}</SubmitButton>
    </ActionForm>
  );
}

/** Team Lead's decision. A late intimation is accepted by default and can be marked not genuine. */
export function RequestDecisionForm({ action, late, approveLabel, rejectLabel }: { action: Act; late: boolean; approveLabel?: string; rejectLabel?: string }) {
  return (
    <ActionForm action={action}>
      <TextField label="Note (optional)" name="note" />
      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="approve" size="sm">{approveLabel ?? (late ? "Accept reason" : "Approve")}</SubmitButton>
        <SubmitButton name="decision" value="reject" variant="danger" size="sm">{rejectLabel ?? (late ? "Not genuine" : "Reject")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

const DAY_PRESETS = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const toHhmm = (min: number) => `${String(Math.floor((((min % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String(((min % 60) + 60) % 60).padStart(2, "0")}`;

type Place = "OFFICE" | "CLIENT_OFFICE" | "CLIENT_VISIT";

/**
 * Team timings: where the person works — office, client office, client visit, one or more (client
 * feedback, 26 Nov 2026) — which are then the only choices at their mark-in. With "Client office", the
 * client and its own reporting time and working hours (25 Nov 2026: the day is not always 8 hours).
 * One tap for the usual lengths, or type any; the leaving time is shown as you choose.
 */
export function ScheduleForm({ action, employees, officeHours, defaults, firmSiteHours = 8, clients = [], labels }: {
  action: Act; employees: Option[]; officeHours: string; firmSiteHours?: number;
  defaults?: { employeeId?: string; places?: Place[]; time?: string; site?: string; hours?: number };
  /** The firm's active clients for the "Client / site" list (client feedback, 26 Nov 2026). */
  clients?: PlaceClient[];
  labels: Record<Place, string>;
}) {
  const [places, setPlaces] = useState<Place[]>(defaults?.places?.length ? defaults.places : ["CLIENT_OFFICE"]);
  const [time, setTime] = useState(defaults?.time ?? "10:00");
  const [hours, setHours] = useState(String(defaults?.hours ?? firmSiteHours));
  const h = Number(hours);
  const [hh, mm] = time.split(":").map(Number);
  const ends = Number.isFinite(h) && h > 0 && Number.isFinite(hh) ? toHhmm(hh * 60 + (mm || 0) + Math.round(h * 60)) : null;
  const site = places.includes("CLIENT_OFFICE");
  const toggle = (p: Place) => setPlaces((xs) => (xs.includes(p) ? xs.filter((x) => x !== p) : [...xs, p]));
  const HINT: Record<Place, string> = {
    OFFICE: `Office hours ${officeHours}`,
    CLIENT_OFFICE: "Works at a client's office, on that client's timing",
    CLIENT_VISIT: "Goes out to clients during the day",
  };
  return (
    <ActionForm action={action}>
      <SelectField label="Team member" name="employeeId" required options={employees} defaultValue={defaults?.employeeId} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Works at <span className="font-normal text-muted">(tick one or more)</span></legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(["OFFICE", "CLIENT_OFFICE", "CLIENT_VISIT"] as Place[]).map((p) => (
            <label key={p} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${places.includes(p) ? "border-ink bg-paper" : "border-line hover:border-ink/30"}`}>
              <input type="checkbox" name="places[]" value={p} checked={places.includes(p)} onChange={() => toggle(p)} className="mt-0.5 accent-ink" />
              <span><span className={places.includes(p) ? "font-medium" : undefined}>{labels[p]}</span><span className="block text-xs text-muted">{HINT[p]}</span></span>
            </label>
          ))}
        </div>
        <p className={`mt-1.5 text-xs ${places.length ? "text-muted" : "text-danger"}`}>
          {places.length === 0 ? "Tick at least one place." : `At mark-in they can choose only: ${places.map((p) => labels[p]).join(", ")}.`}
        </p>
      </fieldset>
      {site && (
        <div className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-2">
          <p className="text-xs text-muted sm:col-span-2">
            <strong className="text-ink">Client office timing.</strong> Their day follows this timing{places.length > 1 ? " on every day, also when they mark in elsewhere" : ""}.
          </p>
          <div className="sm:col-span-2">
            <ClientPlacePicker clients={clients} name="siteName" required label="Client / site" defaultValue={defaults?.site} firmStart={officeHours} scheduleHint
              onPick={(c) => { if (c.opens) setTime(c.opens); }} />
          </div>
          <TextField label="Reporting time" name="siteReportingTime" type="time" required value={time} onChange={(e) => setTime(e.target.value)} />
          <TextField label="Working hours" name="siteDayHours" type="number" required min={1} max={16} step={0.25} value={hours} onChange={(e) => setHours(e.target.value)} hint={ends ? `Day: ${time}–${ends}` : "Hours in the day, e.g. 8 or 8.5"} />
          <div className="-mt-1 flex flex-wrap gap-1.5 sm:col-span-2" role="group" aria-label="Usual working hours">
            {DAY_PRESETS.map((p) => (
              <button key={p} type="button" aria-pressed={h === p} onClick={() => setHours(String(p))}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${h === p ? "border-ink bg-ink text-paper" : "border-line bg-surface text-muted hover:border-ink/30 hover:text-ink"}`}>
                {p} h{p === firmSiteHours ? " (usual)" : ""}
              </button>
            ))}
          </div>
        </div>
      )}
      {!site && places.length > 0 && <p className="text-xs text-muted">Their day follows office hours ({officeHours}).</p>}
      <SubmitButton>Save timing</SubmitButton>
    </ActionForm>
  );
}

export function LunchShiftForm({ action, employees, defaultTime }: { action: Act; employees: Option[]; defaultTime: string }) {
  return (
    <ActionForm action={action}>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Team member (in today)" name="employeeId" required options={employees} />
        <TextField label="Lunch from" name="lunchAt" type="time" required defaultValue={defaultTime} />
      </div>
      <SubmitButton>Move today&apos;s lunch</SubmitButton>
    </ActionForm>
  );
}
