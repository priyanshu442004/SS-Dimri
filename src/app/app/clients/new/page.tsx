import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { PageHeader, buttonClass } from "@/components/ui";
import { BusinessWizard } from "./wizard";
import { Building2, Zap } from "lucide-react";

// Full client registration by the firm, in six short sections.
export default async function NewClientPage() {
  const ctx = await requireCapability("clients.register");
  const [constitutions, natures, services] = await Promise.all([
    prisma.constitution.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, representativeRole: true, allowsMultiple: true } }),
    prisma.businessNature.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true } }),
    prisma.service.findMany({
      where: { organizationId: ctx.organization.id, isActive: true },
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, description: true, department: { select: { name: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader icon={<Building2 />}
        title="Register a client"
        back={{ href: "/app/clients", label: "Clients" }}
        description="Six short sections. The client is created as “pending approval”; an administrator activates it, and you can then invite the client to the portal."
        actions={<Link href="/app/clients/new/quick" className={buttonClass("secondary", "sm")}><Zap className="size-4" aria-hidden /> Quick registration</Link>}
      />
      <div className="max-w-4xl">
        <BusinessWizard
          constitutions={constitutions}
          natures={natures.map((n) => ({ value: n.id, label: n.label }))}
          services={services.map((s) => ({ value: s.id, label: s.name, group: s.department?.name ?? "Other", description: s.description ?? "" }))}
        />
      </div>
    </>
  );
}
