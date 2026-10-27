import { NO_EMPLOYEE } from "@/lib/ids";
import Link from "next/link";
import { clsx } from "clsx";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { addDays, dateOnly, formatDate, isoDateInTz, toIsoDate } from "@/lib/dates";
import { availabilityOn } from "@/lib/domain/allocation";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { ActionButton } from "@/components/action-button";
import { Card, EmptyState, humanize, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui";
import { changeAllocationAction, createAllocationAction, endAllocationAction } from "./actions";
import { AllocationForm, ChangeForm } from "./forms";
import { Users } from "lucide-react";

const DAYS = 14;

export default async function AllocationsPage({ searchParams }: PageProps<"/app/allocations">) {
  const ctx = await requireCapability("app.use");
  const sp = await searchParams;
  const viewAll = can(ctx.role, "allocations.view_all");
  const manage = can(ctx.role, "allocations.manage");
  const clientId = typeof sp.client === "string" ? sp.client : "";
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today;
  const start = dateOnly(from);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const end = days[DAYS - 1];
  const me = ctx.employee?.id;

  const allocations = await prisma.teamAllocation.findMany({
    where: {
      organizationId: ctx.organization.id,
      status: { in: ["ACTIVE", "PLANNED"] },
      ...(viewAll ? {} : { employeeId: me ?? NO_EMPLOYEE }),
      ...(clientId ? { clientId } : {}),
    },
    orderBy: [{ client: { tradeName: "asc" } }, { startDate: "asc" }],
    include: {
      client: {
        select: {
          id: true, tradeName: true, profilePictureFileId: true,
          contacts: { where: { isPrimary: true }, take: 1, select: { name: true, mobile: true } },
          services: { where: { status: "ACTIVE" }, select: { engagementNature: true, dueDate: true, timelineNote: true, service: { select: { name: true } } } },
        },
      },
      employee: { select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } } } },
      replacesAllocation: { select: { employee: { select: { firstName: true } } } },
    },
  });

  // Availability board: every relevant employee × next 14 days.
  const boardEmployees = viewAll
    ? await prisma.employee.findMany({
        where: { organizationId: ctx.organization.id, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } },
        orderBy: { firstName: "asc" },
        select: { id: true, firstName: true, lastName: true, designation: { select: { name: true, seniorityLevel: true } } },
      })
    : [];
  const boardSpans = viewAll
    ? await prisma.teamAllocation.findMany({
        where: { organizationId: ctx.organization.id, status: { in: ["ACTIVE", "PLANNED"] }, startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] },
        select: { employeeId: true, startDate: true, endDate: true, allocationPercent: true },
      })
    : [];
  const leaves = viewAll
    ? await prisma.leaveRequest.findMany({
        where: { organizationId: ctx.organization.id, status: "APPROVED", fromDate: { lte: end }, toDate: { gte: start } },
        select: { employeeId: true, fromDate: true, toDate: true },
      })
    : [];

  const [employees, clients] = manage ? await Promise.all([employeeOptions(ctx.organization.id), activeClientOptions(ctx.organization.id)]) : [[], []];
  const clientName = clientId ? allocations[0]?.client.tradeName : null;

  // Group allocations by client for the "expanded client details" view.
  const byClient = new Map<string, typeof allocations>();
  for (const a of allocations) byClient.set(a.client.id, [...(byClient.get(a.client.id) ?? []), a]);

  return (
    <>
      <PageHeader icon={<Users />}
        title={viewAll ? "Team allocation" : "My allocations"}
        description={viewAll ? "Who is working for which client, availability for the next two weeks, and allocation changes (history is kept)." : "Clients you are currently allocated to."}
      />

      {viewAll && (
        <Card
          title="Availability — next 14 days"
          className="mb-6"
          padded={false}
          actions={
            <span className="flex gap-2 text-sm">
              <Link className="text-muted hover:text-ink" href={`/app/allocations?from=${toIsoDate(addDays(start, -DAYS))}`}>← Earlier</Link>
              <Link className="text-muted hover:text-ink" href={`/app/allocations?from=${toIsoDate(addDays(start, DAYS))}`}>Later →</Link>
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-xs">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 bg-surface px-3 py-2 text-left font-semibold text-muted">Team member</th>
                  {days.map((d) => (
                    <th key={d.toISOString()} scope="col" className={clsx("px-1 py-2 text-center font-medium text-muted", toIsoDate(d) === today && "text-brand-700")}>
                      {d.toLocaleDateString("en-IN", { weekday: "narrow", timeZone: "UTC" })}
                      <div>{d.getUTCDate()}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {boardEmployees.map((e) => {
                  const spans = boardSpans.filter((s) => s.employeeId === e.id);
                  const empLeaves = leaves.filter((l) => l.employeeId === e.id);
                  return (
                    <tr key={e.id} className="border-t border-line/70">
                      <th scope="row" className="sticky left-0 bg-surface px-3 py-1.5 text-left font-normal">
                        <span className="font-medium text-ink">{e.firstName} {e.lastName}</span>
                        <span className="block text-muted">{e.designation?.name ?? "—"}{e.designation?.seniorityLevel ? ` · ${humanize(e.designation.seniorityLevel)}` : ""}</span>
                      </th>
                      {days.map((d) => {
                        const onLeave = empLeaves.some((l) => l.fromDate <= d && l.toDate >= d);
                        const sunday = d.getUTCDay() === 0;
                        const av = availabilityOn(d, spans);
                        const label = onLeave ? "Leave" : sunday ? "Sun" : av.level === "free" ? "Free" : av.level === "partial" ? `${av.percent}%` : "Busy";
                        return (
                          <td key={d.toISOString()} className="px-0.5 py-1">
                            <span
                              title={label}
                              className={clsx(
                                "block rounded px-0.5 py-1 text-center text-[11px] font-medium",
                                onLeave ? "bg-info-bg text-info" : sunday ? "bg-subtle text-muted" : av.level === "free" ? "bg-ok-bg text-ok" : av.level === "partial" ? "bg-warn-bg text-warn" : "bg-[#fbe3c9] text-warn",
                              )}
                            >
                              {label}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-3 py-2 text-xs text-muted">Green = free, orange = allocated (with %), blue = approved leave. Calculated from allocations and approved leave.</p>
        </Card>
      )}

      <div className={clsx("grid gap-6", manage && "lg:grid-cols-[2fr_1fr]")}>
        <div className="min-w-0 space-y-4">
          {clientName && (
            <p className="text-sm">
              Showing <strong>{clientName}</strong> · <Link href="/app/allocations" className="text-brand-700 hover:underline">show all clients</Link>
            </p>
          )}
          {byClient.size === 0 ? (
            <EmptyState kind="people" title="No current allocations">{manage ? "Allocate team members to clients using the form." : "You are not allocated to any client right now."}</EmptyState>
          ) : (
            [...byClient.values()].map((rows) => {
              const c = rows[0].client;
              return (
                <Card
                  key={c.id}
                  title={<Link href={`/app/clients/${c.id}`} className="hover:underline">{c.tradeName}</Link>}
                  actions={<Link href={`/app/allocations?client=${c.id}`} className="text-xs text-muted hover:text-ink">Only this client</Link>}
                >
                  <div className="mb-3 grid gap-2 text-xs text-muted sm:grid-cols-3">
                    <p><span className="font-medium text-ink">Services:</span> {c.services.map((s) => `${s.service.name}${s.engagementNature ? ` (${humanize(s.engagementNature)})` : ""}`).join(", ") || "—"}</p>
                    <p><span className="font-medium text-ink">Point of contact:</span> {c.contacts[0] ? `${c.contacts[0].name} ${c.contacts[0].mobile ?? ""}` : "—"}</p>
                    <p><span className="font-medium text-ink">Timeline:</span> {c.services.filter((s) => s.dueDate || s.timelineNote).map((s) => s.timelineNote ?? `due ${formatDate(s.dueDate)}`).join("; ") || "—"}</p>
                  </div>
                  <Table minWidth={560}>
                    <thead><tr><Th>Team member</Th><Th>Level</Th><Th>Period</Th><Th>Share</Th><Th>Status</Th>{manage && <Th />}</tr></thead>
                    <tbody>
                      {rows.map((a) => (
                        <tr key={a.id}>
                          <Td>
                            <Link href={`/app/allocations/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.employee.firstName} {a.employee.lastName}</Link>
                            <div className="text-xs text-muted">{a.employee.designation?.name}</div>
                            {a.replacesAllocation && <div className="text-xs text-muted">Replaced {a.replacesAllocation.employee.firstName}{a.changeReason ? ` — ${a.changeReason}` : ""}</div>}
                          </Td>
                          <Td>{a.seniorityLevel ? humanize(a.seniorityLevel) : "—"}</Td>
                          <Td className="text-xs">{formatDate(a.startDate)} – {a.endDate ? formatDate(a.endDate) : "ongoing"}</Td>
                          <Td>{a.allocationPercent ? `${a.allocationPercent}%` : "Full"}</Td>
                          <Td><StatusBadge status={a.status} /></Td>
                          {manage && (
                            <Td>
                              <details className="text-sm">
                                <summary className="cursor-pointer text-brand-700">Change</summary>
                                <div className="mt-2 w-64 space-y-3">
                                  <ChangeForm action={changeAllocationAction.bind(null, a.id)} employees={employees} today={today} />
                                  <ActionButton variant="danger" confirm="End this allocation today?" action={endAllocationAction.bind(null, a.id)}>End allocation</ActionButton>
                                </div>
                              </details>
                            </Td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </Card>
              );
            })
          )}
        </div>
        {manage && (
          <Card title="Allocate a team member" className="h-fit">
            <AllocationForm action={createAllocationAction} employees={employees} clients={clients} defaultClient={clientId} today={today} />
          </Card>
        )}
      </div>
    </>
  );
}
