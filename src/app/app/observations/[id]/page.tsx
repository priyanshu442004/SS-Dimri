import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/dates";
import { OBSERVATION_TRANSITIONS } from "@/lib/domain/observation-workflow";
import { observationScope } from "@/lib/services/observations";
import { employeeOptions } from "@/lib/services/lookups";
import { Card, DetailList, humanize, PageHeader, StatusBadge } from "@/components/ui";
import { updateObservationAction } from "../actions";
import { ObservationUpdateForm } from "../forms";

/** Observation detail with status changes and full follow-up history (Page 56). */
export default async function ObservationDetail({ params }: PageProps<"/app/observations/[id]">) {
  const ctx = await requireCapability("app.use");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const o = await prisma.clientObservation.findFirst({
    where: { id, ...observationScope(ctx) },
    include: {
      client: { select: { id: true, tradeName: true } },
      task: { select: { id: true, title: true, status: true } },
      clientService: { select: { service: { select: { name: true } } } },
      responsible: { select: { firstName: true, lastName: true } },
      createdBy: { select: { name: true } },
      followUps: { orderBy: { createdAt: "desc" }, include: { actor: { select: { name: true } } } },
    },
  });
  if (!o) notFound();
  const manager = can(ctx.role, "observations.manage");
  const next = OBSERVATION_TRANSITIONS[o.status].filter((s) => manager || s !== "CLOSED").map((s) => ({ value: s, label: humanize(s) }));
  const employees = manager ? await employeeOptions(ctx.organization.id) : undefined;

  return (
    <>
      <PageHeader
        title={`Observation — ${o.client.tradeName}`}
        back={{ href: "/app/observations", label: "Client observations" }}
        description={<span className="flex items-center gap-2">{formatDate(o.observedOn)} <StatusBadge status={o.status} /></span>}
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="min-w-0 space-y-6">
          <Card title="Observation">
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{o.details}</p>
            <div className="mt-4 border-t border-line pt-4">
              <DetailList
                items={[
                  ["Client", <Link key="c" href={`/app/clients/${o.client.id}`} className="text-brand-700 hover:underline">{o.client.tradeName}</Link>],
                  ["Source", o.source === "CLIENT" ? "Raised by the client" : "Logged by the team"],
                  ["Related task", o.task ? <Link key="t" href={`/app/tasks/${o.task.id}`} className="text-brand-700 hover:underline">{o.task.title}</Link> : null],
                  ["Service", o.clientService?.service.name],
                  ["Responsible", o.responsible ? `${o.responsible.firstName} ${o.responsible.lastName ?? ""}` : "Unassigned"],
                  ["Recorded by", o.createdBy ? `${o.createdBy.name} · ${formatDateTime(o.createdAt)}` : formatDateTime(o.createdAt)],
                  ["Resolution", o.resolution],
                  ["Closed", o.closedAt ? formatDateTime(o.closedAt) : null],
                ]}
              />
            </div>
          </Card>
          <Card title="History">
            <ol className="space-y-3 text-sm">
              {o.followUps.map((f) => (
                <li key={f.id} className="border-l-2 border-line pl-3">
                  <p className="whitespace-pre-wrap">{f.note}</p>
                  <p className="text-xs text-muted">{f.actor?.name ?? "System"} · {formatDateTime(f.createdAt)}</p>
                </li>
              ))}
              <li className="border-l-2 border-line pl-3"><p>Recorded</p><p className="text-xs text-muted">{formatDateTime(o.createdAt)}</p></li>
            </ol>
          </Card>
        </div>
        <Card title="Update" className="h-fit">
          <ObservationUpdateForm action={updateObservationAction.bind(null, o.id)} next={next} employees={employees} current={o.responsibleEmployeeId ?? undefined} />
        </Card>
      </div>
    </>
  );
}
