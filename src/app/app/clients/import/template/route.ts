import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { xlsxResponse } from "@/lib/xlsx";

/** Template in the shape of the firm's "12. Client Details" sheet, with the allowed values alongside. */
export async function GET() {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "clients.import")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const [constitutions, natures, places, billing, services] = await Promise.all([
    prisma.constitution.findMany({ orderBy: { sortOrder: "asc" }, select: { name: true } }),
    prisma.businessNature.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { label: true } }),
    prisma.classificationOption.findMany({ where: { basis: "PLACE_OF_WORK", isActive: true }, orderBy: { sortOrder: "asc" }, select: { label: true } }),
    prisma.classificationOption.findMany({ where: { basis: "BILLING_BASIS", isActive: true }, orderBy: { sortOrder: "asc" }, select: { label: true } }),
    prisma.service.findMany({ where: { organizationId: ctx.organization.id, isActive: true }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  const head = ["Client Code", "Client Name", "Legal Name", "Constitution", "Nature of Business", "GSTIN", "PAN", "TAN", "Contact Person", "Mobile", "Email", "Address", "Services Taken", "Place of Work", "Billing Basis", "Fee", "Status"];
  const sample = ["", "Sample Traders", "Sample Traders Private Limited", "Private Limited Company", natures[0]?.label ?? "", "07AAAAA0000A1Z5", "AAAAA0000A", "", "Ravi Kumar", "9876543210", "ravi@example.com", "Naraina, New Delhi", services.slice(0, 2).map((s) => s.name).join(", "), places[0]?.label ?? "", billing[0]?.label ?? "", 5000, "Active"];
  const lists: [string, string[]][] = [
    ["Constitution", constitutions.map((c) => c.name)],
    ["Nature of Business", natures.map((n) => n.label)],
    ["Services Taken (separate with commas)", services.map((s) => s.name)],
    ["Place of Work", places.map((p) => p.label)],
    ["Billing Basis", billing.map((b) => b.label)],
    ["Status", ["Active", "On Hold", "Discontinued"]],
  ];
  const longest = Math.max(...lists.map(([, v]) => v.length));
  const listRows = [lists.map(([h]) => h), ...Array.from({ length: longest }, (_, i) => lists.map(([, v]) => v[i] ?? ""))];
  return xlsxResponse("client-import-template.xlsx", [
    { name: "Clients", rows: [head, sample] },
    { name: "Allowed values", rows: listRows },
  ]);
}
