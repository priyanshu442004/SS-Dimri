import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDate, formatDateTime, toIsoDate } from "@/lib/dates";
import { clientActions, type ClientStatus } from "@/lib/domain/client-workflow";
import { daysPending, isTaskOverdue } from "@/lib/domain/derived";
import { clientScope } from "@/lib/services/clients";
import { ActionButton } from "@/components/action-button";
import { Badge, Card, DetailList, EmptyState, humanize, Notice, PageHeader, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import {
  addContactAction, addEngagementAction, addGstinAction, addRepresentativeAction, removeContactAction, removeGstinAction,
  removeRepresentativeAction, saveClientDetailsAction, setEngagementStatusAction, transitionClientAction, uploadClientDocumentAction,
  invitePortalUserAction,
  issuePortalResetLinkAction,
  setPortalUserStatusAction,
} from "../actions";
import { ContactForm, DetailsForm, DocumentForm, EngagementForm, GstinForm, PortalInviteForm, ResetLinkForm, RepresentativeForm, TransitionForm } from "./forms";

const TABS = ["overview", "details", "registration", "services", "documents", "portal", "activity"] as const;

export default async function ClientDetailPage({ params, searchParams }: PageProps<"/app/clients/[id]">) {
  const ctx = await requireCapability("app.use");
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.includes(sp.tab as never) ? (sp.tab as (typeof TABS)[number]) : "overview";

  const allowed = await prisma.client.findFirst({ where: { AND: [clientScope(ctx), { id }] }, select: { id: true } });
  const c = allowed ? await getFull(allowed.id) : null;
  if (!c) notFound();
  const edit = can(ctx.role, "clients.edit");
  const viewAll = can(ctx.role, "clients.view_all");
  const base = `/app/clients/${c.id}`;

  return (
    <>
      <PageHeader
        title={c.tradeName}
        back={{ href: "/app/clients", label: "Clients" }}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{c.clientCode}</span>
            <StatusBadge status={c.status} label={c.status === "INACTIVE" ? "Discontinued" : undefined} />
            {c.legalName && <span>· {c.legalName}</span>}
          </span>
        }
      />
      {sp.registered && <div className="mb-4"><Notice tone="ok">Client registered and sent for approval. You can complete the remaining details now or later.</Notice></div>}
      <TabNav
        current={tab}
        tabs={[
          { key: "overview", label: "Overview", href: base },
          ...(edit ? [{ key: "details", label: "Registration details", href: `${base}?tab=details` }] : []),
          { key: "registration", label: "GSTIN, contacts & representatives", href: `${base}?tab=registration` },
          { key: "services", label: "Services", href: `${base}?tab=services` },
          ...(viewAll ? [{ key: "documents", label: "Documents", href: `${base}?tab=documents` }] : []),
          ...(edit ? [{ key: "portal", label: "Portal access", href: `${base}?tab=portal` }] : []),
          ...(viewAll ? [{ key: "activity", label: "Activity", href: `${base}?tab=activity` }] : []),
        ]}
      />

      {tab === "overview" && <Overview c={c} role={ctx.role} edit={edit} viewAll={viewAll} basis={ctx.organization.pendingDaysBasis} />}

      {tab === "details" && edit && (
        <Card className="max-w-4xl">
          <DetailsFormLoader clientId={c.id} c={c} />
        </Card>
      )}

      {tab === "registration" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={`GSTINs (${c.gstRegistrations.length})`}>
            <ul className="mb-4 divide-y divide-line text-sm">
              {c.gstRegistrations.map((g) => (
                <li key={g.id} className="flex items-center justify-between py-2">
                  <span className="font-mono">{g.gstin}</span>
                  {edit && <ActionButton variant="ghost" confirm={`Remove GSTIN ${g.gstin}?`} action={removeGstinAction.bind(null, c.id, g.id)}>Remove</ActionButton>}
                </li>
              ))}
              {c.gstRegistrations.length === 0 && <li className="py-2 text-muted">No GSTIN recorded.</li>}
            </ul>
            {edit && <GstinForm action={addGstinAction.bind(null, c.id)} />}
          </Card>

          <Card title="Points of contact">
            <ul className="mb-4 divide-y divide-line text-sm">
              {c.contacts.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className="font-medium">{p.name} {p.isPrimary && <Badge tone="brand">Primary</Badge>}</p>
                    <p className="text-muted">{[p.designation, p.mobile, p.email].filter(Boolean).join(" · ")}</p>
                    {p.address && <p className="text-xs text-muted">{p.address}</p>}
                  </div>
                  {edit && <ActionButton variant="ghost" confirm={`Remove ${p.name}?`} action={removeContactAction.bind(null, c.id, p.id)}>Remove</ActionButton>}
                </li>
              ))}
              {c.contacts.length === 0 && <li className="py-2 text-muted">No contacts yet.</li>}
            </ul>
            {edit && <ContactForm action={addContactAction.bind(null, c.id)} />}
          </Card>

          <Card title={`Constitution representatives — ${c.constitution?.name ?? "constitution not set"}`} className="lg:col-span-2">
            <p className="mb-3 text-sm text-muted">
              {c.constitution
                ? `Record each ${humanize(c.constitution.representativeRole).toLowerCase()}${c.constitution.allowsMultiple ? " (several allowed)" : ""}. PAN and Aadhaar are visible to administrators only; Aadhaar is stored encrypted.`
                : "Set the constitution under Registration details first."}
            </p>
            {c.constitutionMembers.length > 0 && (
              <Table minWidth={640}>
                <thead><tr><Th>Name</Th><Th>Role</Th><Th>Contact</Th><Th>PAN / Aadhaar</Th><Th /></tr></thead>
                <tbody>
                  {c.constitutionMembers.map((m) => (
                    <tr key={m.id}>
                      <Td className="font-medium">{m.fullName}</Td>
                      <Td>{humanize(m.role)}</Td>
                      <Td className="text-xs">{[m.mobile, m.email].filter(Boolean).join(" · ") || "—"}</Td>
                      <Td className="text-xs">{can(ctx.role, "org.manage") ? `${m.pan ?? "—"} / ${m.aadhaarLast4 ? `XXXX ${m.aadhaarLast4}` : "—"}` : "Restricted"}</Td>
                      <Td>{edit && <ActionButton variant="ghost" confirm={`Remove ${m.fullName}?`} action={removeRepresentativeAction.bind(null, c.id, m.id)}>Remove</ActionButton>}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {edit && (
              <div className="mt-4 border-t border-line pt-4">
                <RepresentativeForm action={addRepresentativeAction.bind(null, c.id)} defaultRole={c.constitution?.representativeRole ?? "OTHER"} />
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === "portal" && edit && <PortalTab clientId={c.id} organizationId={ctx.organization.id} canDisable={can(ctx.role, "clients.approve")} />}
      {tab === "activity" && viewAll && <ActivityTab clientId={c.id} organizationId={ctx.organization.id} />}
      {tab === "services" && <ServicesTab c={c} edit={edit} organizationId={ctx.organization.id} />}

      {tab === "documents" && viewAll && (
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card title="Certificates & documents">
            {(() => {
              const fixed: [string, string | null][] = [
                ["MSME certificate", c.msmeCertificateFileId], ["ESI certificate", c.esiCertificateFileId], ["PF certificate", c.pfCertificateFileId],
              ];
              const rows = [
                ...fixed.filter((f): f is [string, string] => !!f[1]).map(([label, fid]) => ({ label, fid, when: null as Date | null })),
                ...c.documents.map((d) => ({ label: `${d.title ?? d.file.originalFileName} (${humanize(d.type)})`, fid: d.file.id, when: d.file.createdAt })),
              ];
              return rows.length === 0 ? (
                <p className="text-sm text-muted">No documents uploaded.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {rows.map((r) => (
                    <li key={r.fid} className="flex items-center justify-between py-2">
                      <span>{r.label}{r.when && <span className="ml-2 text-xs text-muted">{formatDate(r.when)}</span>}</span>
                      <a href={`/api/files/${r.fid}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">View</a>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </Card>
          {edit && (
            <Card title="Upload">
              <DocumentForm action={uploadClientDocumentAction.bind(null, c.id)} />
            </Card>
          )}
        </div>
      )}
    </>
  );

}

type FullClient = NonNullable<Awaited<ReturnType<typeof getFull>>>;

async function DetailsFormLoader({ clientId, c }: { clientId: string; c: FullClient }) {
  const [constitutions, natures, options] = await Promise.all([
    prisma.constitution.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.businessNature.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.classificationOption.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
  ]);
  const cls = Object.fromEntries(c.classifications.map((x) => [x.basis, x.optionId]));
  return (
    <DetailsForm
      action={saveClientDetailsAction.bind(null, clientId)}
      d={{
        tradeName: c.tradeName, legalName: c.legalName ?? "", address: c.address ?? "", pan: c.pan ?? "", tan: c.tan ?? "",
        constitutionId: c.constitutionId ?? "", natureOfClient: c.natureOfClient ?? "",
        primaryBusinessNatureId: c.primaryBusinessNatureId ?? "", secondaryBusinessNatureId: c.secondaryBusinessNatureId ?? "",
        isMsme: c.isMsme === null ? "" : c.isMsme ? "yes" : "no", msmeRegistrationNumber: c.msmeRegistrationNumber ?? "",
        esiNumber: c.esiNumber ?? "", pfNumber: c.pfNumber ?? "", ...cls,
      }}
      constitutions={constitutions.map((x) => ({ value: x.id, label: x.name }))}
      natures={natures.map((x) => ({ value: x.id, label: x.label }))}
      classifications={options.map((o) => ({ value: o.id, label: o.label, basis: o.basis }))}
      completedAt={c.detailsCompletedAt ? formatDateTime(c.detailsCompletedAt) : null}
    />
  );
}

async function Overview({ c, role, edit, viewAll, basis }: { basis: "CALENDAR" | "BUSINESS"; c: FullClient; role: Parameters<typeof clientActions>[1]; edit: boolean; viewAll: boolean }) {
  const [tasks, pending] = await Promise.all([
    prisma.task.findMany({
      where: { clientId: c.id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
      orderBy: [{ dueAt: "asc" }],
      take: 8,
      select: { id: true, title: true, status: true, dueAt: true, priority: true, isAsap: true },
    }),
    prisma.pendingItem.findMany({
      where: { clientId: c.id, status: { not: "CLOSED" } },
      orderBy: { requestedOn: "asc" },
      take: 8,
      select: { id: true, requestDescription: true, pendingWith: true, requestedOn: true, closedAt: true },
    }),
  ]);
  const actions = clientActions(c.status as ClientStatus, role);
  const cls = (b: string) => c.classifications.find((x) => x.basis === b)?.option.label;
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-6">
        <Card title="Business">
          <DetailList
            items={[
              ["Trade name", c.tradeName],
              ["Legal name", c.legalName],
              ["Constitution", c.constitution?.name],
              ["Nature of business", [c.primaryBusinessNature?.label, c.secondaryBusinessNature?.label].filter(Boolean).join(" / ")],
              ["Nature of client", c.natureOfClient ? humanize(c.natureOfClient) : null],
              ["PAN", c.pan],
              ["TAN", c.tan],
              ["GSTIN", c.gstRegistrations.map((g) => g.gstin).join(", ")],
              ["Address", c.address],
              ["MSME", c.isMsme === null ? null : c.isMsme ? `Yes${c.msmeRegistrationNumber ? ` · ${c.msmeRegistrationNumber}` : ""}` : "No"],
              ["ESI / PF", [c.esiNumber, c.pfNumber].filter(Boolean).join(" / ")],
              ["Billing basis", cls("BILLING_BASIS")],
              ["Place of work", cls("PLACE_OF_WORK")],
              ["GST status", cls("GST_STATUS")],
              ["Priority", cls("PRIORITY")],
              ["Primary contact", c.contacts[0] ? `${c.contacts[0].name} ${c.contacts[0].mobile ?? ""}` : null],
            ]}
          />
        </Card>
        <Card title="Open tasks" actions={<Link className="text-sm text-brand-700 hover:underline" href={`/app/tasks?client=${c.id}`}>All tasks</Link>}>
          {tasks.length === 0 ? <p className="text-sm text-muted">No open tasks.</p> : (
            <ul className="divide-y divide-line text-sm">
              {tasks.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/app/tasks/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.title}</Link>
                  <span className="flex items-center gap-2">
                    {isTaskOverdue(t) && <StatusBadge status="OVERDUE" />}
                    <StatusBadge status={t.status} />
                    <span className="text-xs text-muted">{t.dueAt ? `Due ${formatDate(t.dueAt)}` : ""}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Pending items" actions={<Link className="text-sm text-brand-700 hover:underline" href={`/app/pending?client=${c.id}`}>Pending tracker</Link>}>
          {pending.length === 0 ? <p className="text-sm text-muted">Nothing pending.</p> : (
            <ul className="divide-y divide-line text-sm">
              {pending.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{p.requestDescription}</span>
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <Badge tone={p.pendingWith === "CLIENT" ? "warn" : "info"}>{p.pendingWith === "CLIENT" ? "With client" : "With team"}</Badge>
                    {daysPending(p, undefined, basis)} days
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Registration status">
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">Status: <StatusBadge status={c.status} label={c.status === "INACTIVE" ? "Discontinued" : undefined} /></p>
            {c.submittedAt && <p className="text-muted">Submitted {formatDateTime(c.submittedAt)}</p>}
            {c.approvedAt && <p className="text-muted">Approved {formatDateTime(c.approvedAt)} by {c.approvedBy?.name}</p>}
            {c.rejectedAt && <p className="text-danger">Rejected {formatDateTime(c.rejectedAt)} by {c.rejectedBy?.name}: {c.rejectionReason}</p>}
            {!c.detailsCompletedAt && edit && <p className="text-muted">Remaining registration details are not yet complete.</p>}
          </div>
          {edit && actions.length > 0 && (
            <div className="mt-4 border-t border-line pt-4">
              <TransitionForm action={transitionClientAction.bind(null, c.id)} actions={actions} />
            </div>
          )}
        </Card>
        <Card title="Team allocated" actions={viewAll && <Link className="text-sm text-brand-700 hover:underline" href={`/app/allocations?client=${c.id}`}>Manage</Link>}>
          {c.teamAllocations.length === 0 ? <p className="text-sm text-muted">No team allocated.</p> : (
            <ul className="space-y-2 text-sm">
              {c.teamAllocations.map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.employee.firstName} {a.employee.lastName}</span>
                  <span className="text-muted"> · {a.employee.designation?.name ?? (a.seniorityLevel ? humanize(a.seniorityLevel) : "")}</span>
                  <div className="text-xs text-muted">from {formatDate(a.startDate)}{a.endDate ? ` to ${formatDate(a.endDate)}` : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Services">
          {c.services.filter((s) => s.status === "ACTIVE").length === 0 ? <p className="text-sm text-muted">No active services.</p> : (
            <ul className="space-y-1 text-sm">
              {c.services.filter((s) => s.status === "ACTIVE").map((s) => (
                <li key={s.id}>{s.service.name}{s.engagementNature && <span className="text-xs text-muted"> · {humanize(s.engagementNature)}</span>}</li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

async function getFull(id: string) {
  return prisma.client.findFirst({
    where: { id },
    include: {
      constitution: true, primaryBusinessNature: true, secondaryBusinessNature: true, gstRegistrations: { orderBy: { createdAt: "asc" } }, contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      constitutionMembers: { orderBy: { createdAt: "asc" } }, classifications: { include: { option: true } },
      services: { include: { service: { include: { department: true } } }, orderBy: { createdAt: "asc" } },
      documents: { include: { file: { select: { id: true, originalFileName: true, createdAt: true } } } },
      teamAllocations: { where: { status: { in: ["ACTIVE", "PLANNED"] } }, include: { employee: { include: { designation: true } } } },
      approvedBy: { select: { name: true } }, rejectedBy: { select: { name: true } },
    },
  });
}

async function ServicesTab({ c, edit, organizationId }: { c: FullClient; edit: boolean; organizationId: string }) {
  const services = edit
    ? await prisma.service.findMany({ where: { organizationId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];
  return (
    <div className="space-y-6">
      {c.services.length === 0 ? (
        <EmptyState kind="documents" title="No services yet">Add the services this client has engaged the firm for.</EmptyState>
      ) : (
        <Table minWidth={900}>
          <thead><tr><Th>Service</Th><Th>Nature</Th><Th>Timeline</Th><Th>Agreed fee</Th><Th>Point of contact</Th><Th>Status</Th><Th /></tr></thead>
          <tbody>
            {c.services.map((s) => (
              <tr key={s.id}>
                <Td>
                  <span className="font-medium">{s.service.name}</span>
                  <div className="text-xs text-muted">{s.service.department?.name}</div>
                  {s.description && <div className="text-xs text-muted">{s.description}</div>}
                </Td>
                <Td>{s.engagementNature ? humanize(s.engagementNature) : "—"}</Td>
                <Td className="text-xs">{s.startDate ? formatDate(s.startDate) : "—"}{s.dueDate ? ` → ${formatDate(s.dueDate)}` : ""}{s.timelineNote && <div className="text-muted">{s.timelineNote}</div>}</Td>
                <Td>{s.agreedFee ? `₹ ${Number(s.agreedFee).toLocaleString("en-IN")}` : "—"}</Td>
                <Td className="text-xs">{[s.pocName, s.pocMobile, s.pocEmail].filter(Boolean).join(" · ") || "—"}</Td>
                <Td><StatusBadge status={s.status} /></Td>
                <Td>
                  {edit && s.status === "ACTIVE" && (
                    <span className="flex gap-1">
                      <ActionButton variant="ghost" action={setEngagementStatusAction.bind(null, c.id, s.id, "COMPLETED")}>Complete</ActionButton>
                      <ActionButton variant="ghost" confirm="Cancel this engagement?" action={setEngagementStatusAction.bind(null, c.id, s.id, "CANCELLED")}>Cancel</ActionButton>
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {edit && (
        <Card title="Add a service" className="max-w-4xl">
          <EngagementForm action={addEngagementAction.bind(null, c.id)} services={services.map((s) => ({ value: s.id, label: s.name }))} today={toIsoDate(new Date())} />
        </Card>
      )}
    </div>
  );
}

async function PortalTab({ clientId, organizationId, canDisable }: { clientId: string; organizationId: string; canDisable: boolean }) {
  const users = await prisma.organizationMembership.findMany({
    where: { organizationId, clientId, role: "CLIENT" },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true, createdAt: true, user: { select: { name: true, email: true } } },
  });
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <Card title={`Portal logins (${users.length})`}>
        {users.length === 0 ? <p className="text-sm text-muted">This client has no portal login yet.</p> : (
          <ul className="divide-y divide-line text-sm">
            {users.map((u) => (
              <li key={u.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><span className="font-medium">{u.user.name}</span><span className="block text-xs text-muted">{u.user.email} · since {formatDate(u.createdAt)}</span></span>
                  <StatusBadge status={u.status === "DISABLED" ? "INACTIVE" : "ACTIVE"} label={u.status === "DISABLED" ? "Disabled" : "Active"} />
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <ResetLinkForm action={issuePortalResetLinkAction.bind(null, clientId, u.id)} />
                  {canDisable && (u.status === "DISABLED"
                    ? <ActionButton action={setPortalUserStatusAction.bind(null, clientId, u.id, "ACTIVE")}>Enable</ActionButton>
                    : <ActionButton variant="danger" confirm="Disable this portal login? The person is signed out immediately." action={setPortalUserStatusAction.bind(null, clientId, u.id, "DISABLED")}>Disable</ActionButton>)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Invite a client user">
        <p className="mb-3 text-sm text-muted">Creates a client login for this business. You will get a one-time link for the person to set their password.</p>
        <PortalInviteForm action={invitePortalUserAction.bind(null, clientId)} />
      </Card>
    </div>
  );
}

async function ActivityTab({ clientId, organizationId }: { clientId: string; organizationId: string }) {
  const logs = await prisma.auditLog.findMany({
    where: { organizationId, entityType: "client", entityId: clientId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true } } },
  });
  return (
    <Card title="Activity history">
      {logs.length === 0 ? <p className="text-sm text-muted">No recorded activity.</p> : (
        <ol className="space-y-2 text-sm">
          {logs.map((l) => (
            <li key={l.id} className="border-l-2 border-line pl-3">
              <span>{l.action.replace(/^client\./, "").replace(/[._]/g, " ")}</span>
              <span className="block text-xs text-muted">{l.actor?.name ?? "System"} · {formatDateTime(l.createdAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
