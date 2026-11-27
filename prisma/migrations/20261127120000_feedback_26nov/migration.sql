-- Client feedback 26 Nov 2026: spare parts on an asset, and where each team member may mark in
-- (Team timings "Works at", more than one allowed). Additive only.

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "allowed_work_locations" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "asset_spare_parts" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "issued_on" DATE NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_spare_parts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asset_spare_parts_asset_id_idx" ON "asset_spare_parts"("asset_id");

-- AddForeignKey
ALTER TABLE "asset_spare_parts" ADD CONSTRAINT "asset_spare_parts_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "office_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
