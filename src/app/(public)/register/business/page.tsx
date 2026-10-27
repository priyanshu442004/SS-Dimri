import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPublicOrganization } from "@/lib/services/public-org";
import { RegisterFrame } from "@/components/public/register-frame";
import { BusinessWizard } from "./wizard";

export const metadata: Metadata = { title: "Business registration" };

export default async function BusinessRegistrationPage() {
  await connection(); // depends on live database state (which firm exists); never prerender
  const org = await getPublicOrganization();
  if (!org) redirect("/register");
  const [constitutions, natures, services] = await Promise.all([
    prisma.constitution.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, representativeRole: true, allowsMultiple: true } }),
    prisma.businessNature.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true } }),
    prisma.service.findMany({
      where: { organizationId: org.id, isActive: true, isConfirmed: true },
      orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, description: true, department: { select: { name: true } } },
    }),
  ]);
  return (
    <RegisterFrame
      back={{ href: "/register", label: "All registration options" }}
      eyebrow="Full registration"
      title="Business registration"
      em={["registration"]}
      description="Six short sections. Your registration is reviewed by our office before your account is activated."
      next={["Our office reviews your registration", "We confirm services and the engagement with you", "Your client portal opens for requests, documents and dues"]}
    >
      <BusinessWizard
        constitutions={constitutions}
        natures={natures.map((n) => ({ value: n.id, label: n.label }))}
        services={services.map((s) => ({ value: s.id, label: s.name, group: s.department?.name ?? "Other", description: s.description ?? "" }))}
      />
    </RegisterFrame>
  );
}
