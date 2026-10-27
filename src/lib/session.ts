import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, type Capability, type Role } from "@/lib/permissions";
import { clientAccess, staffAccess, type AccessInfo } from "@/lib/domain/approval-access";

export type AppContext = {
  user: { id: string; name: string; email: string; username: string | null };
  role: Role;
  membershipId: string;
  mustChangePassword: boolean;
  tempPasswordExpiresAt: Date | null;
  organization: { id: string; tradeName: string; timezone: string; pendingDaysBasis: "CALENDAR" | "BUSINESS" };
  employee: {
    id: string;
    firstName: string;
    lastName: string | null;
    approvalStatus: string;
    onboardingSubmittedAt: Date | null;
  } | null;
  /** For CLIENT logins: the client record and its registration status. */
  client: { id: string; tradeName: string; status: string } | null;
  /**
   * Computed on every request: "full" (approved), "grace" (awaiting approval,
   * inside the grace period) or "locked" (grace over, or rejected/inactive).
   */
  access: AccessInfo;
};

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

/** Resolves the signed-in user's active organization membership. Never trusts client input. */
export const getContext = cache(async (): Promise<AppContext | null> => {
  const session = await getSession();
  if (!session) return null;
  const membership = await prisma.organizationMembership.findFirst({
    where: { userId: session.user.id, status: "ACTIVE", organization: { status: "ACTIVE" } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      mustChangePassword: true,
      tempPasswordExpiresAt: true,
      organization: { select: { id: true, tradeName: true, timezone: true, pendingDaysBasis: true, approvalGraceDays: true } },
      employee: {
        select: { id: true, firstName: true, lastName: true, approvalStatus: true, onboardingSubmittedAt: true, createdAt: true },
      },
      client: { select: { id: true, tradeName: true, status: true, createdAt: true } },
    },
  });
  if (!membership) return null;
  if (membership.role === "CLIENT" && !membership.client) return null; // misconfigured client login: no access
  const u = session.user as typeof session.user & { username?: string | null };
  const { approvalGraceDays, ...organization } = membership.organization;
  const e = membership.employee;
  const access: AccessInfo =
    membership.role === "CLIENT"
      ? clientAccess(membership.client!, approvalGraceDays)
      : e
        ? staffAccess(e, membership.role)
        : { state: "full", graceEndsAt: null }; // owner/admin logins without an employee record
  return {
    user: { id: u.id, name: u.name, email: u.email, username: u.username ?? null },
    role: membership.role as Role,
    membershipId: membership.id,
    mustChangePassword: membership.mustChangePassword,
    tempPasswordExpiresAt: membership.tempPasswordExpiresAt,
    organization,
    employee: e ? { id: e.id, firstName: e.firstName, lastName: e.lastName, approvalStatus: e.approvalStatus, onboardingSubmittedAt: e.onboardingSubmittedAt } : null,
    client: membership.client ? { id: membership.client.id, tradeName: membership.client.tradeName, status: membership.client.status } : null,
    access,
  };
});

/** Where a signed-in user without usable access should go (server-side decision). */
async function accountStatusPath(): Promise<string> {
  const session = await getSession();
  if (!session) return "/login";
  const any = await prisma.organizationMembership.findFirst({ where: { userId: session.user.id }, select: { status: true } });
  return any ? "/account/inactive" : "/register";
}

/** For internal staff pages: signed-in staff member, otherwise the right status page. */
export async function requireContext(): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx) redirect(await accountStatusPath());
  if (ctx.role === "CLIENT") redirect("/client");
  // An emailed temporary password must be replaced before anything else.
  if (ctx.mustChangePassword) redirect("/account/set-password");
  return ctx;
}

/** For client portal pages: signed-in client login. Pending/rejected/inactive clients see their status page. */
export async function requireClientContext(opts: { allowPending?: boolean } = {}): Promise<AppContext & { client: NonNullable<AppContext["client"]> }> {
  const ctx = await getContext();
  if (!ctx) redirect(await accountStatusPath());
  if (ctx.role !== "CLIENT" || !ctx.client) redirect("/app");
  if (!opts.allowPending && ctx.access.state === "locked") redirect("/account/pending");
  return ctx as AppContext & { client: NonNullable<AppContext["client"]> };
}

/**
 * Staff locked out of everything except their onboarding page: approval is
 * pending and the grace period is over, or the onboarding was rejected
 * (DFD: "Employee will fill all the details, then after admin approve").
 * Inside the grace period a pending member has their role's full access.
 */
export function isAwaitingApproval(ctx: AppContext) {
  return ctx.role !== "CLIENT" && ctx.access.state === "locked";
}

/** For internal pages: member holding `capability`, otherwise the no-access page. */
export async function requireCapability(capability: Capability): Promise<AppContext> {
  const ctx = await requireContext();
  if (isAwaitingApproval(ctx)) redirect("/app/onboarding");
  if (!can(ctx.role, capability)) redirect("/app/no-access");
  return ctx;
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to do this.") {
    super(message);
  }
}

/** For server actions: throws instead of redirecting. */
export async function actionContext(capability?: Capability): Promise<AppContext> {
  const ctx = await getContext();
  if (!ctx) throw new AuthorizationError("Your session has expired. Please sign in again.");
  if (ctx.mustChangePassword && ctx.role !== "CLIENT") throw new AuthorizationError("Set your own password first.");
  if (capability && isAwaitingApproval(ctx)) throw new AuthorizationError("Your access period has ended. You can continue once an administrator approves your account.");
  if (capability && !can(ctx.role, capability)) throw new AuthorizationError();
  if (!capability && ctx.role === "CLIENT") throw new AuthorizationError(); // internal actions without a capability are staff-only
  return ctx;
}

/** For client-portal server actions. */
export async function clientActionContext() {
  const ctx = await getContext();
  if (!ctx) throw new AuthorizationError("Your session has expired. Please sign in again.");
  if (ctx.role !== "CLIENT" || !ctx.client) throw new AuthorizationError();
  if (ctx.access.state === "locked") throw new AuthorizationError("Your access period has ended. You can continue once our office approves your registration.");
  return ctx as AppContext & { client: NonNullable<AppContext["client"]> };
}
