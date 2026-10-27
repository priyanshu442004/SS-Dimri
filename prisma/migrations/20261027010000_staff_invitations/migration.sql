-- Staff invitation flow (owner decision, 27 Oct 2026). Additive only.
-- Written by hand: the automatic diff also proposed dropping the unused
-- migration-7 columns, which is NOT done here without the owner's decision.

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "EmployeeApprovalStatus" ADD VALUE 'ON_HOLD';

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "temp_password_expires_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "to_email" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL,
    "error" TEXT,
    "related_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_outbox_organization_id_created_at_idx" ON "email_outbox"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "email_outbox_related_user_id_idx" ON "email_outbox"("related_user_id");

-- AddForeignKey
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
