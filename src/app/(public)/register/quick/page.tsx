import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getPublicOrganization } from "@/lib/services/public-org";
import { RegisterFrame } from "@/components/public/register-frame";
import { QuickForm } from "./quick-form";

export const metadata: Metadata = { title: "Quick registration" };

export default async function QuickRegistrationPage() {
  await connection(); // depends on live database state (which firm exists); never prerender
  const org = await getPublicOrganization();
  if (!org) redirect("/register");
  const services = await prisma.service.findMany({
    where: { organizationId: org.id, isActive: true, isConfirmed: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  return (
    <RegisterFrame
      back={{ href: "/register", label: "All registration options" }}
      eyebrow="Quick registration"
      title="Quick registration"
      em={["registration"]}
      description={<>The minimum we need to get started. Your registration stays <strong>pending approval</strong> until our office reviews it; you can add the remaining details afterwards.</>}
      next={["Our office reviews your registration", "We confirm services and the engagement with you", "Your client portal opens for requests, documents and dues"]}
    >
      <QuickForm services={services.map((s) => ({ value: s.id, label: s.name }))} />
    </RegisterFrame>
  );
}
