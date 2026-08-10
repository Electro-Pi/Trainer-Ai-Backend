-- AlterTable
-- Backfill pre-existing rows (submitted before consent tracking existed) with
-- their own `createdAt` as the best-available timestamp, rather than a
-- fabricated "consent given" moment.
ALTER TABLE "demo_requests" ADD COLUMN     "consentGivenAt" TIMESTAMP(3);
UPDATE "demo_requests" SET "consentGivenAt" = "createdAt" WHERE "consentGivenAt" IS NULL;
ALTER TABLE "demo_requests" ALTER COLUMN "consentGivenAt" SET NOT NULL;
