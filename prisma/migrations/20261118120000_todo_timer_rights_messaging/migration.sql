-- To-do timer on morning-plan lines, temporary rights, firm Email & WhatsApp settings (additive only).

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN "grant_expiries" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "daily_plan_items" ADD COLUMN "task_id" UUID,
ADD COLUMN "started_at" TIMESTAMPTZ(3),
ADD COLUMN "worked_minutes" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "daily_plan_items_task_id_idx" ON "daily_plan_items"("task_id");

-- AddForeignKey
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "organization_messaging" (
    "organization_id" UUID NOT NULL,
    "email_enabled" BOOLEAN NOT NULL DEFAULT false,
    "smtp_host" TEXT,
    "smtp_port" INTEGER,
    "smtp_user" TEXT,
    "smtp_pass_enc" TEXT,
    "from_email" TEXT,
    "from_name" TEXT,
    "whatsapp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "wa_phone_number_id" TEXT,
    "wa_business_account_id" TEXT,
    "wa_token_enc" TEXT,
    "wa_api_version" TEXT NOT NULL DEFAULT 'v21.0',
    "triggers" JSONB NOT NULL DEFAULT '{}',
    "updated_by_id" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_messaging_pkey" PRIMARY KEY ("organization_id")
);

-- CreateTable
CREATE TABLE "message_logs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "channel" VARCHAR(12) NOT NULL,
    "event" VARCHAR(60) NOT NULL,
    "recipient" VARCHAR(200) NOT NULL,
    "status" VARCHAR(12) NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "message_logs_organization_id_created_at_idx" ON "message_logs"("organization_id", "created_at");

-- AddForeignKey
ALTER TABLE "organization_messaging" ADD CONSTRAINT "organization_messaging_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
