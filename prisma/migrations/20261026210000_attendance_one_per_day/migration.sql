-- One attendance record per employee per day. Additive: replaces the plain
-- (employee_id, attendance_date) index with a unique one on the same columns.
-- Pre-check: scripts/check-attendance-duplicates.ts reported 0 duplicate groups.

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_employee_id_attendance_date_key" ON "attendance_records"("employee_id", "attendance_date");

-- DropIndex (now redundant: the unique index covers the same columns)
DROP INDEX "attendance_records_employee_id_attendance_date_idx";
