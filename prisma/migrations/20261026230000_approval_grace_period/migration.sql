-- Grace period for accounts awaiting approval (owner decision, 26 Oct 2026). Additive.
-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "approval_grace_days" INTEGER NOT NULL DEFAULT 7;

-- Hand-written check (not modelled by Prisma, causes no drift): 0-90 days.
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_approval_grace_days_check" CHECK ("approval_grace_days" BETWEEN 0 AND 90);
