-- Leave, Timing and Office Decorum Rules and Regulations (client PDF, 14 Nov 2026).
-- Work location at check-in/out, auto-absent cut-off, morning plan + EOD (daily_plans), late /
-- early-leave / overtime forms (attendance_requests), office holidays, client-site schedules,
-- rules acknowledgement, fines and leave rules in the policy. Additive only; the data updates at
-- the end move existing firms onto the PDF values where they still hold the old defaults.
-- CreateEnum
CREATE TYPE "WorkLocation" AS ENUM ('OFFICE', 'CLIENT_OFFICE', 'CLIENT_VISIT');

-- CreateEnum
CREATE TYPE "AttendanceRequestKind" AS ENUM ('LATE_ARRIVAL', 'EARLY_LEAVE', 'OVERTIME');

-- CreateEnum
CREATE TYPE "PlanItemOrigin" AS ENUM ('PLANNED', 'CARRIED', 'NEW');

-- CreateEnum
CREATE TYPE "PlanItemStatus" AS ENUM ('DONE', 'PENDING', 'CARRIED_FORWARD');

-- AlterTable
ALTER TABLE "attendance_policies" ADD COLUMN     "auto_absent_at" VARCHAR(5) NOT NULL DEFAULT '12:00',
ADD COLUMN     "eod_penalty_rupees" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "lead_penalty_rupees" INTEGER NOT NULL DEFAULT 200,
ADD COLUMN     "morning_plan_by" VARCHAR(5) NOT NULL DEFAULT '10:30',
ADD COLUMN     "no_leave_bonus_days" DECIMAL(4,1) NOT NULL DEFAULT 2,
ADD COLUMN     "office_name" TEXT NOT NULL DEFAULT 'Office',
ADD COLUMN     "unrequested_absence_days" DECIMAL(4,1) NOT NULL DEFAULT 2,
ADD COLUMN     "very_late_after_minutes" INTEGER NOT NULL DEFAULT 60,
ALTER COLUMN "late_arrivals_per_half_day" SET DEFAULT 3,
ALTER COLUMN "policy_confirmed" SET DEFAULT true;

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "auto_absent_at" TIMESTAMPTZ(3),
ADD COLUMN     "late_stay_flagged_at" TIMESTAMPTZ(3),
ADD COLUMN     "lunch_shifted_to" VARCHAR(5),
ADD COLUMN     "scheduled_end" VARCHAR(5),
ADD COLUMN     "scheduled_start" VARCHAR(5),
ADD COLUMN     "time_out_work_location" "WorkLocation",
ADD COLUMN     "work_location" "WorkLocation",
ADD COLUMN     "work_place" TEXT;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "rules_acknowledged_at" TIMESTAMPTZ(3),
ADD COLUMN     "site_name" TEXT,
ADD COLUMN     "site_reporting_time" VARCHAR(5);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "holiday_date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_requests" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" "AttendanceRequestKind" NOT NULL,
    "request_date" DATE NOT NULL,
    "at_time" VARCHAR(5),
    "reason" TEXT NOT NULL,
    "task" TEXT,
    "why_not_tomorrow" TEXT,
    "in_advance" BOOLEAN NOT NULL DEFAULT true,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_plans" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "plan_date" DATE NOT NULL,
    "plan_submitted_at" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "lead_edited_at" TIMESTAMPTZ(3),
    "eod_submitted_at" TIMESTAMPTZ(3),
    "eod_note" TEXT,
    "escalated_at" TIMESTAMPTZ(3),
    "escalated_by_id" UUID,
    "plan_flagged_at" TIMESTAMPTZ(3),
    "eod_flagged_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_plan_items" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "client_id" UUID,
    "client_name" TEXT,
    "task" TEXT NOT NULL,
    "expected_by" DATE,
    "origin" "PlanItemOrigin" NOT NULL DEFAULT 'PLANNED',
    "carried_from_id" UUID,
    "status" "PlanItemStatus",
    "reason" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "holidays_organization_id_holiday_date_key" ON "holidays"("organization_id", "holiday_date");

-- CreateIndex
CREATE INDEX "attendance_requests_organization_id_request_date_idx" ON "attendance_requests"("organization_id", "request_date");

-- CreateIndex
CREATE INDEX "attendance_requests_organization_id_status_idx" ON "attendance_requests"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_requests_employee_id_request_date_kind_key" ON "attendance_requests"("employee_id", "request_date", "kind");

-- CreateIndex
CREATE INDEX "daily_plans_organization_id_plan_date_idx" ON "daily_plans"("organization_id", "plan_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_plans_employee_id_plan_date_key" ON "daily_plans"("employee_id", "plan_date");

-- CreateIndex
CREATE INDEX "daily_plan_items_plan_id_idx" ON "daily_plan_items"("plan_id");

-- CreateIndex
CREATE INDEX "daily_plan_items_client_id_idx" ON "daily_plan_items"("client_id");

-- CreateIndex
CREATE INDEX "daily_plan_items_carried_from_id_idx" ON "daily_plan_items"("carried_from_id");

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_requests" ADD CONSTRAINT "attendance_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_escalated_by_id_fkey" FOREIGN KEY ("escalated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "daily_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The PDF confirms the policy: 3 late days (15 min to 1 h) make a half day, overtime is actual
-- minutes, and the figures are no longer provisional.
UPDATE "attendance_policies" SET "late_arrivals_per_half_day" = 3 WHERE "late_arrivals_per_half_day" = 2;
UPDATE "attendance_policies" SET "overtime_mode" = 'ACTUAL_MINUTES', "policy_confirmed" = true;
