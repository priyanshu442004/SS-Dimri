-- AI Reporting: stored daily / refreshed reports (additive only).
-- CreateTable
CREATE TABLE "ai_reports" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scheduled_for" DATE,
    "trigger" VARCHAR(12) NOT NULL DEFAULT 'MANUAL',
    "requested_by_id" UUID,
    "status" VARCHAR(12) NOT NULL DEFAULT 'RUNNING',
    "data" JSONB,
    "narrative" JSONB,
    "error" TEXT,
    "mail_status" VARCHAR(12),
    "mail_to" TEXT,
    "mail_error" TEXT,
    "mailed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_reports_organization_id_created_at_idx" ON "ai_reports"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_reports_organization_id_scheduled_for_key" ON "ai_reports"("organization_id", "scheduled_for");

-- AddForeignKey
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

