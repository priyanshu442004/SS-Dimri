import { NextResponse } from "next/server";
import { isoDateInTz } from "@/lib/dates";
import { getContext } from "@/lib/session";
import { can } from "@/lib/permissions";
import { validMonth } from "@/lib/services/payroll";
import { slipsZip } from "@/lib/services/salary-slips";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Every salary slip of a month in one ZIP, for the administrators (`?month=YYYY-MM`). */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "payroll.manage")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const month = validMonth(new URL(request.url).searchParams.get("month"), isoDateInTz(new Date(), ctx.organization.timezone));
  try {
    const r = await slipsZip(ctx, month);
    if (!r) return new NextResponse("Nobody on the payroll for this month.", { status: 404 });
    return new NextResponse(new Uint8Array(r.zip), {
      headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="Salary_Slips_${month}.zip"`, "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    console.error("Salary slips ZIP failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The salary slips could not be made. Please try again." }, { status: 500 });
  }
}
