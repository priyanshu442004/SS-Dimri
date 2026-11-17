import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runEveningReports } from "@/lib/services/ai-report";

// Scheduled call (server crontab, 18:00 IST daily): makes the Daily AI Summary Report for each firm with
// AI Reporting and mails it as a PDF. Answers at once and works in the background (it takes a minute).
// Requires CRON_SECRET as a bearer token; without it the route does not exist.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return new NextResponse("Not found", { status: 404 });
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return new NextResponse("Not found", { status: 404 });
  void runEveningReports().then(
    (r) => console.log("Evening AI report", JSON.stringify(r)),
    (e) => console.error("Evening AI report failed", e instanceof Error ? e.message : e),
  );
  return NextResponse.json({ ok: true, started: true });
}
