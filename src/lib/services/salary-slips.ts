import "server-only";
import { zipSync } from "fflate";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { htmlToPdfs } from "@/lib/pdf";
import { salarySlipHtml, slipFileName, websiteFromEmail, type SlipInput } from "@/lib/domain/salary-slip";
import { payrollForMonth } from "./payroll";

// Salary slips in the firm's format (25 Nov 2026), as PDF: one person's slip (their own, or anyone's
// for an administrator), or every slip of a month in one ZIP.

async function firmOf(organizationId: string) {
  const o = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { tradeName: true, legalName: true, contactEmail: true, address: true } });
  return { name: o.tradeName, website: websiteFromEmail(o.contactEmail), address: o.address?.split(/\n/)[0]?.slice(0, 120) ?? null };
}

/** Slip documents for the month: one person, or (administrators) everyone on the payroll. */
export async function slipInputs(ctx: AppContext, month: string, employeeId?: string): Promise<SlipInput[]> {
  if (employeeId && employeeId !== ctx.employee?.id && !can(ctx, "payroll.manage")) return [];
  if (!employeeId && !can(ctx, "payroll.manage")) return [];
  const [p, firm] = await Promise.all([payrollForMonth(ctx, month, employeeId), firmOf(ctx.organization.id)]);
  if (p.isOwner) return [];
  return p.rows.map((row) => ({ firm, month, daysInMonth: p.daysInMonth, complete: p.complete, payDay: p.policy.row.salaryPayDay, row }));
}

export async function slipPdf(ctx: AppContext, month: string, employeeId: string) {
  const [input] = await slipInputs(ctx, month, employeeId);
  if (!input) return null;
  const [pdf] = await htmlToPdfs([salarySlipHtml(input)], { margin: "14mm" });
  return { pdf, fileName: slipFileName(input.row, month) };
}

export async function slipsZip(ctx: AppContext, month: string) {
  const inputs = await slipInputs(ctx, month);
  if (!inputs.length) return null;
  const pdfs = await htmlToPdfs(inputs.map(salarySlipHtml), { margin: "14mm" });
  const files: Record<string, Uint8Array> = {};
  inputs.forEach((i, n) => { files[slipFileName(i.row, month)] = new Uint8Array(pdfs[n]); });
  return { zip: zipSync(files, { level: 6 }), count: inputs.length };
}
