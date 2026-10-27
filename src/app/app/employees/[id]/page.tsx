import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can, ROLE_LABELS, type Role } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import Link from "next/link";
import { dateOnly, formatDate, formatDateTime, isoDateInTz, minutesToHhmm, monthRange } from "@/lib/dates";
import { OPEN_STATUSES } from "@/lib/domain/task-workflow";
import { employeeFiles, loadEmployeeProfile, onboardingDefaults } from "@/lib/services/employee-view";
import { Card, DetailList, humanize, Notice, PageHeader, StatusBadge, TabNav } from "@/components/ui";
import { OnboardingForm } from "../onboarding-form";
import { decideOnboardingAction, resendInvitationAction, resetPasswordAction, saveEmployeeDetailsAction, updateAccessAction } from "../actions";
import { ActionButton } from "@/components/action-button";
import { AccessForm, DecisionForm, ResetPasswordForm } from "./admin-forms";

export default async function EmployeeDetailPage({ params, searchParams }: PageProps<"/app/employees/[id]">) {
  const ctx = await requireCapability("employees.view");
  const { id } = await params;
  const tab = (await searchParams).tab === "edit" ? "edit" : "profile";
  const e = await loadEmployeeProfile(ctx.organization.id, id);
  if (!e) notFound();
  const manage = can(ctx.role, "employees.manage");

  const [designations, departments, colleagues] = manage
    ? await Promise.all([
        prisma.designation.findMany({ where: { organizationId: ctx.organization.id, OR: [{ isActive: true }, { employees: { some: { id } } }] }, orderBy: { sortOrder: "asc" } }),
        prisma.department.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { name: "asc" } }),
        prisma.employee.findMany({
          where: { organizationId: ctx.organization.id, id: { not: e.id }, employmentStatus: { not: "EXITED" } },
          orderBy: { firstName: "asc" },
          select: { id: true, firstName: true, lastName: true },
        }),
      ])
    : [[], [], []];

  const name = `${e.firstName} ${e.lastName ?? ""}`.trim();
  const files = manage ? employeeFiles(e) : [];
  const lastEmail = manage && e.membership
    ? await prisma.emailOutbox.findFirst({ where: { organizationId: ctx.organization.id, relatedUserId: e.membership.userId }, orderBy: { createdAt: "desc" } })
    : null;
  const EMAIL_KIND: Record<string, string> = {
    "staff.invitation": "Invitation", "staff.approved": "Approval", "staff.rejected": "Rejection", "staff.on_hold": "On-hold notice",
  };

  return (
    <>
      <PageHeader
        title={name}
        back={{ href: "/app/employees", label: "Employees" }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{e.permanentEmployeeCode ?? `${e.temporaryEmployeeCode} (temporary)`}</span>
            <StatusBadge status={e.approvalStatus} />
            <StatusBadge status={e.employmentStatus === "ACTIVE" ? "ACTIVE" : e.employmentStatus} />
            {e.membership && <span>· {ROLE_LABELS[e.membership.role as Role]}</span>}
          </span>
        }
      />
      {manage && (
        <TabNav
          current={tab}
          tabs={[
            { key: "profile", label: "Profile & approval", href: `/app/employees/${e.id}` },
            { key: "edit", label: "Edit details", href: `/app/employees/${e.id}?tab=edit` },
          ]}
        />
      )}

      {tab === "edit" && manage ? (
        <Card className="max-w-4xl">
          <OnboardingForm action={saveEmployeeDetailsAction.bind(null, e.id)} d={onboardingDefaults(e)} selfService={false} aadhaarLast4={e.aadhaarLast4} />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <Card title="Employment">
              <DetailList
                items={[
                  ["Designation", e.designation?.name],
                  ["Department", e.department?.name],
                  ["Appointment type", humanize(e.employmentType)],
                  ["Type of employment", e.workLocationType ? humanize(e.workLocationType) : null],
                  ["Date of joining", formatDate(e.dateOfJoining)],
                  ["Probation", e.probationEndDate ? `${formatDate(e.probationStartDate)} – ${formatDate(e.probationEndDate)}` : null],
                  ["Reports to", e.reportsTo.map((r) => `${r.manager.firstName} ${r.manager.lastName ?? ""}`.trim()).join(", ")],
                  ["Attendance hours profile", humanize(e.attendanceProfile)],
                  ["Login ID", e.membership?.user.username],
                  ["Approved", e.approvedAt ? `${formatDateTime(e.approvedAt)} by ${e.approvedBy?.name ?? "—"}` : null],
                ]}
              />
            </Card>
            <WorkSummary employeeId={e.id} timezone={ctx.organization.timezone} />
            <Card title="Personal & contact">
              <DetailList
                items={[
                  ["Mobile", e.mobile],
                  ["Email", e.email],
                  ["Official email", e.officialEmail],
                  ["Date of birth", manage ? formatDate(e.dateOfBirth) : "Restricted"],
                  ["Gender", e.gender ? humanize(e.gender) : null],
                  ["Current address", e.addresses.find((a) => a.type === "CURRENT")?.line1],
                  ["Emergency contact", e.emergencyContactName ? `${e.emergencyContactName} (${e.emergencyContactRelation ?? "—"}) ${e.emergencyContactPhone ?? ""}` : null],
                  ["PAN", manage ? e.panNumber : e.panNumber ? "On file" : null],
                  ["Aadhaar", e.aadhaarLast4 ? `XXXX XXXX ${e.aadhaarLast4}` : null],
                  ["Bank account", e.bankAccounts[0] ? `••••${e.bankAccounts[0].accountNumberLast4} · ${e.bankAccounts[0].ifscCode}` : null],
                  ["Qualification", e.qualifications[0]?.qualification],
                  ["Previous employer", e.previousEmployments[0]?.employerName],
                ]}
              />
            </Card>
            {manage && (
              <Card title="Documents">
                {files.length === 0 ? (
                  <p className="text-sm text-muted">No documents uploaded yet.</p>
                ) : (
                  <ul className="divide-y divide-line text-sm">
                    {files.map(([label, fileId]) => (
                      <li key={fileId} className="flex items-center justify-between py-2">
                        <span>{label}</span>
                        <a href={`/api/files/${fileId}`} className="font-medium text-brand-700 hover:underline" target="_blank" rel="noopener noreferrer">
                          View
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>

          {manage && (
            <div className="space-y-6">
              <Card title="Onboarding approval">
                {e.approvalStatus === "APPROVED" ? (
                  <Notice tone="ok">Approved. Permanent ID {e.permanentEmployeeCode}.</Notice>
                ) : e.approvalStatus === "REJECTED" ? (
                  <Notice tone="danger">Rejected{e.reviewNotes ? ` (reason: ${e.reviewNotes.replace(/\.$/, "")})` : ""}. Waiting for the staff member to correct and resubmit.</Notice>
                ) : !e.onboardingSubmittedAt ? (
                  <Notice tone="warn">
                    Invited{e.membership?.mustChangePassword ? " — has not set a password yet" : " — password set, details not submitted yet"}. You can review once they submit their details.
                  </Notice>
                ) : (
                  <>
                    <div className="mb-3"><Notice tone={e.approvalStatus === "ON_HOLD" ? "warn" : "info"}>{e.approvalStatus === "ON_HOLD" ? "On hold" : "Under review"} — submitted {formatDateTime(e.onboardingSubmittedAt)}.</Notice></div>
                    {e.reviewNotes && <p className="mb-3 text-sm text-muted">Last note: {e.reviewNotes}</p>}
                    <DecisionForm action={decideOnboardingAction.bind(null, e.id)} canHold={e.approvalStatus !== "ON_HOLD"} />
                  </>
                )}
              </Card>
              {e.membership && e.membership.role !== "OWNER" && (
                <Card title="Access, role & reporting">
                  <AccessForm
                    action={updateAccessAction.bind(null, e.id)}
                    defaults={{
                      role: e.membership.role,
                      status: e.membership.status === "DISABLED" ? "DISABLED" : "ACTIVE",
                      designationId: e.designationId ?? "",
                      departmentId: e.departmentId ?? "",
                      employmentStatus: e.employmentStatus,
                      attendanceProfile: e.attendanceProfile,
                      managerIds: e.reportsTo.map((r) => r.managerId),
                    }}
                    designations={designations.map((d) => ({ value: d.id, label: d.name }))}
                    departments={departments.map((d) => ({ value: d.id, label: d.name }))}
                    colleagues={colleagues.map((c) => ({ value: c.id, label: `${c.firstName} ${c.lastName ?? ""}`.trim() }))}
                  />
                </Card>
              )}
              {e.membership && (
                <Card title="Sign-in">
                  <p className="mb-3 text-sm">Email: <span className="font-medium">{e.membership.user.email}</span></p>
                  {lastEmail && (
                    <p className="mb-3 text-xs text-muted">
                      Last email: {EMAIL_KIND[lastEmail.template] ?? lastEmail.template} ·{" "}
                      {lastEmail.status === "SENT" ? "sent" : lastEmail.status === "FAILED" ? <span className="text-danger">failed — {lastEmail.error}</span> : "not sent (test address)"} · {formatDateTime(lastEmail.createdAt)}
                    </p>
                  )}
                  {e.membership.mustChangePassword ? (
                    <>
                      <p className="mb-3 text-sm text-muted">
                        Temporary password not used yet{e.membership.tempPasswordExpiresAt ? ` · ${e.membership.tempPasswordExpiresAt < new Date() ? "expired" : "valid until"} ${formatDateTime(e.membership.tempPasswordExpiresAt)}` : ""}.
                      </p>
                      <ActionButton action={resendInvitationAction.bind(null, e.id)} confirm="Email a new temporary password? The previous one stops working.">Resend invitation</ActionButton>
                    </>
                  ) : (
                    <ResetPasswordForm action={resetPasswordAction.bind(null, e.id)} />
                  )}
                </Card>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Allocation, task, attendance and timesheet summary for the current month. */
async function WorkSummary({ employeeId, timezone }: { employeeId: string; timezone: string }) {
  const today = isoDateInTz(new Date(), timezone);
  const { start, end } = monthRange(today);
  const [allocations, tasks, attendance, timesheet] = await Promise.all([
    prisma.teamAllocation.findMany({ where: { employeeId, status: { in: ["ACTIVE", "PLANNED"] } }, select: { id: true, client: { select: { tradeName: true } } } }),
    prisma.task.findMany({
      where: { status: { in: OPEN_STATUSES }, assignments: { some: { employeeId, removedAt: null } } },
      orderBy: { dueAt: { sort: "asc", nulls: "last" } },
      take: 6,
      select: { id: true, title: true, dueAt: true },
    }),
    prisma.attendanceRecord.groupBy({ by: ["status"], where: { employeeId, attendanceDate: { gte: start, lte: end } }, _count: true }),
    prisma.timesheetEntry.aggregate({ where: { employeeId, workDate: { gte: start, lte: dateOnly(today) } }, _sum: { approxMinutes: true }, _count: true }),
  ]);
  const att = (k: string) => attendance.find((a) => a.status === k)?._count ?? 0;
  return (
    <Card title="Work this month">
      <DetailList items={[
        ["Allocated clients", allocations.length ? allocations.map((a) => a.client.tradeName).join(", ") : "None"],
        ["Attendance", `${att("PRESENT")} present · ${att("HALF_DAY")} half days · ${att("LEAVE")} leave · ${att("ABSENT")} absent`],
        ["Timesheet", `${minutesToHhmm(timesheet._sum.approxMinutes ?? 0)} across ${timesheet._count} entries`],
        ["Open tasks", tasks.length ? <ul key="t" className="space-y-0.5">{tasks.map((t) => <li key={t.id}><Link href={`/app/tasks/${t.id}`} className="text-brand-700 hover:underline">{t.title}</Link>{t.dueAt && <span className="text-xs text-muted"> · due {formatDate(t.dueAt)}</span>}</li>)}</ul> : "None"],
      ]} />
    </Card>
  );
}
