import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { xlsxResponse } from "@/lib/xlsx";
import { clientListOrder, clientListWhere, parseClientFilters } from "@/lib/services/client-list";

const STATUS: Record<string, string> = { ACTIVE: "Active", ON_HOLD: "On Hold", INACTIVE: "Discontinued", PENDING_APPROVAL: "Pending approval", REJECTED: "Rejected", DRAFT: "Draft" };

/** The filtered client list as Excel, in the Client Master's columns. Passwords are never exported. */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "clients.view_all")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const f = parseClientFilters(Object.fromEntries(new URL(request.url).searchParams));
  const clients = await prisma.client.findMany({
    where: clientListWhere(ctx, f),
    orderBy: clientListOrder(f.sort),
    take: 20_000,
    select: {
      clientCode: true, tradeName: true, legalName: true, address: true, pan: true, tan: true, state: true, dateOfBirth: true, itFileNo: true,
      departments: true, masterRemark: true, status: true, gstUserId: true, incomeTaxUserId: true, tracesUserId: true, extraFields: true, createdAt: true,
      constitution: { select: { name: true } },
      gstRegistrations: { select: { gstin: true } },
      contacts: { where: { isPrimary: true }, take: 1, select: { name: true, mobile: true, email: true } },
      services: { where: { status: "ACTIVE" }, select: { service: { select: { name: true } } } },
      teamAllocations: { where: { status: { in: ["ACTIVE", "PLANNED"] } }, select: { employee: { select: { firstName: true, lastName: true } } } },
    },
  });
  const extraKeys = [...new Set(clients.flatMap((c) => (c.extraFields && typeof c.extraFields === "object" && !Array.isArray(c.extraFields) ? Object.keys(c.extraFields) : [])))];
  const head = ["Client Code", "Name", "Legal Name (as per PAN)", "Address", "GSTIN", "PAN", "Constitution of Business", "GST User ID", "Income Tax User ID", "TRACES User ID",
    "State", "TAN", "Contact Person", "Mobile", "Email", "DOB", "IT File No.", "Applicable Department", "Remark", "Services", "Team", "Status", "Registered on", ...extraKeys];
  const rows = clients.map((c) => {
    const extra = (c.extraFields ?? {}) as Record<string, string>;
    const contact = c.contacts[0];
    return [
      c.clientCode, c.tradeName, c.legalName, c.address, c.gstRegistrations.map((g) => g.gstin).join(", "), c.pan, c.constitution?.name, c.gstUserId, c.incomeTaxUserId, c.tracesUserId,
      c.state, c.tan, contact?.name, contact?.mobile, contact?.email, c.dateOfBirth, c.itFileNo, c.departments.join(", "), c.masterRemark,
      c.services.map((s) => s.service.name).join(", "), c.teamAllocations.map((a) => `${a.employee.firstName} ${a.employee.lastName ?? ""}`.trim()).join(", "),
      STATUS[c.status] ?? c.status, c.createdAt, ...extraKeys.map((k) => extra[k] ?? ""),
    ];
  });
  return xlsxResponse("clients.xlsx", [{ name: "Client Master", title: `${ctx.organization.tradeName} – Clients`, rows: [head, ...rows] }]);
}
