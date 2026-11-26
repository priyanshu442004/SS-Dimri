import Link from "next/link";
import { DeleteFileButton } from "@/components/delete-file-button";
import { canDeleteFiles } from "@/lib/services/file-removal";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { requireCapability } from "@/lib/session";
import { formatDate, formatDateTime, toIsoDate } from "@/lib/dates";
import { complianceChoices } from "@/lib/services/client-compliances";
import { clientActions, type ClientStatus } from "@/lib/domain/client-workflow";
import { daysPending, isTaskOverdue } from "@/lib/domain/derived";
import { describeSchedule } from "@/lib/domain/allocation-schedule";
import { clientScope } from "@/lib/services/clients";
import { GST_TYPES, isGstType } from "@/lib/domain/gst-type";
import { ActionButton } from "@/components/action-button";
import { DeleteButton } from "@/components/delete-dialog";
import { canDelete } from "@/lib/services/deletions";
import { Badge, Card, DetailList, EmptyState, humanize, Notice, PageHeader, StatusBadge, TabNav, Table, Td, Th } from "@/components/ui";
import {
  addContactAction, addEngagementAction, addGstinAction, addRepresentativeAction, removeContactAction, removeGstinAction, updateGstinAction,
  removeRepresentativeAction, saveClientDetailsAction, setEngagementStatusAction, transitionClientAction, updateEngagementAction, uploadClientDocumentAction,
  invitePortalUserAction,
  issuePortalResetLinkAction,
  setPortalUserStatusAction,
} from "../actions";
import { ContactForm, DetailsForm, DocumentForm, EngagementForm, GstinDetailsForm, GstinForm, PortalInviteForm, ResetLinkForm, RepresentativeForm, TransitionForm } from "./forms";
import { gstinLabel, gstState } from "@/lib/domain/gst-state";

const TABS = ["overview", "details", "registration", "services", "documents", "portal", "activity"] as const;

export default async function ClientDetailPage({ params, searchParams }: PageProps<"/app/clients/[id]">) {
  const ctx = await requireCapability("clients.use");
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.includes(sp.tab as never) ? (sp.tab as (typeof TABS)[number]) : "overview";

  const allowed = await prisma.client.findFirst({ where: { AND: [clientScope(ctx), { id }] }, select: { id: true } });
  const c = allowed ? await getFull(allowed.id) : null;
  if (!c) notFound();
  const edit = can(ctx, "clients.edit");
  const viewAll = can(ctx, "clients.view_all");
  const base = `/app/clients/${c.id}`;
  // Filings tracked per GSTIN (registration number in the compliance tracker), for state-wise compliances.
  const gstinFilings = new Map((await prisma.complianceEntry.groupBy({ by: ["registrationNumber"], where: { clientId: c.id, registrationNumber: { in: c.gstRegistrations.map((g) => g.gstin) } }, _count: { _all: true } })).map((g) => [g.registrationNumber!, g._count._all]));
  // Other clients of the same group (tracker S.No. 107), as far as this person may see them.
  const groupMates = c.groupId ? await prisma.client.findMany({ where: { AND: [clientScope(ctx), { groupId: c.groupId, id: { not: c.id } }] }, orderBy: { tradeName: "asc" }, select: { id: true, tradeName: true, clientCode: true, state: true, status: true, gstRegistrations: { select: { gstin: true, state: true } } } }) : [];

  return (
    <>
      <PageHeader
        title={c.tradeName}
        back={{ href: "/app/clients", label: "Clients" }}
        actions={canDelete(ctx, "client") && <DeleteButton entity="client" id={c.id} redirectTo="/app/clients" />}
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
          // Everyone who can open the client (its allocated team too) sees and downloads its documents; only editors upload.
          { key: "documents", label: "Documents", href: `${base}?tab=documents` },
          ...(edit ? [{ key: "portal", label: "Portal access", href: `${base}?tab=portal` }] : []),
          ...(viewAll ? [{ key: "activity", label: "Activity", href: `${base}?tab=activity` }] : []),
        ]}
      />

      {tab === "overview" && <Overview c={c} role={ctx} edit={edit} viewAll={viewAll} basis={ctx.organization.pendingDaysBasis} groupMates={groupMates} />}

      {tab === "details" && edit && (
        <Card className="max-w-4xl">
          <DetailsFormLoader clientId={c.id} c={c} />
        </Card>
      )}

      {tab === "registration" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title={`GSTINs — state-wise (${c.gstRegistrations.length})`}>
            {c.gstRegistrations.length > 1 && <p className="mb-2 text-xs text-muted">One PAN registered in {new Set(c.gstRegistrations.map((g) => g.state ?? gstState(g.gstin))).size} state(s). Each GSTIN files its own returns: pick the GSTIN in the compliance tracker so each state&apos;s filings are tracked separately.</p>}
            <ul className="mb-4 divide-y divide-line text-sm">
              {c.gstRegistrations.map((g) => (
                <li key={g.id} className="py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-mono">{g.gstin}</span>
                      <span className="ml-2 text-xs text-muted">{[g.state ?? gstState(g.gstin), g.branchName].filter(Boolean).join(" · ") || "State not known"}</span>
                      {g.registrationType && isGstType(g.registrationType) && <> <Badge tone="info">{GST_TYPES[g.registrationType]}</Badge></>}
                      {(gstinFilings.get(g.gstin) ?? 0) > 0 && <Link href={`/app/compliances?client=${c.id}`} className="ml-2 text-xs text-brand-700 hover:underline">{gstinFilings.get(g.gstin)} filing{gstinFilings.get(g.gstin) === 1 ? "" : "s"} tracked</Link>}
                    </span>
                    {edit && <ActionButton variant="ghost" confirm={`Remove GSTIN ${g.gstin}?`} action={removeGstinAction.bind(null, c.id, g.id)}>Remove</ActionButton>}
                  </div>
                  {edit && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-brand-700">Branch / registration type</summary>
                      <div className="mt-2"><GstinDetailsForm action={updateGstinAction.bind(null, c.id, g.id)} d={{ branchName: g.branchName ?? "", registrationType: g.registrationType ?? "" }} /></div>
                    </details>
                  )}
                </li>
              ))}
              {c.gstRegistrations.length === 0 && <li className="py-2 text-muted">No GSTIN recorded.</li>}
            </ul>
            {edit && <GstinForm action={addGstinAction.bind(null, c.id)} pan={c.pan} />}
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
                      <Td className="text-xs">{can(ctx, "org.manage") ? `${m.pan ?? "—"} / ${m.aadhaarLast4 ? `XXXX ${m.aadhaarLast4}` : "—"}` : "Restricted"}</Td>
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

      {tab === "portal" && edit && <PortalTab clientId={c.id} organizationId={ctx.organization.id} canDisable={can(ctx, "clients.approve")} />}
      {tab === "activity" && viewAll && <ActivityTab clientId={c.id} organizationId={ctx.organization.id} />}
      {tab === "services" && <ServicesTab c={c} edit={edit} organizationId={ctx.organization.id} editId={typeof sp.edit === "string" ? sp.edit : undefined} />}

      {tab === "documents" && (
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
                <p className="text-sm text-muted">No documents uploaded.{!edit && " Ask your manager to upload the client's documents."}</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {rows.map((r) => (
                    <li key={r.fid} className="flex items-center justify-between py-2">
                      <span>{r.label}{r.when && <span className="ml-2 text-xs text-muted">{formatDate(r.when)}</span>}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <a href={`/api/files/${r.fid}`} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline">View / download</a>
                        {canDeleteFiles(ctx) && <DeleteFileButton fileId={r.fid} />}
                      </span>
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
  const [constitutions, natures, options, choices, chosen, groups] = await Promise.all([
    prisma.constitution.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.businessNature.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    prisma.classificationOption.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    complianceChoices(),
    prisma.clientCompliance.findMany({ where: { clientId }, select: { complianceItemId: true } }),
    prisma.clientGroup.findMany({ where: { organizationId: c.organizationId }, orderBy: { name: "asc" }, select: { name: true } }),
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
        gstUserId: c.gstUserId ?? "", incomeTaxUserId: c.incomeTaxUserId ?? "", tracesUserId: c.tracesUserId ?? "", ewayBillUserId: c.ewayBillUserId ?? "",
        gstPasswordSet: c.gstPasswordEncrypted ? "1" : "", incomeTaxPasswordSet: c.incomeTaxPasswordEncrypted ? "1" : "", tracesPasswordSet: c.tracesPasswordEncrypted ? "1" : "", ewayBillPasswordSet: c.ewayBillPasswordEncrypted ? "1" : "",
        groupName: c.group?.name ?? "",
        officeOpensAt: c.officeOpensAt ?? "", state: c.state ?? "", dateOfBirth: c.dateOfBirth ? toIsoDate(c.dateOfBirth) : "", itFileNo: c.itFileNo ?? "", masterRemark: c.masterRemark ?? "",
      }}
      compliances={{ ...choices, chosenDepartments: c.departments, chosenIds: chosen.map((x) => x.complianceItemId), gstType: c.gstRegistrationType ?? "", gstinTypes: c.gstRegistrations.map((g) => g.registrationType).filter((t): t is string => !!t) }}
      groups={groups.map((g) => g.name)}
      constitutions={constitutions.map((x) => ({ value: x.id, label: x.name }))}
      natures={natures.map((x) => ({ value: x.id, label: x.label }))}
      classifications={options.map((o) => ({ value: o.id, label: o.label, basis: o.basis }))}
      completedAt={c.detailsCompletedAt ? formatDateTime(c.detailsCompletedAt) : null}
    />
  );
}

type GroupMate = { id: string; tradeName: string; clientCode: string | null; state: string | null; status: string; gstRegistrations: { gstin: string; state: string | null }[] };

async function Overview({ c, role, edit, viewAll, basis, groupMates }: { basis: "CALENDAR" | "BUSINESS"; c: FullClient; role: Parameters<typeof clientActions>[1]; edit: boolean; viewAll: boolean; groupMates: GroupMate[] }) {
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
              ["Client group", c.group?.name],
              ["GSTIN", c.gstRegistrations.map((g) => gstinLabel(g)).join(", ")],
              ["Address", c.address],
              ["MSME", c.isMsme === null ? null : c.isMsme ? `Yes${c.msmeRegistrationNumber ? ` · ${c.msmeRegistrationNumber}` : ""}` : "No"],
              ["ESI / PF", [c.esiNumber, c.pfNumber].filter(Boolean).join(" / ")],
              ["Billing basis", cls("BILLING_BASIS")],
              ["Place of work", cls("PLACE_OF_WORK")],
              ["GST registration type", c.gstRegistrationType && isGstType(c.gstRegistrationType) ? GST_TYPES[c.gstRegistrationType] : null],
              ["GST status", cls("GST_STATUS")],
              ["Office opens at", c.officeOpensAt ? `${c.officeOpensAt} (late-coming of staff at this client is checked against it)` : null],
              ["Priority", cls("PRIORITY")],
              ["State", c.state],
              ["Date of birth / incorporation", c.dateOfBirth ? formatDate(c.dateOfBirth) : null],
              ["IT file no.", c.itFileNo],
              ["Departments", c.departments.join(", ")],
              ["Portal logins", ([["GST", c.gstUserId, c.gstPasswordEncrypted], ["Income Tax", c.incomeTaxUserId, c.incomeTaxPasswordEncrypted], ["TRACES", c.tracesUserId, c.tracesPasswordEncrypted], ["E-way bill", c.ewayBillUserId, c.ewayBillPasswordEncrypted]] as const).filter(([, id, pw]) => id || pw).map(([k, id, pw]) => `${k}: ${id ?? "—"}${pw ? " (password saved)" : ""}`).join(" · ")],
              ["Remark", c.masterRemark],
              ...(c.extraFields && typeof c.extraFields === "object" && !Array.isArray(c.extraFields) ? Object.entries(c.extraFields as Record<string, string>).map(([k, v]) => [k, String(v)] as [string, string]) : []),
              ["Primary contact", c.contacts[0] ? `${c.contacts[0].name} ${c.contacts[0].mobile ?? ""}` : null],
            ]}
          />
        </Card>
        <Card title={`Compliances (${c.compliances.length})`} actions={<Link className="text-sm text-brand-700 hover:underline" href="/app/compliances">Compliance tracker</Link>}>
          {c.compliances.length === 0 ? <p className="text-sm text-muted">No compliances chosen yet.{edit && " Pick the departments under Details."}</p> : (
            <div className="space-y-3 text-sm">
              {[...new Set(c.compliances.map((x) => x.item.department))].map((dept) => (
                <div key={dept}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{dept}</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {c.compliances.filter((x) => x.item.department === dept).map((x) => (
                      <li key={x.id}><Badge tone="neutral">{x.item.name}{x.item.frequency ? ` · ${x.item.frequency}` : ""}</Badge></li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Open tasks" actions={<Link className="text-sm text-brand-700 hover:underline" href={`/app/tasks?client=${c.id}${viewAll ? "&scope=all" : ""}`}>All tasks of this client</Link>}>
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
        {c.group && (
          <Card title={`Group · ${c.group.name}`} actions={<Link className="text-sm text-brand-700 hover:underline" href={`/app/clients?group=${c.group.id}`}>All in group</Link>}>
            {groupMates.length === 0 ? <p className="text-sm text-muted">No other client of this group{viewAll ? "" : " that you can see"}.</p> : (
              <ul className="space-y-2 text-sm">
                {groupMates.map((m) => (
                  <li key={m.id}>
                    <Link href={`/app/clients/${m.id}`} className="font-medium text-brand-700 hover:underline">{m.tradeName}</Link>
                    <span className="block text-xs text-muted">{[m.clientCode, m.state ?? [...new Set(m.gstRegistrations.map((g) => g.state ?? gstState(g.gstin)).filter(Boolean))].join(", "), m.gstRegistrations.length ? `${m.gstRegistrations.length} GSTIN${m.gstRegistrations.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <Card title="Team allocated" actions={viewAll && <Link className="text-sm text-brand-700 hover:underline" href={`/app/allocations?client=${c.id}`}>Manage</Link>}>
          {c.teamAllocations.length === 0 ? <p className="text-sm text-muted">No team allocated.</p> : (
            <ul className="space-y-2 text-sm">
              {c.teamAllocations.map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.employee.firstName} {a.employee.lastName}</span>
                  <span className="text-muted"> · {a.employee.designation?.name ?? (a.seniorityLevel ? humanize(a.seniorityLevel) : "")}</span>
                  <div className="text-xs text-muted">{describeSchedule(a)} · from {formatDate(a.startDate)}{a.endDate ? ` to ${formatDate(a.endDate)}` : ""}</div>
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
      constitution: true, primaryBusinessNature: true, secondaryBusinessNature: true, gstRegistrations: { orderBy: { createdAt: "asc" } }, group: true, contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      constitutionMembers: { orderBy: { createdAt: "asc" } }, classifications: { include: { option: true } },
      services: { include: { service: { include: { department: true } } }, orderBy: { createdAt: "asc" } },
      documents: { include: { file: { select: { id: true, originalFileName: true, createdAt: true } } } },
      teamAllocations: { where: { status: { in: ["ACTIVE", "PLANNED"] } }, include: { employee: { include: { designation: true } } } },
      approvedBy: { select: { name: true } }, rejectedBy: { select: { name: true } },
      compliances: { include: { item: { select: { department: true, name: true, frequency: true, sortOrder: true } } }, orderBy: { item: { sortOrder: "asc" } } },
    },
  });
}

async function ServicesTab({ c, edit, organizationId, editId }: { c: FullClient; edit: boolean; organizationId: string; editId?: string }) {
  const editing = edit && editId ? c.services.find((s) => s.id === editId) : undefined;
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
                  {edit && (
                    <span className="flex flex-wrap gap-1">
                      <Link href={`/app/clients/${c.id}?tab=services&edit=${s.id}#edit-service`} className="inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-brand-700 hover:bg-subtle">Edit</Link>
                      {s.status === "ACTIVE" ? (
                        <>
                          <ActionButton variant="ghost" action={setEngagementStatusAction.bind(null, c.id, s.id, "COMPLETED")}>Complete</ActionButton>
                          <ActionButton variant="ghost" confirm="Cancel this engagement?" action={setEngagementStatusAction.bind(null, c.id, s.id, "CANCELLED")}>Cancel</ActionButton>
                        </>
                      ) : (
                        <ActionButton variant="ghost" confirm="Make this service active again?" action={setEngagementStatusAction.bind(null, c.id, s.id, "ACTIVE")}>Make active</ActionButton>
                      )}
                    </span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {edit && editing && (
        <div id="edit-service" className="scroll-mt-6">
          <Card title={`Edit service · ${editing.service.name}`} className="max-w-4xl" actions={<Link href={`/app/clients/${c.id}?tab=services`} className="text-sm text-muted hover:text-ink">Close</Link>}>
            <EngagementForm
              key={editing.id}
              action={updateEngagementAction.bind(null, c.id, editing.id)}
              services={(services.some((x) => x.id === editing.serviceId) ? services : [{ id: editing.serviceId, name: editing.service.name }, ...services]).map((x) => ({ value: x.id, label: x.name }))}
              today={toIsoDate(new Date())}
              d={{
                serviceId: editing.serviceId, engagementNature: editing.engagementNature ?? "", agreedFee: editing.agreedFee ? String(editing.agreedFee) : "",
                startDate: editing.startDate ? toIsoDate(editing.startDate) : "", dueDate: editing.dueDate ? toIsoDate(editing.dueDate) : "",
                timelineNote: editing.timelineNote ?? "", description: editing.description ?? "",
                pocName: editing.pocName ?? "", pocMobile: editing.pocMobile ?? "", pocEmail: editing.pocEmail ?? "", pocAddress: editing.pocAddress ?? "",
              }}
            />
          </Card>
        </div>
      )}
      {edit && (
        <Card title="Add services" className="max-w-4xl">
          <EngagementForm action={addEngagementAction.bind(null, c.id)} services={services.map((s) => ({ value: s.id, label: s.name }))} today={toIsoDate(new Date())} active={c.services.filter((s) => s.status === "ACTIVE").map((s) => s.serviceId)} />
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
