import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { clsx } from "clsx";
import { ArrowUpRight, Bot, CircleAlert, FileText, FileUser, Inbox, MailCheck, MailWarning, MailX, Send, Tag, UserRound } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { formatDateTime } from "@/lib/dates";
import { ActionButton } from "@/components/action-button";
import { Avatar, Badge, Card, DownloadButton, EmptyState, Notice, PageHeader, Pagination, Stat, TabNav, Table, Td, Th } from "@/components/ui";
import { CAREER_STATUSES, MAIL_STATUSES, PAGE_SIZE, canManageCareers, careerStats, careersVersion, listResumes, parseResumeFilters, resumeDetail, type ResumeFilters } from "@/lib/services/careers";
import { DETAIL_FIELDS, DETAIL_LABELS } from "@/lib/careers/reply-parse";
import { mailboxStatus } from "@/lib/careers/mailbox";
import { deleteResumeAction, followUpAction, resendAction, resendFailedAction, rereadReplyAction, updateResumeAction } from "./actions";
import { UploadForm } from "./upload-form";
import { CareersLive } from "./live";
import { CandidatePanel, FollowUpForm, ResendForm, StatusForm } from "./forms";

export const metadata: Metadata = { title: "Careers" };

const selectCls = "h-10 rounded-lg border border-line bg-surface px-2 text-sm";
const STATUS_TONE = { NEW: "brand", SHORTLISTED: "info", INTERVIEW: "warn", SELECTED: "ok", ON_HOLD: "neutral", REJECTED: "danger" } as const;
const MAIL_TONE = { PENDING: "neutral", SENT: "ok", FAILED: "danger", SKIPPED: "info", BOUNCED: "danger", TEST: "neutral" } as const;
const MAIL_ICON = { PENDING: Send, SENT: MailCheck, FAILED: MailX, SKIPPED: MailCheck, BOUNCED: MailWarning, TEST: Send } as const;
const SOURCE_LABEL: Record<string, string> = { RESUME: "From the resume", CHECKED: "Checked by the uploader", TYPED: "Typed by the uploader" };
const FRESH_MS = 30 * 60_000;

type Row = Awaited<ReturnType<typeof listResumes>>["rows"][number];

// Careers (client request 28 Nov 2026): everyone uploads resumes (one at a time) and sees their own;
// administrators see all of them, who uploaded and who referred each, the email sent, and the
// candidate's reply — which arrives on the page by itself (see live.tsx).
export default async function CareersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireCapability("careers.use");
  const sp = await searchParams;
  const admin = canManageCareers(ctx);
  const tab = admin && sp.tab !== "mine" ? "all" : "mine";
  const f = parseResumeFilters(sp);
  const tz = ctx.organization.timezone;
  const selfName = ctx.employee ? `${ctx.employee.firstName} ${ctx.employee.lastName ?? ""}`.trim() : ctx.user.name;

  const [list, version, team, stats, box] = await Promise.all([
    listResumes(ctx, f, { all: tab === "all" }),
    careersVersion(ctx),
    prisma.employee.findMany({ where: { organizationId: ctx.organization.id, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } }, orderBy: { firstName: "asc" }, select: { firstName: true, lastName: true } }),
    admin ? careerStats(ctx) : null,
    admin ? mailboxStatus() : null,
  ]);
  const viewId = admin && typeof sp.view === "string" && /^[0-9a-f-]{36}$/i.test(sp.view) ? sp.view : null;
  const detail = viewId ? await resumeDetail(ctx, viewId) : null;

  const qs = (patch: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string> = { tab: tab === "mine" && admin ? "mine" : "", q: f.q, status: f.status, mail: f.mail, replied: f.replied, page: f.page > 1 ? String(f.page) : "" };
    for (const [k, v] of Object.entries({ ...base, ...patch })) if (v !== null && v !== "") p.set(k, String(v));
    const s = p.toString();
    return `/app/careers${s ? `?${s}` : ""}`;
  };
  const closeHref = qs({ view: null });

  return (
    <>
      <PageHeader icon={<FileUser />} title="Careers"
        description={admin
          ? "Every resume the team uploads, who uploaded and who referred each candidate, the email each candidate got, and their replies — which appear here on their own as they arrive."
          : "Upload a candidate's resume and say who referred them. The candidate is emailed straight away at the address in the resume, asking for their CTC, notice period, interview slots and location."}
        actions={<>
          <CareersLive initialVersion={version} admin={admin} />
          {admin && tab === "all" && <DownloadButton href={`/app/careers/export${qs({ page: null, tab: null }).replace("/app/careers", "")}`}>Export to Excel</DownloadButton>}
        </>} />

      {admin && box && !box.configured && (
        <div className="mb-4"><Notice tone="warn">Candidates&apos; replies cannot be read: the careers mailbox is not set up on the server (IMAP settings, or the SMTP account it reuses). Emails still go out.</Notice></div>
      )}

      {/* Administrators mostly review: the register gets the full width and the upload form opens on a
          click (it starts open on "Uploaded by me"). Team members have the form beside their uploads. */}
      {admin && (
        <details open={tab === "mine"} className="group app-rise mb-5 rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgb(15_29_51/.04)] open:shadow-[0_18px_40px_-30px_rgb(15_29_51/.45)]">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-brand-700"><Send className="size-4" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-ink">Upload a resume</span>
              <span className="block text-xs text-muted">The candidate is emailed as soon as it is uploaded</span>
            </span>
            <span className="text-xs font-medium text-brand-700 group-open:hidden">Open</span>
            <span className="hidden text-xs font-medium text-muted group-open:inline">Close</span>
          </summary>
          <div className="grid gap-6 border-t border-line p-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <UploadForm selfName={selfName} team={team.map((e) => `${e.firstName} ${e.lastName ?? ""}`.trim())} />
            <div className="hidden text-sm leading-relaxed text-muted lg:block">
              <p className="font-medium text-ink">What happens</p>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>The email address is read from the resume — you see it before anything is sent.</li>
                <li>The candidate is emailed at once for their CTC, notice period, interview slots and location.</li>
                <li>Their reply arrives here on its own: the details fill in, and the conversation is in the resume&apos;s panel.</li>
              </ol>
            </div>
          </div>
        </details>
      )}

      <div className={clsx("grid grid-cols-1 gap-6", !admin && "xl:grid-cols-[minmax(0,23rem)_minmax(0,1fr)]")}>
        {!admin && (
          <div className="xl:sticky xl:top-20 xl:self-start">
            <Card title="Upload a resume" icon={<Send />}>
              <UploadForm selfName={selfName} team={team.map((e) => `${e.firstName} ${e.lastName ?? ""}`.trim())} />
            </Card>
            <p className="mt-3 px-1 text-xs leading-relaxed text-muted">
              One resume at a time. The email address is read from the resume itself — you see it before anything is sent. The candidate is asked to reply with their current and expected CTC, notice period, interview slots and current location.
            </p>
          </div>
        )}

        <div className="min-w-0 space-y-4">
          {admin && <TabNav current={tab} tabs={[
            { key: "all", label: "All resumes", href: "/app/careers", count: stats?.total },
            { key: "mine", label: "Uploaded by me", href: "/app/careers?tab=mine" },
          ]} />}

          {admin && stats && tab === "all" && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Resumes (last 30 days)" value={stats.month} hint={`${stats.total} in all`} icon={<FileText />} />
              <Stat label="Candidates who replied" value={stats.replied} tone="ok" icon={<Inbox />} href={qs({ replied: f.replied === "yes" ? null : "yes", page: null })} active={f.replied === "yes"} />
              <Stat label="Not reviewed yet" value={stats.fresh} tone="info" icon={<Tag />} href={qs({ status: f.status === "NEW" ? null : "NEW", page: null })} active={f.status === "NEW"} />
              <Stat label="Email problems" value={stats.failed} tone={stats.failed ? "danger" : "neutral"} icon={<MailWarning />} href={qs({ mail: f.mail === "FAILED" ? null : "FAILED", page: null })} active={f.mail === "FAILED"}
                hint={stats.failed ? "Not sent or bounced" : "Every email went out"} />
            </div>
          )}

          {admin && tab === "all" && stats && stats.failed > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/25 bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
              <span className="flex items-center gap-2"><CircleAlert className="size-4 shrink-0" aria-hidden /> {stats.failed} candidate{stats.failed === 1 ? "" : "s"} did not get the email (not sent, or the address bounced).</span>
              <ActionButton action={resendFailedAction} variant="secondary">Send unsent emails again</ActionButton>
            </div>
          )}

          <Filters f={f} admin={tab === "all"} tab={tab === "mine" && admin ? "mine" : ""} />

          {list.rows.length === 0 ? (
            <EmptyState kind="documents" title={f.q || f.status || f.mail || f.replied ? "No resume matches" : tab === "all" ? "No resumes yet" : "You have not uploaded a resume yet"}>
              {f.q || f.status || f.mail || f.replied ? "Try other filters." : "Upload one with the form — the candidate is emailed at once and the upload shows here with the time it was made."}
            </EmptyState>
          ) : tab === "all" ? (
            <AllTable rows={list.rows} tz={tz} openHref={(id) => qs({ view: id })} openId={viewId} now={new Date().getTime()} />
          ) : (
            <MineList rows={list.rows} tz={tz} admin={admin} openHref={(id) => qs({ view: id })} />
          )}
          <Pagination page={f.page} pageSize={PAGE_SIZE} total={list.total} hrefFor={(p) => qs({ page: p })} />
        </div>
      </div>

      {detail && <Detail d={detail} tz={tz} closeHref={closeHref} />}
    </>
  );
}

function Filters({ f, admin, tab }: { f: ResumeFilters; admin: boolean; tab: string }) {
  return (
    <form className="flex flex-wrap items-end gap-2" role="search">
      {tab && <input type="hidden" name="tab" value={tab} />}
      <input name="q" defaultValue={f.q} placeholder={admin ? "Name, email, phone, referrer, uploader, ref" : "Name, email, phone, referrer"} aria-label="Search resumes" className={`${selectCls} w-full sm:w-72`} />
      {admin && (
        <select name="status" defaultValue={f.status} aria-label="Status" className={selectCls}>
          <option value="">Any status</option>
          {Object.entries(CAREER_STATUSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      )}
      <select name="mail" defaultValue={f.mail} aria-label="Email" className={selectCls}>
        <option value="">Any email status</option>
        <option value="SENT">Sent</option><option value="FAILED">Not sent</option><option value="BOUNCED">Bounced</option><option value="SKIPPED">Already emailed</option>
      </select>
      {admin && (
        <select name="replied" defaultValue={f.replied} aria-label="Reply" className={selectCls}>
          <option value="">Replied or not</option><option value="yes">Replied</option><option value="no">No reply yet</option>
        </select>
      )}
      <button className="h-10 rounded-lg border border-line bg-surface px-4 text-sm transition-colors hover:bg-subtle">Apply</button>
      {(f.q || f.status || f.mail || f.replied) && <Link href={`/app/careers${tab ? "?tab=mine" : ""}`} className="h-10 px-2 text-sm leading-10 text-muted hover:text-ink">Clear</Link>}
    </form>
  );
}

function MailBadge({ status, at, tz }: { status: string; at?: Date | null; tz: string }) {
  const Icon = MAIL_ICON[status as keyof typeof MAIL_ICON] ?? Send;
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <Badge tone={MAIL_TONE[status as keyof typeof MAIL_TONE] ?? "neutral"}><Icon className="size-3" aria-hidden />{MAIL_STATUSES[status as keyof typeof MAIL_STATUSES] ?? status}</Badge>
      {at && status === "SENT" && <span className="text-[11px] text-muted">{formatDateTime(at, tz)}</span>}
    </span>
  );
}

function Referral({ r }: { r: Row }) {
  return r.referredBy === "SELF"
    ? <span>{r.referrerName}<span className="block text-[11px] text-muted">Self</span></span>
    : <span>{r.referrerName}<span className="block text-[11px] text-muted">Referred by someone else</span></span>;
}

function ReplyCell({ r, now }: { r: Row; now: number }) {
  const fresh = r.lastReplyAt && now - r.lastReplyAt.getTime() < FRESH_MS;
  if (!r.replyCount) return <span className="text-xs text-muted">{r.mailStatus === "SENT" ? "Waiting for reply" : "—"}</span>;
  const shown = DETAIL_FIELDS.filter((k) => r[k]);
  return (
    // Keyed on the reply count: a new reply re-mounts the cell, so it glows once as it arrives.
    <div key={`${r.id}-${r.replyCount}`} className={clsx("-mx-1 rounded-lg px-1 py-0.5", fresh && "cv-new")}>
      <span className="flex items-center gap-1.5 text-xs font-medium text-ok">
        <Inbox className="size-3.5" aria-hidden /> Replied{r.replyCount > 1 ? ` (${r.replyCount})` : ""}
        {fresh && <span className="rounded bg-marigold-soft px-1 text-[10px] font-semibold uppercase tracking-wide text-warn">New</span>}
      </span>
      {shown.length > 0 && <span className="mt-0.5 block max-w-[15rem] truncate text-[11px] text-muted" title={shown.map((k) => `${DETAIL_LABELS[k]}: ${r[k]}`).join("\n")}>
        {r.currentCtc ? `Now ${r.currentCtc}` : ""}{r.expectedCtc ? `${r.currentCtc ? " → " : "Expects "}${r.expectedCtc}` : ""}{!r.currentCtc && !r.expectedCtc ? shown.map((k) => r[k]).join(" · ") : ""}
      </span>}
    </div>
  );
}

function AllTable({ rows, tz, openHref, openId, now }: { rows: Row[]; tz: string; openHref: (id: string) => string; openId: string | null; now: number }) {
  return (
    <>
    {/* Phones: one card per resume. */}
    <ul className="space-y-2.5 md:hidden">
      {rows.map((r, i) => (
        <li key={r.id} className="app-rise" style={{ "--d": `${Math.min(i, 12) * 25}ms` } as CSSProperties}>
          <Link href={openHref(r.id)} scroll={false} className="block rounded-xl border border-line bg-surface p-3.5 shadow-[0_1px_2px_rgb(15_29_51/.04)] active:scale-[.99]">
            <div className="flex items-start gap-2.5">
              <Avatar name={r.candidateName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center justify-between gap-2"><span className="truncate font-medium text-ink">{r.candidateName}</span><Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{CAREER_STATUSES[r.status as keyof typeof CAREER_STATUSES] ?? r.status}</Badge></p>
                <p className="break-all text-xs text-muted">{r.candidateEmail}</p>
                <p className="mt-1 text-[11px] text-muted">{formatDateTime(r.createdAt, tz)} · {r.referredBy === "SELF" ? `${r.referrerName} (self)` : `referred by ${r.referrerName}`}</p>
                <div className="mt-2 flex flex-wrap items-start gap-3"><MailBadge status={r.mailStatus} tz={tz} /><ReplyCell r={r} now={now} /></div>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
    <div className="hidden md:block">
    <Table minWidth={860}>
      <thead><tr><Th>Uploaded</Th><Th>Candidate</Th><Th>Referred / uploaded by</Th><Th>Email & reply</Th><Th>Status</Th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.id} className={clsx("app-rise", r.id === openId && "bg-paper")} style={{ "--d": `${Math.min(i, 12) * 25}ms` } as CSSProperties}>
            <Td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt, tz)}<span className="block font-mono text-[11px] text-muted">{r.ref}</span></Td>
            <Td>
              <Link href={openHref(r.id)} scroll={false} className="group flex items-center gap-2.5">
                <Avatar name={r.candidateName} size="sm" />
                <span className="min-w-0">
                  <span className="block font-medium text-ink group-hover:underline">{r.candidateName}</span>
                  <span className="block break-all text-xs text-muted">{r.candidateEmail}</span>
                  {r.candidatePhone && <span className="block font-mono text-[11px] text-muted">{r.candidatePhone}</span>}
                </span>
              </Link>
            </Td>
            <Td className="text-sm">
              <Referral r={r} />
              <span className="mt-1 block text-[11px] text-muted">Uploaded by <span className="text-ink">{r.uploadedBy?.name ?? "—"}</span></span>
            </Td>
            <Td><div className="space-y-1.5"><MailBadge status={r.mailStatus} at={r.mailedAt} tz={tz} /><ReplyCell r={r} now={now} /></div></Td>
            <Td>
              <div className="flex flex-col items-start gap-1.5">
                <Badge tone={STATUS_TONE[r.status as keyof typeof STATUS_TONE] ?? "neutral"}>{CAREER_STATUSES[r.status as keyof typeof CAREER_STATUSES] ?? r.status}</Badge>
                <Link href={openHref(r.id)} scroll={false} className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-brand-700 hover:underline">Open <ArrowUpRight className="size-3.5" aria-hidden /></Link>
              </div>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
    </div>
    </>
  );
}

/** A team member's own uploads: what they sent, to which address, and whether the email went. */
function MineList({ rows, tz, admin, openHref }: { rows: Row[]; tz: string; admin: boolean; openHref: (id: string) => string }) {
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.id} className="app-rise rounded-xl border border-line bg-surface p-3.5 shadow-[0_1px_2px_rgb(15_29_51/.04)] transition-[border-color,box-shadow] duration-300 hover:border-ink/20 hover:shadow-[0_14px_30px_-24px_rgb(15_29_51/.5)]" style={{ "--d": `${Math.min(i, 12) * 30}ms` } as CSSProperties}>
          <div className="flex flex-wrap items-start gap-3">
            <Avatar name={r.candidateName} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-medium text-ink">{r.candidateName}</span>
                <span className="font-mono text-[11px] text-muted">{r.ref}</span>
              </div>
              <p className="mt-0.5 break-all text-xs text-muted">Email to <span className="text-ink">{r.mailTo ?? r.candidateEmail}</span></p>
              <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                <div><dt className="text-muted">Uploaded</dt><dd className="text-ink">{formatDateTime(r.createdAt, tz)}</dd></div>
                <div><dt className="text-muted">Referred by</dt><dd className="text-ink">{r.referrerName}{r.referredBy === "SELF" ? " (self)" : ""}</dd></div>
                <div><dt className="text-muted">Resume</dt><dd>{r.file && !r.file.deletedAt ? <a href={`/api/files/${r.file.id}`} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">{r.file.originalFileName}</a> : "—"}</dd></div>
              </dl>
            </div>
            <div className="flex flex-col items-end gap-2">
              <MailBadge status={r.mailStatus} at={r.mailedAt} tz={tz} />
              {admin && <Link href={openHref(r.id)} scroll={false} className="text-xs font-medium text-brand-700 hover:underline">Open</Link>}
            </div>
          </div>
          {r.mailStatus === "FAILED" && <p className="mt-2 rounded-md bg-danger-bg px-2 py-1 text-xs text-danger">The email could not be sent yet. An administrator can send it again — you don&apos;t need to upload it again.</p>}
          {r.mailStatus === "BOUNCED" && <p className="mt-2 rounded-md bg-danger-bg px-2 py-1 text-xs text-danger">The candidate&apos;s mail server returned the email: the address may be wrong. Tell an administrator the correct address.</p>}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------- the candidate panel

type D = NonNullable<Awaited<ReturnType<typeof resumeDetail>>>;

function Section({ title, icon, children, d = 0 }: { title: string; icon: ReactNode; children: ReactNode; d?: number }) {
  return (
    <section className="ops-rise rounded-xl border border-line bg-surface" style={{ "--d": `${d}ms` } as CSSProperties}>
      <h3 className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-semibold text-ink [&_svg]:size-4 [&_svg]:text-muted">{icon}{title}</h3>
      <div className="p-4">{children}</div>
    </section>
  );
}

function followUpSubject(d: D) {
  const last = [...d.replies].reverse().find((r) => r.kind === "REPLY" || r.kind === "FOLLOW_UP");
  const base = (last?.subject ?? d.email.subject).replace(/^(?:\s*(?:re|fwd?|aw)\s*:\s*)+/i, "");
  return `Re: ${base}`;
}

function Detail({ d, tz, closeHref }: { d: D; tz: string; closeHref: string }) {
  const hasDetails = DETAIL_FIELDS.some((k) => d[k]);
  return (
    <CandidatePanel closeHref={closeHref} title={d.candidateName}>
      <div className="ops-rise flex flex-wrap items-center gap-3">
        <Avatar name={d.candidateName} />
        <div className="min-w-0 flex-1">
          <p className="break-all text-sm text-ink">{d.candidateEmail} <span className="ml-1 text-xs text-muted">· {SOURCE_LABEL[d.emailSource] ?? d.emailSource}</span></p>
          <p className="text-xs text-muted">{d.candidatePhone ? <span className="font-mono">{d.candidatePhone} · </span> : null}Ref <span className="font-mono">{d.ref}</span> · uploaded {formatDateTime(d.createdAt, tz)}</p>
        </div>
        <Badge tone={STATUS_TONE[d.status as keyof typeof STATUS_TONE] ?? "neutral"}>{CAREER_STATUSES[d.status as keyof typeof CAREER_STATUSES] ?? d.status}</Badge>
      </div>

      <Section title="Details from the candidate" icon={<Inbox />} d={40}>
        {hasDetails ? (
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DETAIL_FIELDS.map((k) => (
              <div key={k} className={clsx("rounded-lg border px-3 py-2", d[k] ? "border-ok/25 bg-ok-bg/50" : "border-dashed border-line")}>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">{DETAIL_LABELS[k]}</dt>
                <dd className={clsx("mt-0.5 text-sm", d[k] ? "font-medium text-ink" : "text-muted")}>{d[k] ?? "Not given"}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted">{d.replyCount ? "The candidate replied (below) but did not give these details in a form that could be read." : d.mailStatus === "SENT" ? "No reply yet. It appears here by itself when the candidate answers." : "No reply — the email has not reached the candidate yet."}</p>
        )}
        {d.detailsAt && <p className="mt-2 text-[11px] text-muted">Taken from the reply of {formatDateTime(d.detailsAt, tz)}, as the candidate wrote them.</p>}
      </Section>

      <Section title="Resume & referral" icon={<UserRound />} d={80}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Resume</dt><dd>{d.file && !d.file.deletedAt ? <a href={`/api/files/${d.file.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"><FileText className="size-3.5" aria-hidden />{d.file.originalFileName}</a> : "Removed"}</dd></div>
          <div><dt className="text-xs text-muted">Referred by</dt><dd className="text-ink">{d.referrerName} <span className="text-xs text-muted">({d.referredBy === "SELF" ? "self" : "someone else"})</span></dd></div>
          <div><dt className="text-xs text-muted">Uploaded by</dt><dd className="text-ink">{d.uploadedBy?.name ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted">Uploaded on</dt><dd className="text-ink">{formatDateTime(d.createdAt, tz)}</dd></div>
          {d.emailsFound.length > 1 && <div className="sm:col-span-2"><dt className="text-xs text-muted">Addresses in the resume</dt><dd className="break-all text-ink">{d.emailsFound.join(", ")}</dd></div>}
        </dl>
      </Section>

      <Section title="Email conversation" icon={<MailCheck />} d={120}>
        <ol className="relative space-y-4 before:absolute before:inset-y-1 before:left-[11px] before:w-px before:bg-line">
          <li className="relative pl-8">
            <span className="absolute left-0 top-0.5 grid size-6 place-items-center rounded-full border border-line bg-surface text-brand-700"><Send className="size-3" aria-hidden /></span>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium text-ink">Email to {d.mailTo ?? d.candidateEmail}</span>
              <MailBadge status={d.mailStatus} tz={tz} />
            </div>
            <p className="text-xs text-muted">{d.mailedAt ? `Sent ${formatDateTime(d.mailedAt, tz)}` : "Not sent yet"}{d.mailCount > 1 ? ` · sent ${d.mailCount} times` : ""}{d.replyTo ? ` · replies come to ${d.replyTo}` : ""}</p>
            {d.mailError && <p className="mt-1 rounded-md bg-danger-bg px-2 py-1 text-xs text-danger">{d.mailError}</p>}
            <details className="group mt-2 rounded-lg border border-line bg-paper/60">
              <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium text-brand-700 [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show the email that was sent</span><span className="hidden group-open:inline">Hide the email</span>
              </summary>
              <div className="border-t border-line px-3 py-2.5 text-xs">
                <p><span className="text-muted">Subject:</span> {d.email.subject}</p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-ink">{d.email.text}</pre>
              </div>
            </details>
          </li>
          {d.replies.map((r) => (
            <li key={r.id} className="relative pl-8">
              <span className={clsx("absolute left-0 top-0.5 grid size-6 place-items-center rounded-full border bg-surface", r.kind === "BOUNCE" ? "border-danger/30 text-danger" : r.kind === "AUTO_REPLY" ? "border-line text-muted" : r.kind === "FOLLOW_UP" ? "border-brand-200 text-brand-700" : "border-ok/30 text-ok")}>
                {r.kind === "BOUNCE" ? <MailWarning className="size-3" aria-hidden /> : r.kind === "AUTO_REPLY" ? <Bot className="size-3" aria-hidden /> : r.kind === "FOLLOW_UP" ? <Send className="size-3" aria-hidden /> : <Inbox className="size-3" aria-hidden />}
              </span>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-ink">{r.kind === "BOUNCE" ? "Returned as undeliverable" : r.kind === "AUTO_REPLY" ? "Automatic reply" : r.kind === "FOLLOW_UP" ? `Follow-up by ${r.fromName ?? "an administrator"}` : `Reply from ${r.fromName || r.fromEmail}`}</span>
                {r.kind === "FOLLOW_UP" && <Badge tone={r.status === "SENT" ? "ok" : "danger"}>{r.status === "SENT" ? "Sent" : "Not sent"}</Badge>}
                {r.kind === "REPLY" && <Badge tone={r.status === "APPLIED" ? "ok" : r.status === "FAILED" ? "danger" : "neutral"}>{r.status === "APPLIED" ? "Details read" : r.status === "FAILED" ? "Details not read yet" : r.status === "PROCESSING" ? "Reading…" : "No details found"}</Badge>}
              </div>
              <p className="text-xs text-muted">{formatDateTime(r.receivedAt, tz)} · {r.kind === "FOLLOW_UP" ? `to ${d.mailTo ?? d.candidateEmail}` : r.fromEmail}{r.folder !== "INBOX" && r.folder !== "SENT" ? ` · found in ${r.folder.replace(/^INBOX\./, "")}` : ""}</p>
              {r.kind === "FOLLOW_UP" && r.error && <p className="mt-1 rounded-md bg-danger-bg px-2 py-1 text-xs text-danger">{r.error}</p>}
              <blockquote className={clsx("mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border px-3 py-2 text-[13px] leading-relaxed text-ink", r.kind === "FOLLOW_UP" ? "border-brand-100 bg-brand-50/60" : "border-line bg-paper/60")}>{r.bodyText}</blockquote>
              {r.kind === "REPLY" && <div className="mt-1.5"><ActionButton action={rereadReplyAction.bind(null, r.id)} variant="ghost">Read the details again</ActionButton></div>}
            </li>
          ))}
          {!d.replies.some((r) => r.kind === "REPLY") && d.mailStatus === "SENT" && (
            <li className="relative pl-8 text-xs text-muted">
              <span className="absolute left-[7px] top-1 size-2.5 rounded-full bg-ok cv-live-dot text-ok" aria-hidden />
              Waiting for the candidate&apos;s reply — it will appear here on its own.
            </li>
          )}
        </ol>
        {d.attempts.length > 0 && (
          <details className="mt-4 text-xs">
            <summary className="cursor-pointer text-muted hover:text-ink">Delivery log ({d.attempts.length})</summary>
            <ul className="mt-2 divide-y divide-line rounded-lg border border-line">
              {d.attempts.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                  <Badge tone={a.status === "SENT" ? "ok" : a.status === "FAILED" ? "danger" : "neutral"}>{a.status === "SENT" ? "Accepted by the mail server" : a.status === "FAILED" ? "Failed" : "Skipped"}</Badge>{a.template === "careers.follow_up" && <span className="text-muted">Follow-up</span>}
                  <span className="break-all">{a.toEmail}</span><span className="text-muted">{formatDateTime(a.createdAt, tz)}</span>
                  {a.error && <span className="w-full text-danger">{a.error}</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      {(d.mailStatus === "SENT" || d.replies.length > 0) && d.mailStatus !== "BOUNCED" && (
        <Section title="Write to the candidate" icon={<Send />} d={150}>
          <FollowUpForm key={d.replies.length} action={followUpAction.bind(null, d.id)} subject={followUpSubject(d)} />
        </Section>
      )}

      <Section title="Review" icon={<Tag />} d={160}>
        <StatusForm action={updateResumeAction.bind(null, d.id)} status={d.status} note={d.adminNote ?? ""} statuses={Object.entries(CAREER_STATUSES).map(([value, label]) => ({ value, label }))} />
      </Section>

      <Section title="Email again" icon={<Send />} d={200}>
        <ResendForm action={resendAction.bind(null, d.id)} email={d.candidateEmail} />
      </Section>

      <div className="flex justify-end pb-2">
        <ActionButton variant="ghost" action={deleteResumeAction.bind(null, d.id)} confirm={`Remove ${d.candidateName}'s resume, its replies and the file? This cannot be undone.`}>Remove this resume</ActionButton>
      </div>
    </CandidatePanel>
  );
}
