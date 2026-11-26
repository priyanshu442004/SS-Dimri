-- Tracker 25 Nov 2026 (S.No. 99-112) and the follow-up asks: attendance marking requests, own working hours,
-- SSDA conveyance sheet and salary slip fields, client groups / state-wise GSTINs, e-way bill login, AI files.
-- Additive only.
-- AlterEnum
ALTER TYPE "AttendanceRequestKind" ADD VALUE 'MARK_ATTENDANCE';

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "eway_bill_password_encrypted" TEXT,
ADD COLUMN     "eway_bill_user_id" TEXT,
ADD COLUMN     "group_id" UUID;

-- AlterTable
ALTER TABLE "client_gst_registrations" ADD COLUMN     "branch_name" TEXT,
ADD COLUMN     "registration_type" VARCHAR(16),
ADD COLUMN     "state" VARCHAR(60);

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "commute_km" DECIMAL(6,1),
ADD COLUMN     "site_day_minutes" INTEGER;

-- AlterTable
ALTER TABLE "employee_salary_records" ADD COLUMN     "fixed_allowance" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "marked_on_request" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "attendance_policies" ADD COLUMN     "conveyance_rate_per_km" DECIMAL(6,2) NOT NULL DEFAULT 4.5,
ADD COLUMN     "request_marks_per_month" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "salary_pay_day" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "attendance_requests" ADD COLUMN     "escalated_at" TIMESTAMPTZ(3),
ADD COLUMN     "work_location" VARCHAR(16),
ADD COLUMN     "work_place" TEXT;

-- AlterTable
ALTER TABLE "conveyance_claims" ADD COLUMN     "commute_km" DECIMAL(8,1),
ADD COLUMN     "rate_per_km" DECIMAL(6,2),
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "total_run_km" DECIMAL(8,1);

-- CreateTable
CREATE TABLE "client_groups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_generated_files" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "conversation_id" UUID,
    "kind" VARCHAR(8) NOT NULL,
    "file_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_generated_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_groups_organization_id_name_key" ON "client_groups"("organization_id", "name");

-- CreateIndex
CREATE INDEX "ai_generated_files_user_id_created_at_idx" ON "ai_generated_files"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "clients_group_id_idx" ON "clients"("group_id");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "client_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_groups" ADD CONSTRAINT "client_groups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generated_files" ADD CONSTRAINT "ai_generated_files_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generated_files" ADD CONSTRAINT "ai_generated_files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ISD registration (tracker S.No. 100): its return, GSTR-6, joins the compliance master.
INSERT INTO "compliance_items" ("id", "department", "name", "form", "applicable_to", "frequency", "due_date_rule", "penalty", "remarks", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid(), 'GST', 'ISD return (Input Service Distributor)', 'GSTR-6', 'Input Service Distributors (ISD registration)', 'Monthly', '13th of next month', 'Late fee', 'Distribution of input tax credit to the units (GSTINs) of the same PAN', 17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "compliance_items" WHERE "department" = 'GST' AND "form" = 'GSTR-6');
