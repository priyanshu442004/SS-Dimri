// Deletes ONLY end-to-end test organizations: those whose OWNER's email ends
// with "@e2e.invalid". Prints what it will delete; runs in one transaction.
// Usage: npm run test:e2e:cleanup
import { loadEnvConfig } from "@next/env";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";

loadEnvConfig(process.cwd());
const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const orgs = await prisma.organization.findMany({
    where: { memberships: { some: { role: "OWNER", user: { email: { endsWith: "@e2e.invalid" } } } } },
    select: { id: true, tradeName: true },
  });
  if (!orgs.length) {
    console.log("No e2e organizations found.");
    return;
  }
  console.log(`Deleting ${orgs.length} e2e organization(s):`, orgs.map((o) => o.tradeName).join(", "));
  const ids = orgs.map((o) => o.id);
  const users = await prisma.organizationMembership.findMany({ where: { organizationId: { in: ids } }, select: { userId: true } });
  const userIds = [...new Set(users.map((u) => u.userId))];
  const org = { organizationId: { in: ids } };
  const byClient = { client: org };
  const byEmployee = { employee: org };
  const byTask = { task: org };

  await prisma.$transaction(
    [
      prisma.followUp.deleteMany({ where: org }),
      prisma.clientObservation.deleteMany({ where: org }),
      prisma.notification.deleteMany({ where: org }),
      prisma.attendanceCorrection.deleteMany({ where: { attendanceRecord: org } }),
      prisma.attendanceRecord.deleteMany({ where: org }),
      prisma.leaveRequest.deleteMany({ where: org }),
      prisma.leaveBalance.deleteMany({ where: org }),
      prisma.pendingItem.deleteMany({ where: org }),
      prisma.timesheetEntry.deleteMany({ where: org }),
      prisma.dayReportRecipient.deleteMany({ where: { dayReport: org } }),
      prisma.dayReport.deleteMany({ where: org }),
      prisma.taskReview.deleteMany({ where: byTask }),
      prisma.taskActivity.deleteMany({ where: byTask }),
      prisma.taskReminder.deleteMany({ where: byTask }),
      prisma.taskAttachment.deleteMany({ where: byTask }),
      prisma.taskAssignment.deleteMany({ where: byTask }),
      prisma.task.deleteMany({ where: org }),
      prisma.workCommitment.deleteMany({ where: org }),
      prisma.clientReport.deleteMany({ where: org }),
      prisma.clientDue.deleteMany({ where: org }),
      prisma.teamAllocation.updateMany({ where: org, data: { replacesAllocationId: null } }),
      prisma.teamAllocation.deleteMany({ where: org }),
      prisma.clientService.updateMany({ where: org, data: { renewedFromId: null } }),
      prisma.clientService.deleteMany({ where: org }),
      prisma.clientDocument.deleteMany({ where: byClient }),
      prisma.constitutionMember.deleteMany({ where: org }),
      prisma.clientClassification.deleteMany({ where: byClient }),
      prisma.clientContact.deleteMany({ where: byClient }),
      prisma.clientGstRegistration.deleteMany({ where: byClient }),
      // Client portal logins reference their client: remove memberships first.
      prisma.organizationMembership.deleteMany({ where: org }),
      prisma.client.deleteMany({ where: org }),
      prisma.employeeReportingRelationship.deleteMany({ where: byEmployee }),
      prisma.employeeMemo.deleteMany({ where: byEmployee }),
      prisma.employeeSalaryRecord.deleteMany({ where: byEmployee }),
      prisma.employeeDocument.deleteMany({ where: byEmployee }),
      prisma.employeePreviousEmployment.deleteMany({ where: byEmployee }),
      prisma.employeeReference.deleteMany({ where: byEmployee }),
      prisma.employeeQualification.deleteMany({ where: byEmployee }),
      prisma.employeeBankAccount.deleteMany({ where: byEmployee }),
      prisma.employeeAddress.deleteMany({ where: byEmployee }),
      prisma.service.deleteMany({ where: org }),
      prisma.employee.deleteMany({ where: org }),
      prisma.auditLog.deleteMany({ where: org }),
      prisma.organizationCertificate.deleteMany({ where: org }),
      prisma.organizationDocument.deleteMany({ where: org }),
      prisma.organization.updateMany({ where: { id: { in: ids } }, data: { profilePictureFileId: null } }),
      prisma.storedFile.deleteMany({ where: org }),
      prisma.organization.deleteMany({ where: { id: { in: ids } } }), // cascades departments, designations, work types, policy
      // Unused password setup/reset links of these users (value = "<userId>:<purpose>").
      prisma.verification.deleteMany({ where: { OR: userIds.map((id) => ({ value: { startsWith: `${id}:` } })) } }),
      prisma.user.deleteMany({ where: { id: { in: userIds } } }), // cascades sessions and accounts
    ],
    { timeout: 60_000, maxWait: 15_000 },
  );
  console.log("Done. Note: uploaded test files remain in S3 under ss-dimri/org/<id>/ and can be removed separately.");
}

main()
  .catch((e) => {
    console.error("Cleanup failed:", e instanceof Error ? `${e.name} ${(e as { code?: string }).code ?? ""} ${e.message}`.slice(0, 1500) : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
