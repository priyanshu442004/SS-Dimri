import Link from "next/link";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, parseForm, safeAction, zMoney, zOptionalText, zRequiredText, type ActionState } from "@/lib/actions";
import { actionContext, requireCapability } from "@/lib/session";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui";
import { DepartmentForm, ServiceForm } from "./forms";
import { Briefcase } from "lucide-react";

const serviceSchema = z.object({
  name: zRequiredText(200),
  serviceCode: zOptionalText(20),
  departmentId: z.uuid().optional(),
  description: zOptionalText(2000),
  defaultFee: zMoney.optional(),
  frequency: zOptionalText(120),
  deliverable: zOptionalText(500),
  estimatedDurationDays: z.coerce.number().int().min(0).max(3650).optional(),
  pocName: zOptionalText(120),
  pocMobile: zOptionalText(20),
  pocEmail: z.email().optional(),
  pocAddress: zOptionalText(500),
});

async function createService(_p: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const parsed = parseForm(serviceSchema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("services.manage");
    if (parsed.data.departmentId && !(await prisma.department.findFirst({ where: { id: parsed.data.departmentId, organizationId: ctx.organization.id } }))) {
      throw new BusinessRuleError("Department not found.");
    }
    await prisma.service.create({ data: { ...parsed.data, organizationId: ctx.organization.id } });
    revalidatePath("/app/services");
    return { ok: true, message: "Service added." };
  });
}

async function createDepartment(_p: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const parsed = parseForm(z.object({ name: zRequiredText(120), code: zOptionalText(20), scope: zOptionalText(500) }), fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("services.manage");
    await prisma.department.create({ data: { ...parsed.data, organizationId: ctx.organization.id } });
    revalidatePath("/app/services");
    return { ok: true, message: "Department added." };
  });
}

async function toggleConfirmed(kind: "service" | "department", id: string, value: boolean): Promise<ActionState> {
  "use server";
  return safeAction(async () => {
    const ctx = await actionContext("services.manage");
    if (kind === "service") await prisma.service.updateMany({ where: { id, organizationId: ctx.organization.id }, data: { isConfirmed: value } });
    else await prisma.department.updateMany({ where: { id, organizationId: ctx.organization.id }, data: { isConfirmed: value } });
    revalidatePath("/app/services");
  });
}

async function toggleActive(id: string, value: boolean): Promise<ActionState> {
  "use server";
  return safeAction(async () => {
    const ctx = await actionContext("services.manage");
    // Deactivate instead of delete: historical engagements, tasks and fees keep their service.
    await prisma.service.updateMany({ where: { id, organizationId: ctx.organization.id }, data: { isActive: value } });
    revalidatePath("/app/services");
  });
}

export default async function ServicesAdminPage() {
  const ctx = await requireCapability("services.manage");
  const [departments, services] = await Promise.all([
    prisma.department.findMany({ where: { organizationId: ctx.organization.id }, orderBy: [{ code: "asc" }, { name: "asc" }], include: { _count: { select: { services: true } } } }),
    prisma.service.findMany({
      where: { organizationId: ctx.organization.id },
      orderBy: [{ serviceCode: "asc" }, { name: "asc" }],
      include: { department: { select: { name: true } }, _count: { select: { clientServices: true } } },
    }),
  ]);
  return (
    <>
      <PageHeader icon={<Briefcase />}
        title="Services & departments"
        description="Loaded from the firm's ERP master data pack. Items marked “suggested” were proposed in that pack and await the firm's confirmation; only confirmed services appear on the public website."
      />
      <Card title={`Services (${services.length})`} className="mb-6" padded={false}>
        <Table minWidth={1000}>
          <thead><tr><Th>Code</Th><Th>Service</Th><Th>Department</Th><Th>Frequency</Th><Th>Billing basis</Th><Th>Clients</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id}>
                <Td className="font-mono text-xs">{s.serviceCode}</Td>
                <Td><Link href={`/app/services/${s.id}`} className="font-medium text-brand-700 hover:underline">{s.name}</Link>{s.description && <div className="max-w-md text-xs text-muted">{s.description}</div>}</Td>
                <Td>{s.department?.name ?? "—"}</Td>
                <Td className="text-xs">{s.frequency ?? "—"}</Td>
                <Td className="text-xs">{s.billingBasis ?? "—"}{s.defaultFee && <div>₹ {Number(s.defaultFee).toLocaleString("en-IN")}</div>}</Td>
                <Td>{s._count.clientServices}</Td>
                <Td className="space-y-1">
                  {s.isConfirmed ? <Badge tone="ok">Confirmed</Badge> : <Badge tone="warn">Suggested</Badge>}
                  {!s.isActive && <Badge>Inactive</Badge>}
                </Td>
                <Td>
                  <span className="flex flex-col gap-1">
                    <ActionButton variant="ghost" action={toggleConfirmed.bind(null, "service", s.id, !s.isConfirmed)}>{s.isConfirmed ? "Mark suggested" : "Confirm"}</ActionButton>
                    <ActionButton variant="ghost" action={toggleActive.bind(null, s.id, !s.isActive)}>{s.isActive ? "Deactivate" : "Activate"}</ActionButton>
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Add service"><ServiceForm action={createService} departments={departments.map((d) => ({ value: d.id, label: d.name }))} /></Card>
        <Card title={`Departments (${departments.length})`}>
          <ul className="mb-4 divide-y divide-line text-sm">
            {departments.map((d) => (
              <li key={d.id} className="flex items-start justify-between gap-2 py-2">
                <span><span className="font-mono text-xs text-muted">{d.code}</span> <span className="font-medium">{d.name}</span>{d.scope && <span className="block text-xs text-muted">{d.scope}</span>}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {d.isConfirmed ? <Badge tone="ok">Confirmed</Badge> : <Badge tone="warn">Suggested</Badge>}
                  <ActionButton variant="ghost" action={toggleConfirmed.bind(null, "department", d.id, !d.isConfirmed)}>{d.isConfirmed ? "Unconfirm" : "Confirm"}</ActionButton>
                </span>
              </li>
            ))}
          </ul>
          <DepartmentForm action={createDepartment} />
        </Card>
      </div>
    </>
  );
}
