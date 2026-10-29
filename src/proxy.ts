import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic gate only: redirects visitors without a session cookie away from
// the app. Real authorization happens on the server in every page and action.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    // Proxy redirects must be absolute. Use the public origin (BETTER_AUTH_URL):
    // behind the hosting proxy request.url can be the internal http://localhost:3000.
    const url = new URL("/login", process.env.BETTER_AUTH_URL ?? request.url);
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/client/:path*"] };
