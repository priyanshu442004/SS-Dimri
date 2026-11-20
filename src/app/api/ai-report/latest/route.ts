import { NextResponse } from "next/server";
import { actionContext } from "@/lib/session";
import { isReportKind, latestReportStamp } from "@/lib/services/ai-report";

// Reporting page: the newest finished report of a kind, so an open page shows a new report by itself.
export async function GET(request: Request) {
  let ctx;
  try {
    ctx = await actionContext("assistant.use");
  } catch {
    return NextResponse.json({ error: "Not allowed." }, { status: 403 });
  }
  const kind = new URL(request.url).searchParams.get("kind") ?? "DAILY";
  if (!isReportKind(kind)) return NextResponse.json({ error: "Unknown report." }, { status: 400 });
  const r = await latestReportStamp(ctx.organization.id, kind);
  return NextResponse.json({ id: r?.id ?? null, completedAt: r?.completedAt?.toISOString() ?? null }, { headers: { "Cache-Control": "private, no-store" } });
}
