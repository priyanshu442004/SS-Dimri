-- Client feedback 20 Nov 2026 (additive only): weekly reports, one timesheet entry per task per day,
-- client GST registration type and office opening time, completion date of an engagement.

-- AI Reporting: daily and weekly reports (one scheduled report per firm per kind per day / week).
ALTER TABLE "ai_reports" ADD COLUMN "kind" VARCHAR(8) NOT NULL DEFAULT 'DAILY';
DROP INDEX "ai_reports_organization_id_scheduled_for_key";
CREATE UNIQUE INDEX "ai_reports_organization_id_kind_scheduled_for_key" ON "ai_reports"("organization_id", "kind", "scheduled_for");

-- Timesheet: the start / stop sessions of a timed task inside its one entry for the day.
ALTER TABLE "timesheet_entries" ADD COLUMN "sessions" JSONB;

-- Clients: GST registration type (Regular / Composition / Surrendered) and the client's office opening time.
ALTER TABLE "clients" ADD COLUMN "gst_registration_type" VARCHAR(16);
ALTER TABLE "clients" ADD COLUMN "office_opens_at" VARCHAR(5);

-- Engagements: when a one-time engagement was completed (its fee is earned then).
ALTER TABLE "client_services" ADD COLUMN "completed_at" TIMESTAMPTZ(3);
UPDATE "client_services" SET "completed_at" = "updated_at" WHERE "status" = 'COMPLETED' AND "completed_at" IS NULL;
