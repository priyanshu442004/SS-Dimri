import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { CAPABILITIES, can, ROLE_LABELS, type Capability, type Role } from "@/lib/permissions";
import { formatDate, formatDateTime, toIsoDate } from "@/lib/dates";
import { getPolicy } from "@/lib/services/attendance";
import { Card, DetailList, humanize, Notice, PageHeader, Pagination, TabNav, Table, Td, Th } from "@/components/ui";
import { ActionButton } from "@/components/action-button";
import { addListItemAction, saveCertificateAction, saveOrganizationAction, savePolicyAction, savePreferencesAction, toggleListItemAction, uploadLeavePolicyAction } from "./actions";
import { CertificateForm, LeavePolicyDocForm, ListItemForm, OrganizationForm, PolicyForm, PreferencesForm } from "./forms";
import { Settings } from "lucide-react";

export default async function SettingsPage({ searchParams }: PageProps<"/app/settings">) {
  const ctx = await requireCapability("org.manage");
  const sp = await searchParams;
  const tab = (["policy", "audit", "roles", "lists"] as const).find((t) => t === sp.tab) ?? "organization";
  return (
    <>
      <PageHeader icon={<Settings />} title="Settings" description="Organization registration, certificate, leave & timing policy and audit log." />
      <TabNav
        current={tab}
        tabs={[
          { key: "organization", label: "Organization", href: "/app/settings" },
          { key: "policy", label: "Leave & timing policy", href: "/app/settings?tab=policy" },
          { key: "lists", label: "Lists & preferences", href: "/app/settings?tab=lists" },
          { key: "roles", label: "Roles & permissions", href: "/app/settings?tab=roles" },
          { key: "audit", label: "Audit log", href: "/app/settings?tab=audit" },
        ]}
      />
      {tab === "organization" && <OrgTab />}
      {tab === "policy" && <PolicyTab />}
      {tab === "audit" && <AuditTab />}
      {tab === "roles" && <RolesTab />}
      {tab === "lists" && <ListsTab />}
    </>
  );

  async function OrgTab() {
    const [org, cert, docs, users, people] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, include: { constitution: true } }),
      prisma.organizationCertificate.findUnique({ where: { organizationId: ctx.organization.id }, include: { file: { select: { id: true, originalFileName: true } } } }),
      prisma.organizationDocument.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { createdAt: "desc" }, include: { file: { select: { id: true, originalFileName: true } } } }),
      prisma.organizationMembership.count({ where: { organizationId: ctx.organization.id, status: { not: "DISABLED" } } }),
      // The firm's own people (members without a client). PAN/Aadhaar are not shown here.
      prisma.constitutionMember.findMany({
        where: { organizationId: ctx.organization.id, clientId: null },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, fullName: true, role: true, mobile: true, email: true },
      }),
    ]);
    const s = (v: string | null) => v ?? "";
    return (
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card title="Business registration">
          <OrganizationForm
            action={saveOrganizationAction}
            usedLicences={users}
            d={{
              tradeName: org.tradeName, legalName: s(org.legalName), address: s(org.address), pan: s(org.pan), gstin: s(org.gstin), tan: s(org.tan),
              contactPersonName: s(org.contactPersonName), contactMobile: s(org.contactMobile), contactEmail: s(org.contactEmail), contactPhone: s(org.contactPhone),
              accessMode: org.accessMode, licensedUserLimit: String(org.licensedUserLimit),
              declaredEmployeeCount: org.declaredEmployeeCount?.toString() ?? "", declaredClientCount: org.declaredClientCount?.toString() ?? "",
              defaultProbationDays: String(org.defaultProbationDays),
            }}
          />
        </Card>
        <div className="space-y-6">
          <Card title="Registration status">
            <DetailList items={[
              ["Constitution", org.constitution?.name],
              ["GSTIN verification", org.gstVerificationStatus === "VERIFIED" ? `Verified ${formatDateTime(org.gstVerifiedAt)}` : "Not verified (GST portal integration pending)"],
              ["Profile picture", org.profilePictureFileId ? <a key="p" href={`/api/files/${org.profilePictureFileId}`} className="text-brand-700 hover:underline" target="_blank" rel="noopener noreferrer">View</a> : null],
            ]} />
          </Card>
          <Card title={`${org.constitution?.name ?? "Constitution"}: associated people`}>
            {people.length === 0 ? <p className="text-sm text-muted">None recorded.</p> : (
              <ul className="space-y-2 text-sm">
                {people.map((m) => (
                  <li key={m.id}>
                    <span className="font-medium">{m.fullName}</span> <span className="text-muted">· {humanize(m.role)}</span>
                    {(m.mobile || m.email) && <span className="block text-xs text-muted">{[m.mobile, m.email].filter(Boolean).join(" · ")}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Certificate (one per organization)">
            {cert && (
              <p className="mb-3 text-sm">
                Current: <a href={`/api/files/${cert.file.id}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">{cert.certificateName ?? cert.file.originalFileName}</a>
                {cert.expiresOn && <span className="text-muted"> · expires {formatDate(cert.expiresOn)}</span>}
              </p>
            )}
            <CertificateForm
              action={saveCertificateAction}
              d={{ certificateName: s(cert?.certificateName ?? null), certificateNumber: s(cert?.certificateNumber ?? null), issuedOn: cert?.issuedOn ? toIsoDate(cert.issuedOn) : "", expiresOn: cert?.expiresOn ? toIsoDate(cert.expiresOn) : "" }}
              replacing={!!cert}
            />
          </Card>
          <Card title="Leave policy documents">
            <ul className="mb-3 space-y-1 text-sm">
              {docs.map((d) => <li key={d.id}><a href={`/api/files/${d.file.id}`} target="_blank" rel="noopener noreferrer" className="text-brand-700 hover:underline">{d.title ?? d.file.originalFileName}</a>{d.effectiveFrom && <span className="text-muted"> · from {formatDate(d.effectiveFrom)}</span>}</li>)}
              {docs.length === 0 && <li className="text-muted">None uploaded.</li>}
            </ul>
            <LeavePolicyDocForm action={uploadLeavePolicyAction} />
          </Card>
        </div>
      </div>
    );
  }

  async function PolicyTab() {
    const { row } = await getPolicy(ctx.organization.id);
    return (
      <div className="max-w-4xl space-y-4">
        <Notice tone="warn">
          The firm has two versions of the Leave & Timing Policy that differ on overtime (actual minutes vs. 2.5h/5h slabs) and on Sunday rules.
          These settings drive indicative attendance figures only. No salary deduction or overtime payment is calculated until the policy is confirmed — see docs/requirements-audit.md.
        </Notice>
        <Card>
          <PolicyForm
            action={savePolicyAction}
            d={Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "boolean" ? (v ? "on" : "") : v === null ? "" : String(v)]))}
          />
        </Card>
      </div>
    );
  }

  async function ListsTab() {
    const [designations, workTypes, org] = await Promise.all([
      prisma.designation.findMany({ where: { organizationId: ctx.organization.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { employees: true } } } }),
      prisma.workType.findMany({ where: { organizationId: ctx.organization.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { timesheetEntries: true } } } }),
      prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { pendingDaysBasis: true, timezone: true, approvalGraceDays: true } }),
    ]);
    const list = (kind: "designation" | "work_type", rows: { id: string; name: string; isActive: boolean; used: number; extra?: string | null }[]) => (
      <ul className="mb-4 divide-y divide-line text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 py-2">
            <span className={r.isActive ? "" : "text-muted line-through"}>{r.name}{r.extra && <span className="text-xs text-muted"> · {humanize(r.extra)}</span>}<span className="block text-xs text-muted">Used by {r.used} record(s)</span></span>
            <ActionButton action={toggleListItemAction.bind(null, kind, r.id)} confirm={r.isActive ? `Stop offering "${r.name}" in new forms? Existing records keep it.` : undefined}>{r.isActive ? "Deactivate" : "Reactivate"}</ActionButton>
          </li>
        ))}
        {rows.length === 0 && <li className="py-2 text-muted">None yet.</li>}
      </ul>
    );
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Designations">
          {list("designation", designations.map((d) => ({ id: d.id, name: d.name, isActive: d.isActive, used: d._count.employees, extra: d.seniorityLevel })))}
          <ListItemForm action={addListItemAction.bind(null, "designation")} withSeniority />
        </Card>
        <Card title="Types of work (timesheet)">
          {list("work_type", workTypes.map((w) => ({ id: w.id, name: w.name, isActive: w.isActive, used: w._count.timesheetEntries })))}
          <ListItemForm action={addListItemAction.bind(null, "work_type")} />
        </Card>
        <div className="space-y-6">
          <Card title="Workflow preferences"><PreferencesForm action={savePreferencesAction} basis={org.pendingDaysBasis} graceDays={String(org.approvalGraceDays)} /></Card>
          <Card title="Time zone">
            <p className="text-sm">{org.timezone}</p>
            <p className="mt-1 text-xs text-muted">All dates, attendance cut-offs and reports use this zone. It is fixed for the firm (India Standard Time) and not editable here.</p>
          </Card>
          <Notice tone="info">Departments and the service catalog are managed on <Link href="/app/services" className="font-medium underline">Services &amp; departments</Link>.</Notice>
        </div>
      </div>
    );
  }

  async function RolesTab() {
    const counts = await prisma.organizationMembership.groupBy({
      by: ["role"],
      where: { organizationId: ctx.organization.id, status: "ACTIVE" },
      _count: true,
    });
    const roles = Object.keys(ROLE_LABELS) as Role[];
    return (
      <div className="space-y-4">
        <Notice tone="info">
          This matrix is generated from the rules the server enforces on every page and action. Roles are assigned per person on the Employees page
          (staff) or created by registration (clients). Designation never grants permissions. The owner&apos;s role cannot be changed or removed.
        </Notice>
        <div className="flex flex-wrap gap-2 text-sm">
          {roles.map((r) => (
            <span key={r} className="rounded-md border border-line bg-surface px-2.5 py-1">
              {ROLE_LABELS[r]}: <strong>{counts.find((c) => c.role === r)?._count ?? 0}</strong> active
            </span>
          ))}
        </div>
        <Table minWidth={760}>
          <thead>
            <tr>
              <Th>Permission</Th>
              {roles.map((r) => <Th key={r} className="text-center">{ROLE_LABELS[r]}</Th>)}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(CAPABILITIES) as Capability[]).map((cap) => (
              <tr key={cap}>
                <Td className="font-mono text-xs">{cap}</Td>
                {roles.map((r) => (
                  <Td key={r} className="text-center">
                    {can(r, cap) ? <span aria-label="Allowed" className="text-ok">✓</span> : <span aria-label="Not allowed" className="text-line">—</span>}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    );
  }

  async function AuditTab() {
    const page = Math.max(1, Number(sp.page) || 1);
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { createdAt: "desc" }, skip: (page - 1) * 50, take: 50, include: { actor: { select: { name: true } } } }),
      prisma.auditLog.count({ where: { organizationId: ctx.organization.id } }),
    ]);
    return (
      <>
        <Table minWidth={720}>
          <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Record</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-xs">{formatDateTime(r.createdAt)}</Td>
                <Td>{r.actor?.name ?? "System"}</Td>
                <Td>{r.action.replace(/[._]/g, " ")}</Td>
                <Td className="font-mono text-xs text-muted">{r.entityType}{r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pagination page={page} pageSize={50} total={total} hrefFor={(p) => `/app/settings?tab=audit&page=${p}`} />
      </>
    );
  }
}
