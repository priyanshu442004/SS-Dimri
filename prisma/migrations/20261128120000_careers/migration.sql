-- Careers (client request 28 Nov 2026): resumes uploaded by the team, the email sent to each candidate,
-- the candidates' replies read back from the mailbox, and where reading the mailbox got to. Additive only.

-- CreateTable
CREATE TABLE "resume_submissions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ref" VARCHAR(12) NOT NULL,
    "file_id" UUID,
    "candidate_name" VARCHAR(200) NOT NULL,
    "candidate_email" VARCHAR(254) NOT NULL,
    "candidate_phone" VARCHAR(20),
    "email_source" VARCHAR(10) NOT NULL,
    "emails_found" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "referred_by" VARCHAR(6) NOT NULL,
    "referrer_name" VARCHAR(200) NOT NULL,
    "uploaded_by_id" UUID,
    "status" VARCHAR(12) NOT NULL DEFAULT 'NEW',
    "admin_note" TEXT,
    "mail_status" VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    "mail_error" VARCHAR(400),
    "mail_to" VARCHAR(254),
    "mailed_at" TIMESTAMPTZ(3),
    "mail_count" INTEGER NOT NULL DEFAULT 0,
    "mail_message_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "current_ctc" VARCHAR(200),
    "expected_ctc" VARCHAR(200),
    "notice_period" VARCHAR(200),
    "interview_slots" VARCHAR(300),
    "current_location" VARCHAR(200),
    "details_at" TIMESTAMPTZ(3),
    "reply_count" INTEGER NOT NULL DEFAULT 0,
    "last_reply_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "resume_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_replies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "message_id" VARCHAR(500) NOT NULL,
    "folder" VARCHAR(100) NOT NULL,
    "from_email" VARCHAR(254) NOT NULL,
    "from_name" VARCHAR(200),
    "subject" VARCHAR(500),
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "kind" VARCHAR(10) NOT NULL DEFAULT 'REPLY',
    "matched_by" VARCHAR(8) NOT NULL,
    "body_text" TEXT NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'PROCESSING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(400),
    "details" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "candidate_replies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "careers_mail_sync" (
    "folder" VARCHAR(100) NOT NULL,
    "uid_validity" BIGINT,
    "last_uid" INTEGER NOT NULL DEFAULT 0,
    "last_run_at" TIMESTAMPTZ(3),
    "last_ok_at" TIMESTAMPTZ(3),
    "last_error" VARCHAR(400),
    "last_found" INTEGER NOT NULL DEFAULT 0,
    "runs" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "careers_mail_sync_pkey" PRIMARY KEY ("folder")
);

-- CreateIndex
CREATE UNIQUE INDEX "resume_submissions_file_id_key" ON "resume_submissions"("file_id");

-- CreateIndex
CREATE INDEX "resume_submissions_organization_id_created_at_idx" ON "resume_submissions"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "resume_submissions_organization_id_candidate_email_idx" ON "resume_submissions"("organization_id", "candidate_email");

-- CreateIndex
CREATE INDEX "resume_submissions_uploaded_by_id_created_at_idx" ON "resume_submissions"("uploaded_by_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "resume_submissions_organization_id_ref_key" ON "resume_submissions"("organization_id", "ref");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_replies_message_id_key" ON "candidate_replies"("message_id");

-- CreateIndex
CREATE INDEX "candidate_replies_organization_id_created_at_idx" ON "candidate_replies"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "candidate_replies_submission_id_received_at_idx" ON "candidate_replies"("submission_id", "received_at");

-- AddForeignKey
ALTER TABLE "resume_submissions" ADD CONSTRAINT "resume_submissions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_submissions" ADD CONSTRAINT "resume_submissions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resume_submissions" ADD CONSTRAINT "resume_submissions_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_replies" ADD CONSTRAINT "candidate_replies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_replies" ADD CONSTRAINT "candidate_replies_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "resume_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

