-- Client feedback round 2: Accounting Workflow Tracker, Team Daily Work Log columns,
-- compliances per client, Client Master columns, "Remark (If Date Extend)".
-- Additive only.

ALTER TYPE "WorkStatus" ADD VALUE IF NOT EXISTS 'NOT_STARTED';
ALTER TYPE "WorkStatus" ADD VALUE IF NOT EXISTS 'ON_HOLD';

-- Client Master columns
ALTER TABLE "clients"
  ADD COLUMN "state" TEXT,
  ADD COLUMN "date_of_birth" DATE,
  ADD COLUMN "it_file_no" TEXT,
  ADD COLUMN "master_remark" TEXT,
  ADD COLUMN "departments" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "gst_user_id" TEXT,
  ADD COLUMN "gst_password_encrypted" TEXT,
  ADD COLUMN "income_tax_user_id" TEXT,
  ADD COLUMN "income_tax_password_encrypted" TEXT,
  ADD COLUMN "traces_user_id" TEXT,
  ADD COLUMN "traces_password_encrypted" TEXT;

-- Remark (If Date Extend)
ALTER TABLE "organization_compliance_settings" ADD COLUMN "extended_date_remark" TEXT;

-- Compliances per client
CREATE TABLE "client_compliances" (
  "id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "compliance_item_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_compliances_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "client_compliances_client_id_compliance_item_id_key" ON "client_compliances"("client_id", "compliance_item_id");
ALTER TABLE "client_compliances" ADD CONSTRAINT "client_compliances_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_compliances" ADD CONSTRAINT "client_compliances_compliance_item_id_fkey" FOREIGN KEY ("compliance_item_id") REFERENCES "compliance_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Accounting Workflow Tracker
CREATE TABLE "tracker_lines" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "ref_no" TEXT NOT NULL,
  "client_id" UUID,
  "client_name" TEXT NOT NULL,
  "branch" TEXT,
  "type_of_work" TEXT NOT NULL,
  "bank_name" TEXT,
  "period_from" DATE,
  "period_to" DATE,
  "status_of_work" "WorkStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "issue_level" TEXT,
  "issue_details" TEXT,
  "issue_status" TEXT,
  "client_pending_item" TEXT,
  "client_raised_on" DATE,
  "client_due_by" DATE,
  "client_pending_status" TEXT,
  "team_pending_item" TEXT,
  "team_raised_on" DATE,
  "team_due_by" DATE,
  "team_pending_status" TEXT,
  "get_from" TEXT,
  "date_received" DATE,
  "maker_employee_id" UUID,
  "checker_employee_id" UUID,
  "checker_status" TEXT,
  "work_start_date" DATE,
  "priority" TEXT,
  "next_follow_up_on" DATE,
  "remarks" TEXT,
  "source" TEXT NOT NULL DEFAULT 'MANAGER',
  "reviewed_at" TIMESTAMPTZ(3),
  "created_by_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "tracker_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tracker_lines_organization_id_ref_no_key" ON "tracker_lines"("organization_id", "ref_no");
CREATE INDEX "tracker_lines_organization_id_client_name_idx" ON "tracker_lines"("organization_id", "client_name");
CREATE INDEX "tracker_lines_maker_employee_id_idx" ON "tracker_lines"("maker_employee_id");
CREATE INDEX "tracker_lines_checker_employee_id_idx" ON "tracker_lines"("checker_employee_id");
ALTER TABLE "tracker_lines" ADD CONSTRAINT "tracker_lines_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tracker_lines" ADD CONSTRAINT "tracker_lines_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tracker_lines" ADD CONSTRAINT "tracker_lines_maker_employee_id_fkey" FOREIGN KEY ("maker_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tracker_lines" ADD CONSTRAINT "tracker_lines_checker_employee_id_fkey" FOREIGN KEY ("checker_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Team Daily Work Log columns
ALTER TABLE "timesheet_entries"
  ADD COLUMN "branch" TEXT,
  ADD COLUMN "tracker_line_id" UUID,
  ADD COLUMN "issue_level" TEXT,
  ADD COLUMN "issue_details" TEXT,
  ADD COLUMN "issue_status" TEXT,
  ADD COLUMN "client_pending_item" TEXT,
  ADD COLUMN "client_raised_on" DATE,
  ADD COLUMN "client_due_by" DATE,
  ADD COLUMN "client_pending_status" TEXT,
  ADD COLUMN "team_pending_item" TEXT,
  ADD COLUMN "team_raised_on" DATE,
  ADD COLUMN "team_due_by" DATE,
  ADD COLUMN "team_pending_status" TEXT;
CREATE INDEX "timesheet_entries_tracker_line_id_idx" ON "timesheet_entries"("tracker_line_id");
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_tracker_line_id_fkey" FOREIGN KEY ("tracker_line_id") REFERENCES "tracker_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Type of Work: the 24 values of the Team Daily Work Log. Master and older-workbook types that
-- are not on the list are retired (entries keep their text); a firm's own types stay, and
-- anything can be switched back on under Settings.
CREATE TEMP TABLE "_log_work_types" ("name" TEXT, "ord" INT);
INSERT INTO "_log_work_types" VALUES
  ('Bank Statement Posting', 1), ('Purchase Invoice Posting', 2), ('Sale Invoice Posting', 3), ('Expense Posting', 4),
  ('Journal / Adjustment Entries', 5), ('Bank Reconciliation', 6), ('Credit Card Reconciliation', 7), ('Creditors Reconciliation', 8),
  ('Debtors Reconciliation', 9), ('Data Reconciliation', 10), ('Ledger Scrutiny / Clean-up', 11), ('Making of Accounts / Final Accounts', 12),
  ('GST Work', 13), ('TDS Work', 14), ('Balance Confirmation', 15), ('Client Meeting / Discussion', 16),
  ('Income Tax Work', 17), ('Payroll / Salary Work', 18), ('Fixed Assets / Depreciation', 19), ('Stock / Inventory Work', 20),
  ('Loan Accounting', 21), ('Opening Balances / Carry Forward', 22), ('Capital / Partners'' Accounts', 23), ('Other', 24);

UPDATE "work_types" t SET "is_active" = false
 WHERE lower(t."name") NOT IN (SELECT lower("name") FROM "_log_work_types")
   AND (t."code" IS NOT NULL OR t."name" IN (
     'Sales Entry', 'Purchase Entry', 'Payment Mode Reconciliation', 'GSTR-1 Compilation', 'GSTR-3B Compilation', 'TDS Reconciliation', 'GST Liability Working',
     'PNL Preparation / Comparison', 'GSTR-3B Reconciliation & Drafting', 'Books Finalisation', 'Audit Data Entry', 'Audit Data Compilation', 'Audit Coordination with Client',
     'Backend Training (Fresher)', 'Team Supervision / Mentoring', 'Client Site Visit (Review/Monitoring)', 'Waiting - Client Not Available', 'System / Portal Downtime', 'Documentation'));

UPDATE "work_types" t SET "is_active" = true, "sort_order" = w."ord"
  FROM "_log_work_types" w WHERE lower(t."name") = lower(w."name");

INSERT INTO "work_types" ("id", "organization_id", "name", "sort_order", "is_active", "updated_at")
SELECT gen_random_uuid(), o."id", w."name", w."ord", true, CURRENT_TIMESTAMP
  FROM "organizations" o CROSS JOIN "_log_work_types" w
 WHERE NOT EXISTS (SELECT 1 FROM "work_types" t WHERE t."organization_id" = o."id" AND lower(t."name") = lower(w."name"));

DROP TABLE "_log_work_types";
