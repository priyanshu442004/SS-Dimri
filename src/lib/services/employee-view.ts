import "server-only";
import { prisma } from "@/lib/db";
import { toIsoDate } from "@/lib/dates";
import type { OnboardingDefaults } from "@/app/app/employees/onboarding-form";

/** Load an employee (scoped to the organization) with everything the profile pages show. */
export async function loadEmployeeProfile(organizationId: string, employeeId: string) {
  return prisma.employee.findFirst({
    where: { id: employeeId, organizationId },
    include: {
      designation: true,
      department: true,
      addresses: true,
      bankAccounts: { where: { isPrimary: true }, take: 1 },
      qualifications: { orderBy: { createdAt: "asc" }, take: 1 },
      previousEmployments: { orderBy: { createdAt: "asc" }, take: 1 },
      documents: { include: { file: { select: { id: true, originalFileName: true } } } },
      reportsTo: { include: { manager: { select: { id: true, firstName: true, lastName: true } } } },
      membership: { select: { userId: true, role: true, status: true, mustChangePassword: true, tempPasswordExpiresAt: true, user: { select: { username: true, email: true } } } },
      approvedBy: { select: { name: true } },
    },
  });
}

export type EmployeeProfile = NonNullable<Awaited<ReturnType<typeof loadEmployeeProfile>>>;

export function onboardingDefaults(e: EmployeeProfile): OnboardingDefaults {
  const addr = (t: string) => e.addresses.find((a) => a.type === t)?.line1;
  const bank = e.bankAccounts[0];
  const q = e.qualifications[0];
  const p = e.previousEmployments[0];
  const d = (x: Date | null | undefined) => (x ? toIsoDate(x) : undefined);
  const s = (x: string | null | undefined) => x ?? undefined;
  return {
    firstName: e.firstName, lastName: s(e.lastName), gender: s(e.gender), dateOfBirth: d(e.dateOfBirth), maritalStatus: s(e.maritalStatus),
    fatherName: s(e.fatherName), motherName: s(e.motherName), mobile: s(e.mobile), email: s(e.email), panNumber: s(e.panNumber),
    voterIdNumber: s(e.voterIdNumber), uanNumber: s(e.uanNumber), esiIpNumber: s(e.esiIpNumber),
    currentAddress: addr("CURRENT"), permanentAddress: addr("PERMANENT"),
    emergencyContactName: s(e.emergencyContactName), emergencyContactRelation: s(e.emergencyContactRelation), emergencyContactPhone: s(e.emergencyContactPhone),
    bankAccountHolder: s(bank?.accountHolderName), bankLast4: bank?.accountNumberLast4, ifscCode: bank?.ifscCode, bankName: s(bank?.bankName), branch: s(bank?.branch),
    qualification: q?.qualification, institution: s(q?.institution), yearOfPassing: q?.yearOfPassing?.toString(),
    previousEmployer: p?.employerName, previousEmployerAddress: s(p?.employerAddress), previousDesignation: s(p?.designation),
    previousEmployerContact: s(p?.contactNumber), previousFrom: d(p?.fromDate), previousTo: d(p?.toDate),
    remarks: s(e.remarks),
  };
}

const DOC_LABELS: Record<string, string> = {
  MARKSHEET_10: "10th marksheet", MARKSHEET_12: "12th marksheet", DEGREE: "Degree / diploma", PROFESSIONAL_CERTIFICATE: "Professional certificate",
  ADDRESS_PROOF: "Address proof", OFFER_LETTER: "Offer letter", APPOINTMENT_LETTER: "Appointment letter", JOINING_LETTER: "Joining letter",
  JOINING_FORM: "Joining form", RELIEVING_LETTER: "Relieving letter", EXPERIENCE_CERTIFICATE: "Experience certificate", SALARY_SLIP: "Salary slip",
  CANCELLED_CHEQUE: "Cancelled cheque", POLICY_ACKNOWLEDGEMENT: "Policy acknowledgement", PHOTOGRAPH: "Photograph", OTHER: "Other document",
};

/** Uploaded documents for display: [label, fileId]. */
export function employeeFiles(e: EmployeeProfile): [string, string][] {
  const out: [string, string | null | undefined][] = [
    ["Photograph", e.profilePictureFileId],
    ["PAN card", e.panDocumentFileId],
    ["Aadhaar card", e.aadhaarDocumentFileId],
    ["Bank passbook / cheque", e.bankAccounts[0]?.bankBookFileId],
    ["Qualification certificate", e.qualifications[0]?.certificateFileId],
    ["Experience letter", e.previousEmployments[0]?.experienceCertificateFileId],
    ...e.documents.map((doc) => [`${DOC_LABELS[doc.type] ?? doc.type}${doc.title ? ` (${doc.title})` : ""}`, doc.file.id] as [string, string]),
  ];
  return out.filter((x): x is [string, string] => !!x[1]);
}
