import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDate, isoDateInTz } from "@/lib/dates";
import { observationScope } from "@/lib/services/observations";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { Badge, Card, EmptyState, PageHeader, StatusBadge, TabNav } from "@/components/ui";
import { createObservationAction } from "./actions";
import { ObservationCreateForm } from "./forms";
import { MessageSquareWarning } from "lucide-react";

const UUID = /^[0-9a-f-]{36}$/i;

/** Client observations register (Page 56). */
export default async function ObservationsPage({ searchParams }: PageProps<"/app/observations">) {
  const ctx = await requireCapability("app.use");
  const sp = await searchParams;
  const state = sp.state === "closed" ? "closed" : sp.state === "all" ? "all" : "open";
  const clientId = typeof sp.client === "string" && UUID.test(sp.client) ? sp.client : "";
  const manager = can(ctx.role, "observations.manage");

  const where: Prisma.ClientObservationWhereInput = {
    AND: [
      observationScope(ctx),
      state === "open" ? { status: { in: ["OPEN", "IN_PROGRESS"] } } : state === "closed" ? { status: { in: ["RESOLVED", "CLOSED"] } } : {},
      clientId ? { clientId } : {},
    ],
  };
  const [items, clients, employees] = await Promise.all([
    prisma.clientObservation.findMany({
      where,
      orderBy: [{ observedOn: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        client: { select: { id: true, tradeName: true } },
        task: { select: { id: true, title: true } },
        responsible: { select: { firstName: true, lastName: true } },
        followUps: { orderBy: { createdAt: "desc" }, take: 1, select: { note: true, createdAt: true } },
      },
    }),
    manager ? activeClientOptions(ctx.organization.id) : Promise.resolve([]),
    manager ? employeeOptions(ctx.organization.id) : Promise.resolve([]),
  ]);
  const qs = (s: string) => `/app/observations?state=${s}${clientId ? `&client=${clientId}` : ""}`;

  return (
    <>
      <PageHeader icon={<MessageSquareWarning />}
        title="Client observations"
        description={manager ? "Observations raised by clients or logged by the team, with their resolution history." : "Observations assigned to you."}
      />
      <TabNav current={state} tabs={[{ key: "open", label: "Open", href: qs("open") }, { key: "closed", label: "Resolved & closed", href: qs("closed") }, { key: "all", label: "All", href: qs("all") }]} />
      <div className={manager ? "grid gap-6 lg:grid-cols-[2fr_1fr]" : ""}>
        <div className="min-w-0 space-y-3">
          {items.length === 0 ? <EmptyState kind="done" title="No observations here" /> : items.map((o) => (
            <Link key={o.id} href={`/app/observations/${o.id}`} className="block rounded-lg border border-line bg-surface p-4 text-sm hover:border-brand-300">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="font-medium">{o.client.tradeName}</p>
                <span className="flex items-center gap-2"><Badge tone={o.source === "CLIENT" ? "warn" : "neutral"}>{o.source === "CLIENT" ? "From client" : "Logged by team"}</Badge><StatusBadge status={o.status} /></span>
              </div>
              <p className="mt-1 line-clamp-2">{o.details}</p>
              <p className="mt-2 text-xs text-muted">
                {formatDate(o.observedOn)} · Responsible: {o.responsible ? `${o.responsible.firstName} ${o.responsible.lastName ?? ""}` : "unassigned"}
                {o.task && ` · Task: ${o.task.title}`}
              </p>
              {o.followUps[0] && <p className="mt-1 truncate text-xs text-muted">Latest: {o.followUps[0].note}</p>}
            </Link>
          ))}
        </div>
        {manager && (
          <Card title="Log an observation" className="h-fit">
            <ObservationCreateForm action={createObservationAction} clients={clients} employees={employees} today={isoDateInTz(new Date(), ctx.organization.timezone)} defaultClient={clientId || undefined} />
          </Card>
        )}
      </div>
    </>
  );
}
