import "server-only";
import { cookies } from "next/headers";

/**
 * Leaves a one-time message for the next page, for server actions that redirect
 * after succeeding (the <Toaster> shows it and clears the cookie). Call before redirect().
 */
export async function setFlash(message: string, tone: "success" | "error" | "info" | "warning" = "success") {
  // The cookie serializer URL-encodes the value; the toaster decodes it.
  (await cookies()).set("ssda-flash", JSON.stringify({ message, tone }), {
    path: "/",
    maxAge: 60,
    sameSite: "lax",
    httpOnly: false, // read by the client-side toaster
  });
}
