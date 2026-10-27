import Link from "next/link";
import { requireClientContext } from "@/lib/session";
import { formatDate } from "@/lib/dates";
import { portalOverview } from "@/lib/services/portal";
import { ArrowUpRight, Briefcase, CheckCircle2, ClipboardCheck, Inbox, Users, Wallet } from "lucide-react";
import { Donut } from "@/components/charts";
import { Avatar, Card, EmptyState, Notice, Stat, StatusBadge } from "@/components/ui";

const inr = (n: number) => `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const CLIENT_STATUS: Record<string, string> = {
  PENDING: "Not started", ASSIGNED: "Scheduled", IN_PROGRESS: "In progress", ON_HOLD: "On hold", PENDING_REVIEW: "Internal review",
  CHANGES_REQUESTED: "In progress", AWAITING_CLIENT: "Waiting for you", AWAITING_TEAM_MEMBER: "In progress",
};

export default async function ClientDashboard() {
  const ctx = await requireClientContext();
  const o = await portalOverview(ctx);
  const duesTotal = o.dues.reduce((s, d) => s + Number(d.amount), 0);
  return (
    <>
      <div className="app-rise pub-night-grid relative mb-6 overflow-hidden rounded-2xl px-6 py-6 text-paper sm:px-8">
        <div aria-hidden className="absolute -right-16 -top-20 size-64 rounded-full bg-marigold/20 blur-[80px]" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs text-paper/55">{o.client.clientCode}{o.client.legalName ? ` · ${o.client.legalName}` : ""}</p>
            <h1 className="mt-2 font-editorial text-4xl leading-none tracking-[-0.01em] sm:text-5xl">{o.client.tradeName}</h1>
            <p className="mt-3 text-sm text-paper/65">
              {o.requests.length > 0 ? `${o.requests.length} item${o.requests.length === 1 ? "" : "s"} needed from you` : "Nothing is pending from your side"} · {o.openWork.length} in progress
            </p>
          </div>
          <span className="rounded-full bg-paper px-1 py-0.5"><StatusBadge status={o.client.status} label={o.client.status === "ACTIVE" ? "Active client" : undefined} /></span>
        </div>
      </div>
      {o.client.status === "ON_HOLD" && <div className="mb-4"><Notice tone="warn">Your engagement is currently on hold. Contact the office for details.</Notice></div>}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Needed from you" value={o.requests.length} href="/client/requests" icon={<Inbox />} tone={o.requests.length ? "warn" : "ok"} />
        <Stat label="Work in progress" value={o.openWork.length} href="/client/work" icon={<Briefcase />} tone="info" />
        <Stat label="Awaiting your review" value={o.awaitingReview.length} href="/client/work" icon={<ClipboardCheck />} tone={o.awaitingReview.length ? "warn" : "neutral"} />
        <Stat label="Outstanding dues" value={duesTotal ? inr(duesTotal) : "—"} icon={<Wallet />} tone={duesTotal ? "warn" : "neutral"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <Card title="Information needed from you" icon={<Inbox />} actions={<Link href="/client/requests" className="group inline-flex items-center gap-0.5 text-xs font-medium text-muted hover:text-ink">All requests <ArrowUpRight className="size-3.5" aria-hidden /></Link>}>
            {o.requests.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted"><CheckCircle2 className="size-4 text-ok" aria-hidden /> Nothing is pending from your side.</p>
            ) : (
              <ul className="-mx-1 space-y-0.5 text-sm">
                {o.requests.map((r) => (
                  <li key={r.id}>
                    <Link href={`/client/requests/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-1 py-2 transition-colors hover:bg-paper">
                      <span className="font-medium text-ink">{r.requestDescription}</span>
                      <span className="rounded-md bg-warn-bg px-1.5 py-0.5 text-xs text-warn">{r.dueBy ? `Please provide by ${formatDate(r.dueBy)}` : `Requested ${formatDate(r.requestedOn)}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {o.awaitingReview.length > 0 && (
            <Card title="Work awaiting your review or confirmation">
              <ul className="divide-y divide-line text-sm">
                {o.awaitingReview.map((t) => <li key={t.id} className="py-2"><Link href={`/client/work/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.title}</Link></li>)}
              </ul>
            </Card>
          )}
          <Card title="Work being done by S S Dimri & Associates">
            {o.openWork.length === 0 ? <p className="text-sm text-muted">No open work items shared with you.</p> : (
              <ul className="divide-y divide-line text-sm">
                {o.openWork.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/client/work/${t.id}`} className="font-medium hover:underline">{t.title}</Link>
                    <span className="flex items-center gap-2 text-xs text-muted">
                      {t.dueAt && `Due ${formatDate(t.dueAt)}`}
                      <StatusBadge status={t.status === "AWAITING_CLIENT" ? "PENDING" : "IN_PROGRESS"} label={CLIENT_STATUS[t.status] ?? "In progress"} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recently completed">
            {o.completed.length === 0 ? <p className="text-sm text-muted">Nothing completed yet.</p> : (
              <ul className="divide-y divide-line text-sm">
                {o.completed.map((t) => <li key={t.id} className="flex justify-between gap-2 py-2"><Link href={`/client/work/${t.id}`} className="hover:underline">{t.title}</Link><span className="text-xs text-muted">{formatDate(t.completedAt)}</span></li>)}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Your services">
            {o.client.services.length === 0 ? <p className="text-sm text-muted">Services will appear here once confirmed.</p> : (
              <ul className="space-y-3 text-sm">
                {o.client.services.map((s) => (
                  <li key={s.id}>
                    <p className="font-medium">{s.service.name}</p>
                    {(s.timelineNote || s.dueDate) && <p className="text-xs text-muted">{s.timelineNote ?? `Due ${formatDate(s.dueDate)}`}</p>}
                    {s.pocName && <p className="text-xs text-muted">Contact: {s.pocName}{s.pocMobile ? ` · ${s.pocMobile}` : ""}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Where your work stands">
            <Donut
              centerLabel="Items"
              slices={[
                { label: "Needed from you", value: o.requests.length, href: "/client/requests" },
                { label: "In progress", value: o.openWork.length, href: "/client/work" },
                { label: "Awaiting your review", value: o.awaitingReview.length, href: "/client/work" },
                { label: "Recently completed", value: o.completed.length, href: "/client/work" },
              ]}
            />
          </Card>
          <Card title="Your team at S S Dimri" icon={<Users />}>
            {o.team.length === 0 ? <p className="text-sm text-muted">Your team will be shown once assigned.</p> : (
              <ul className="space-y-2.5 text-sm">
                {o.team.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5">
                    <Avatar name={`${a.employee.firstName} ${a.employee.lastName ?? ""}`} />
                    <span className="min-w-0"><span className="block font-medium">{a.employee.firstName} {a.employee.lastName}</span><span className="block text-xs text-muted">{a.employee.designation?.name}</span></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Outstanding dues">
            {o.dues.length === 0 ? <p className="text-sm text-muted">No outstanding dues.</p> : (
              <ul className="divide-y divide-line text-sm">
                {o.dues.map((d) => (
                  <li key={d.id} className="flex justify-between gap-2 py-2">
                    <span>{d.description}<span className="block text-xs text-muted">{[d.referenceNumber, d.dueDate && `due ${formatDate(d.dueDate)}`].filter(Boolean).join(" · ")}</span></span>
                    <span className="font-medium">{inr(Number(d.amount))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {o.requests.length + o.openWork.length + o.completed.length === 0 && (
        <div className="mt-6"><EmptyState kind="inbox" title="Welcome to your client portal">Requests from our team, work updates and documents will appear here.</EmptyState></div>
      )}
    </>
  );
}
