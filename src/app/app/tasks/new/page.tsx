import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { dateTimeLocalInTz } from "@/lib/dates";
import { taskEmployeeOptions, visibleClientOptions } from "@/lib/services/lookups";
import { Card, PageHeader } from "@/components/ui";
import { TaskForm } from "./task-form";
import { ListPlus } from "lucide-react";
import { prisma } from "@/lib/db";

export default async function NewTaskPage({ searchParams }: PageProps<"/app/tasks/new">) {
  const ctx = await requireCapability("tasks.create");
  const sp = await searchParams;
  const [employees, clients, items, workTypes] = await Promise.all([
    taskEmployeeOptions(ctx.organization.id), visibleClientOptions(ctx),
    prisma.complianceItem.findMany({ orderBy: { sortOrder: "asc" }, select: { department: true, name: true } }),
    prisma.workType.findMany({ where: { organizationId: ctx.organization.id, isActive: true }, orderBy: { sortOrder: "asc" }, select: { name: true } }),
  ]);
  // Standard tasks (tracker S.No. 95): the compliance master by department, then the firm's types of work.
  const groups = new Map<string, string[]>();
  for (const i of items) groups.set(i.department, [...(groups.get(i.department) ?? []), i.name]);
  const standardTasks = [...[...groups.entries()].map(([group, list]) => ({ group, items: [...new Set(list)] })), { group: "Accounts & other work", items: [...new Set(workTypes.map((w) => w.name))] }].filter((g) => g.items.length);
  return (
    <>
      <PageHeader icon={<ListPlus />} title="New task" back={{ href: "/app/tasks", label: "Tasks" }} description="Quick create: a title or a voice note, and an assignee, are enough. Add details, images or documents as needed." />
      <Card className="max-w-4xl">
        <TaskForm employees={employees} clients={clients} defaultClient={typeof sp.client === "string" ? sp.client : ""} now={dateTimeLocalInTz(new Date(), ctx.organization.timezone)} timezone={ctx.organization.timezone} canShare={can(ctx, "tasks.review")} standardTasks={standardTasks} />
      </Card>
    </>
  );
}
