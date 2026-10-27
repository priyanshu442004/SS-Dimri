import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { dateOnly, formatDate, formatDateTime, isoDateInTz } from "@/lib/dates";
import { daysPending } from "@/lib/domain/derived";
import { pendingScope } from "@/lib/services/worklog";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { Badge, Card, EmptyState, PageHeader, Stat, StatusBadge, TabNav } from "@/components/ui";
import { createPendingAction, updatePendingAction } from "../worklog-actions";
import { PendingForm, PendingUpdateForm } from "../worklog-forms";
import { Flag } from "lucide-react";

export default async function PendingPage({ searchParams }: PageProps<"/app/pending">) {
  const ctx = await requireCapability("pending.manage_own");
  const sp = await searchParams;
  const category = sp.tab === "communication" ? "COMMUNICATION" : "DAILY";
  const who = sp.with === "CLIENT" || sp.with === "TEAM_MEMBER" ? sp.with : "";
  const state = sp.state === "closed" ? "closed" : sp.state === "all" ? "all" : "open";
  const overdueOnly = sp.overdue === "1";
  const clientId = typeof sp.client === "string" && /^[0-9a-f-]{36}$/i.test(sp.client) ? sp.client : "";
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const todayDate = dateOnly(today);

  const where: Prisma.PendingItemWhereInput = {
    AND: [
      pendingScope(ctx),
      { category },
      who ? { pendingWith: who } : {},
      state === "open" ? { status: { not: "CLOSED" } } : state === "closed" ? { status: "CLOSED" } : {},
      overdueOnly ? { dueBy: { lt: todayDate }, status: { not: "CLOSED" } } : {},
      clientId ? { clientId } : {},
    ],
  };
  const [items, openCounts, clients, employees] = await Promise.all([
    prisma.pendingItem.findMany({
      where,
      orderBy: [{ dueBy: { sort: "asc", nulls: "last" } }, { requestedOn: "asc" }],
      take: 200,
      include: {
        client: { select: { id: true, tradeName: true } },
        pendingWithEmployee: { select: { firstName: true, lastName: true } },
        raisedByEmployee: { select: { firstName: true, lastName: true } },
        task: { select: { id: true, title: true } },
        timesheetEntry: { select: { id: true, workDate: true } },
        followUps: { orderBy: { createdAt: "desc" }, take: 8, include: { actor: { select: { name: true, memberships: { select: { role: true }, take: 1 } } } } },
      },
    }),
    prisma.pendingItem.groupBy({ by: ["pendingWith"], where: { AND: [pendingScope(ctx), { category, status: { not: "CLOSED" } }] }, _count: true }),
    activeClientOptions(ctx.organization.id),
    employeeOptions(ctx.organization.id),
  ]);
  const countFor = (w: string) => openCounts.find((c) => c.pendingWith === w)?._count ?? 0;
  const qs = (extra: Record<string, string>) => {
    const p = new URLSearchParams({ tab: category === "DAILY" ? "daily" : "communication", ...(who && { with: who }), state, ...(clientId && { client: clientId }), ...(overdueOnly && { overdue: "1" }) });
    for (const [k, v] of Object.entries(extra)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/app/pending?${p}`;
  };

  return (
    <>
      <PageHeader icon={<Flag />}
        title="Pending tracker"
        description={can(ctx.role, "pending.view_all") ? "Everything pending with clients and with the team. Days pending are calculated from the request date." : "Items you raised or that are pending with you."}
      />
      <TabNav
        current={category}
        tabs={[
          { key: "DAILY", label: "12A · Daily", href: "/app/pending?tab=daily" },
          { key: "COMMUNICATION", label: "12B · Communication", href: "/app/pending?tab=communication" },
        ]}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Open — with client" value={countFor("CLIENT")} href={qs({ with: "CLIENT", state: "open" })} />
        <Stat label="Open — with team" value={countFor("TEAM_MEMBER")} href={qs({ with: "TEAM_MEMBER", state: "open" })} />
      </div>
      <form className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="tab" value={category === "DAILY" ? "daily" : "communication"} />
        <select name="with" defaultValue={who} aria-label="Pending with" className="h-9 rounded-md border border-line bg-surface px-2">
          <option value="">Client & team</option><option value="CLIENT">Pending with client</option><option value="TEAM_MEMBER">Pending with team</option>
        </select>
        <select name="state" defaultValue={state} aria-label="Status" className="h-9 rounded-md border border-line bg-surface px-2">
          <option value="open">Open</option><option value="closed">Closed</option><option value="all">All</option>
        </select>
        <select name="client" defaultValue={clientId} aria-label="Client" className="h-9 max-w-48 rounded-md border border-line bg-surface px-2">
          <option value="">All clients</option>
          {clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <label className="flex items-center gap-1"><input type="checkbox" name="overdue" value="1" defaultChecked={overdueOnly} className="accent-brand-700" /> Overdue only</label>
        <button className="h-9 rounded-md border border-line bg-surface px-3 hover:bg-subtle">Apply</button>
      </form>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          {items.length === 0 ? <EmptyState kind="done" title="Nothing pending here" /> : items.map((i) => {
            const overdue = i.dueBy && i.dueBy < todayDate && i.status !== "CLOSED";
            return (
              <article key={i.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      {i.clientVisible && <Badge tone="brand">In client portal</Badge>}
                      <Badge tone={i.pendingWith === "CLIENT" ? "warn" : "info"}>{i.pendingWith === "CLIENT" ? "With client" : `With ${i.pendingWithEmployee?.firstName ?? "team"}`}</Badge>
                      {i.client && <Link href={`/app/clients/${i.client.id}`} className="hover:underline">{i.client.tradeName}</Link>}
                      <span>
                        Responsible: {i.pendingWith === "TEAM_MEMBER"
                          ? (i.pendingWithEmployee ? `${i.pendingWithEmployee.firstName} ${i.pendingWithEmployee.lastName ?? ""}`.trim() : "—")
                          : (i.raisedByEmployee ? `${i.raisedByEmployee.firstName} ${i.raisedByEmployee.lastName ?? ""}`.trim() : "—")}
                      </span>
                    </p>
                    <p className="mt-1 font-medium">{i.requestDescription}</p>
                    {i.remark && <p className="text-sm text-muted">{i.remark}</p>}
                    {(i.task || i.timesheetEntry) && (
                      <p className="mt-1 flex flex-wrap gap-3 text-xs">
                        {i.task && <Link href={`/app/tasks/${i.task.id}`} className="text-brand-700 hover:underline">Task: {i.task.title}</Link>}
                        {i.timesheetEntry && <Link href={`/app/timesheet/${i.timesheetEntry.id}`} className="text-brand-700 hover:underline">Timesheet entry {formatDate(i.timesheetEntry.workDate)}</Link>}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    <StatusBadge status={i.status} />
                    <p className="mt-1 text-muted">Asked {formatDate(i.requestedOn)} · due {formatDate(i.dueBy)}</p>
                    <p className={overdue ? "font-semibold text-danger" : "text-muted"}>{daysPending(i, undefined, ctx.organization.pendingDaysBasis)} days pending{overdue && " · overdue"}</p>
                  </div>
                </div>
                {i.followUps.length > 0 && (
                  <ol className="mt-3 space-y-1 border-t border-line pt-2 text-xs text-muted">
                    {i.followUps.map((f) => {
                      const fromClient = f.actor?.memberships[0]?.role === "CLIENT";
                      return (
                        <li key={f.id} className={fromClient ? "text-ink" : undefined}>
                          {formatDateTime(f.createdAt)} · {f.actor?.name}{fromClient && <> <Badge tone="warn">Client reply</Badge></>}{f.clientVisible && !fromClient && <> <Badge tone="info">Shared</Badge></>}: {f.note}
                          {f.nextFollowUpOn && ` (next: ${formatDate(f.nextFollowUpOn)})`}
                          {f.fileId && <> · <a href={`/api/files/${f.fileId}`} className="text-brand-700 underline" target="_blank" rel="noopener noreferrer">document</a></>}
                        </li>
                      );
                    })}
                  </ol>
                )}
                <div className="mt-3 border-t border-line pt-3">
                  <PendingUpdateForm action={updatePendingAction.bind(null, i.id)} status={i.status} canShare={i.clientVisible} />
                </div>
              </article>
            );
          })}
        </div>
        <Card title={`Add ${category === "DAILY" ? "daily" : "communication"} pending item`} className="h-fit">
          <PendingForm action={createPendingAction} clients={clients} employees={employees} category={category} today={today} defaultClient={clientId} />
        </Card>
      </div>
    </>
  );
}
