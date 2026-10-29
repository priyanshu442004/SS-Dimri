import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { QuickRegistrationForm } from "./quick-form";
import { Zap } from "lucide-react";

export default async function QuickClientPage() {
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
      <PageHeader icon={<Zap />}
        title="Quick registration"
        back={{ href: "/app/clients/new", label: "Full registration" }}
        description="Only the essentials. The client is created as “pending approval” and can be completed later; an administrator activates it."
      />
      <Card className="max-w-3xl">
        <QuickRegistrationForm
          constitutions={constitutions.map((c) => ({ value: c.id, label: c.name }))}
          services={services.map((s) => ({ value: s.id, label: s.name, group: s.department?.name ?? "Other" }))}
        />
      </Card>
      <p className="mt-4 text-sm text-muted">Have all the details? Use the <Link href="/app/clients/new" className="text-brand-700 hover:underline">full registration</Link> instead.</p>
    </>
  );
}
