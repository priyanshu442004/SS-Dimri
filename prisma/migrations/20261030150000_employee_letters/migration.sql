-- CreateEnum
CREATE TYPE "EmployeeLetterKind" AS ENUM ('OFFER_LETTER', 'APPOINTMENT_EMPLOYEE', 'APPOINTMENT_TRAINEE');

-- AlterTable
ALTER TABLE "employee_memos" ADD COLUMN     "employee_reply" TEXT,
ADD COLUMN     "fields" JSONB,
ADD COLUMN     "replied_at" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "employee_letters" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kind" "EmployeeLetterKind" NOT NULL,
    "reference_no" TEXT,
    "letter_date" DATE NOT NULL,
    "fields" JSONB NOT NULL,
    "file_id" UUID NOT NULL,
    "issued_by_id" UUID,
    "accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_letters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employee_letters_file_id_key" ON "employee_letters"("file_id");

-- CreateIndex
CREATE INDEX "employee_letters_organization_id_kind_idx" ON "employee_letters"("organization_id", "kind");

-- CreateIndex
CREATE INDEX "employee_letters_employee_id_created_at_idx" ON "employee_letters"("employee_id", "created_at");

-- AddForeignKey
ALTER TABLE "employee_letters" ADD CONSTRAINT "employee_letters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_letters" ADD CONSTRAINT "employee_letters_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_letters" ADD CONSTRAINT "employee_letters_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_letters" ADD CONSTRAINT "employee_letters_issued_by_id_fkey" FOREIGN KEY ("issued_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
