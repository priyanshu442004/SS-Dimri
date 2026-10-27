import "server-only";
import { headers } from "next/headers";

// Small in-memory fixed-window limiter for public form actions (registration,
// password-reset requests). Per server instance; Better Auth separately
// rate-limits its own sign-in endpoints.
const buckets = new Map<string, { count: number; resetAt: number }>();

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Returns true when the action may proceed. */
export async function checkRateLimit(name: string, max: number, windowSeconds: number) {
  const key = `${name}:${await clientIp()}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  b.count++;
  return b.count <= max;
}
