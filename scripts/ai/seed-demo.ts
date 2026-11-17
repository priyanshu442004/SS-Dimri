// Demo firm for trying the AI assistant on the LOCAL throw-away test database only.
// Refuses to run unless DATABASE_URL points at the docker test database (host "pg").
//
//   (with the test-database env exported, see docs/testing-strategy.md)
//   npx tsx --conditions=react-server scripts/ai/seed-demo.ts

import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

const url = process.env.DATABASE_URL ?? "";
if (!/@pg:5432\/ssdimri_test/.test(url) && !/@localhost:55432\//.test(url)) {
  console.error("Refusing to seed: DATABASE_URL is not the local test database.");
  process.exit(1);
}

async function main() {
  const { prisma } = await import("../../src/lib/db");
  const { createCredentialUser } = await import("../../src/lib/services/accounts");
  const { createOrganizationDefaults } = await import("../../src/lib/domain/organization-defaults");
  const { zonedDateTime, addDays, dateOnly, toIsoDate, isoDateInTz } = await import("../../src/lib/dates");

  const email = "owner@demo.invalid";
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log("Demo firm already exists. Sign in as owner@demo.invalid / DemoOwner#2026");
    return;
  }
  const tz = "Asia/Kolkata";
  const { orgId, ownerId } = await prisma.$transaction(async (tx) => {
    const owner = await createCredentialUser(tx, { name: "Demo Owner", email, password: "DemoOwner#2026" });
    const org = await tx.organization.create({ data: { tradeName: "Demo CA Firm", accessMode: "MULTI_USER", licensedUserLimit: 50 } });
    await tx.organizationMembership.create({ data: { organizationId: org.id, userId: owner.id, role: "OWNER" } });
    await createOrganizationDefaults(tx, org.id);
    return { orgId: org.id, ownerId: owner.id };
  }, { timeout: 60_000 });

  const designations = await prisma.designation.findMany({ where: { organizationId: orgId }, orderBy: { sortOrder: "asc" } });
  const dept = await prisma.department.create({ data: { organizationId: orgId, name: "Accounts & Audit" } });
  const tax = await prisma.department.create({ data: { organizationId: orgId, name: "Taxation" } });

  const people = [
    ["Sanjay", "Dimri", 95000], ["Kamal", "Verma", 60000], ["Kirpal", "Singh", 42000], ["Gaurav", "Sharma", 40000], ["Ginesh", "Rawat", 26000],
    ["Neha", "Kapoor", 30000], ["Ravi", "Kumar", 28000], ["Pooja", "Mehta", 32000], ["Amit", "Joshi", 25000], ["Sunita", "Negi", 27000],
  ] as const;
  const employees = [];
  for (const [i, [first, last, salary]] of people.entries()) {
    const e = await prisma.employee.create({
      data: {
        organizationId: orgId, temporaryEmployeeCode: `TMP-${100 + i}`, permanentEmployeeCode: `EMP-${String(i + 1).padStart(3, "0")}`, idType: "PERMANENT",
        approvalStatus: "APPROVED", employmentStatus: "ACTIVE", firstName: first, lastName: last, dateOfJoining: dateOnly("2026-01-05"),
        designationId: designations[Math.min(i, designations.length - 1)]?.id, departmentId: i % 3 === 0 ? tax.id : dept.id, gender: i % 2 ? "FEMALE" : "MALE",
        email: `${first.toLowerCase()}@demo.invalid`, mobile: `98100000${String(i).padStart(2, "0")}`,
      },
    });
    await prisma.employeeSalaryRecord.create({ data: { employeeId: e.id, effectiveFrom: dateOnly("2026-04-01"), agreedSalary: salary, salaryPeriod: "MONTHLY", createdById: ownerId } });
    employees.push(e);
  }
  // A manager login, to check what a non-admin may see.
  const mgrUser = await prisma.$transaction((tx) => createCredentialUser(tx, { name: "Kamal Verma", email: "manager@demo.invalid", password: "DemoManager#2026" }));
  await prisma.organizationMembership.create({ data: { organizationId: orgId, userId: mgrUser.id, employeeId: employees[1].id, role: "MANAGER" } });
  for (const e of employees.slice(2)) await prisma.employeeReportingRelationship.create({ data: { employeeId: e.id, managerId: employees[1].id, isPrimary: true } });

  // Four weeks of attendance (Sundays off), with late arrivals and reasons.
  const reasons = ["Traffic jam on Ring Road", "Metro was delayed", "Doctor's appointment in the morning", "Child's school meeting", "Two-wheeler puncture"];
  const today = dateOnly(isoDateInTz(new Date(), tz));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let d = addDays(today, -28); d <= today; d = addDays(d, 1)) {
    if (d.getUTCDay() === 0) continue;
    const iso = toIsoDate(d);
    for (const [i, e] of employees.entries()) {
      const r = rnd();
      if (iso === toIsoDate(today) && r < 0.2) continue; // not in yet today
      if (r < 0.05) {
        await prisma.attendanceRecord.create({ data: { organizationId: orgId, employeeId: e.id, attendanceDate: d, status: "ABSENT" } });
        continue;
      }
      const late = r > 0.8 || (i === 6 && r > 0.55);
      const inMin = late ? 9 * 60 + 50 + Math.floor(rnd() * 70) : 9 * 60 + 10 + Math.floor(rnd() * 30);
      const outMin = 18 * 60 + 25 + Math.floor(rnd() * 45);
      const isToday = iso === toIsoDate(today);
      await prisma.attendanceRecord.create({
        data: {
          organizationId: orgId, employeeId: e.id, attendanceDate: d, status: "PRESENT", workLocation: i % 4 === 0 ? "CLIENT_OFFICE" : "OFFICE",
          timeIn: zonedDateTime(iso, inMin, tz), timeOut: isToday ? null : zonedDateTime(iso, outMin, tz),
          lateReason: late ? reasons[Math.floor(rnd() * reasons.length)] : null,
        },
      });
    }
  }
  await prisma.leaveRequest.createMany({
    data: [
      { organizationId: orgId, employeeId: employees[5].id, fromDate: addDays(today, -10), toDate: addDays(today, -9), reason: "Family function", status: "APPROVED", leaveType: "CASUAL", decidedById: ownerId, decidedAt: new Date() },
      { organizationId: orgId, employeeId: employees[8].id, fromDate: addDays(today, 2), toDate: addDays(today, 3), reason: "Sister's wedding", status: "PENDING", leaveType: "PLANNED" },
      { organizationId: orgId, employeeId: employees[3].id, fromDate: addDays(today, -3), toDate: addDays(today, -3), reason: "Fever", status: "APPROVED", leaveType: "SICK", decidedById: ownerId, decidedAt: new Date() },
    ],
  });

  const clientNames = [["Roshan Di Kulfi & Sons", "RDK"], ["Sharma Traders Pvt Ltd", "SHT"], ["Gupta & Sons", "GUP"], ["Mehra Logistics LLP", "MLL"], ["Bansal Textiles", "BTX"], ["Arora Foods", "ARF"]];
  const clients = [];
  for (const [name, code] of clientNames) {
    clients.push(await prisma.client.create({ data: { organizationId: orgId, tradeName: name, clientCode: code, status: "ACTIVE", natureOfClient: code === "RDK" || code === "SHT" ? "RETAINER" : "ONE_TIME", createdById: ownerId } }));
  }
  const titles = ["GST return filing", "Bank statement posting", "TDS return Q2", "Balance sheet finalisation", "Income tax notice reply", "Stock audit", "Payroll processing", "ROC annual filing"];
  const statuses = ["PENDING", "IN_PROGRESS", "COMPLETED", "PENDING_REVIEW", "ON_HOLD"] as const;
  for (let i = 0; i < 28; i++) {
    const status = statuses[i % statuses.length];
    const due = addDays(today, -8 + (i % 14));
    const t = await prisma.task.create({
      data: {
        organizationId: orgId, clientId: clients[i % clients.length].id, title: `${titles[i % titles.length]} — ${clients[i % clients.length].clientCode}`,
        priority: i % 3 === 0 ? "HIGH" : i % 3 === 1 ? "MEDIUM" : "LOW", status, dueAt: zonedDateTime(toIsoDate(due), 18 * 60, tz),
        completedAt: status === "COMPLETED" ? new Date() : null, makerEmployeeId: employees[2 + (i % 8)].id, createdById: ownerId,
      },
    });
    await prisma.taskAssignment.create({ data: { taskId: t.id, employeeId: employees[2 + (i % 8)].id, assignedById: ownerId } });
  }
  console.log(`Demo firm ready (organization ${orgId}).`);
  console.log("Owner:   owner@demo.invalid / DemoOwner#2026");
  console.log("Manager: manager@demo.invalid / DemoManager#2026");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  const { prisma } = await import("../../src/lib/db");
  await prisma.$disconnect();
});
