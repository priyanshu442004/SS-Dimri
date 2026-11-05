import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { todayDateOnly } from "@/lib/dates";
import { COMPLIANCE_STATUS_LABELS, complianceStatus, daysRemaining, isEscalated } from "@/lib/domain/compliance";
import { can } from "@/lib/permissions";
import { complianceScope } from "@/lib/services/compliance";
import { getContext } from "@/lib/session";
import { xlsxResponse } from "@/lib/xlsx";

/** The compliance tracker as an Excel file, in the columns of the firm's own workbook. */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "compliance.use")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const sp = new URL(request.url).searchParams;
  const dept = sp.get("dept") ?? "";
  const itemId = sp.get("item");
  const today = todayDateOnly(ctx.organization.timezone);
  const [entries, columns] = await Promise.all([
    prisma.complianceEntry.findMany({
      where: { AND: [complianceScope(ctx), dept ? { department: dept } : {}, itemId && /^[0-9a-f-]{36}$/i.test(itemId) ? { complianceItemId: itemId } : {}] },
      orderBy: [{ actionTaken: "asc" }, { dueDate: "asc" }],
      include: { client: { select: { tradeName: true } }, responsible: { select: { firstName: true, lastName: true } } },
    }),
    prisma.complianceColumn.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { sortOrder: "asc" } }),
  ]);
  const extended = new Map((await prisma.organizationComplianceSetting.findMany({ where: { organizationId: ctx.organization.id, extendedDateRemark: { not: null } }, select: { complianceItemId: true, extendedDateRemark: true } })).map((x) => [x.complianceItemId, x.extendedDateRemark!]));
  const header = ["S.No", "Client Name", "Module", "Compliance / License Type", "Issuing Authority", "License / Reg. No.", "Due Date", "Remark (If Date Extend)", "Renewal Frequency", "Responsible Person", "Reminder Lead Days", "Days Remaining", "Status", "Action Taken (Y/N)", "Action Taken Date", "Escalated", ...columns.map((c) => c.label), "Remarks"];
  const rows = entries.map((e, i) => {
    const custom = (e.customValues ?? {}) as Record<string, string>;
    return [
      i + 1,
      e.client?.tradeName ?? ctx.organization.tradeName,
      e.department,
      e.complianceType,
      e.issuingAuthority ?? "",
      e.registrationNumber ?? "",
      e.dueDate,
      (e.complianceItemId && extended.get(e.complianceItemId)) || "",
      e.frequency ?? "",
      e.responsible ? `${e.responsible.firstName} ${e.responsible.lastName ?? ""}`.trim() : "",
      e.reminderLeadDays,
      e.actionTaken ? null : daysRemaining(e.dueDate, today),
      COMPLIANCE_STATUS_LABELS[complianceStatus(e, today)],
      e.actionTaken ? "Y" : "N",
      e.actionTakenOn,
      isEscalated(e, today) ? "Escalated" : "",
      ...columns.map((c) => custom[c.id] ?? ""),
      e.remarks ?? "",
    ];
  });
  return xlsxResponse(`compliance-tracker${dept ? `-${dept.toLowerCase().replace(/\s+/g, "-")}` : ""}.xlsx`, [
    { name: "Compliance Tracker", title: `${ctx.organization.tradeName} · License & Compliance Tracker`, rows: [header, ...rows] },
  ]);
}
