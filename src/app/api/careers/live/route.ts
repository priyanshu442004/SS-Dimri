import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { getContext } from "@/lib/session";
import { careersVersion, repliesSince } from "@/lib/services/careers";
import { mailboxStatus, syncCareersMailbox } from "@/lib/careers/mailbox";

// The open Careers page asks here every few seconds (and the moment the tab is shown again). The
// mailbox is read if it was not read in the last 20 seconds (by anyone), then the page gets a short
// fingerprint of its data: when it changes, the page reloads its data by itself — no Refresh needed.
export async function GET(request: Request) {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "careers.use")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const sinceRaw = Number(new URL(request.url).searchParams.get("since"));
  const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? new Date(sinceRaw) : new Date();
  // Wait for the check, but never hold the page's request longer than ~12 s (it runs on in the background).
  await Promise.race([syncCareersMailbox({ minIntervalSeconds: 20 }).catch(() => undefined), new Promise((r) => setTimeout(r, 12_000))]);
  const admin = can(ctx, "careers.manage");
  const [version, replies, box] = await Promise.all([careersVersion(ctx), repliesSince(ctx, since), admin ? mailboxStatus() : null]);
  return NextResponse.json(
    { version, replies, now: Date.now(), mailbox: box && { configured: box.configured, lastOkAt: box.lastOkAt?.getTime() ?? null, lastError: box.lastError } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
