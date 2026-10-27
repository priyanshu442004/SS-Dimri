import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { NewEmployeeForm } from "./new-employee-form";
import { UserPlus } from "lucide-react";

export default async function NewEmployeePage() {
  const ctx = await requireCapability("employees.manage");
  const [org, used] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { licensedUserLimit: true } }),
    prisma.organizationMembership.count({ where: { organizationId: ctx.organization.id, status: { not: "DISABLED" } } }),
  ]);
  return (
    <>
      <PageHeader icon={<UserPlus />}
        title="Invite staff member"
        back={{ href: "/app/employees", label: "Employees" }}
        description={`They receive an email with a temporary password (valid 7 days). At first sign-in they set their own password, then fill in their details for your review. They cannot use the portal until you approve them. Licences in use: ${used} of ${org.licensedUserLimit}.`}
      />
      <Card className="max-w-2xl">
        <NewEmployeeForm />
      </Card>
    </>
  );
}
