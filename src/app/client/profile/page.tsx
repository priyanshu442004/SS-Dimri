import { prisma } from "@/lib/db";
import { requireClientContext } from "@/lib/session";
import { formatDate } from "@/lib/dates";
import { Card, DetailList, humanize, PageHeader } from "@/components/ui";
import { ChangePasswordForm } from "@/components/change-password-form";
import { DisplayNameForm } from "@/components/display-name-form";
import { Building2 } from "lucide-react";

export default async function ClientProfile() {
  const ctx = await requireClientContext();
  const c = await prisma.client.findUniqueOrThrow({
    where: { id: ctx.client.id },
    select: {
      clientCode: true, tradeName: true, legalName: true, address: true, pan: true, tan: true, natureOfClient: true, isMsme: true,
      msmeRegistrationNumber: true, esiNumber: true, pfNumber: true, approvedAt: true,
      constitution: { select: { name: true } },
      gstRegistrations: { select: { gstin: true } },
      contacts: { select: { id: true, name: true, designation: true, mobile: true, email: true, isPrimary: true } },
      // Representatives: names and roles only — PAN/Aadhaar are never shown back in the portal.
      constitutionMembers: { select: { id: true, fullName: true, role: true } },
    },
  });
  return (
    <>
      <PageHeader icon={<Building2 />} title="Business profile" description="The details registered with Office ERP. To change them, contact the office or reply to a request." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Business">
          <DetailList items={[
            ["Client ID", c.clientCode], ["Trade name", c.tradeName], ["Legal name", c.legalName], ["Constitution", c.constitution?.name],
            ["Address", c.address], ["PAN", c.pan], ["TAN", c.tan], ["Engagement", c.natureOfClient ? humanize(c.natureOfClient) : null],
            ["Client since", formatDate(c.approvedAt)],
          ]} />
        </Card>
        <Card title="Registrations">
          <DetailList items={[
            ["GSTIN", c.gstRegistrations.map((g) => g.gstin).join(", ")],
            ["MSME", c.isMsme === null ? null : c.isMsme ? `Yes ${c.msmeRegistrationNumber ?? ""}` : "No"],
            ["ESI number", c.esiNumber], ["PF number", c.pfNumber],
          ]} />
        </Card>
        <Card title="Contacts">
          <ul className="space-y-2 text-sm">
            {c.contacts.map((p) => <li key={p.id}><span className="font-medium">{p.name}</span>{p.isPrimary && " (primary)"}<span className="block text-xs text-muted">{[p.designation, p.mobile, p.email].filter(Boolean).join(" · ")}</span></li>)}
          </ul>
        </Card>
        <Card title="Your login">
          <p className="mb-3 text-sm text-muted">{ctx.user.email} · Client login</p>
          <DisplayNameForm name={ctx.user.name} />
          <div className="mt-6 border-t border-line pt-4"><ChangePasswordForm /></div>
        </Card>
        <Card title="Partners / directors / representatives">
          {c.constitutionMembers.length === 0 ? <p className="text-sm text-muted">None recorded.</p> : (
            <ul className="space-y-1 text-sm">{c.constitutionMembers.map((m) => <li key={m.id}>{m.fullName} <span className="text-muted">· {humanize(m.role)}</span></li>)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
