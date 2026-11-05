-- Client feedback (5 Nov 2026). Additive only: the running application keeps working
-- while this is applied. allocation_percent stays, converted to half-day hours below.

-- AlterEnum
ALTER TYPE "TaskAttachmentKind" ADD VALUE 'AUDIO';

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "allowed_modules" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "granted_capabilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "module_restricted" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "timesheet_penalty_rupees" INTEGER NOT NULL DEFAULT 100;

-- AlterTable
ALTER TABLE "task_attachments" ADD COLUMN     "duration_seconds" INTEGER;

-- AlterTable
ALTER TABLE "team_allocations" ADD COLUMN     "first_half_hours" DECIMAL(4,2),
ADD COLUMN     "reports_to_employee_id" UUID,
ADD COLUMN     "resource_type" TEXT,
ADD COLUMN     "second_half_hours" DECIMAL(4,2),
ADD COLUMN     "team_leader_employee_id" UUID;

-- AlterTable
ALTER TABLE "timesheet_entries" ADD COLUMN     "assessment_year" TEXT,
ADD COLUMN     "end_time" VARCHAR(5),
ADD COLUMN     "resource_type" TEXT,
ADD COLUMN     "start_time" VARCHAR(5);

-- CreateTable
CREATE TABLE "organization_compliance_settings" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "compliance_item_id" UUID NOT NULL,
    "applies_to_firm" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_compliance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_columns" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID,
    "department" TEXT NOT NULL,
    "compliance_item_id" UUID,
    "compliance_type" TEXT NOT NULL,
    "issuing_authority" TEXT,
    "registration_number" TEXT,
    "due_date" DATE NOT NULL,
    "frequency" TEXT,
    "responsible_employee_id" UUID,
    "reminder_lead_days" INTEGER NOT NULL DEFAULT 7,
    "action_taken" BOOLEAN NOT NULL DEFAULT false,
    "action_taken_on" DATE,
    "remarks" TEXT,
    "custom_values" JSONB NOT NULL DEFAULT '{}',
    "reminder_sent_at" TIMESTAMPTZ(3),
    "escalated_at" TIMESTAMPTZ(3),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "compliance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_compliance_settings_organization_id_compliance_key" ON "organization_compliance_settings"("organization_id", "compliance_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_columns_organization_id_label_key" ON "compliance_columns"("organization_id", "label");

-- CreateIndex
CREATE INDEX "compliance_entries_organization_id_department_due_date_idx" ON "compliance_entries"("organization_id", "department", "due_date");

-- CreateIndex
CREATE INDEX "compliance_entries_client_id_idx" ON "compliance_entries"("client_id");

-- CreateIndex
CREATE INDEX "compliance_entries_responsible_employee_id_idx" ON "compliance_entries"("responsible_employee_id");

-- AddForeignKey
ALTER TABLE "team_allocations" ADD CONSTRAINT "team_allocations_reports_to_employee_id_fkey" FOREIGN KEY ("reports_to_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_allocations" ADD CONSTRAINT "team_allocations_team_leader_employee_id_fkey" FOREIGN KEY ("team_leader_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_compliance_settings" ADD CONSTRAINT "organization_compliance_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_compliance_settings" ADD CONSTRAINT "organization_compliance_settings_compliance_item_id_fkey" FOREIGN KEY ("compliance_item_id") REFERENCES "compliance_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_columns" ADD CONSTRAINT "compliance_columns_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_entries" ADD CONSTRAINT "compliance_entries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_entries" ADD CONSTRAINT "compliance_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_entries" ADD CONSTRAINT "compliance_entries_compliance_item_id_fkey" FOREIGN KEY ("compliance_item_id") REFERENCES "compliance_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_entries" ADD CONSTRAINT "compliance_entries_responsible_employee_id_fkey" FOREIGN KEY ("responsible_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_entries" ADD CONSTRAINT "compliance_entries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Team allocation moves from a percentage to hours per half of the day (default policy:
-- first half 09:30-13:00 = 3.5 h, second half 13:30-18:30 = 5 h). NULL hours = full day.
UPDATE "team_allocations"
SET "first_half_hours" = ROUND(3.5 * "allocation_percent" / 100.0, 2),
    "second_half_hours" = ROUND(5.0 * "allocation_percent" / 100.0, 2)
WHERE "allocation_percent" IS NOT NULL;

-- "Other Client Site" from the Team Timesheet workbook (a second site visited the same day).
INSERT INTO "classification_options" ("id", "basis", "code", "label", "description", "sort_order", "is_active", "created_at", "updated_at")
VALUES (gen_random_uuid(), 'PLACE_OF_WORK', 'PLC-05', 'Other Client Site', 'A different client site visited the same day', 99, true, now(), now())
ON CONFLICT ("code") DO NOTHING;

-- Nature-of-work values from the Team Timesheet workbook that the firm's list did not have.
INSERT INTO "work_types" ("id", "organization_id", "name", "sort_order", "is_active", "created_at", "updated_at")
SELECT gen_random_uuid(), o."id", v.name, 100 + v.ord, true, now(), now()
FROM "organizations" o
CROSS JOIN (VALUES
  ('Sales Entry', 1), ('Purchase Entry', 2), ('Payment Mode Reconciliation', 3), ('GSTR-1 Compilation', 4), ('GSTR-3B Compilation', 5),
  ('TDS Reconciliation', 6), ('GST Liability Working', 7), ('PNL Preparation / Comparison', 8), ('GSTR-3B Reconciliation & Drafting', 9),
  ('Books Finalisation', 10), ('Audit Data Entry', 11), ('Audit Data Compilation', 12), ('Audit Coordination with Client', 13),
  ('Backend Training (Fresher)', 14), ('Team Supervision / Mentoring', 15), ('Client Site Visit (Review/Monitoring)', 16),
  ('Waiting - Client Not Available', 17), ('System / Portal Downtime', 18), ('Documentation', 19)
) AS v(name, ord)
ON CONFLICT ("organization_id", "name") DO NOTHING;
