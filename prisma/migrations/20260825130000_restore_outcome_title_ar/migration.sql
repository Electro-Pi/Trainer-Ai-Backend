-- Restores Outcome.titleAr, dropped by the prior content restructure
-- migration in error — the English-only decision applies to the new
-- ContentItem.name field, not to outcomes across the rest of the app
-- (reports, public catalogue, training-plan snapshots all display it).
-- Existing rows have no Arabic value to backfill from, so titleEn stands in
-- until re-translated.

-- AlterTable
ALTER TABLE "outcomes" ADD COLUMN "titleAr" TEXT;

UPDATE "outcomes" SET "titleAr" = "titleEn" WHERE "titleAr" IS NULL;

ALTER TABLE "outcomes" ALTER COLUMN "titleAr" SET NOT NULL;
