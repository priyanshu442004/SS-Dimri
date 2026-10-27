import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { BusinessRuleError, parseForm, safeAction, zCheckbox, zMoney, zOptionalText, zRequiredText, type ActionState } from "@/lib/actions";
import { actionContext, requireCapability } from "@/lib/session";
import { audit } from "@/lib/services/audit";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { ServiceEditForm } from "./form";

const schema = z.object({
  name: zRequiredText(200),
  serviceCode: zOptionalText(20),
  departmentId: z.uuid().optional(),
  description: zOptionalText(2000),
  deliverable: zOptionalText(500),
  frequency: zOptionalText(120),
  billingBasis: zOptionalText(120),
  defaultFee: zMoney.optional(),
  estimatedDurationDays: z.coerce.number().int().min(0).max(3650).optional(),
  pocName: zOptionalText(120),
  pocMobile: zOptionalText(20),
  pocEmail: z.email().optional(),
  pocAddress: zOptionalText(500),
  isConfirmed: zCheckbox.optional(),
  isActive: zCheckbox.optional(),
});

async function updateService(serviceId: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const parsed = parseForm(schema, fd);
  if (!parsed.success) return parsed.state;
  return safeAction(async () => {
    const ctx = await actionContext("services.manage");
    const v = parsed.data;
    if (v.departmentId && !(await prisma.department.findFirst({ where: { id: v.departmentId, organizationId: ctx.organization.id } }))) {
      throw new BusinessRuleError("Department not found.");
    }
    await prisma.$transaction(async (tx) => {
      const res = await tx.service.updateMany({
        where: { id: serviceId, organizationId: ctx.organization.id },
        data: {
          ...v,
          serviceCode: v.serviceCode ?? null,
          departmentId: v.departmentId ?? null,
          defaultFee: v.defaultFee ?? null,
          isConfirmed: !!v.isConfirmed,
          isActive: !!v.isActive,
        },
      });
      if (res.count !== 1) throw new BusinessRuleError("Service not found.");
      await audit(tx, ctx, "service.updated", "service", serviceId, { public: !!v.isConfirmed && !!v.isActive });
    });
    revalidatePath("/app/services");
    revalidatePath("/services");
    revalidatePath("/");
    return { ok: true, message: "Saved." };
  });
}

export default async function ServiceEditPage({ params }: PageProps<"/app/services/[id]">) {
  const ctx = await requireCapability("services.manage");
  const { id } = await params;
  const [s, departments, engagements] = await Promise.all([
    prisma.service.findFirst({ where: { id, organizationId: ctx.organization.id } }),
    prisma.department.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.clientService.findMany({
      where: { serviceId: id, status: "ACTIVE" },
      take: 50,
      select: { id: true, client: { select: { id: true, tradeName: true } } },
    }),
  ]);
  if (!s) notFound();
  const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));
  return (
    <>
      <PageHeader
        title={s.name}
        back={{ href: "/app/services", label: "Services & departments" }}
        description={
          <span className="flex flex-wrap gap-2">
            <StatusBadge status={s.isActive ? "ACTIVE" : "INACTIVE"} />
            {s.isConfirmed && s.isActive ? <StatusBadge status="APPROVED" label="Shown on public website" /> : <StatusBadge status="DRAFT" label="Not on public website" />}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card>
          <ServiceEditForm
            action={updateService.bind(null, s.id)}
            departments={departments.map((d) => ({ value: d.id, label: d.name }))}
            d={{
              name: s.name, serviceCode: str(s.serviceCode), departmentId: str(s.departmentId), description: str(s.description), deliverable: str(s.deliverable),
              frequency: str(s.frequency), billingBasis: str(s.billingBasis), defaultFee: str(s.defaultFee), estimatedDurationDays: str(s.estimatedDurationDays),
              pocName: str(s.pocName), pocMobile: str(s.pocMobile), pocEmail: str(s.pocEmail), pocAddress: str(s.pocAddress),
              isConfirmed: s.isConfirmed ? "on" : "", isActive: s.isActive ? "on" : "",
            }}
          />
        </Card>
        <Card title={`Active clients (${engagements.length})`}>
          {engagements.length === 0 ? <p className="text-sm text-muted">No client currently uses this service.</p> : (
            <ul className="space-y-1 text-sm">{engagements.map((e) => <li key={e.id}><Link href={`/app/clients/${e.client.id}?tab=services`} className="text-brand-700 hover:underline">{e.client.tradeName}</Link></li>)}</ul>
          )}
          <p className="mt-4 text-xs text-muted">Services are deactivated rather than deleted, so past engagements, tasks and fees keep their service.</p>
        </Card>
      </div>
    </>
  );
}
