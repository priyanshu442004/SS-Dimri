-- CreateEnum
CREATE TYPE "PendingDaysBasis" AS ENUM ('CALENDAR', 'BUSINESS');

-- CreateEnum
CREATE TYPE "ObservationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ObservationSource" AS ENUM ('CLIENT', 'STAFF');

-- AlterEnum
ALTER TYPE "TimesheetStatus" ADD VALUE 'RETURNED';

-- AlterTable
ALTER TABLE "day_report_recipients" ADD COLUMN     "review_remark" TEXT;

-- AlterTable
ALTER TABLE "follow_ups" ADD COLUMN     "observation_id" UUID;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "pending_days_basis" "PendingDaysBasis" NOT NULL DEFAULT 'CALENDAR';

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "overdue_notified_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "client_observations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "task_id" UUID,
    "client_service_id" UUID,
    "responsible_employee_id" UUID,
    "observed_on" DATE NOT NULL,
    "details" TEXT NOT NULL,
    "status" "ObservationStatus" NOT NULL DEFAULT 'OPEN',
    "source" "ObservationSource" NOT NULL DEFAULT 'STAFF',
    "resolution" TEXT,
    "closed_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_observations_organization_id_status_idx" ON "client_observations"("organization_id", "status");

-- CreateIndex
CREATE INDEX "client_observations_client_id_status_idx" ON "client_observations"("client_id", "status");

-- CreateIndex
CREATE INDEX "client_observations_task_id_idx" ON "client_observations"("task_id");

-- CreateIndex
CREATE INDEX "follow_ups_observation_id_idx" ON "follow_ups"("observation_id");

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_observation_id_fkey" FOREIGN KEY ("observation_id") REFERENCES "client_observations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_observations" ADD CONSTRAINT "client_observations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_observations" ADD CONSTRAINT "client_observations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_observations" ADD CONSTRAINT "client_observations_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_observations" ADD CONSTRAINT "client_observations_client_service_id_fkey" FOREIGN KEY ("client_service_id") REFERENCES "client_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_observations" ADD CONSTRAINT "client_observations_responsible_employee_id_fkey" FOREIGN KEY ("responsible_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_observations" ADD CONSTRAINT "client_observations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
