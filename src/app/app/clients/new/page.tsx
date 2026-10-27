import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { QuickRegistrationForm } from "./quick-form";
import { Building2 } from "lucide-react";

export default async function NewClientPage() {
  const ctx = await requireCapability("clients.register");
  const [constitutions, services] = await Promise.all([
    prisma.constitution.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    prisma.service.findMany({
      where: { organizationId: ctx.organization.id, isActive: true },
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, department: { select: { name: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader icon={<Building2 />}
        title="Quick registration"
        back={{ href: "/app/clients", label: "Clients" }}
        description="Only the essentials. The client is created as “pending approval” and can be completed later; an administrator activates it."
      />
      <Card className="max-w-3xl">
        <QuickRegistrationForm
          constitutions={constitutions.map((c) => ({ value: c.id, label: c.name }))}
          services={services.map((s) => ({ value: s.id, label: s.name, group: s.department?.name ?? "Other" }))}
        />
      </Card>
    </>
  );
}
