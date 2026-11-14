import { NO_EMPLOYEE } from "@/lib/ids";
import Link from "next/link";
import { clsx } from "clsx";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { addDays, dateOnly, formatDate, isoDateInTz, toIsoDate } from "@/lib/dates";
import { availabilityOn, bookedOn, capacityFromPolicy, describeHours, formatHours, spanHours, type AllocationSpan } from "@/lib/domain/allocation";
import { ALLOCATION_RESOURCE_TYPES, ALLOCATION_ROLES } from "@/lib/domain/allocation-import";
import { describeSchedule, FREQUENCIES, isPlannedOn, plannedDates } from "@/lib/domain/allocation-schedule";
import { getPolicy } from "@/lib/services/attendance";
import { refreshAllocationStatuses } from "@/lib/services/allocations";
import { allocationWhere, ALLOCATION_STATUS_FILTERS, filtersQuery, parseAllocationFilters } from "@/lib/services/allocation-views";
import { DeleteButton } from "@/components/delete-dialog";
import { canDelete } from "@/lib/services/deletions";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, DownloadButton, EmptyState, humanize, LinkButton, PageHeader, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { changeAllocationAction, createAllocationAction, endAllocationAction } from "./actions";
import { AllocationForm, ChangeForm } from "./forms";
import { Users } from "lucide-react";

const DAYS = 14;
const VIEWS = ["client", "person", "free"] as const;
const selectCls = "h-10 rounded-md border border-line bg-surface px-2 text-sm";

export default async function AllocationsPage({ searchParams }: PageProps<"/app/allocations">) {
  const ctx = await requireCapability("allocations.use");
  const sp = await searchParams;
  const viewAll = can(ctx, "allocations.view_all");
  const manage = can(ctx, "allocations.manage");
  const filters = parseAllocationFilters(sp);
  const view = viewAll && VIEWS.includes(sp.view as never) ? (sp.view as (typeof VIEWS)[number]) : "client";
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  // Allocations past their To date end by themselves; planned ones start on their day.
  await refreshAllocationStatuses(ctx.organization.id, today);
  const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : today;
  const freeOn = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const start = dateOnly(from);
  const days = Array.from({ length: DAYS }, (_, i) => addDays(start, i));
  const end = days[DAYS - 1];
  const me = ctx.employee?.id;
  const { row: policy } = await getPolicy(ctx.organization.id);
  const capacity = capacityFromPolicy(policy);
  const num = (d: unknown) => (d === null || d === undefined ? null : Number(d));
  const mayDelete = canDelete(ctx, "allocation");
  const monthStart = dateOnly(`${today.slice(0, 7)}-01`);
  const todayDate = dateOnly(today);

  const allocations = await prisma.teamAllocation.findMany({
    where: allocationWhere(ctx.organization.id, filters, viewAll ? undefined : me ?? NO_EMPLOYEE),
    orderBy: [{ client: { tradeName: "asc" } }, { startDate: "asc" }],
    take: 2000,
    include: {
      client: {
        select: {
          id: true, tradeName: true, clientCode: true,
          contacts: { where: { isPrimary: true }, take: 1, select: { name: true, mobile: true } },
          services: { where: { status: "ACTIVE" }, select: { engagementNature: true, dueDate: true, timelineNote: true, service: { select: { name: true } } } },
        },
      },
      employee: { select: { id: true, firstName: true, lastName: true, designation: { select: { name: true } } } },
      reportsTo: { select: { firstName: true } },
      replacesAllocation: { select: { employee: { select: { firstName: true } } } },
    },
  });
  const spanOf = (a: (typeof allocations)[number]): AllocationSpan => ({
    startDate: a.startDate, endDate: a.endDate, firstHalfHours: num(a.firstHalfHours), secondHalfHours: num(a.secondHalfHours),
    weekDays: a.weekDays, frequency: a.frequency, visitDays: a.visitDays, allowOverlap: a.allowOverlap,
  });

  // Allocated vs actual: hours logged in the timesheet under each allocation this month.
  const logged = allocations.length
    ? await prisma.timesheetEntry.groupBy({ by: ["teamAllocationId"], where: { teamAllocationId: { in: allocations.map((a) => a.id) }, workDate: { gte: monthStart, lte: todayDate } }, _sum: { approxMinutes: true } })
    : [];
  const loggedHours = new Map(logged.map((g) => [g.teamAllocationId, (g._sum.approxMinutes ?? 0) / 60]));
  const plannedHours = (a: (typeof allocations)[number]) => {
    const s = spanOf(a);
    const h = spanHours(s, capacity);
    return plannedDates(s, monthStart, todayDate).length * (h.first + h.second);
  };

  // Availability board and "free on a day": every current team member.
  const needBoard = viewAll && view !== "person";
  const [boardEmployees, boardSpans, leaves] = viewAll
    ? await Promise.all([
        prisma.employee.findMany({
          where: { organizationId: ctx.organization.id, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } },
          orderBy: { firstName: "asc" },
          select: { id: true, firstName: true, lastName: true, designation: { select: { name: true, seniorityLevel: true } } },
        }),
        prisma.teamAllocation.findMany({
          where: { organizationId: ctx.organization.id, status: { in: ["ACTIVE", "PLANNED"] } },
          select: { employeeId: true, startDate: true, endDate: true, firstHalfHours: true, secondHalfHours: true, weekDays: true, frequency: true, visitDays: true, client: { select: { tradeName: true } } },
        }),
        prisma.leaveRequest.findMany({
          where: { organizationId: ctx.organization.id, status: "APPROVED", fromDate: { lte: end > dateOnly(freeOn) ? end : dateOnly(freeOn) }, toDate: { gte: start < dateOnly(freeOn) ? start : dateOnly(freeOn) } },
          select: { employeeId: true, fromDate: true, toDate: true },
        }),
      ])
    : [[], [], []];
  const spansOf = (employeeId: string) =>
    boardSpans.filter((s) => s.employeeId === employeeId).map((s) => ({
      startDate: s.startDate, endDate: s.endDate, firstHalfHours: num(s.firstHalfHours), secondHalfHours: num(s.secondHalfHours),
      weekDays: s.weekDays, frequency: s.frequency, visitDays: s.visitDays, clientName: s.client.tradeName,
    }));

  const [employees, clients] = manage || viewAll ? await Promise.all([employeeOptions(ctx.organization.id), activeClientOptions(ctx.organization.id)]) : [[], []];
  const clientName = filters.client ? clients.find((c) => c.value === filters.client)?.label ?? allocations[0]?.client.tradeName : null;
  const resourceTypes = [...new Set([...ALLOCATION_RESOURCE_TYPES, ...(await prisma.teamAllocation.findMany({ where: { organizationId: ctx.organization.id, resourceType: { not: null } }, distinct: ["resourceType"], select: { resourceType: true } })).map((r) => r.resourceType!)])];

  const byClient = new Map<string, typeof allocations>();
  for (const a of allocations) byClient.set(a.client.id, [...(byClient.get(a.client.id) ?? []), a]);
  const byPerson = new Map<string, typeof allocations>();
  for (const a of [...allocations].sort((x, y) => x.employee.firstName.localeCompare(y.employee.firstName))) byPerson.set(a.employee.id, [...(byPerson.get(a.employee.id) ?? []), a]);
  const filtered = !!(filters.client || filters.person || filters.type || filters.frequency || filters.q || filters.status !== "current");

  const rowCells = (a: (typeof allocations)[number], showClient: boolean) => {
    const s = spanOf(a);
    const planned = plannedHours(a);
    const done = loggedHours.get(a.id) ?? 0;
    return (
      <>
        <Td>
          {showClient ? (
            <Link href={`/app/clients/${a.client.id}`} className="font-medium text-brand-700 hover:underline">{a.client.tradeName}</Link>
          ) : (
            <Link href={`/app/allocations/${a.id}`} className="font-medium text-brand-700 hover:underline">{a.employee.firstName} {a.employee.lastName}</Link>
          )}
          <div className="text-xs text-muted">{[a.seniorityLevel ? ALLOCATION_ROLES[a.seniorityLevel] : null, a.resourceType].filter(Boolean).join(" · ") || a.employee.designation?.name}</div>
          {a.replacesAllocation && <div className="text-xs text-muted">Replaced {a.replacesAllocation.employee.firstName}{a.changeReason ? ` — ${a.changeReason}` : ""}</div>}
        </Td>
        <Td className="text-xs">{describeSchedule(s)}<div className="text-muted">{describeHours(s, capacity)}{a.allowOverlap ? " · overlap allowed" : ""}</div></Td>
        <Td className="text-xs">
          {formatDate(a.startDate)} – {a.endDate ? formatDate(a.endDate) : "ongoing"}
          <div className="mt-1"><StatusBadge status={a.status} /></div>
          {a.reportsTo && <div className="mt-1 text-muted">Reviewer: {a.reportsTo.firstName}</div>}
        </Td>
        <Td className="text-xs">{planned > 0 || done > 0 ? <span className={clsx(planned > 0 && done < planned * 0.5 && "text-warn")}>{formatHours(Math.round(done * 10) / 10)} of {formatHours(planned)} h</span> : "—"}</Td>
      </>
    );
  };

  return (
    <>
      <PageHeader icon={<Users />}
        title={viewAll ? "Team allocation" : "My allocations"}
        description={viewAll ? "Who works for which client, on which days, and who is free. Changes keep the history." : "Clients you are allocated to, and on which days."}
        actions={
          <>
            {viewAll && <DownloadButton href={`/app/allocations/export${filtersQuery(filters)}`}>Export to Excel</DownloadButton>}
            {manage && <LinkButton variant="secondary" href="/app/allocations/import">Import from Excel</LinkButton>}
          </>
        }
      />

      {viewAll && (
        <TabNav
          current={view}
          tabs={[
            { key: "client", label: "By client", href: `/app/allocations${filtersQuery(filters)}` },
            { key: "person", label: "By team member", href: `/app/allocations${filtersQuery(filters, { view: "person" })}` },
            { key: "free", label: "Who is free", href: `/app/allocations?view=free` },
          ]}
        />
      )}

      {view !== "free" && (
        <form className="mb-4 flex flex-wrap gap-2" role="search">
          {view !== "client" && <input type="hidden" name="view" value={view} />}
          <input name="q" defaultValue={filters.q} placeholder="Search client, person or remark" aria-label="Search allocations" className="h-10 w-full max-w-xs rounded-md border border-line bg-surface px-3 text-sm" />
          {viewAll && (
            <>
              <select name="client" defaultValue={filters.client} aria-label="Client" className={clsx(selectCls, "max-w-[14rem]")}>
                <option value="">All clients</option>
                {clients.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <select name="person" defaultValue={filters.person} aria-label="Team member" className={clsx(selectCls, "max-w-[14rem]")}>
                <option value="">All team members</option>
                {employees.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
              <select name="type" defaultValue={filters.type} aria-label="Resource type" className={selectCls}>
                <option value="">All resource types</option>
                {resourceTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select name="freq" defaultValue={filters.frequency} aria-label="Frequency" className={selectCls}>
                <option value="">Any frequency</option>
                {Object.entries(FREQUENCIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </>
          )}
          <select name="status" defaultValue={filters.status} aria-label="Status" className={selectCls}>
            {Object.entries(ALLOCATION_STATUS_FILTERS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Apply</button>
          {filtered && <Link href={`/app/allocations${view !== "client" ? `?view=${view}` : ""}`} className="flex h-10 items-center px-2 text-sm text-muted hover:text-ink">Clear</Link>}
        </form>
      )}

      {needBoard && view === "client" && !filtered && (
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
                  const spans = spansOf(e.id);
                  const empLeaves = leaves.filter((l) => l.employeeId === e.id);
                  return (
                    <tr key={e.id} className="border-t border-line/70">
                      <th scope="row" className="sticky left-0 bg-surface px-3 py-1.5 text-left font-normal">
                        <Link href={`/app/allocations?view=person&person=${e.id}`} className="font-medium text-ink hover:underline">{e.firstName} {e.lastName}</Link>
                        <span className="block text-muted">{e.designation?.name ?? "—"}{e.designation?.seniorityLevel ? ` · ${humanize(e.designation.seniorityLevel)}` : ""}</span>
                      </th>
                      {days.map((d) => {
                        const onLeave = empLeaves.some((l) => l.fromDate <= d && l.toDate >= d);
                        const sunday = d.getUTCDay() === 0;
                        const av = availabilityOn(d, spans, capacity);
                        const at = spans.filter((s) => s.startDate <= d && (s.endDate ?? d) >= d && isPlannedOn(s, d)).map((s) => s.clientName);
                        const label = onLeave ? "Leave" : sunday ? "Sun" : av.level === "free" ? "Free" : av.level === "busy" ? "Busy" : `${formatHours(av.first)}+${formatHours(av.second)}`;
                        const full = onLeave ? "On approved leave" : sunday ? "Sunday" : `First half ${formatHours(av.first)} of ${formatHours(capacity.first)} h, second half ${formatHours(av.second)} of ${formatHours(capacity.second)} h${at.length ? ` — ${at.join(", ")}` : ""}`;
                        return (
                          <td key={d.toISOString()} className="px-0.5 py-1">
                            <span
                              title={full}
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
          <p className="border-t border-line px-3 py-2 text-xs text-muted">Green = free, orange = hours booked (first half + second half), blue = approved leave. Only the days a person is planned at a client count (week days and visit days). Hover a day to see the clients. The first half has {formatHours(capacity.first)} h and the second half {formatHours(capacity.second)} h, from the firm&apos;s timing policy.</p>
        </Card>
      )}

      {view === "free" && (() => {
        const d = dateOnly(freeOn);
        const rows = boardEmployees.map((e) => {
          const spans = spansOf(e.id);
          const b = bookedOn(d, spans, capacity);
          const onLeave = leaves.some((l) => l.employeeId === e.id && l.fromDate <= d && l.toDate >= d);
          const at = spans.filter((s) => s.startDate <= d && (s.endDate ?? d) >= d && isPlannedOn(s, d));
          return { e, b, onLeave, at, left: { first: Math.max(0, capacity.first - b.first), second: Math.max(0, capacity.second - b.second) } };
        });
        const free = rows.filter((r) => !r.onLeave && r.b.first === 0 && r.b.second === 0);
        const partly = rows.filter((r) => !r.onLeave && (r.b.first > 0 || r.b.second > 0) && (r.left.first > 0 || r.left.second > 0));
        const sunday = d.getUTCDay() === 0;
        return (
          <div className="space-y-6">
            <form className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="view" value="free" />
              <label className="text-sm"><span className="mb-1 block font-medium">Day</span><input type="date" name="day" defaultValue={freeOn} className="h-10 rounded-md border border-line bg-surface px-3 text-sm" /></label>
              <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Show</button>
            </form>
            {sunday && <p className="text-sm text-muted">{formatDate(d)} is a Sunday.</p>}
            <Card title={`Not allocated on ${formatDate(d)} (${free.length})`} padded={false}>
              {free.length === 0 ? <p className="p-4 text-sm text-muted">Everyone has client work planned that day.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {free.map(({ e }) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                      <span><span className="font-medium">{e.firstName} {e.lastName}</span> <span className="text-xs text-muted">{e.designation?.name}</span></span>
                      <Link href={`/app/allocations?view=person&person=${e.id}`} className="text-xs text-brand-700 hover:underline">Their allocations</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title={`Partly free (${partly.length})`} padded={false}>
              {partly.length === 0 ? <p className="p-4 text-sm text-muted">Nobody is partly free.</p> : (
                <Table minWidth={560}>
                  <thead><tr><Th>Team member</Th><Th>Planned at</Th><Th>Hours left</Th></tr></thead>
                  <tbody>
                    {partly.map(({ e, at, left }) => (
                      <tr key={e.id}>
                        <Td className="font-medium">{e.firstName} {e.lastName}</Td>
                        <Td className="text-xs">{at.map((s) => s.clientName).join(", ")}</Td>
                        <Td className="text-xs">{[left.first > 0 && `1st half ${formatHours(left.first)} h`, left.second > 0 && `2nd half ${formatHours(left.second)} h`].filter(Boolean).join(" · ")}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
            {rows.some((r) => r.onLeave) && <p className="text-sm text-muted">On leave: {rows.filter((r) => r.onLeave).map((r) => r.e.firstName).join(", ")}.</p>}
          </div>
        );
      })()}

      {view !== "free" && (
        <div className={clsx("grid gap-6", manage && view === "client" && "lg:grid-cols-[2fr_1fr]")}>
          <div className="min-w-0 space-y-4">
            {clientName && (
              <p className="text-sm">
                Showing <strong>{clientName}</strong> · <Link href="/app/allocations" className="text-brand-700 hover:underline">show all clients</Link>
              </p>
            )}
            {allocations.length === 0 ? (
              <EmptyState kind="people" title={filtered ? "No allocations match" : "No current allocations"}>
                {filtered ? "Try other filters." : manage ? "Allocate team members to clients using the form, or import the Team Allocation sheet." : "You are not allocated to any client right now."}
              </EmptyState>
            ) : view === "person" ? (
              [...byPerson.values()].map((rows) => {
                const e = rows[0].employee;
                const t = bookedOn(todayDate, rows.filter((a) => a.status === "ACTIVE").map(spanOf), capacity);
                return (
                  <Card key={e.id} title={`${e.firstName} ${e.lastName ?? ""}`.trim()} actions={<span className="text-xs text-muted">{rows.length} {rows.length === 1 ? "client" : "clients"} · today {formatHours(t.first + t.second)} of {formatHours(capacity.first + capacity.second)} h booked</span>}>
                    <Table minWidth={600}>
                      <thead><tr><Th>Client</Th><Th>Days &amp; hours</Th><Th>Period</Th><Th>Logged this month</Th></tr></thead>
                      <tbody>{rows.map((a) => <tr key={a.id}>{rowCells(a, true)}</tr>)}</tbody>
                    </Table>
                  </Card>
                );
              })
            ) : (
              [...byClient.values()].map((rows) => {
                const c = rows[0].client;
                return (
                  <Card
                    key={c.id}
                    title={<Link href={`/app/clients/${c.id}`} className="hover:underline">{c.tradeName}</Link>}
                    actions={viewAll && !filters.client ? <Link href={`/app/allocations?client=${c.id}`} className="text-xs text-muted hover:text-ink">Only this client</Link> : undefined}
                  >
                    <div className="mb-3 grid gap-2 text-xs text-muted sm:grid-cols-3">
                      <p><span className="font-medium text-ink">Services:</span> {c.services.map((s) => `${s.service.name}${s.engagementNature ? ` (${humanize(s.engagementNature)})` : ""}`).join(", ") || "—"}</p>
                      <p><span className="font-medium text-ink">Point of contact:</span> {c.contacts[0] ? `${c.contacts[0].name} ${c.contacts[0].mobile ?? ""}` : "—"}</p>
                      <p><span className="font-medium text-ink">Timeline:</span> {c.services.filter((s) => s.dueDate || s.timelineNote).map((s) => s.timelineNote ?? `due ${formatDate(s.dueDate)}`).join("; ") || "—"}</p>
                    </div>
                    <Table minWidth={600}>
                      <thead><tr><Th>Team member</Th><Th>Days &amp; hours</Th><Th>Period</Th><Th>Logged this month</Th>{manage && <Th />}</tr></thead>
                      <tbody>
                        {rows.map((a) => (
                          <tr key={a.id}>
                            {rowCells(a, false)}
                            {manage && (
                              <Td>
                                {a.status === "ACTIVE" || a.status === "PLANNED" ? (
                                  <details className="text-sm">
                                    <summary className="cursor-pointer text-brand-700">Change</summary>
                                    <div className="mt-2 w-64 space-y-3">
                                      <ChangeForm action={changeAllocationAction.bind(null, a.id)} employees={employees} today={today} />
                                      <div className="flex flex-wrap gap-2">
                                        <ActionButton variant="danger" confirm="End this allocation today?" action={endAllocationAction.bind(null, a.id)}>End allocation</ActionButton>
                                        {mayDelete && <DeleteButton entity="allocation" id={a.id} />}
                                      </div>
                                    </div>
                                  </details>
                                ) : mayDelete ? <DeleteButton entity="allocation" id={a.id} /> : null}
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
            {allocations.length >= 2000 && <Badge tone="warn">Showing the first 2,000 allocations; use the filters to narrow down.</Badge>}
          </div>
          {manage && view === "client" && (
            <Card title="Allocate a team member" className="h-fit">
              <AllocationForm action={createAllocationAction} employees={employees} clients={clients} defaultClient={filters.client} today={today} capacity={capacity} />
            </Card>
          )}
        </div>
      )}
    </>
  );
}
