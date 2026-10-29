import { requireCapability } from "@/lib/session";
import { dateTimeLocalInTz } from "@/lib/dates";
import { activeClientOptions, employeeOptions } from "@/lib/services/lookups";
import { Card, PageHeader } from "@/components/ui";
import { TaskForm } from "./task-form";
import { ListPlus } from "lucide-react";

export default async function NewTaskPage({ searchParams }: PageProps<"/app/tasks/new">) {
  const ctx = await requireCapability("tasks.create");
  const sp = await searchParams;
  const [employees, clients] = await Promise.all([employeeOptions(ctx.organization.id), activeClientOptions(ctx.organization.id)]);
  return (
    <>
      <PageHeader icon={<ListPlus />} title="New task" back={{ href: "/app/tasks", label: "Tasks" }} description="Quick create: a title and an assignee are enough. Add details, images or documents as needed." />
      <Card className="max-w-4xl">
        <TaskForm employees={employees} clients={clients} defaultClient={typeof sp.client === "string" ? sp.client : ""} now={dateTimeLocalInTz(new Date(), ctx.organization.timezone)} timezone={ctx.organization.timezone} />
      </Card>
    </>
  );
}
