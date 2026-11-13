-- Client feedback 12 Nov 2026: photo attendance by a colleague, mark-out reminders,
-- client visits, lunch in/out, daily (contract) workers. Additive only.
-- CreateEnum
CREATE TYPE "AttendancePhotoReview" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- AlterTable
ALTER TABLE "attendance_policies" ADD COLUMN     "mark_out_reminder_at" VARCHAR(5) NOT NULL DEFAULT '19:00';

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "lunch_in_at" TIMESTAMPTZ(3),
ADD COLUMN     "lunch_out_at" TIMESTAMPTZ(3),
ADD COLUMN     "mark_out_reminder_sent_at" TIMESTAMPTZ(3),
ADD COLUMN     "missed_mark_out_notified_at" TIMESTAMPTZ(3),
ADD COLUMN     "photo_review" "AttendancePhotoReview",
ADD COLUMN     "photo_review_note" TEXT,
ADD COLUMN     "photo_reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "photo_reviewed_by_id" UUID,
ADD COLUMN     "time_in_proxy_by_id" UUID,
ADD COLUMN     "time_out_proxy_by_id" UUID;

-- CreateTable
CREATE TABLE "client_visits" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "client_id" UUID,
    "place_name" TEXT NOT NULL,
    "purpose" TEXT,
    "visit_date" DATE NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "start_latitude" DECIMAL(9,6),
    "start_longitude" DECIMAL(9,6),
    "ended_at" TIMESTAMPTZ(3),
    "end_latitude" DECIMAL(9,6),
    "end_longitude" DECIMAL(9,6),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_workers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" VARCHAR(20),
    "work_type" TEXT,
    "contractor" TEXT,
    "daily_wage" DECIMAL(10,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_worker_days" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "worker_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "time_in" TIMESTAMPTZ(3),
    "time_out" TIMESTAMPTZ(3),
    "in_latitude" DECIMAL(9,6),
    "in_longitude" DECIMAL(9,6),
    "in_photo_file_id" UUID,
    "out_photo_file_id" UUID,
    "wage" DECIMAL(10,2) NOT NULL,
    "remarks" TEXT,
    "marked_by_id" UUID,
    "paid_at" TIMESTAMPTZ(3),
    "paid_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_worker_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "client_visits_organization_id_visit_date_idx" ON "client_visits"("organization_id", "visit_date");

-- CreateIndex
CREATE INDEX "client_visits_employee_id_visit_date_idx" ON "client_visits"("employee_id", "visit_date");

-- CreateIndex
CREATE INDEX "client_visits_client_id_idx" ON "client_visits"("client_id");

-- CreateIndex
CREATE INDEX "daily_workers_organization_id_is_active_idx" ON "daily_workers"("organization_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "daily_worker_days_in_photo_file_id_key" ON "daily_worker_days"("in_photo_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_worker_days_out_photo_file_id_key" ON "daily_worker_days"("out_photo_file_id");

-- CreateIndex
CREATE INDEX "daily_worker_days_organization_id_work_date_idx" ON "daily_worker_days"("organization_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_worker_days_worker_id_work_date_key" ON "daily_worker_days"("worker_id", "work_date");

-- CreateIndex
CREATE INDEX "attendance_records_organization_id_photo_review_idx" ON "attendance_records"("organization_id", "photo_review");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_time_in_proxy_by_id_fkey" FOREIGN KEY ("time_in_proxy_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_time_out_proxy_by_id_fkey" FOREIGN KEY ("time_out_proxy_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_photo_reviewed_by_id_fkey" FOREIGN KEY ("photo_reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_visits" ADD CONSTRAINT "client_visits_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_visits" ADD CONSTRAINT "client_visits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_visits" ADD CONSTRAINT "client_visits_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_workers" ADD CONSTRAINT "daily_workers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_worker_days" ADD CONSTRAINT "daily_worker_days_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_worker_days" ADD CONSTRAINT "daily_worker_days_worker_id_fkey" FOREIGN KEY ("worker_id") REFERENCES "daily_workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_worker_days" ADD CONSTRAINT "daily_worker_days_in_photo_file_id_fkey" FOREIGN KEY ("in_photo_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_worker_days" ADD CONSTRAINT "daily_worker_days_out_photo_file_id_fkey" FOREIGN KEY ("out_photo_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_worker_days" ADD CONSTRAINT "daily_worker_days_marked_by_id_fkey" FOREIGN KEY ("marked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_worker_days" ADD CONSTRAINT "daily_worker_days_paid_by_id_fkey" FOREIGN KEY ("paid_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
