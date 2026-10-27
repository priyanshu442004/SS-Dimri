-- Multi-firm platform (owner decision, 26 Oct 2026). Additive: existing firms default to APPROVED.

-- CreateEnum
CREATE TYPE "FirmApprovalStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FirmRegistrationChannel" AS ENUM ('SELF', 'PLATFORM_ADMIN');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "approval_decided_at" TIMESTAMPTZ(3),
ADD COLUMN     "approval_decided_by_id" UUID,
ADD COLUMN     "approval_status" "FirmApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "registration_channel" "FirmRegistrationChannel" NOT NULL DEFAULT 'SELF',
ADD COLUMN     "rejection_reason" TEXT,
ADD COLUMN     "signup_code" VARCHAR(40);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_platform_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "organizations_signup_code_key" ON "organizations"("signup_code");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_approval_decided_by_id_fkey" FOREIGN KEY ("approval_decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

