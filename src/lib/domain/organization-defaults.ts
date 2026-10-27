import type { Prisma } from "@/generated/prisma/client";
import master from "../../../prisma/data/ssda-master-data.json";

// Per-organization defaults created when an organization registers. They are
// rows (not enums) so each organization can edit them. Departments, services
// and work types come from the client's ERP master data pack; "Suggested"
// entries are created with is_confirmed = false.

/** Designations from the handwritten notes — defaults, not an exhaustive list. */
export const DEFAULT_DESIGNATIONS = [
  { name: "Associate Partner", seniorityLevel: "SENIOR", sortOrder: 1 },
  { name: "Manager", seniorityLevel: "SENIOR", sortOrder: 2 },
  { name: "Senior", seniorityLevel: "MID_LEVEL", sortOrder: 3 },
  { name: "Accounts Executive", seniorityLevel: "JUNIOR", sortOrder: 4 },
  { name: "Executive", seniorityLevel: "JUNIOR", sortOrder: 5 },
  { name: "Account Trainee", seniorityLevel: "JUNIOR", sortOrder: 6 },
] as const;

/** "Nature of Employee" — first option's wording is uncertain in the notes. */
export const DEFAULT_EMPLOYEE_NATURES = [
  { label: "Frontend", sourceWording: "Frontend / Extended (handwriting unclear)", sortOrder: 1 },
  { label: "Backend", sourceWording: "Backend", sortOrder: 2 },
  { label: "On-site", sourceWording: "On-site", sortOrder: 3 },
] as const;

export async function createOrganizationDefaults(tx: Prisma.TransactionClient, organizationId: string) {
  await tx.designation.createMany({
    data: DEFAULT_DESIGNATIONS.map((d) => ({ ...d, organizationId })),
    skipDuplicates: true,
  });
  await tx.employeeNatureOption.createMany({
    data: DEFAULT_EMPLOYEE_NATURES.map((n) => ({ ...n, organizationId })),
    skipDuplicates: true,
  });
  await tx.department.createMany({
    data: master.departments.map((d) => ({
      organizationId,
      code: d.code,
      name: d.name,
      scope: d.scope,
      isConfirmed: d.confirmed,
    })),
    skipDuplicates: true,
  });
  const departments = await tx.department.findMany({ where: { organizationId }, select: { id: true, name: true } });
  const deptByName = new Map(departments.map((d) => [d.name.toLowerCase(), d.id]));
  await tx.service.createMany({
    data: master.services.map((s) => ({
      organizationId,
      serviceCode: s.code,
      name: s.name,
      // "Income Tax / GST" maps to its first department.
      departmentId: deptByName.get(s.department.split("/")[0].trim().toLowerCase()) ?? null,
      description: s.description,
      frequency: s.frequency,
      deliverable: s.deliverable,
      billingBasis: s.billingBasis,
      isConfirmed: s.confirmed,
    })),
    skipDuplicates: true,
  });
  await tx.workType.createMany({
    data: master.workTypes.map((w, i) => ({ organizationId, code: w.code, name: w.name, sortOrder: i + 1 })),
    skipDuplicates: true,
  });
  await tx.attendancePolicy.upsert({ where: { organizationId }, update: {}, create: { organizationId } });
}
