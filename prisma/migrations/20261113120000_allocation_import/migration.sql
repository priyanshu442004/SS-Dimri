-- Client feedback 13 Nov 2026: Team Allocation import (week days, frequency, visit days,
-- overlap flag, remark), Team Leader / Trainee roles, and extra columns kept from imports.
-- Additive only.
-- AlterEnum
ALTER TYPE "SeniorityLevel" ADD VALUE 'TEAM_LEADER';
ALTER TYPE "SeniorityLevel" ADD VALUE 'TRAINEE';

-- CreateEnum
CREATE TYPE "AllocationFrequency" AS ENUM ('DAILY', 'THREE_A_WEEK', 'TWICE_A_WEEK', 'ONCE_A_WEEK', 'TWICE_A_MONTH', 'MONTHLY', 'AS_REQUIRED');

-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "extra_fields" JSONB;

-- AlterTable
ALTER TABLE "team_allocations" ADD COLUMN     "allow_overlap" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "extra_fields" JSONB,
ADD COLUMN     "frequency" "AllocationFrequency",
ADD COLUMN     "remark" TEXT,
ADD COLUMN     "visit_days" VARCHAR(80),
ADD COLUMN     "week_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
