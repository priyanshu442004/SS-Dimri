// Role → capability matrix, plus per-person rights and module restrictions. Enforced on
// the server in every action and page (see docs/role-permission-matrix.md). Job
// designation never grants capabilities: only the membership's role and its explicit
// grants do. Module restrictions always win over the role (a peon or driver who may
// only use attendance and payroll stays out of everything else).

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
  /** Any approved member: pages that belong to no module (profile, notifications, search). */
  "app.use": EVERYONE,
  "dashboard.use": EVERYONE,
  "org.manage": ADMINS,
  "audit.view": ADMINS,
  /** Change another person's extra rights and module access. Never grantable. */
  "access.manage": ADMINS,
  "employees.manage": ADMINS,
  "employees.view": LEADS,
  /** Add and invite staff (and resend their invitation). */
  "employees.invite": ADMINS,
  /** Approve, hold or reject a staff member's submitted details. */
  "employees.approve": ADMINS,
  "employees.delete": ADMINS,
  "clients.use": EVERYONE,
  "clients.view_all": LEADS,
  "clients.register": MANAGERS,
  /** Quick registration (the essentials, pending approval) is open to every team member (tracker S.No. 73). */
  "clients.quick_register": EVERYONE,
  "clients.import": MANAGERS,
  "clients.edit": MANAGERS,
  "clients.approve": ADMINS,
  "clients.delete": ADMINS,
  "services.manage": ADMINS,
  "allocations.use": EVERYONE,
  "allocations.view_all": LEADS,
  "allocations.manage": MANAGERS,
  "tasks.use": EVERYONE,
  "tasks.view_all": LEADS,
  /** Every role can create tasks and depute people (client feedback, 5 Nov 2026). */
  "tasks.create": EVERYONE,
  "tasks.review": LEADS,
  "tasks.cancel": MANAGERS,
  "tasks.update_assigned": EVERYONE,
  "tasks.delete": ADMINS,
  "attendance.mark_own": EVERYONE,
  "attendance.view_all": LEADS,
  // No "correct attendance" right: attendance is system-driven and nobody marks or changes it by hand
  // (Leave, Timing and Office Decorum rules, section 1).
  /** Mark a colleague or a daily worker in / out from one's own phone, with their photo as proof. */
  "attendance.mark_others": LEADS,
  /** Check every photo attendance marked by someone else. Seniors and managers check their own reportees without it. */
  "attendance.review_photos": ADMINS,
  /** Register daily (contract) workers, set their wage and settle their pay. */
  "attendance.workers": MANAGERS,
  "leave.request": EVERYONE,
  "leave.decide": LEADS,
  "payroll.view_own": EVERYONE,
  "payroll.manage": ADMINS,
  /** Fix, increase and correct salaries: managers for the people under them, administrators for everyone. */
  "payroll.salaries": MANAGERS,
  "timesheet.fill_own": EVERYONE,
  "timesheet.view_all": LEADS,
  "timesheet.review": LEADS,
  "dayreport.submit": EVERYONE,
  "dayreport.view_all": ADMINS,
  "pending.manage_own": EVERYONE,
  "pending.view_all": LEADS,
  "reports.client": MANAGERS,
  "dues.manage": MANAGERS,
  "observations.use": EVERYONE,
  /** Log and resolve client observations for any client; others act only on observations assigned to them. */
  "observations.manage": LEADS,
  "compliance.use": EVERYONE,
  /** Track filings for clients and add columns to the compliance tracker. */
  "compliance.manage": LEADS,
  /** Delete other entries: allocations, timesheet and attendance entries, pending items, dues, observations, compliance rows. */
  "records.delete": ADMINS,
  /**
   * AI assistant: ask questions about the firm's data in plain language. What it can read is
   * still limited by the person's other rights (salaries only with payroll rights, and so on).
   */
  "assistant.use": LEADS,
  /** AI products (invoice, bank, GST, TDS, ledgers, trial balance, …): released to AI_PRODUCTS_EMAILS only. */
  "ai_products.use": EVERYONE,
  /** Client portal: own business profile, requests, permitted work updates, dues. */
  "portal.use": CLIENTS,
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

// ---------------------------------------------------------------- modules

export const MODULES = {
  dashboard: "Dashboard",
  tasks: "Tasks",
  clients: "Clients",
  observations: "Client observations",
  client_reports: "Client reports",
  dues: "Fees & dues",
  allocations: "Team allocation",
  timesheet: "Timesheet",
  day_reports: "Day reports",
  pending: "Pending tracker",
  attendance: "Attendance & leave",
  payroll: "Payroll",
  employees: "Employees",
  services: "Services & departments",
  compliance: "Compliance",
} as const;

export type ModuleKey = keyof typeof MODULES;

/** Ready-made access for support staff such as a peon or driver. */
export const SUPPORT_STAFF_MODULES: ModuleKey[] = ["attendance", "payroll"];

const MODULE_BY_PREFIX: Record<string, ModuleKey> = {
  dashboard: "dashboard",
  tasks: "tasks",
  clients: "clients",
  observations: "observations",
  reports: "client_reports",
  dues: "dues",
  allocations: "allocations",
  timesheet: "timesheet",
  dayreport: "day_reports",
  pending: "pending",
  attendance: "attendance",
  leave: "attendance",
  payroll: "payroll",
  employees: "employees",
  services: "services",
  compliance: "compliance",
};

export function moduleOf(capability: Capability): ModuleKey | null {
  return MODULE_BY_PREFIX[capability.split(".")[0]] ?? null;
}

// ---------------------------------------------------------------- per-person rights

/** Rights an administrator can give one person beyond their role, grouped for the access form. */
export const GRANTABLE_RIGHTS: { capability: Capability; label: string; group: string }[] = [
  { capability: "employees.view", label: "See the employee list", group: "Employees" },
  { capability: "employees.invite", label: "Add & invite employees", group: "Employees" },
  { capability: "employees.approve", label: "Approve employees", group: "Employees" },
  { capability: "employees.delete", label: "Delete employees", group: "Employees" },
  { capability: "employees.manage", label: "Edit employee records", group: "Employees" },
  { capability: "clients.view_all", label: "See all clients", group: "Clients" },
  { capability: "clients.register", label: "Register clients", group: "Clients" },
  { capability: "clients.edit", label: "Edit client details", group: "Clients" },
  { capability: "clients.import", label: "Import clients from Excel", group: "Clients" },
  { capability: "clients.approve", label: "Approve clients", group: "Clients" },
  { capability: "clients.delete", label: "Delete clients", group: "Clients" },
  { capability: "allocations.view_all", label: "See everyone's team allocation", group: "Team allocation" },
  { capability: "allocations.manage", label: "Allocate team members & import allocations", group: "Team allocation" },
  { capability: "tasks.view_all", label: "See all tasks", group: "Tasks" },
  { capability: "tasks.review", label: "Review any task", group: "Tasks" },
  { capability: "tasks.cancel", label: "Cancel tasks", group: "Tasks" },
  { capability: "tasks.delete", label: "Delete tasks", group: "Tasks" },
  { capability: "attendance.view_all", label: "See team attendance & export it", group: "Attendance & payroll" },
  { capability: "leave.decide", label: "Approve leave & attendance requests of their team", group: "Attendance & payroll" },
  { capability: "attendance.mark_others", label: "Mark attendance for others with a photo", group: "Attendance & payroll" },
  { capability: "attendance.review_photos", label: "Check everyone's photo attendance", group: "Attendance & payroll" },
  { capability: "attendance.workers", label: "Manage daily workers & their pay", group: "Attendance & payroll" },
  { capability: "payroll.salaries", label: "Fix and change salaries of their team", group: "Attendance & payroll" },
  { capability: "payroll.manage", label: "Run payroll for everyone (and set anyone's salary)", group: "Attendance & payroll" },
  { capability: "timesheet.view_all", label: "See the team's timesheets", group: "Timesheet" },
  { capability: "timesheet.review", label: "Review timesheets", group: "Timesheet" },
  { capability: "compliance.manage", label: "Manage the compliance tracker", group: "Compliance" },
  { capability: "services.manage", label: "Manage services & departments", group: "Other" },
  { capability: "reports.client", label: "Client reports", group: "Other" },
  { capability: "dues.manage", label: "Fees & dues", group: "Other" },
  { capability: "observations.manage", label: "Manage client observations", group: "Other" },
  { capability: "pending.view_all", label: "See everyone's pending items", group: "Other" },
  { capability: "dayreport.view_all", label: "See everyone's day reports", group: "Other" },
  { capability: "records.delete", label: "Delete other entries", group: "Other" },
  { capability: "assistant.use", label: "Use AI reporting (sees only what their other rights allow)", group: "Other" },
];

const GRANTABLE = new Set<string>(GRANTABLE_RIGHTS.map((r) => r.capability));

/** Temporary rights: { capability: "YYYY-MM-DD" }, the last day the right is given. */
export type GrantExpiries = Record<string, string>;

export function parseExpiries(raw: unknown): GrantExpiries {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e[1])));
}

/** The rights still in force on `todayIso` (a temporary right lapses after its last day). */
export function liveGrants(granted: readonly string[], expiries: unknown, todayIso: string): string[] {
  const until = parseExpiries(expiries);
  return granted.filter((c) => !until[c] || until[c] >= todayIso);
}
export const isGrantable = (c: string): c is Capability => GRANTABLE.has(c);

/** Who is asking: a role alone (the matrix), or a member with their own rights and restrictions. */
export type Member = {
  role: Role;
  grantedCapabilities?: readonly string[];
  moduleRestricted?: boolean;
  allowedModules?: readonly string[];
  /** The signed-in login; used for features released to named accounts only. */
  user?: { email: string };
};

/** "AI reporting" is released only to these logins for now (the client's demo account). */
export const AI_REPORTING_EMAILS: readonly string[] = ["demo@gmail.com"];

/** The AI products (ai-products/apps) are released only to these logins (the client's demo account). */
export const AI_PRODUCTS_EMAILS: readonly string[] = ["demo@gmail.com"];

const isUnrestrictable = (role: Role) => role === "OWNER" || role === "ADMIN";

/** Is this module open to the member? Owners and administrators can never be locked out. */
export function canUseModule(member: Member, module: ModuleKey): boolean {
  if (!member.moduleRestricted || isUnrestrictable(member.role)) return true;
  return (member.allowedModules ?? []).includes(module);
}

export function can(who: Role | Member, capability: Capability): boolean {
  const member: Member = typeof who === "string" ? { role: who } : who;
  if (capability === "assistant.use" && !AI_REPORTING_EMAILS.includes(member.user?.email?.toLowerCase() ?? "")) return false;
  if (capability === "ai_products.use" && !AI_PRODUCTS_EMAILS.includes(member.user?.email?.toLowerCase() ?? "")) return false;
  const mod = moduleOf(capability);
  if (mod && member.role !== "CLIENT" && !canUseModule(member, mod)) return false;
  if ((CAPABILITIES[capability] as readonly Role[]).includes(member.role)) return true;
  return member.role !== "CLIENT" && !!member.grantedCapabilities?.includes(capability) && GRANTABLE.has(capability);
}

/** Where a member lands after sign-in (DFD: automatic redirection by identity). */
export function landingPath(who: Role | Member): string {
  const member: Member = typeof who === "string" ? { role: who } : who;
  if (member.role === "CLIENT") return "/client";
  if (!canUseModule(member, "dashboard")) {
    if (canUseModule(member, "attendance")) return "/app/attendance";
    if (canUseModule(member, "payroll")) return "/app/payroll";
    if (canUseModule(member, "tasks")) return "/app/tasks";
    return "/app/profile";
  }
  switch (member.role) {
    case "OWNER":
    case "ADMIN":
      return "/app/admin";
    case "MANAGER":
      return "/app/manager";
    case "SENIOR":
      return "/app/senior";
    default:
      return "/app/workspace";
  }
}
