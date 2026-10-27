-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('EMPLOYEE', 'TRAINEE');

-- CreateEnum
CREATE TYPE "AttendanceProfile" AS ENUM ('STANDARD', 'ONSITE', 'FAR_CLIENT', 'REDUCED_HOURS');

-- CreateEnum
CREATE TYPE "SalaryMode" AS ENUM ('TRANSFER', 'CASH');

-- CreateEnum
CREATE TYPE "OvertimeMode" AS ENUM ('ACTUAL_MINUTES', 'SLABS');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('CASUAL', 'SICK', 'PLANNED', 'UNPAID', 'OTHER');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "ClassificationBasis" AS ENUM ('GST_STATUS', 'BILLING_BASIS', 'PLACE_OF_WORK', 'TURNOVER', 'PRIORITY');

-- AlterEnum
ALTER TYPE "ClientStatus" ADD VALUE 'ON_HOLD';

-- AlterEnum
ALTER TYPE "ConstitutionMemberRole" ADD VALUE 'MEMBER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ConstitutionType" ADD VALUE 'INDIVIDUAL';
ALTER TYPE "ConstitutionType" ADD VALUE 'LLP';
ALTER TYPE "ConstitutionType" ADD VALUE 'PUBLIC_COMPANY';
ALTER TYPE "ConstitutionType" ADD VALUE 'OPC';
ALTER TYPE "ConstitutionType" ADD VALUE 'AOP_BOI';
ALTER TYPE "ConstitutionType" ADD VALUE 'GOVERNMENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmployeeDocumentType" ADD VALUE 'PHOTOGRAPH';
ALTER TYPE "EmployeeDocumentType" ADD VALUE 'ADDRESS_PROOF';
ALTER TYPE "EmployeeDocumentType" ADD VALUE 'MARKSHEET_10';
ALTER TYPE "EmployeeDocumentType" ADD VALUE 'MARKSHEET_12';
ALTER TYPE "EmployeeDocumentType" ADD VALUE 'DEGREE';
ALTER TYPE "EmployeeDocumentType" ADD VALUE 'PROFESSIONAL_CERTIFICATE';
ALTER TYPE "EmployeeDocumentType" ADD VALUE 'RELIEVING_LETTER';
ALTER TYPE "EmployeeDocumentType" ADD VALUE 'SALARY_SLIP';
ALTER TYPE "EmployeeDocumentType" ADD VALUE 'APPOINTMENT_LETTER';
ALTER TYPE "EmployeeDocumentType" ADD VALUE 'POLICY_ACKNOWLEDGEMENT';
ALTER TYPE "EmployeeDocumentType" ADD VALUE 'JOINING_FORM';
ALTER TYPE "EmployeeDocumentType" ADD VALUE 'CANCELLED_CHEQUE';

-- AlterEnum
ALTER TYPE "MembershipRole" ADD VALUE 'SENIOR';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MemoCategory" ADD VALUE 'LATE_ATTENDANCE';
ALTER TYPE "MemoCategory" ADD VALUE 'SHOW_CAUSE';
ALTER TYPE "MemoCategory" ADD VALUE 'GENERAL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PendingStatus" ADD VALUE 'IN_PROGRESS';
ALTER TYPE "PendingStatus" ADD VALUE 'AWAITING_RESPONSE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TaskStatus" ADD VALUE 'ASSIGNED';
ALTER TYPE "TaskStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "TaskStatus" ADD VALUE 'CHANGES_REQUESTED';

-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN     "late_reason" TEXT;

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "primary_business_nature_id" UUID,
ADD COLUMN     "secondary_business_nature_id" UUID;

-- AlterTable
ALTER TABLE "constitutions" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "day_reports" ADD COLUMN     "blockers" TEXT,
ADD COLUMN     "completed_work" TEXT,
ADD COLUMN     "new_assignments" TEXT,
ADD COLUMN     "pending_work" TEXT,
ADD COLUMN     "work_plan" TEXT;

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "code" TEXT,
ADD COLUMN     "is_confirmed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "scope" TEXT;

-- AlterTable
ALTER TABLE "employee_memos" ADD COLUMN     "action_required" TEXT,
ADD COLUMN     "memo_number" TEXT,
ADD COLUMN     "reply_by_date" DATE;

-- AlterTable
ALTER TABLE "employee_salary_records" ADD COLUMN     "salary_mode" "SalaryMode";

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "attendance_profile" "AttendanceProfile" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "department_id" UUID,
ADD COLUMN     "emergency_contact_name" TEXT,
ADD COLUMN     "emergency_contact_phone" VARCHAR(20),
ADD COLUMN     "emergency_contact_relation" TEXT,
ADD COLUMN     "employment_type" "EmploymentType" NOT NULL DEFAULT 'EMPLOYEE',
ADD COLUMN     "esi_ip_number" TEXT,
ADD COLUMN     "father_name" TEXT,
ADD COLUMN     "mother_name" TEXT,
ADD COLUMN     "offer_accepted_on" DATE,
ADD COLUMN     "onboarding_submitted_at" TIMESTAMPTZ(3),
ADD COLUMN     "uan_number" TEXT,
ADD COLUMN     "voter_id_number" TEXT;

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "leave_type" "LeaveType" NOT NULL DEFAULT 'CASUAL',
ADD COLUMN     "with_intimation" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "billing_basis" TEXT,
ADD COLUMN     "deliverable" TEXT,
ADD COLUMN     "frequency" TEXT,
ADD COLUMN     "is_confirmed" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "timesheet_entries" ADD COLUMN     "review_note" TEXT,
ADD COLUMN     "reviewed_at" TIMESTAMPTZ(3),
ADD COLUMN     "reviewed_by_id" UUID,
ADD COLUMN     "status" "TimesheetStatus" NOT NULL DEFAULT 'SUBMITTED',
ADD COLUMN     "work_type_id" UUID;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "display_username" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "business_natures" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "business_natures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classification_options" (
    "id" UUID NOT NULL,
    "basis" "ClassificationBasis" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "classification_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_classifications" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "basis" "ClassificationBasis" NOT NULL,
    "option_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contacts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "mobile" VARCHAR(20),
    "email" TEXT,
    "address" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_types" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "work_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_items" (
    "id" UUID NOT NULL,
    "department" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "form" TEXT,
    "applicable_to" TEXT,
    "frequency" TEXT,
    "due_date_rule" TEXT,
    "penalty" TEXT,
    "remarks" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "compliance_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "office_start" VARCHAR(5) NOT NULL DEFAULT '09:30',
    "reporting_grace_until" VARCHAR(5) NOT NULL DEFAULT '09:45',
    "lunch_start" VARCHAR(5) NOT NULL DEFAULT '13:00',
    "lunch_end" VARCHAR(5) NOT NULL DEFAULT '13:30',
    "office_end" VARCHAR(5) NOT NULL DEFAULT '18:30',
    "leaving_grace_until" VARCHAR(5) NOT NULL DEFAULT '18:45',
    "half_day_if_leaving_before" VARCHAR(5) NOT NULL DEFAULT '17:30',
    "required_minutes" INTEGER NOT NULL DEFAULT 540,
    "onsite_required_minutes" INTEGER NOT NULL DEFAULT 480,
    "reduced_required_minutes" INTEGER NOT NULL DEFAULT 510,
    "far_client_early_month_minutes" INTEGER NOT NULL DEFAULT 510,
    "far_client_early_month_until_day" INTEGER NOT NULL DEFAULT 15,
    "late_arrivals_per_half_day" INTEGER NOT NULL DEFAULT 2,
    "late_grace_per_month" INTEGER NOT NULL DEFAULT 1,
    "overtime_mode" "OvertimeMode" NOT NULL DEFAULT 'ACTUAL_MINUTES',
    "overtime_minutes_per_day" INTEGER NOT NULL DEFAULT 540,
    "paid_leaves_per_month" DECIMAL(4,1) NOT NULL DEFAULT 1,
    "planned_leave_notice_days" INTEGER NOT NULL DEFAULT 15,
    "policy_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "id" UUID NOT NULL,
    "attendance_record_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT NOT NULL,
    "original_values" JSONB NOT NULL,
    "new_values" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_reviews" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "reviewer_employee_id" UUID NOT NULL,
    "decision" "ReviewDecision" NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "pending_item_id" UUID,
    "client_due_id" UUID,
    "note" TEXT NOT NULL,
    "next_follow_up_on" DATE,
    "actor_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_natures_code_key" ON "business_natures"("code");

-- CreateIndex
CREATE UNIQUE INDEX "classification_options_code_key" ON "classification_options"("code");

-- CreateIndex
CREATE INDEX "classification_options_basis_idx" ON "classification_options"("basis");

-- CreateIndex
CREATE INDEX "client_classifications_option_id_idx" ON "client_classifications"("option_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_classifications_client_id_basis_key" ON "client_classifications"("client_id", "basis");

-- CreateIndex
CREATE INDEX "client_contacts_client_id_idx" ON "client_contacts"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_types_organization_id_name_key" ON "work_types"("organization_id", "name");

-- CreateIndex
CREATE INDEX "compliance_items_department_idx" ON "compliance_items"("department");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policies_organization_id_key" ON "attendance_policies"("organization_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_attendance_record_id_idx" ON "attendance_corrections"("attendance_record_id");

-- CreateIndex
CREATE INDEX "task_reviews_task_id_created_at_idx" ON "task_reviews"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "follow_ups_pending_item_id_idx" ON "follow_ups"("pending_item_id");

-- CreateIndex
CREATE INDEX "follow_ups_client_due_id_idx" ON "follow_ups"("client_due_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "constitutions_code_key" ON "constitutions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_primary_business_nature_id_fkey" FOREIGN KEY ("primary_business_nature_id") REFERENCES "business_natures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_secondary_business_nature_id_fkey" FOREIGN KEY ("secondary_business_nature_id") REFERENCES "business_natures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_work_type_id_fkey" FOREIGN KEY ("work_type_id") REFERENCES "work_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_classifications" ADD CONSTRAINT "client_classifications_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_classifications" ADD CONSTRAINT "client_classifications_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "classification_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_types" ADD CONSTRAINT "work_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_attendance_record_id_fkey" FOREIGN KEY ("attendance_record_id") REFERENCES "attendance_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_reviews" ADD CONSTRAINT "task_reviews_reviewer_employee_id_fkey" FOREIGN KEY ("reviewer_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_pending_item_id_fkey" FOREIGN KEY ("pending_item_id") REFERENCES "pending_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_client_due_id_fkey" FOREIGN KEY ("client_due_id") REFERENCES "client_dues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
