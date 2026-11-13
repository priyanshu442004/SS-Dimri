import Link from "next/link";
import { Camera, CheckCircle2, Clock4, MapPin, Navigation, ShieldAlert, Users, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { addDays, dateOnly, formatDate, formatDateTime, formatTime, minutesToHhmm, toIsoDate } from "@/lib/dates";
import type { AppContext } from "@/lib/session";
import { myProxyMarksToday, photoCheckRows, proxyTargets, type PhotoFilter } from "@/lib/services/attendance-proxy";
import { teamVisits } from "@/lib/services/client-visits";
import { workerDaySheet, workerPayoffs } from "@/lib/services/daily-workers";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, DownloadButton, EmptyState, Notice, Stat, StatusBadge, Table, Td, Th } from "@/components/ui";
import { proxyMarkAction, reviewPhotoAction, saveWorkerAction, saveWorkerDayAction, toggleWorkerAction, workerPaidAction } from "./actions";
import { PhotoReviewForm, ProxyMarkForm, WorkerDayForm, WorkerForm } from "./extra-forms";

type SP = Record<string, string | string[] | undefined>;
const iso = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : "");
const map = (lat: unknown, lng: unknown) => (lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : null);
const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const nameOf = (p: { firstName: string; lastName: string | null }) => `${p.firstName} ${p.lastName ?? ""}`.trim();

/** A small photo that opens full size in a new tab. */
export function Thumb({ fileId, label, size = "md" }: { fileId: string | null | undefined; label: string; size?: "sm" | "md" | "lg" }) {
  if (!fileId) return <span className="text-xs text-muted">—</span>;
  const cls = size === "lg" ? "size-32 sm:size-36" : size === "md" ? "size-14" : "size-10";
  return (
    <a href={`/api/files/${fileId}`} target="_blank" rel="noopener noreferrer" title={`${label} (opens full size)`} className="inline-block shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/files/${fileId}`} alt={label} loading="lazy" className={`${cls} rounded-lg border border-line bg-subtle object-cover transition-opacity hover:opacity-90`} />
    </a>
  );
}

const REVIEW_LABEL = { PENDING: "To check", ACCEPTED: "Photo accepted", REJECTED: "Marked absent" } as const;
const REVIEW_TONE = { PENDING: "warn", ACCEPTED: "ok", REJECTED: "danger" } as const;
export function ReviewBadge({ review }: { review: keyof typeof REVIEW_LABEL | null }) {
  if (!review) return null;
  return <Badge tone={REVIEW_TONE[review]}>{REVIEW_LABEL[review]}</Badge>;
}

// ---------------------------------------------------------------- mark for others

export async function OthersTab({ ctx }: { ctx: AppContext }) {
  const [targets, mine] = await Promise.all([proxyTargets(ctx), myProxyMarksToday(ctx)]);
  const tz = ctx.organization.timezone;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title="Mark someone in or out" icon={<Camera />}>
        <div className="mb-4">
          <Notice tone="info">
            For a colleague who has no phone, no internet, no battery or no balance, or for a daily worker. Take their photo: it is the proof that they were here.
            They count as present straight away; their senior or an administrator can look at the photo later.
          </Notice>
        </div>
        {targets.length === 0 ? <p className="text-sm text-muted">There is nobody to mark yet.</p> : <ProxyMarkForm action={proxyMarkAction} targets={targets} />}
      </Card>
      <Card title={`Marked by you today (${mine.length})`} padded={false}>
        {mine.length === 0 ? (
          <p className="p-4 text-sm text-muted">Nobody yet. People you mark appear here with their photos.</p>
        ) : (
          <ul className="divide-y divide-line">
            {mine.map((m) => (
              <li key={m.id} className="flex items-center gap-3 p-3 text-sm">
                <Thumb fileId={m.inPhoto} label={`${m.name} – time in`} size="sm" />
                <Thumb fileId={m.outPhoto} label={`${m.name} – time out`} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.name} <span className="text-xs font-normal text-muted">· {m.kind}</span></p>
                  <p className="text-xs text-muted">In {formatTime(m.timeIn, tz)}{m.timeOut ? ` · out ${formatTime(m.timeOut, tz)}` : " · still in"}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- photo check

const PHOTO_FILTERS: { key: PhotoFilter; label: string }[] = [
  { key: "PENDING", label: "To check" },
  { key: "REJECTED", label: "Marked absent" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "ALL", label: "All" },
];

export async function PhotosTab({ ctx, sp, today }: { ctx: AppContext; sp: SP; today: string }) {
  const filter = PHOTO_FILTERS.find((f) => f.key === sp.show)?.key ?? "PENDING";
  // "To check" looks back a month by default; the others the last week. Any range can be chosen.
  const to = iso(sp.to) || today;
  let from = iso(sp.from) || toIsoDate(addDays(dateOnly(to), filter === "PENDING" ? -30 : -6));
  if (from > to) from = to;
  if (from < toIsoDate(addDays(dateOnly(to), -91))) from = toIsoDate(addDays(dateOnly(to), -91));
  const employeeId = uuid(sp.employee);
  const tz = ctx.organization.timezone;
  const rows = await photoCheckRows(ctx, { from: dateOnly(from), to: dateOnly(to), filter, employeeId: employeeId || undefined });
  const person = employeeId ? rows[0]?.employee : null;
  const href = (o: Record<string, string>) => {
    const p = new URLSearchParams({ tab: "photos", show: filter, from, to, ...(employeeId && { employee: employeeId }), ...o });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/app/attendance?${p}`;
  };
  return (
    <div className="space-y-4">
      <Notice tone="info">
        Attendance that a senior or a designated person marked for someone else, with the photo they took. It already counts as present.
        Open a photo to see it full size. If it is not genuine, choose <strong>Not genuine – mark absent</strong>; you can change your decision later.
      </Notice>
      <div className="flex flex-wrap items-end gap-2">
        <nav aria-label="Show" className="flex flex-wrap gap-1 rounded-lg bg-subtle p-1">
          {PHOTO_FILTERS.map((f) => (
            <Link key={f.key} href={href({ show: f.key, from: "", to: "" })} aria-current={f.key === filter ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${f.key === filter ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
              {f.label}
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap items-end gap-2" aria-label="Photo check period">
          <input type="hidden" name="tab" value="photos" />
          <input type="hidden" name="show" value={filter} />
          {employeeId && <input type="hidden" name="employee" value={employeeId} />}
          <label className="text-sm"><span className="mb-1 block font-medium">From</span><input type="date" name="from" defaultValue={from} max={today} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" /></label>
          <label className="text-sm"><span className="mb-1 block font-medium">To</span><input type="date" name="to" defaultValue={to} max={today} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" /></label>
          <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Apply</button>
        </form>
      </div>
      {person && (
        <p className="text-sm">Showing only <strong>{nameOf(person)}</strong>. <Link href={href({ employee: "" })} className="text-brand-700 hover:underline">Show everyone</Link></p>
      )}
      {rows.length === 0 ? (
        <EmptyState kind="calendar" title={filter === "PENDING" ? "Nothing to check" : "Nothing here"}>
          {filter === "PENDING" ? "Every photo attendance in this period has been checked." : "No photo attendance matches this period."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {rows.map((r) => {
            const inMap = map(r.timeInLatitude, r.timeInLongitude);
            const outMap = map(r.timeOutLatitude, r.timeOutLongitude);
            return (
              <li key={r.id} className="rounded-xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgb(15_29_51/.04)]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={href({ employee: r.employee.id })} className="font-medium text-ink hover:underline">{nameOf(r.employee)}</Link>
                    <p className="text-xs text-muted">{r.employee.designation?.name ?? "Team member"} · {formatDate(r.attendanceDate)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1"><StatusBadge status={r.status} /><ReviewBadge review={r.photoReview} /></div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <figure>
                    <Thumb fileId={r.timeInPhotoFileId} label={`${nameOf(r.employee)} – time in`} size="lg" />
                    <figcaption className="mt-1 text-xs text-muted">
                      In <strong className="text-ink">{formatTime(r.timeIn, tz)}</strong>
                      {r.timeInProxyBy ? <> · by {r.timeInProxyBy.name}</> : r.timeIn ? <> · by themself</> : null}
                      {inMap && <> · <a href={inMap} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">Map</a></>}
                    </figcaption>
                  </figure>
                  <figure>
                    <Thumb fileId={r.timeOutPhotoFileId} label={`${nameOf(r.employee)} – time out`} size="lg" />
                    <figcaption className="mt-1 text-xs text-muted">
                      Out <strong className="text-ink">{formatTime(r.timeOut, tz)}</strong>
                      {r.timeOutProxyBy ? <> · by {r.timeOutProxyBy.name}</> : r.timeOut ? <> · by themself</> : null}
                      {outMap && <> · <a href={outMap} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">Map</a></>}
                    </figcaption>
                  </figure>
                </div>
                {r.remarks && <p className="mt-2 text-xs text-muted">Note: {r.remarks}</p>}
                {r.photoReviewedAt && (
                  <p className="mt-2 text-xs text-muted">
                    {r.photoReview === "REJECTED" ? "Marked absent" : r.photoReview === "ACCEPTED" ? "Accepted" : "Checked"} by {r.photoReviewedBy?.name ?? "—"}, {formatDateTime(r.photoReviewedAt, tz)}
                    {r.photoReviewNote && <>: “{r.photoReviewNote}”</>}
                  </p>
                )}
                <div className="mt-3 border-t border-line pt-3">
                  {r.mayReview ? (
                    <PhotoReviewForm action={reviewPhotoAction.bind(null, r.id)} decided={r.photoReview !== "PENDING"} />
                  ) : (
                    <p className="text-xs text-muted">
                      {r.timeInProxyById === ctx.user.id || r.timeOutProxyById === ctx.user.id
                        ? "You marked this one, so another senior or an administrator checks it."
                        : "Their senior or an administrator checks this one."}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- client visits

export async function VisitsTab({ ctx, sp, today }: { ctx: AppContext; sp: SP; today: string }) {
  const date = iso(sp.date) && iso(sp.date) <= today ? iso(sp.date) : today;
  const employeeId = uuid(sp.employee);
  const tz = ctx.organization.timezone;
  const [groups, markedIn] = await Promise.all([
    teamVisits(ctx, dateOnly(date), employeeId || undefined),
    prisma.attendanceRecord.count({ where: { organizationId: ctx.organization.id, attendanceDate: dateOnly(date), timeIn: { not: null } } }),
  ]);
  const isToday = date === today;
  const atClientNow = groups.filter((g) => g.visits.some((v) => !v.endedAt)).length;
  const stops = groups.reduce((s, g) => s + g.visits.length, 0);
  return (
    <div className="space-y-5">
      <form className="flex flex-wrap items-end gap-2" aria-label="Visits day">
        <input type="hidden" name="tab" value="visits" />
        <label className="text-sm"><span className="mb-1 block font-medium">Day</span><input type="date" name="date" defaultValue={date} max={today} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" /></label>
        <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show</button>
        {employeeId && <Link href={`/app/attendance?tab=visits&date=${date}`} className="flex h-10 items-center px-2 text-sm text-muted hover:text-ink">Show everyone</Link>}
      </form>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {isToday && <Stat label="At a client right now" value={atClientNow} icon={<Navigation />} tone={atClientNow ? "info" : "neutral"} />}
        <Stat label="People who visited clients" value={groups.length} icon={<Users />} />
        <Stat label="Client stops" value={stops} hint={`${markedIn} marked in this day`} icon={<MapPin />} />
      </div>
      {groups.length === 0 ? (
        <EmptyState kind="calendar" title="No client visits">Nobody checked in at a client on {formatDate(dateOnly(date))}. Team members check in from their My attendance page.</EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => {
            const current = g.visits.find((v) => !v.endedAt);
            return (
              <li key={g.employee.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/app/attendance?tab=visits&date=${date}&employee=${g.employee.id}`} className="font-medium hover:underline">{nameOf(g.employee)}</Link>
                    <p className="text-xs text-muted">{g.employee.designation?.name ?? "Team member"}</p>
                  </div>
                  {current ? <Badge tone="info"><MapPin className="size-3" aria-hidden />{isToday ? "Now at" : "Last at"} {current.placeName} since {formatTime(current.startedAt, tz)}</Badge> : <Badge>Not at a client</Badge>}
                </div>
                <ol className="mt-3 space-y-2 border-l-2 border-line pl-4">
                  {g.visits.map((v, i) => {
                    const mins = v.endedAt ? (v.endedAt.getTime() - v.startedAt.getTime()) / 60000 : null;
                    const pin = map(v.startLatitude, v.startLongitude);
                    return (
                      <li key={v.id} className="relative text-sm">
                        <span aria-hidden className={`absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full ${v.endedAt ? "bg-ink/30" : "bg-info"}`} />
                        <p><span className="text-xs text-muted">{i + 1}.</span> <strong>{v.clientId ? <Link href={`/app/clients/${v.clientId}`} className="hover:underline">{v.placeName}</Link> : v.placeName}</strong></p>
                        <p className="text-xs text-muted">
                          {formatTime(v.startedAt, tz)} – {v.endedAt ? formatTime(v.endedAt, tz) : "now"}{mins !== null && ` · ${minutesToHhmm(mins)}`}
                          {pin && <> · <a href={pin} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">Map</a></>}
                        </p>
                        {v.purpose && <p className="text-xs">{v.purpose}</p>}
                      </li>
                    );
                  })}
                </ol>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- daily workers

export async function WorkersTab({ ctx, sp, today }: { ctx: AppContext; sp: SP; today: string }) {
  const view = sp.view === "pay" || sp.view === "list" ? sp.view : "sheet";
  const sub = [
    { key: "sheet", label: "Day sheet" },
    { key: "pay", label: "Pay" },
    { key: "list", label: "Workers" },
  ];
  return (
    <div className="space-y-5">
      <Notice tone="info">
        For labour taken on by the day, without a login. Add them under <strong>Workers</strong> with their daily wage; a senior marks them in and out with a photo from
        <strong> Mark for others</strong>; <strong>Pay</strong> adds up what each has earned and been paid.
      </Notice>
      <nav aria-label="Daily workers" className="flex w-fit flex-wrap gap-1 rounded-lg bg-subtle p-1">
        {sub.map((s) => (
          <Link key={s.key} href={`/app/attendance?tab=workers&view=${s.key}`} aria-current={s.key === view ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${s.key === view ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
            {s.label}
          </Link>
        ))}
      </nav>
      {view === "sheet" && <WorkerSheet ctx={ctx} sp={sp} today={today} />}
      {view === "pay" && <WorkerPay ctx={ctx} sp={sp} today={today} />}
      {view === "list" && <WorkerList ctx={ctx} />}
    </div>
  );
}

async function WorkerSheet({ ctx, sp, today }: { ctx: AppContext; sp: SP; today: string }) {
  const date = iso(sp.date) && iso(sp.date) <= today ? iso(sp.date) : today;
  const tz = ctx.organization.timezone;
  const rows = await workerDaySheet(ctx.organization.id, dateOnly(date));
  const present = rows.filter((r) => r.day && r.day.status !== "ABSENT").length;
  const wages = rows.reduce((s, r) => s + (r.day ? Number(r.day.wage) : 0), 0);
  const options = rows.filter((r) => r.worker.isActive).map((r) => ({ value: r.worker.id, label: r.worker.name + (r.worker.workType ? ` — ${r.worker.workType}` : "") }));
  return (
    <div className="space-y-5">
      <form className="flex flex-wrap items-end gap-2" aria-label="Day sheet date">
        <input type="hidden" name="tab" value="workers" />
        <input type="hidden" name="view" value="sheet" />
        <label className="text-sm"><span className="mb-1 block font-medium">Day</span><input type="date" name="date" defaultValue={date} max={today} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" /></label>
        <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show</button>
      </form>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Workers present" value={present} hint={`of ${rows.filter((r) => r.worker.isActive).length} active`} icon={<Users />} tone="ok" />
        <Stat label="Not marked" value={rows.filter((r) => !r.day && r.worker.isActive).length} icon={<Clock4 />} />
        <Stat label="Wages for the day" value={rupees(wages)} icon={<Wallet />} />
      </div>
      {rows.length === 0 ? (
        <EmptyState kind="people" title="No daily workers yet" action={<Link href="/app/attendance?tab=workers&view=list" className="text-sm font-medium text-brand-700 hover:underline">Add a worker</Link>}>
          Add the workers first, with their daily wage.
        </EmptyState>
      ) : (
        <Table minWidth={900}>
          <thead><tr><Th>Worker</Th><Th>Status</Th><Th>In</Th><Th>Out</Th><Th>Hours</Th><Th>Photos</Th><Th>Marked by</Th><Th>Wage</Th><Th>Notes</Th></tr></thead>
          <tbody>
            {rows.map(({ worker: w, day: d }) => (
              <tr key={w.id}>
                <Td><span className="font-medium">{w.name}</span><div className="text-xs text-muted">{[w.workType, w.contractor].filter(Boolean).join(" · ") || "—"}</div></Td>
                <Td>{d ? <StatusBadge status={d.status} /> : <span className="text-xs text-muted">Not marked</span>}{d && d.timeIn && !d.timeOut && date < today && <div><Badge tone="warn">No time out</Badge></div>}</Td>
                <Td>{formatTime(d?.timeIn, tz)}</Td>
                <Td>{formatTime(d?.timeOut, tz)}</Td>
                <Td>{d?.timeIn && d.timeOut ? minutesToHhmm((d.timeOut.getTime() - d.timeIn.getTime()) / 60000) : "—"}</Td>
                <Td><span className="flex gap-1"><Thumb fileId={d?.inPhotoFileId} label={`${w.name} – in`} size="sm" />{d?.outPhotoFileId && <Thumb fileId={d.outPhotoFileId} label={`${w.name} – out`} size="sm" />}</span></Td>
                <Td className="text-xs">{d?.markedBy?.name ?? "—"}{d && map(d.inLatitude, d.inLongitude) && <> · <a href={map(d.inLatitude, d.inLongitude)!} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">Map</a></>}</Td>
                <Td>{d ? rupees(Number(d.wage)) : "—"}{d?.paidAt && <div><Badge tone="ok">Paid</Badge></div>}</Td>
                <Td className="text-xs text-muted">{d?.remarks ?? ""}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {options.length > 0 && (
        <Card title="Record or correct a day by hand" className="max-w-3xl">
          <p className="mb-3 text-sm text-muted">For a day nobody marked, a half day or an absence. The wage for the day follows the status. A day already paid cannot be changed.</p>
          <WorkerDayForm action={saveWorkerDayAction} workers={options} date={date} />
        </Card>
      )}
    </div>
  );
}

async function WorkerPay({ ctx, sp, today }: { ctx: AppContext; sp: SP; today: string }) {
  const to = iso(sp.to) && iso(sp.to) <= today ? iso(sp.to) : today;
  let from = iso(sp.from) || `${today.slice(0, 7)}-01`;
  if (from > to) from = to;
  const rows = await workerPayoffs(ctx.organization.id, from, to);
  const total = rows.reduce((s, r) => ({ earned: s.earned + r.earned, paid: s.paid + r.paid, due: s.due + r.due }), { earned: 0, paid: 0, due: 0 });
  return (
    <div className="space-y-5">
      <form className="flex flex-wrap items-end gap-2" aria-label="Pay period">
        <input type="hidden" name="tab" value="workers" />
        <input type="hidden" name="view" value="pay" />
        <label className="text-sm"><span className="mb-1 block font-medium">From</span><input type="date" name="from" defaultValue={from} max={today} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" /></label>
        <label className="text-sm"><span className="mb-1 block font-medium">To</span><input type="date" name="to" defaultValue={to} max={today} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" /></label>
        <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Apply</button>
        <span className="ml-auto"><DownloadButton href={`/app/attendance/workers-export?from=${from}&to=${to}`}>Export to Excel</DownloadButton></span>
      </form>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Earned in the period" value={rupees(total.earned)} icon={<Wallet />} />
        <Stat label="Paid" value={rupees(total.paid)} icon={<CheckCircle2 />} tone="ok" />
        <Stat label="Still to pay" value={rupees(total.due)} icon={<ShieldAlert />} tone={total.due ? "warn" : "neutral"} />
      </div>
      {rows.length === 0 ? (
        <EmptyState kind="people" title="No daily workers yet">Add workers under the Workers view.</EmptyState>
      ) : (
        <Table minWidth={860}>
          <thead><tr><Th>Worker</Th><Th>Wage / day</Th><Th>Full days</Th><Th>Half days</Th><Th>Days worked</Th><Th>Earned</Th><Th>Paid</Th><Th>To pay</Th><Th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.worker.id}>
                <Td><span className="font-medium">{r.worker.name}</span>{!r.worker.isActive && <span className="ml-1 text-xs text-muted">(inactive)</span>}<div className="text-xs text-muted">{r.worker.contractor ?? ""}</div></Td>
                <Td>{rupees(Number(r.worker.dailyWage))}</Td>
                <Td>{r.fullDays}</Td>
                <Td>{r.halfDays}</Td>
                <Td>{r.daysWorked}</Td>
                <Td>{rupees(r.earned)}</Td>
                <Td>{rupees(r.paid)}</Td>
                <Td><strong className={r.due ? "text-warn" : ""}>{rupees(r.due)}</strong></Td>
                <Td className="whitespace-nowrap">
                  {r.due > 0 && <ActionButton action={workerPaidAction.bind(null, r.worker.id, from, to, true)} confirm={`Mark ${rupees(r.due)} as paid to ${r.worker.name} for this period?`} variant="primary">Mark paid</ActionButton>}
                  {r.paid > 0 && <span className="ml-1"><ActionButton action={workerPaidAction.bind(null, r.worker.id, from, to, false)} confirm={`Undo the payment recorded for ${r.worker.name} in this period?`} variant="ghost">Undo</ActionButton></span>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="text-xs text-muted">A full day earns the daily wage and a half day half of it, at the wage on the day it was marked. Change a day from the Day sheet.</p>
    </div>
  );
}

async function WorkerList({ ctx }: { ctx: AppContext }) {
  const workers = await prisma.dailyWorker.findMany({ where: { organizationId: ctx.organization.id }, orderBy: [{ isActive: "desc" }, { name: "asc" }], include: { _count: { select: { days: true } } } });
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <Card title="Add a daily worker">
        <WorkerForm action={saveWorkerAction.bind(null, null)} submitLabel="Add worker" />
      </Card>
      <Card title={`Workers (${workers.length})`} padded={false}>
        {workers.length === 0 ? (
          <p className="p-4 text-sm text-muted">No workers yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {workers.map((w) => (
              <li key={w.id} className="p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className={w.isActive ? "" : "text-muted"}>
                    <span className="font-medium">{w.name}</span> · {rupees(Number(w.dailyWage))}/day
                    <div className="text-xs text-muted">{[w.workType, w.contractor, w.mobile].filter(Boolean).join(" · ") || "—"} · {w._count.days} day(s) recorded</div>
                  </div>
                  <ActionButton action={toggleWorkerAction.bind(null, w.id, !w.isActive)} confirm={w.isActive ? `Set ${w.name} inactive? Their past days and pay stay.` : undefined}>
                    {w.isActive ? "Set inactive" : "Make active"}
                  </ActionButton>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-brand-700">Edit details or wage</summary>
                  <div className="mt-3">
                    <WorkerForm action={saveWorkerAction.bind(null, w.id)} submitLabel="Save" d={{ ...w, dailyWage: String(Number(w.dailyWage)) }} />
                    <p className="mt-2 text-xs text-muted">A new wage applies to days marked from now on.</p>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

