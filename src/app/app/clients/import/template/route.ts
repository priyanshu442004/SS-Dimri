import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { xlsxResponse } from "@/lib/xlsx";
import { complianceChoices } from "@/lib/services/client-compliances";

/** Template in the shape of the firm's SSDA_Client_Master sheet, with the allowed values alongside. */
export async function GET() {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "clients.import")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const departments = (await complianceChoices()).departments;
  const [constitutions, natures, places, billing, services] = await Promise.all([
    prisma.constitution.findMany({ orderBy: { sortOrder: "asc" }, select: { name: true } }),
    prisma.businessNature.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { label: true } }),
    prisma.classificationOption.findMany({ where: { basis: "PLACE_OF_WORK", isActive: true }, orderBy: { sortOrder: "asc" }, select: { label: true } }),
    prisma.classificationOption.findMany({ where: { basis: "BILLING_BASIS", isActive: true }, orderBy: { sortOrder: "asc" }, select: { label: true } }),
    prisma.service.findMany({ where: { organizationId: ctx.organization.id, isActive: true }, orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  // The firm's SSDA_Client_Master columns first (one row per GSTIN; same PAN = same client), then the optional extras.
  const head = [
    "S.No.", "Name", "Legal Name (as per PAN)", "Address", "GSTIN", "PAN", "Constitution of Business", "GST User ID", "GST Password", "Income Tax User ID",
    "Income Tax Password", "TRACES User ID", "TRACES Password", "State", "TAN", "Mobile", "Email", "DOB", "IT File No.", "Applicable Department", "Remark",
    "Client Code", "Nature of Business", "Contact Person", "Services Taken", "Place of Work", "Billing Basis", "Fee", "Status",
  ];
  const sample = [
    1, "Sample Traders", "SAMPLE TRADERS PRIVATE LIMITED", "Naraina, New Delhi", "07AAAAA0000A1Z5", "AAAAA0000A", "Private Limited Company", "", "", "AAAAA0000A",
    "", "", "", "Delhi", "", "9876543210", "ravi@example.com", "01/04/2015", "SSDA-001", "GST, Income Tax", "",
    "", natures[0]?.label ?? "", "Ravi Kumar", services.slice(0, 2).map((s) => s.name).join(", "), places[0]?.label ?? "", billing[0]?.label ?? "", 5000, "Active",
  ];
  const lists: [string, string[]][] = [
    ["Constitution of Business", constitutions.map((c) => c.name)],
    ["Applicable Department (separate with commas)", departments],
    ["Nature of Business", natures.map((n) => n.label)],
    ["Services Taken (separate with commas)", services.map((s) => s.name)],
    ["Place of Work", places.map((p) => p.label)],
    ["Billing Basis", billing.map((b) => b.label)],
    ["Status", ["Active", "On Hold", "Discontinued"]],
  ];
  const longest = Math.max(...lists.map(([, v]) => v.length));
  const listRows = [lists.map(([h]) => h), ...Array.from({ length: longest }, (_, i) => lists.map(([, v]) => v[i] ?? ""))];
  return xlsxResponse("client-import-template.xlsx", [
    { name: "Client Master", title: `${ctx.organization.tradeName} – Client Master`, rows: [head, sample] },
    { name: "Allowed values", rows: listRows },
  ]);
}
