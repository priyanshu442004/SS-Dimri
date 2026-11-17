import { NextResponse } from "next/server";
import { actionContext } from "@/lib/session";
import { isPeriod, opsSummary } from "@/lib/services/ops-summary";

// Data for the operations dashboard's period filter (Today, Yesterday, Last 7 days, …).
export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await actionContext("org.manage");
  } catch {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const period = new URL(request.url).searchParams.get("period");
  if (!isPeriod(period)) return NextResponse.json({ error: "Unknown period." }, { status: 400 });
  try {
    return NextResponse.json(await opsSummary(ctx, period), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    console.error("dashboard summary failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "The figures could not be loaded. Please try again." }, { status: 500 });
  }
}
