// Access while an account waits for approval (owner's rule, 26 Oct 2026):
// a new staff member awaiting onboarding approval, or a business awaiting
// registration approval, may use the account for a grace period (default
// 7 days) counted from account creation. When it ends, access stops at once —
// open pages are signed out — until an administrator approves the account.
// Rejected (or discontinued) accounts have no grace period.

export type AccessState = "full" | "grace" | "locked";
export type AccessInfo = { state: AccessState; graceEndsAt: Date | null };

const DAY_MS = 86_400_000;

/** Exactly `graceDays` × 24 h after the start; 0 disables the grace period. */
export function graceEndsAt(startedAt: Date, graceDays: number): Date {
  return new Date(startedAt.getTime() + Math.max(0, graceDays) * DAY_MS);
}

function pending(startedAt: Date, graceDays: number, now: Date): AccessInfo {
  const endsAt = graceEndsAt(startedAt, graceDays);
  return now < endsAt ? { state: "grace", graceEndsAt: endsAt } : { state: "locked", graceEndsAt: endsAt };
}

/**
 * Staff (owner decision, 27 Oct 2026): no grace period. Until an administrator
 * approves their details, staff can only set their password and complete or
 * see the status of their onboarding. Owners and administrators are never locked.
 */
export function staffAccess(e: { approvalStatus: string }, role: string): AccessInfo {
  if (role === "OWNER" || role === "ADMIN" || e.approvalStatus === "APPROVED") return { state: "full", graceEndsAt: null };
  return { state: "locked", graceEndsAt: null };
}

/**
 * Client login: active / on hold → full; awaiting approval → grace / locked by
 * time from the registration's creation (a resubmission does not restart it);
 * otherwise locked.
 */
export function clientAccess(
  c: { status: string; createdAt: Date },
  graceDays: number,
  now = new Date(),
): AccessInfo {
  if (c.status === "ACTIVE" || c.status === "ON_HOLD") return { state: "full", graceEndsAt: null };
  if (c.status === "PENDING_APPROVAL" || c.status === "DRAFT") return pending(c.createdAt, graceDays, now);
  return { state: "locked", graceEndsAt: null };
}
