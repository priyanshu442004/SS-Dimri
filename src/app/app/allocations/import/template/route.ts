import { NextResponse } from "next/server";
import { can } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { getContext } from "@/lib/session";
import { xlsxResponse } from "@/lib/xlsx";
import { ALLOCATION_FIELDS, ALLOCATION_RESOURCE_TYPES, ALLOCATION_ROLES } from "@/lib/domain/allocation-import";
import { FREQUENCIES } from "@/lib/domain/allocation-schedule";

/** Template in the shape of the firm's Team Allocation sheet, with the firm's own clients and team in the lists. */
export async function GET() {
  const ctx = await getContext();
  if (!ctx || ctx.role === "CLIENT" || ctx.mustChangePassword || ctx.access.state === "locked" || !can(ctx, "allocations.manage")) {
    return new NextResponse("Not found", { status: 404 });
  }
  const [employees, clients] = await Promise.all([
    prisma.employee.findMany({ where: { organizationId: ctx.organization.id, approvalStatus: "APPROVED", employmentStatus: { not: "EXITED" } }, orderBy: { firstName: "asc" }, select: { firstName: true, lastName: true } }),
    prisma.client.findMany({ where: { organizationId: ctx.organization.id, status: { in: ["ACTIVE", "ON_HOLD"] } }, orderBy: { tradeName: "asc" }, select: { tradeName: true } }),
  ]);
  const head = Object.values(ALLOCATION_FIELDS).map((f) => ("required" in f && f.required ? `${f.label} *` : f.label));
  const people = employees.map((e) => `${e.firstName} ${e.lastName ?? ""}`.trim());
  const sample = [
    clients[0]?.tradeName ?? "Giriraj Marketing", people[0] ?? "Akash", "Junior", "Visiting (periodic visits)", "01-11-2026", "", "Mon, Thu", "No", "Twice a week", "",
    3.5, 0, people[1] ?? "", people[2] ?? "", "No", "First half at client",
  ];
  const instructions = [
    ["Field", "How to fill"],
    ["General", "One row = one team member on one client. If a person works on 3 clients, make 3 rows. Keep the headings in row 2."],
    ["Client *", "Client name exactly as in the Client Master (client code or PAN also work)"],
    ["Team member *", "Name as in the team list (full name, first name if unique, or employee code)"],
    ["Role on this client", Object.values(ALLOCATION_ROLES).join(", ")],
    ["Resource type", ALLOCATION_RESOURCE_TYPES.join(", ")],
    ["From *", "Allocation start date (DD-MM-YYYY)"],
    ["To", "End date. Leave blank if ongoing. A past date keeps the row as history (ended)."],
    ["Week days", "Days at this client, e.g. Mon, Wed, Fri. Blank = Mon–Sat"],
    ["Full Day", "Yes = full day. No = fill hours in 1st half / 2nd half"],
    ["Frequency", Object.values(FREQUENCIES).join(", ")],
    ["Visit day(s) of month", "Only for Twice a month / Monthly, e.g. 5, 20 or 7 or 1st & 3rd Tue or Last working day. A Sunday moves to the next working day."],
    ["1st half (hours)", "0 to 3.5. Leave blank if Full Day = Yes"],
    ["2nd half (hours)", "0 to 5. Leave blank if Full Day = Yes"],
    ["Reports to (timesheet reviewer)", "Person who checks the timesheet for this client. Blank = their usual manager"],
    ["Team leader (escalation)", "Person told when work is pending"],
    ["Allow overlap with other allocations", "Yes = may be booked on another client at the same time. Default No"],
    ["Remark", "Any note"],
    ["Other columns", "Any extra column you add is kept with the allocation as an extra detail"],
  ];
  const lists: [string, string[]][] = [
    ["Role on this client", Object.values(ALLOCATION_ROLES)],
    ["Resource type", [...ALLOCATION_RESOURCE_TYPES]],
    ["Frequency", Object.values(FREQUENCIES)],
    ["Week Day", ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Mon–Sat (all days)"]],
    ["Yes / No", ["Yes", "No"]],
    ["Team Member", people],
    ["Client", clients.map((c) => c.tradeName)],
  ];
  const longest = Math.max(...lists.map(([, v]) => v.length));
  const listRows = [lists.map(([h]) => h), ...Array.from({ length: longest }, (_, i) => lists.map(([, v]) => v[i] ?? ""))];
  return xlsxResponse("team-allocation-import-template.xlsx", [
    { name: "Allocation", title: `${ctx.organization.tradeName} – Team Allocation (import)`, rows: [head, sample] },
    { name: "Instructions", rows: instructions },
    { name: "Lists", rows: listRows },
  ]);
}
