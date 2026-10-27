import { can, type Capability, type Role } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: string; section: string };

const ITEMS: (NavItem & { cap?: Capability })[] = [
  { href: "/app", label: "Dashboard", icon: "home", section: "Overview" },
  { href: "/app/notifications", label: "Notifications", icon: "bell", section: "Overview" },
  { href: "/app/clients", label: "Clients", icon: "building", section: "Clients" },
  { href: "/app/observations", label: "Client observations", icon: "message", section: "Clients" },
  { href: "/app/reports/clients", label: "Client reports", icon: "chart", section: "Clients", cap: "reports.client" },
  { href: "/app/dues", label: "Fees & dues", icon: "wallet", section: "Clients", cap: "dues.manage" },
  { href: "/app/allocations", label: "Team allocation", icon: "users", section: "Work" },
  { href: "/app/tasks", label: "Tasks", icon: "list", section: "Work" },
  { href: "/app/timesheet", label: "Timesheet", icon: "clock", section: "Work" },
  { href: "/app/day-reports", label: "Day reports", icon: "file", section: "Work" },
  { href: "/app/pending", label: "Pending tracker", icon: "flag", section: "Work" },
  { href: "/app/attendance", label: "Attendance", icon: "calendar", section: "People" },
  { href: "/app/employees", label: "Employees", icon: "id", section: "People", cap: "employees.view" },
  { href: "/app/services", label: "Services & departments", icon: "briefcase", section: "Setup", cap: "services.manage" },
  { href: "/app/compliances", label: "Compliance calendar", icon: "book", section: "Setup" },
  { href: "/app/settings", label: "Settings", icon: "settings", section: "Setup", cap: "org.manage" },
];

export function navFor(role: Role, awaitingApproval: boolean, hasEmployee: boolean): NavItem[] {
  if (awaitingApproval) return [{ href: "/app/onboarding", label: "My onboarding", icon: "id", section: "Getting started" }];
  const items = ITEMS.filter((i) => !i.cap || can(role, i.cap));
  items.splice(2, 0, { href: "/app/profile", label: "My profile", icon: "id", section: "Overview" });
  if (hasEmployee) items.splice(3, 0, { href: "/app/onboarding", label: "My employee record", icon: "file", section: "Overview" });
  return items;
}
