import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireCapability } from "@/lib/session";
import { formatDateTime } from "@/lib/dates";
import { clientAccess } from "@/lib/domain/approval-access";
import { GraceBadge } from "@/components/grace-badge";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { BadgeCheck } from "lucide-react";

const CHANNEL: Record<string, string> = { STAFF: "Registered by staff", CLIENT_QUICK: "Client — quick registration", CLIENT_FULL: "Client — full registration" };

/** Client approval queue: pending registrations with what is still missing. */
export default async function ClientApprovalQueue() {
  const ctx = await requireCapability("clients.approve");
  const { approvalGraceDays } = await prisma.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { approvalGraceDays: true } });
  const pending = await prisma.client.findMany({
    where: { organizationId: ctx.organization.id, status: "PENDING_APPROVAL" },
    orderBy: { submittedAt: "asc" },
    select: {
      id: true, tradeName: true, legalName: true, address: true, pan: true, constitutionId: true, registrationChannel: true, submittedAt: true, createdAt: true, status: true,
      contacts: { where: { isPrimary: true }, take: 1, select: { name: true, mobile: true, email: true } },
      _count: { select: { gstRegistrations: true, documents: true, services: true, constitutionMembers: true, portalMemberships: true } },
    },
  });
  return (
    <>
      <PageHeader icon={<BadgeCheck />}
        title="Client approval queue"
        back={{ href: "/app/clients", label: "Clients" }}
        description="Registrations waiting for an administrator. Open a registration to review all details and documents, then approve or reject it with a reason."
      />
      {pending.length === 0 ? <EmptyState kind="done" title="No registrations waiting">New quick and full registrations will appear here.</EmptyState> : (
        <ul className="space-y-3">
          {pending.map((c) => {
            const missing = [
              !c.legalName && "legal name",
              !c.address && "address",
              !c.pan && "PAN",
              !c.constitutionId && "constitution",
              c._count.services === 0 && "services",
            ].filter(Boolean) as string[];
            const contact = c.contacts[0];
            return (
              <li key={c.id} className="rounded-lg border border-line bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{c.tradeName}</p>
                    <p className="text-xs text-muted">{CHANNEL[c.registrationChannel]} · submitted {formatDateTime(c.submittedAt)}</p>
                    {/* Portal access while pending (grace period) matters only once the client has a portal login. */}
                    {c._count.portalMemberships > 0 && <div className="mt-1"><GraceBadge info={clientAccess(c, approvalGraceDays)} /></div>}
                    {contact && <p className="mt-1 text-sm">{contact.name}<span className="text-muted"> · {[contact.mobile, contact.email].filter(Boolean).join(" · ")}</span></p>}
                    <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
                      <Badge>{c._count.gstRegistrations} GSTIN</Badge>
                      <Badge>{c._count.documents} documents</Badge>
                      <Badge>{c._count.constitutionMembers} representatives</Badge>
                      <Badge>{c._count.services} services</Badge>
                      {missing.length > 0 ? <Badge tone="warn">Missing: {missing.join(", ")}</Badge> : <Badge tone="ok">Key details complete</Badge>}
                    </p>
                  </div>
                  <LinkButton href={`/app/clients/${c.id}`} size="sm">Review</LinkButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-6 text-sm text-muted"><Link href="/app/clients?status=REJECTED" className="text-brand-700 hover:underline">View rejected registrations</Link></p>
    </>
  );
}
