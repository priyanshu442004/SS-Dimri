import { NextResponse } from "next/server";
import { getContext, getSession } from "@/lib/session";

// Current access state of the caller, for the in-page AccessWatcher. Reveals
// nothing beyond the caller's own state and the end of their grace period.
export async function GET() {
  const ctx = await getContext();
  let state: "signed_out" | "inactive" | "full" | "grace" | "locked";
  if (ctx) state = ctx.access.state;
  else state = (await getSession()) ? "inactive" : "signed_out";
  return NextResponse.json(
    {
      state,
      graceEndsAt: ctx?.access.graceEndsAt?.toISOString() ?? null,
      // Changes when an approval decision is made (approve / hold / reject), so open pages refresh.
      marker: ctx ? `${ctx.employee?.approvalStatus ?? ctx.client?.status ?? ""}:${ctx.mustChangePassword ? 1 : 0}` : "",
      serverNow: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
