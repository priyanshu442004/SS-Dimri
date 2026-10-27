import { NO_EMPLOYEE } from "@/lib/ids";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDateTime, isoDateInTz } from "@/lib/dates";
import { isTaskOverdue } from "@/lib/domain/derived";
import { OPEN_STATUSES } from "@/lib/domain/task-workflow";
import { taskScope } from "@/lib/services/tasks";
import { MonthCalendar } from "@/components/month-calendar";
import { Badge, EmptyState, LinkButton, PageHeader, Pagination, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { ListChecks } from "lucide-react";

const PAGE_SIZE = 30;

const BOARD: { title: string; statuses: string[] }[] = [
  { title: "To do", statuses: ["PENDING", "ASSIGNED"] },
  { title: "In progress", statuses: ["IN_PROGRESS", "CHANGES_REQUESTED"] },
  { title: "Waiting", statuses: ["AWAITING_CLIENT", "AWAITING_TEAM_MEMBER", "ON_HOLD"] },
  { title: "In review", statuses: ["PENDING_REVIEW"] },
  { title: "Done", statuses: ["COMPLETED"] },
];

/** Timestamp bounds of a calendar month ("YYYY-MM") in IST. */
function istMonthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { gte: new Date(`${month}-01T00:00:00+05:30`), lt: new Date(`${next}-01T00:00:00+05:30`) };
}

export default async function TasksPage({ searchParams }: PageProps<"/app/tasks">) {
  const ctx = await requireCapability("app.use");
  const sp = await searchParams;
  const view = sp.view === "calendar" ? "calendar" : sp.view === "board" ? "board" : "list";
  const scope = typeof sp.scope === "string" ? sp.scope : can(ctx.role, "tasks.view_all") ? "all" : "mine";
  const state = typeof sp.state === "string" ? sp.state : "open";
  const clientId = typeof sp.client === "string" && /^[0-9a-f-]{36}$/i.test(sp.client) ? sp.client : "";
  const priority = sp.priority === "ASAP" || sp.priority === "HIGH" || sp.priority === "MEDIUM" || sp.priority === "LOW" ? sp.priority : "";
  const sort = sp.sort === "newest" || sp.sort === "title" || sp.sort === "updated" ? sp.sort : "due";
  const orderBy: Prisma.TaskOrderByWithRelationInput[] =
    sort === "newest" ? [{ createdAt: "desc" }] : sort === "title" ? [{ title: "asc" }] : sort === "updated" ? [{ updatedAt: "desc" }]
      : [{ isAsap: "desc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }];
  const page = Math.max(1, Number(sp.page) || 1);
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : today.slice(0, 7);
  const me = ctx.employee?.id ?? NO_EMPLOYEE;

  const where: Prisma.TaskWhereInput = {
    AND: [
      taskScope(ctx),
      scope === "mine" ? { OR: [{ assignments: { some: { employeeId: me, removedAt: null } } }, { makerEmployeeId: me }] } : {},
      scope === "review" ? { status: "PENDING_REVIEW", OR: [{ checkerEmployeeId: me }, ...(can(ctx.role, "tasks.review") ? [{ checkerEmployeeId: null }] : [])] } : {},
      state === "open" ? { status: { in: OPEN_STATUSES } } : state === "overdue" ? { status: { in: OPEN_STATUSES }, dueAt: { lt: new Date() } } : state === "done" ? { status: { in: ["COMPLETED", "CANCELLED"] } } : {},
      clientId ? { clientId } : {},
      priority === "ASAP" ? { isAsap: true } : priority ? { priority } : {},
      view === "calendar" ? { dueAt: istMonthBounds(month) } : {},
    ],
  };

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy,
      skip: view === "list" ? (page - 1) * PAGE_SIZE : 0, // board and calendar show up to 500
      take: view === "list" ? PAGE_SIZE : 500,
      select: {
        id: true, title: true, status: true, priority: true, isAsap: true, dueAt: true, makerStatus: true, checkerStatus: true,
        client: { select: { tradeName: true } },
        assignments: { where: { removedAt: null }, select: { employee: { select: { firstName: true } } } },
      },
    }),
    prisma.task.count({ where }),
  ]);

  const params = (extra: Record<string, string | number>) => {
    const p = new URLSearchParams({ scope, state, view, ...(clientId && { client: clientId }), ...(priority && { priority }), ...(sort !== "due" && { sort }) });
    for (const [k, v] of Object.entries(extra)) p.set(k, String(v));
    return `/app/tasks?${p}`;
  };

  return (
    <>
      <PageHeader icon={<ListChecks />}
        title="Tasks"
        description="Team members update the status of their tasks and add remarks; tasks cannot be deleted by team members."
        actions={can(ctx.role, "tasks.create") && <LinkButton href="/app/tasks/new">New task</LinkButton>}
      />
      <TabNav
        current={scope}
        tabs={[
          { key: "mine", label: "My tasks", href: params({ scope: "mine", page: 1 }) },
          ...(can(ctx.role, "tasks.review") || ctx.employee ? [{ key: "review", label: "Awaiting my review", href: params({ scope: "review", state: "all", page: 1 }) }] : []),
          ...(can(ctx.role, "tasks.view_all") ? [{ key: "all", label: "All tasks", href: params({ scope: "all", page: 1 }) }] : []),
        ]}
      />
      <form className="mb-4 flex flex-wrap items-center gap-2" aria-label="Filters">
        <input type="hidden" name="scope" value={scope} />
        <input type="hidden" name="view" value={view} />
        {clientId && <input type="hidden" name="client" value={clientId} />}
        <select name="state" defaultValue={state} aria-label="Status" className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
          <option value="open">Open</option>
          <option value="overdue">Overdue</option>
          <option value="done">Completed / cancelled</option>
          <option value="all">All</option>
        </select>
        <select name="priority" defaultValue={priority} aria-label="Priority" className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
          <option value="">Any priority</option>
          <option value="ASAP">ASAP</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        {view === "list" && (
          <select name="sort" defaultValue={sort} aria-label="Sort" className="h-9 rounded-md border border-line bg-surface px-2 text-sm">
            <option value="due">ASAP, then due date</option>
            <option value="newest">Newest first</option>
            <option value="updated">Recently updated</option>
            <option value="title">Title A–Z</option>
          </select>
        )}
        <button className="h-9 rounded-md border border-line bg-surface px-3 text-sm hover:bg-subtle">Apply</button>
        <span className="ml-auto flex gap-1 text-sm">
          <Link href={params({ view: "list" })} aria-current={view === "list" ? "page" : undefined} className={`rounded px-2 py-1 ${view === "list" ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-subtle"}`}>List</Link>
          <Link href={params({ view: "board" })} aria-current={view === "board" ? "page" : undefined} className={`rounded px-2 py-1 ${view === "board" ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-subtle"}`}>Board</Link>
          <Link href={params({ view: "calendar" })} aria-current={view === "calendar" ? "page" : undefined} className={`rounded px-2 py-1 ${view === "calendar" ? "bg-brand-50 text-brand-700" : "text-muted hover:bg-subtle"}`}>Calendar</Link>
        </span>
      </form>

      {view === "calendar" ? (
        <MonthCalendar
          month={month}
          today={today}
          hrefForMonth={(m) => params({ month: m })}
          events={tasks.filter((t) => t.dueAt).map((t) => ({
            date: isoDateInTz(t.dueAt!, ctx.organization.timezone),
            label: `${t.isAsap ? "ASAP · " : ""}${t.title}`,
            href: `/app/tasks/${t.id}`,
            tone: isTaskOverdue(t) ? "danger" : t.status === "COMPLETED" ? "ok" : t.status === "PENDING_REVIEW" ? "info" : "warn",
          }))}
        />
      ) : view === "board" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {BOARD.map((col) => {
            const items = tasks.filter((t) => col.statuses.includes(t.status));
            return (
              <section key={col.title} aria-label={col.title} className="min-w-0 rounded-lg border border-line bg-subtle/40">
                <h2 className="flex items-center justify-between border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted">{col.title}<span>{items.length}</span></h2>
                <ul className="space-y-2 p-2">
                  {items.map((t) => (
                    <li key={t.id}>
                      <Link href={`/app/tasks/${t.id}`} className="block rounded-md border border-line bg-surface p-2.5 text-sm hover:border-brand-200">
                        <span className="font-medium">{t.title}</span>
                        <span className="mt-1 block truncate text-xs text-muted">{t.client?.tradeName ?? "Internal"} · {t.assignments.map((a) => a.employee.firstName).join(", ") || "Unassigned"}</span>
                        <span className="mt-1.5 flex flex-wrap gap-1">{t.isAsap && <Badge tone="danger">ASAP</Badge>}<StatusBadge status={t.priority} />{isTaskOverdue(t) && <StatusBadge status="OVERDUE" />}{col.title === "Waiting" && <StatusBadge status={t.status} />}</span>
                      </Link>
                    </li>
                  ))}
                  {items.length === 0 && <li className="px-1 py-2 text-xs text-muted">None</li>}
                </ul>
              </section>
            );
          })}
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState kind="tasks" title="No tasks here" action={can(ctx.role, "tasks.create") && <LinkButton href="/app/tasks/new">Create a task</LinkButton>}>
          Change the filters to see other tasks.
        </EmptyState>
      ) : (
        <>
          {/* Phones: compact rows instead of a squeezed table */}
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface md:hidden">
            {tasks.map((t) => (
              <li key={t.id}>
                <Link href={`/app/tasks/${t.id}`} className="block px-4 py-3">
                  <span className="flex items-start justify-between gap-2"><span className="font-medium text-brand-700">{t.title}</span><StatusBadge status={t.status} /></span>
                  <span className="mt-1 block text-xs text-muted">{t.client?.tradeName ?? "Internal"} · {t.assignments.map((a) => a.employee.firstName).join(", ") || "Unassigned"}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-muted">{t.isAsap && <Badge tone="danger">ASAP</Badge>}<StatusBadge status={t.priority} />{isTaskOverdue(t) && <StatusBadge status="OVERDUE" />}{t.dueAt && <span>Due {formatDateTime(t.dueAt)}</span>}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
          <Table minWidth={860}>
            <thead><tr><Th>Task</Th><Th>Client</Th><Th>Assigned to</Th><Th>Priority</Th><Th>Due</Th><Th>Status</Th><Th>Maker / checker</Th></tr></thead>
            <tbody>
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-subtle/50">
                  <Td><Link href={`/app/tasks/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.title}</Link></Td>
                  <Td>{t.client?.tradeName ?? "—"}</Td>
                  <Td className="text-xs">{t.assignments.map((a) => a.employee.firstName).join(", ") || <span className="text-muted">Unassigned</span>}</Td>
                  <Td><span className="flex gap-1">{t.isAsap && <Badge tone="danger">ASAP</Badge>}<StatusBadge status={t.priority} /></span></Td>
                  <Td className="text-xs">{formatDateTime(t.dueAt)} {isTaskOverdue(t) && <div><StatusBadge status="OVERDUE" /></div>}</Td>
                  <Td><StatusBadge status={t.status} /></Td>
                  <Td className="text-xs text-muted">{t.makerStatus.replaceAll("_", " ").toLowerCase()} / {t.checkerStatus.replaceAll("_", " ").toLowerCase()}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} hrefFor={(p) => params({ page: p })} />
        </>
      )}
    </>
  );
}
