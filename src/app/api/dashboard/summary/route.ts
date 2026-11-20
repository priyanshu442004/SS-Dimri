import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { actionContext } from "@/lib/session";
import { dashboardBundle, parseBizFilters } from "@/lib/services/business360";

// Data for the Business 360° dashboard's filters (period, client, staff, activity, service).
export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await actionContext("org.manage");
  } catch {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  // The Business 360° dashboard is the AI Reporting login's dashboard (others keep the firm dashboard).
  if (!can(ctx, "assistant.use")) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  const f = parseBizFilters(Object.fromEntries(new URL(request.url).searchParams));
  try {
    return NextResponse.json(await dashboardBundle(ctx, f), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("dashboard summary failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The figures could not be loaded. Please try again." }, { status: 500 });
  }
}
