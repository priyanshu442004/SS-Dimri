-- Ex-Employee: why the person left (resigned / terminated / other) and a note.
ALTER TABLE "employees" ADD COLUMN "exit_type" VARCHAR(20);
ALTER TABLE "employees" ADD COLUMN "exit_reason" TEXT;
