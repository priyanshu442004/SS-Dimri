import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic gate only: redirects visitors without a session cookie away from
// the app. Real authorization happens on the server in every page and action.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    // Relative Location: behind a hosting proxy request.url may be an internal address.
    const query = new URLSearchParams({ next: request.nextUrl.pathname });
    return new NextResponse(null, { status: 307, headers: { Location: `/login?${query}` } });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/client/:path*"] };
