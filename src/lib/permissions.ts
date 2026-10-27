// Role → capability matrix. Enforced on the server in every action and page
// (see docs/role-permission-matrix.md). Job designation never grants capabilities;
// only organization_memberships.role does.

export type Role = "OWNER" | "ADMIN" | "MANAGER" | "SENIOR" | "STAFF" | "CLIENT";

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Administrator",
  MANAGER: "Manager",
  SENIOR: "Senior",
  STAFF: "Team member",
  CLIENT: "Client",
};

const ADMINS: Role[] = ["OWNER", "ADMIN"];
const LEADS: Role[] = ["OWNER", "ADMIN", "MANAGER", "SENIOR"];
const MANAGERS: Role[] = ["OWNER", "ADMIN", "MANAGER"];
/** All internal staff roles. Clients are never included in internal capabilities. */
const EVERYONE: Role[] = ["OWNER", "ADMIN", "MANAGER", "SENIOR", "STAFF"];
const CLIENTS: Role[] = ["CLIENT"];

export const CAPABILITIES = {
  /** Any approved member: dashboards and modules whose data is scoped per user. */
  "app.use": EVERYONE,
  "org.manage": ADMINS,
  "audit.view": ADMINS,
  "employees.manage": ADMINS,
  "employees.view": LEADS,
  "clients.view_all": LEADS,
  "clients.register": MANAGERS,
  "clients.edit": MANAGERS,
  "clients.approve": ADMINS,
  "services.manage": ADMINS,
  "allocations.view_all": LEADS,
  "allocations.manage": MANAGERS,
  "tasks.view_all": LEADS,
  "tasks.create": LEADS,
  "tasks.review": LEADS,
  "tasks.cancel": MANAGERS,
  "tasks.update_assigned": EVERYONE,
  "attendance.mark_own": EVERYONE,
  "attendance.view_all": LEADS,
  "attendance.correct": ADMINS,
  "leave.request": EVERYONE,
  "leave.decide": LEADS,
  "timesheet.fill_own": EVERYONE,
  "timesheet.view_all": LEADS,
  "timesheet.review": LEADS,
  "dayreport.submit": EVERYONE,
  "dayreport.view_all": ADMINS,
  "pending.manage_own": EVERYONE,
  "pending.view_all": LEADS,
  "reports.client": MANAGERS,
  "dues.manage": MANAGERS,
  /** Log and resolve client observations for any client; others act only on observations assigned to them. */
  "observations.manage": LEADS,
  /** Client portal: own business profile, requests, permitted work updates, dues. */
  "portal.use": CLIENTS,
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

export function can(role: Role, capability: Capability): boolean {
  return (CAPABILITIES[capability] as readonly Role[]).includes(role);
}

/** Where each role lands after sign-in (DFD: automatic redirection by identity). */
export function landingPath(role: Role): string {
  switch (role) {
    case "OWNER":
    case "ADMIN":
      return "/app/admin";
    case "MANAGER":
      return "/app/manager";
    case "SENIOR":
      return "/app/senior";
    case "CLIENT":
      return "/client";
    default:
      return "/app/workspace";
  }
}
