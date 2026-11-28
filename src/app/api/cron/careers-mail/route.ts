import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncCareersMailbox } from "@/lib/careers/mailbox";

// Reads candidates' replies from the careers mailbox even when nobody has the app open. Called every
// two minutes by the server itself (src/instrumentation.ts) and can be added to the crontab as well.
// Requires CRON_SECRET (24+ characters) as a bearer token; without it the route does not exist.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) return new NextResponse("Not found", { status: 404 });
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const want = Buffer.from(secret);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return new NextResponse("Not found", { status: 404 });
  const r = await syncCareersMailbox({ minIntervalSeconds: 60 });
  return NextResponse.json({ ok: !r.error, ...r });
}
