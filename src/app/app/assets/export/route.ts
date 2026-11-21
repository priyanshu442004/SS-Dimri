import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getContext } from "@/lib/session";
import { isoDateInTz } from "@/lib/dates";
import { xlsxResponse } from "@/lib/xlsx";
import { ASSET_CONDITIONS, ASSET_STATUSES, assetRegister, parseAssetFilters } from "@/lib/services/assets";

/** The Fixed Assets Register with the current holder, and every issue / return, as Excel. */
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "assets.manage")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const rows = await assetRegister(ctx.organization.id, parseAssetFilters(Object.fromEntries(new URL(request.url).searchParams)));
  const today = isoDateInTz(new Date(), ctx.organization.timezone);
  const name = (e: { firstName: string; lastName: string | null }) => `${e.firstName} ${e.lastName ?? ""}`.trim();
  const cond = (c: string | null) => (c ? ASSET_CONDITIONS[c as keyof typeof ASSET_CONDITIONS] ?? c : "");
  const register = rows.map((a) => {
    const h = a.issues.find((i) => !i.returnedOn);
    return [a.code, a.description, a.category ?? "", a.serialNo ?? "", a.purchaseDate, a.vendor ?? "", a.cost === null ? null : Number(a.cost), a.location ?? "", cond(a.condition), ASSET_STATUSES[a.status as keyof typeof ASSET_STATUSES] ?? a.status, h ? name(h.employee) : "", h?.issuedOn ?? null, a.notes ?? ""];
  });
  const history = rows.flatMap((a) => a.issues.map((i) => [a.code, a.description, name(i.employee), i.issuedOn, cond(i.issueCondition), i.returnedOn, cond(i.returnCondition), i.notes ?? ""]));
  return xlsxResponse(`fixed-assets-${today}.xlsx`, [
    { name: "Register", title: `${ctx.organization.tradeName} – Fixed Assets Register · ${today}`, rows: [["Asset code", "Description", "Category", "Serial no.", "Purchase date", "Vendor", "Cost", "Location", "Condition", "Status", "Issued to", "Issued on", "Notes"], ...register] },
    { name: "Issue history", title: `${ctx.organization.tradeName} – Asset issue / return history`, rows: [["Asset code", "Description", "Employee", "Issued (out)", "Condition at issue", "Returned (in)", "Condition at return", "Notes"], ...history] },
  ]);
}
