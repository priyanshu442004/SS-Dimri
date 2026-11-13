import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sweepAllFirms } from "@/lib/services/attendance-reminders";

// Scheduled call (server crontab, every 15 minutes) that sends mark-out reminders and
// missed time-out notices for every firm, even when nobody has the app open.
// Requires CRON_SECRET (24+ characters) as a bearer token; without it the route does not exist.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return new NextResponse("Not found", { status: 404 });
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return new NextResponse("Not found", { status: 404 });
  const result = await sweepAllFirms();
  return NextResponse.json({ ok: true, ...result });
}
