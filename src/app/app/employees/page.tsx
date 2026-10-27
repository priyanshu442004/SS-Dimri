import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { can, ROLE_LABELS, type Role } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/dates";
import { staffInvitationFlow } from "@/lib/services/analytics";
import { Badge, EmptyState, LinkButton, PageHeader, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import { ChartCard, Donut, TrendLine } from "@/components/charts";
import { IdCard } from "lucide-react";

/** Staff onboarding stages (owner decision, 27 Oct 2026). */
const FILTERS: Record<string, { label: string; where: Prisma.EmployeeWhereInput }> = {
  all: { label: "All", where: {} },
  invited: { label: "Invited", where: { approvalStatus: "PENDING", onboardingSubmittedAt: null } },
  review: { label: "Under review", where: { OR: [{ approvalStatus: "UNDER_REVIEW" }, { approvalStatus: "PENDING", onboardingSubmittedAt: { not: null } }] } },
  hold: { label: "On hold", where: { approvalStatus: "ON_HOLD" } },
  approved: { label: "Approved", where: { approvalStatus: "APPROVED" } },
  rejected: { label: "Rejected", where: { approvalStatus: "REJECTED" } },
};
// Old links used ?status=pending for "awaiting approval".
const ALIASES: Record<string, string> = { pending: "review" };

function stageLabel(e: { approvalStatus: string; onboardingSubmittedAt: Date | null }) {
  if (e.approvalStatus === "PENDING") return e.onboardingSubmittedAt ? "Under review" : "Invited";
  return { UNDER_REVIEW: "Under review", ON_HOLD: "On hold", APPROVED: "Approved", REJECTED: "Rejected" }[e.approvalStatus] ?? e.approvalStatus;
}
const STAGE_STATUS: Record<string, string> = { Invited: "PLANNED", "Under review": "PENDING_REVIEW", "On hold": "ON_HOLD", Approved: "APPROVED", Rejected: "REJECTED" };

export default async function EmployeesPage({ searchParams }: PageProps<"/app/employees">) {
  const ctx = await requireCapability("employees.view");
  const org = ctx.organization.id;
  const sp = await searchParams;
  const requested = typeof sp.status === "string" ? ALIASES[sp.status] ?? sp.status : "all";
  const filter = requested in FILTERS ? requested : "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const where: Prisma.EmployeeWhereInput = {
    AND: [
      { organizationId: org },
      FILTERS[filter].where,
      q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { mobile: { contains: q } },
              { permanentEmployeeCode: { contains: q, mode: "insensitive" } },
              { temporaryEmployeeCode: { contains: q, mode: "insensitive" } },
            ],
          }
        : {},
    ],
  };
  const [employees, all, flow] = await Promise.all([
    prisma.employee.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 200,
      select: {
        id: true, firstName: true, lastName: true, email: true, mobile: true, temporaryEmployeeCode: true, permanentEmployeeCode: true, approvalStatus: true,
        onboardingSubmittedAt: true, dateOfJoining: true, createdAt: true,
        designation: { select: { name: true } }, department: { select: { name: true } },
        membership: { select: { role: true, status: true, mustChangePassword: true, userId: true } },
      },
    }),
    prisma.employee.findMany({ where: { organizationId: org }, select: { approvalStatus: true, onboardingSubmittedAt: true } }),
    staffInvitationFlow(ctx),
  ]);
  const lastEmails = await prisma.emailOutbox.findMany({
    where: { organizationId: org, relatedUserId: { in: employees.map((e) => e.membership?.userId).filter((x): x is string => !!x) } },
    orderBy: { createdAt: "desc" },
    distinct: ["relatedUserId"],
    select: { relatedUserId: true, status: true, template: true, createdAt: true },
  });
  const emailOf = new Map(lastEmails.map((m) => [m.relatedUserId, m]));
  const manage = can(ctx.role, "employees.manage");

  const counts = new Map<string, number>();
  for (const e of all) counts.set(stageLabel(e), (counts.get(stageLabel(e)) ?? 0) + 1);
  const tabCount = (key: string) => (key === "all" ? all.length : counts.get(FILTERS[key].label) ?? 0);
  const stages = ["Invited", "Under review", "On hold", "Approved", "Rejected"].map((label) => ({
    label, value: counts.get(label) ?? 0, href: `/app/employees?status=${Object.keys(FILTERS).find((k) => FILTERS[k].label === label)}`,
  }));

  return (
    <>
      <PageHeader icon={<IdCard />}
        title="Employees"
        description="Invite staff by email, review their details, and approve, hold or reject them."
        actions={manage && <LinkButton href="/app/employees/new">Invite staff member</LinkButton>}
      />
      {all.length > 0 && (
        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_2fr]">
          <ChartCard title="Staff by stage" table={{ head: ["Stage", "People"], rows: stages.map((s) => [s.label, s.value]) }}>
            <Donut slices={stages.filter((s) => s.value > 0)} centerLabel="Staff" />
          </ChartCard>
          <ChartCard title="Invitations vs approvals" subtitle="Last 30 days" table={{ head: ["Date", "Invited", "Approved"], rows: flow.map((f) => [f.date, ...f.values]) }}>
            <TrendLine points={flow} series={["Invited", "Approved"]} />
          </ChartCard>
        </div>
      )}
      <TabNav
        current={filter}
        tabs={Object.entries(FILTERS).map(([key, f]) => ({ key, label: f.label, href: key === "all" ? "/app/employees" : `/app/employees?status=${key}`, count: tabCount(key) }))}
      />
      <form className="mb-4 flex gap-2" role="search">
        {filter !== "all" && <input type="hidden" name="status" value={filter} />}
        <input name="q" defaultValue={q} placeholder="Search name, email, mobile or employee ID" aria-label="Search employees" className="h-10 w-full max-w-sm rounded-md border border-line bg-surface px-3 text-sm" />
        <button className="h-10 rounded-md border border-line bg-surface px-4 text-sm hover:bg-subtle">Search</button>
      </form>
      {employees.length === 0 ? (
        <EmptyState kind="people" title="No staff here" action={manage && <LinkButton href="/app/employees/new">Invite staff member</LinkButton>}>
          Invite a staff member with their name, email, mobile and role. They get a temporary password by email, set their own, fill in their details, and you approve them.
        </EmptyState>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface md:hidden">
            {employees.map((e) => (
              <li key={e.id}>
                <Link href={`/app/employees/${e.id}`} className="block px-4 py-3">
                  <span className="flex items-start justify-between gap-2">
                    <span className="font-medium text-brand-700">{e.firstName} {e.lastName}</span>
                    <StatusBadge status={STAGE_STATUS[stageLabel(e)]} label={stageLabel(e)} />
                  </span>
                  <span className="mt-1 block text-xs text-muted">{[e.email, e.membership ? ROLE_LABELS[e.membership.role as Role] : null].filter(Boolean).join(" · ")}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table minWidth={900}>
              <thead>
                <tr><Th>Name</Th><Th>Email & mobile</Th><Th>Role</Th><Th>Stage</Th><Th>Invitation</Th><Th>Employee ID</Th><Th>Invited</Th></tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                  const mail = e.membership ? emailOf.get(e.membership.userId) : undefined;
                  return (
                    <tr key={e.id} className="hover:bg-subtle/50">
                      <Td>
                        <Link href={`/app/employees/${e.id}`} className="font-medium text-brand-700 hover:underline">{e.firstName} {e.lastName}</Link>
                        {e.designation && <div className="text-xs text-muted">{e.designation.name}</div>}
                      </Td>
                      <Td className="text-xs">{e.email ?? "—"}<div className="text-muted">{e.mobile ?? ""}</div></Td>
                      <Td>{e.membership ? ROLE_LABELS[e.membership.role as Role] : "—"}</Td>
                      <Td>
                        <StatusBadge status={STAGE_STATUS[stageLabel(e)]} label={stageLabel(e)} />
                        {e.membership?.status === "DISABLED" && <div className="mt-1"><StatusBadge status="INACTIVE" label="Login disabled" /></div>}
                      </Td>
                      <Td className="text-xs">
                        {e.membership?.mustChangePassword ? <Badge tone="warn">Password not set yet</Badge> : e.membership ? <span className="text-muted">Password set</span> : "No login"}
                        {mail && (
                          <div className="mt-1 text-muted">
                            Last email: {mail.status === "SENT" ? "sent" : mail.status === "FAILED" ? <span className="text-danger">failed</span> : "not sent (test address)"} · {formatDateTime(mail.createdAt)}
                          </div>
                        )}
                      </Td>
                      <Td className="font-mono text-xs">{e.permanentEmployeeCode ?? <span className="text-muted">{e.temporaryEmployeeCode} (temp)</span>}</Td>
                      <Td className="text-xs">{formatDate(e.createdAt)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </>
  );
}
