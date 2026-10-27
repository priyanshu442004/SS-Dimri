-- CreateEnum
CREATE TYPE "ClientRegistrationChannel" AS ENUM ('STAFF', 'CLIENT_QUICK', 'CLIENT_FULL');

-- AlterEnum
ALTER TYPE "MembershipRole" ADD VALUE 'CLIENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskStatus" ADD VALUE 'AWAITING_CLIENT';
ALTER TYPE "TaskStatus" ADD VALUE 'AWAITING_TEAM_MEMBER';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "registration_channel" "ClientRegistrationChannel" NOT NULL DEFAULT 'STAFF';

-- AlterTable
ALTER TABLE "follow_ups" ADD COLUMN     "client_visible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "file_id" UUID;

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "client_id" UUID;

-- AlterTable
ALTER TABLE "pending_items" ADD COLUMN     "client_visible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "task_activities" ADD COLUMN     "client_visible" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "client_visible" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "follow_ups_file_id_key" ON "follow_ups"("file_id");

-- CreateIndex
CREATE INDEX "organization_memberships_client_id_idx" ON "organization_memberships"("client_id");

-- AddForeignKey
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
