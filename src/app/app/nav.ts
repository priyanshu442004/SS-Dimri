import { can, type Capability, type Member } from "@/lib/permissions";

export type NavItem = { href: string; label: string; icon: string; section: string };

const ITEMS: (NavItem & { cap?: Capability })[] = [
  { href: "/app", label: "Dashboard", icon: "home", section: "Overview", cap: "dashboard.use" },
  { href: "/app/notifications", label: "Notifications", icon: "bell", section: "Overview" },
  { href: "/app/clients", label: "Clients", icon: "building", section: "Clients", cap: "clients.use" },
  { href: "/app/observations", label: "Client observations", icon: "message", section: "Clients", cap: "observations.use" },
  { href: "/app/reports/clients", label: "Client reports", icon: "chart", section: "Clients", cap: "reports.client" },
  { href: "/app/dues", label: "Fees & dues", icon: "wallet", section: "Clients", cap: "dues.manage" },
  { href: "/app/allocations", label: "Team allocation", icon: "users", section: "Work", cap: "allocations.use" },
  { href: "/app/tasks", label: "Tasks", icon: "list", section: "Work", cap: "tasks.use" },
  { href: "/app/timesheet", label: "Timesheet", icon: "clock", section: "Work", cap: "timesheet.fill_own" },
  { href: "/app/day-reports", label: "Day reports", icon: "file", section: "Work", cap: "dayreport.submit" },
  { href: "/app/pending", label: "Pending tracker", icon: "flag", section: "Work", cap: "pending.manage_own" },
  { href: "/app/attendance", label: "Attendance", icon: "calendar", section: "People", cap: "attendance.mark_own" },
  { href: "/app/payroll", label: "Payroll", icon: "wallet", section: "People", cap: "payroll.view_own" },
  { href: "/app/employees", label: "Employees", icon: "id", section: "People", cap: "employees.view" },
  { href: "/app/services", label: "Services & departments", icon: "briefcase", section: "Setup", cap: "services.manage" },
  { href: "/app/compliances", label: "Compliance", icon: "book", section: "Setup", cap: "compliance.use" },
  { href: "/app/settings", label: "Settings", icon: "settings", section: "Setup", cap: "org.manage" },
];

export function navFor(member: Member, awaitingApproval: boolean, hasEmployee: boolean): NavItem[] {
  if (awaitingApproval) return [{ href: "/app/onboarding", label: "My onboarding", icon: "id", section: "Getting started" }];
  const items = ITEMS.filter((i) => !i.cap || can(member, i.cap));
  const after = items.findIndex((i) => i.href === "/app/notifications") + 1;
  items.splice(after, 0, { href: "/app/profile", label: "My profile", icon: "id", section: "Overview" });
  if (hasEmployee) items.splice(after + 1, 0, { href: "/app/onboarding", label: "My employee record", icon: "file", section: "Overview" });
  return items;
}
