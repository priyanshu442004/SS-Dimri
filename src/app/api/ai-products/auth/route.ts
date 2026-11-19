import { getContext, isAwaitingApproval } from "@/lib/session";
import { can } from "@/lib/permissions";

// nginx auth_request for everything under /ai-products/ (see ai-products/deploy/nginx-ai-products.conf):
// 204 = this session may use the AI products (the demo login), 401 = not signed in, 403 = anyone else.
// nginx never forwards the request body here, only the cookies.
export async function GET() {
  const ctx = await getContext().catch(() => null);
  const headers = { "Cache-Control": "private, no-store" };
  if (!ctx) return new Response(null, { status: 401, headers });
  const allowed = !ctx.mustChangePassword && !isAwaitingApproval(ctx) && can(ctx, "ai_products.use");
  return new Response(null, { status: allowed ? 204 : 403, headers });
}
