-- Client feedback 21 Nov 2026 (additive only): half-day leave session, flexible weekly off and work on
-- a Sunday / holiday (attendance forms), conveyance claims and salary advances.

ALTER TYPE "AttendanceRequestKind" ADD VALUE IF NOT EXISTS 'WEEKLY_OFF';
ALTER TYPE "AttendanceRequestKind" ADD VALUE IF NOT EXISTS 'OFF_DAY_WORK';

ALTER TABLE "leave_requests" ADD COLUMN "half_day_session" VARCHAR(8);

CREATE TABLE "conveyance_claims" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "claim_date" DATE NOT NULL,
    "client_id" UUID,
    "place" TEXT,
    "mode" VARCHAR(20),
    "km" DECIMAL(8,1),
    "amount" DECIMAL(12,2) NOT NULL,
    "purpose" TEXT,
    "bill_file_id" UUID,
    "status" VARCHAR(12) NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "conveyance_claims_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conveyance_claims_bill_file_id_key" ON "conveyance_claims"("bill_file_id");
CREATE INDEX "conveyance_claims_organization_id_status_idx" ON "conveyance_claims"("organization_id", "status");
CREATE INDEX "conveyance_claims_employee_id_claim_date_idx" ON "conveyance_claims"("employee_id", "claim_date");
ALTER TABLE "conveyance_claims" ADD CONSTRAINT "conveyance_claims_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conveyance_claims" ADD CONSTRAINT "conveyance_claims_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conveyance_claims" ADD CONSTRAINT "conveyance_claims_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conveyance_claims" ADD CONSTRAINT "conveyance_claims_bill_file_id_fkey" FOREIGN KEY ("bill_file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conveyance_claims" ADD CONSTRAINT "conveyance_claims_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "employee_advances" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "given_on" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "monthly_deduction" DECIMAL(12,2) NOT NULL,
    "start_month" VARCHAR(7) NOT NULL,
    "note" TEXT,
    "closed_month" VARCHAR(7),
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "employee_advances_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "employee_advances_employee_id_idx" ON "employee_advances"("employee_id");
CREATE INDEX "employee_advances_organization_id_idx" ON "employee_advances"("organization_id");
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Selfie at attendance: off / optional / required (tracker S.No. 94).
ALTER TABLE "attendance_policies" ADD COLUMN "attendance_photo" VARCHAR(10) NOT NULL DEFAULT 'OPTIONAL';

-- Notices with reply due dates (tracker S.No. 86).
CREATE TABLE "client_notices" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "department" VARCHAR(30) NOT NULL,
    "reference" TEXT,
    "section" TEXT,
    "received_on" DATE,
    "reply_due_date" DATE NOT NULL,
    "responsible_employee_id" UUID,
    "status" VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    "replied_on" DATE,
    "remarks" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "client_notices_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "client_notices_organization_id_status_reply_due_date_idx" ON "client_notices"("organization_id", "status", "reply_due_date");
CREATE INDEX "client_notices_client_id_idx" ON "client_notices"("client_id");
ALTER TABLE "client_notices" ADD CONSTRAINT "client_notices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_notices" ADD CONSTRAINT "client_notices_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_notices" ADD CONSTRAINT "client_notices_responsible_employee_id_fkey" FOREIGN KEY ("responsible_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fixed Assets Register and asset issue / return (tracker S.No. 89, 90).
CREATE TABLE "office_assets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" VARCHAR(40),
    "serial_no" TEXT,
    "purchase_date" DATE,
    "vendor" TEXT,
    "cost" DECIMAL(12,2),
    "location" TEXT,
    "condition" VARCHAR(12),
    "status" VARCHAR(14) NOT NULL DEFAULT 'IN_STOCK',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "office_assets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "office_assets_organization_id_code_key" ON "office_assets"("organization_id", "code");
CREATE INDEX "office_assets_organization_id_status_idx" ON "office_assets"("organization_id", "status");
ALTER TABLE "office_assets" ADD CONSTRAINT "office_assets_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "asset_issues" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "issued_on" DATE NOT NULL,
    "issue_condition" VARCHAR(12),
    "returned_on" DATE,
    "return_condition" VARCHAR(12),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_issues_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "asset_issues_asset_id_idx" ON "asset_issues"("asset_id");
CREATE INDEX "asset_issues_employee_id_returned_on_idx" ON "asset_issues"("employee_id", "returned_on");
ALTER TABLE "asset_issues" ADD CONSTRAINT "asset_issues_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "office_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "asset_issues" ADD CONSTRAINT "asset_issues_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
