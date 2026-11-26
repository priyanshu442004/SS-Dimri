import { NextResponse } from "next/server";
import { isoDateInTz } from "@/lib/dates";
import { getContext } from "@/lib/session";
import { can } from "@/lib/permissions";
import { validMonth } from "@/lib/services/payroll";
import { slipInputs, slipPdf } from "@/lib/services/salary-slips";
import { salarySlipHtml } from "@/lib/domain/salary-slip";

export const runtime = "nodejs";

/**
 * One salary slip in the firm's format (25 Nov 2026): `?month=YYYY-MM&person=<employee id>`, own slip when
 * `person` is left out. PDF download by default; `&view=1` shows the same slip in the browser.
 */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "payroll.view_own")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const sp = new URL(request.url).searchParams;
  const month = validMonth(sp.get("month"), isoDateInTz(new Date(), ctx.organization.timezone));
  const person = sp.get("person") || ctx.employee?.id;
  if (!person || !/^[0-9a-f-]{36}$/i.test(person)) return new NextResponse("Not found", { status: 404 });
  if (sp.get("view")) {
    const [input] = await slipInputs(ctx, month, person);
    if (!input) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(salarySlipHtml(input), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
  }
  try {
    const slip = await slipPdf(ctx, month, person);
    if (!slip) return new NextResponse("Not found", { status: 404 });
    return new NextResponse(new Uint8Array(slip.pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${slip.fileName}"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("Salary slip PDF failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The salary slip could not be made. Please try again." }, { status: 500 });
  }
}
