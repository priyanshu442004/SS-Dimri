import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { safeAppPath } from "@/lib/safe-path";

/**
 * Redirect with a relative Location, so the browser stays on the origin it is using.
 * (Behind a hosting proxy `req.url` can be the internal http://localhost:3000.)
 */
const redirectTo = (path: string) => new NextResponse(null, { status: 303, headers: { Location: path } });

// Opens a notification: marks it read for its owner only, then redirects to
// its in-app link. Unknown or foreign ids get the same 404 (no existence leak).
export async function GET(_req: Request, { params }: RouteContext<"/api/notifications/[id]">) {
  const ctx = await getContext();
  if (!ctx) return redirectTo("/login");
  const { id } = await params;
  const home = ctx.role === "CLIENT" ? "/client/notifications" : "/app/notifications";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const n = await prisma.notification.findFirst({ where: { id, userId: ctx.user.id, organizationId: ctx.organization.id }, select: { id: true, link: true, readAt: true } });
  if (!n) return new NextResponse("Not found", { status: 404 });
  if (!n.readAt) await prisma.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
  const target = safeAppPath(n.link, ctx.role === "CLIENT" ? "client" : "app") ?? home;
  return redirectTo(target);
}
