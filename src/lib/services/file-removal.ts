import "server-only";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/db";
import { BusinessRuleError } from "@/lib/actions";
import { serverEnv } from "@/lib/env";
import { can } from "@/lib/permissions";
import type { AppContext } from "@/lib/session";
import { s3 } from "@/lib/storage/s3";
import { audit } from "./audit";

// Remove one stored document / photo / attachment wherever it is shown (24 Nov 2026: "admin or
// higher can delete any document which is showing"). The record it is attached to stays:
// an optional slot (profile picture, certificate, photo, bill…) is emptied, and a row whose only
// purpose is the file (a client / employee / firm document, the firm certificate, a task
// attachment) is removed. An issued HR letter is a record of its own and is not removed here.

export const canDeleteFiles = (ctx: AppContext) => ctx.role !== "CLIENT" && can(ctx, "documents.delete");

export async function deleteStoredFile(ctx: AppContext, fileId: string): Promise<{ name: string }> {
  if (!canDeleteFiles(ctx)) throw new BusinessRuleError("You do not have the right to delete documents. Ask your administrator.");
  const orgId = ctx.organization.id;

  const file = await prisma.$transaction(async (tx) => {
    const f = await tx.storedFile.findFirst({
      where: { id: fileId, organizationId: orgId, deletedAt: null },
      select: { id: true, bucket: true, objectKey: true, originalFileName: true, employeeLetter: { select: { id: true } } },
    });
    if (!f) throw new BusinessRuleError("This document was not found. It may already have been deleted.");
    if (f.employeeLetter) throw new BusinessRuleError("This is the stored copy of an issued letter. Cancel or reissue the letter instead.");

    const slot = { where: { organizationId: orgId } };
    // Optional slots: empty them, keep the record.
    await tx.organization.updateMany({ where: { id: orgId, profilePictureFileId: f.id }, data: { profilePictureFileId: null } });
    await tx.client.updateMany({ where: { ...slot.where, profilePictureFileId: f.id }, data: { profilePictureFileId: null } });
    await tx.client.updateMany({ where: { ...slot.where, msmeCertificateFileId: f.id }, data: { msmeCertificateFileId: null } });
    await tx.client.updateMany({ where: { ...slot.where, esiCertificateFileId: f.id }, data: { esiCertificateFileId: null } });
    await tx.client.updateMany({ where: { ...slot.where, pfCertificateFileId: f.id }, data: { pfCertificateFileId: null } });
    await tx.constitutionMember.updateMany({ where: { profilePictureFileId: f.id }, data: { profilePictureFileId: null } });
    await tx.employee.updateMany({ where: { ...slot.where, profilePictureFileId: f.id }, data: { profilePictureFileId: null } });
    await tx.employee.updateMany({ where: { ...slot.where, aadhaarDocumentFileId: f.id }, data: { aadhaarDocumentFileId: null } });
    await tx.employee.updateMany({ where: { ...slot.where, panDocumentFileId: f.id }, data: { panDocumentFileId: null } });
    await tx.employeeBankAccount.updateMany({ where: { bankBookFileId: f.id }, data: { bankBookFileId: null } });
    await tx.employeeQualification.updateMany({ where: { certificateFileId: f.id }, data: { certificateFileId: null } });
    await tx.employeePreviousEmployment.updateMany({ where: { experienceCertificateFileId: f.id }, data: { experienceCertificateFileId: null } });
    await tx.employeeMemo.updateMany({ where: { fileId: f.id }, data: { fileId: null } });
    await tx.attendanceRecord.updateMany({ where: { timeInPhotoFileId: f.id }, data: { timeInPhotoFileId: null } });
    await tx.attendanceRecord.updateMany({ where: { timeOutPhotoFileId: f.id }, data: { timeOutPhotoFileId: null } });
    await tx.dailyWorkerDay.updateMany({ where: { inPhotoFileId: f.id }, data: { inPhotoFileId: null } });
    await tx.dailyWorkerDay.updateMany({ where: { outPhotoFileId: f.id }, data: { outPhotoFileId: null } });
    await tx.clientReport.updateMany({ where: { exportFileId: f.id }, data: { exportFileId: null } });
    await tx.followUp.updateMany({ where: { fileId: f.id }, data: { fileId: null } });
    await tx.conveyanceClaim.updateMany({ where: { billFileId: f.id }, data: { billFileId: null } });
    // Rows that exist only to hold the file.
    await tx.clientDocument.deleteMany({ where: { fileId: f.id } });
    await tx.employeeDocument.deleteMany({ where: { fileId: f.id } });
    await tx.organizationDocument.deleteMany({ where: { fileId: f.id } });
    await tx.organizationCertificate.deleteMany({ where: { fileId: f.id } });
    await tx.taskAttachment.deleteMany({ where: { fileId: f.id } });

    await tx.storedFile.update({ where: { id: f.id }, data: { deletedAt: new Date() } });
    await audit(tx, ctx, "file.deleted", "stored_file", f.id, { name: f.originalFileName });
    return f;
  });

  // Best effort: the links are gone and the file can no longer be opened; a leftover object harms nothing.
  // Files from an earlier storage account (another bucket) are only unlinked.
  if (file.bucket !== serverEnv().AWS_BUCKET_NAME) return { name: file.originalFileName };
  await s3()
    .send(new DeleteObjectCommand({ Bucket: serverEnv().AWS_BUCKET_NAME, Key: file.objectKey }))
    .catch((e) => console.error("stored file object not removed", e instanceof Error ? e.name : e));
  return { name: file.originalFileName };
}
