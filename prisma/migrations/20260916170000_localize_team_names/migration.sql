-- Add localized fields without removing the legacy `name` column. Keeping it
-- makes this migration safe while older API instances are still running.
ALTER TABLE "teams" ADD COLUMN "nameEn" TEXT;
ALTER TABLE "teams" ADD COLUMN "nameAr" TEXT;

UPDATE "teams"
SET "nameEn" = "name",
    "nameAr" = "name"
WHERE "nameEn" IS NULL OR "nameAr" IS NULL;
