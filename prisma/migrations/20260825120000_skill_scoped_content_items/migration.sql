-- Content restructure: ContentItem moves from Track+Level scoping to a
-- required, direct Skill relation. Drops the review/publish/version workflow,
-- text/link content types, and the content_outcomes M2M tagging table.
-- Existing content_items rows predate skill-scoping and have no reliable
-- skill to backfill onto, so they are removed rather than guessed at
-- (dev/demo-scale data only).

-- DropForeignKey
ALTER TABLE "content_outcomes" DROP CONSTRAINT "content_outcomes_contentItemId_fkey";
ALTER TABLE "content_outcomes" DROP CONSTRAINT "content_outcomes_outcomeId_fkey";

-- DropTable
DROP TABLE "content_outcomes";

-- DropForeignKey (self-referencing version chain no longer exists)
ALTER TABLE "content_items" DROP CONSTRAINT "content_items_parentVersionId_fkey";
ALTER TABLE "content_items" DROP CONSTRAINT "content_items_trackId_fkey";
ALTER TABLE "content_items" DROP CONSTRAINT "content_items_levelId_fkey";

-- Existing content predates skill-scoping; no safe backfill for the new
-- required skillId, so old rows (and everything that cascades from them)
-- are cleared before the column lands.
DELETE FROM "session_contents";
DELETE FROM "content_effectiveness";
DELETE FROM "recommendation_items";
DELETE FROM "content_chunks";
DELETE FROM "media_assets";
DELETE FROM "content_prerequisites";
DELETE FROM "content_items";

-- AlterTable
ALTER TABLE "content_items"
  DROP COLUMN "title",
  DROP COLUMN "trackId",
  DROP COLUMN "levelId",
  DROP COLUMN "contentType",
  DROP COLUMN "textBody",
  DROP COLUMN "sourceUrl",
  DROP COLUMN "language",
  DROP COLUMN "status",
  DROP COLUMN "version",
  DROP COLUMN "parentVersionId",
  DROP COLUMN "skillTags",
  DROP COLUMN "publishedAt",
  DROP COLUMN "archivedAt",
  ADD COLUMN "skillId" TEXT NOT NULL,
  ADD COLUMN "name" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "content_items_organizationId_skillId_idx" ON "content_items"("organizationId", "skillId");

-- AlterTable (outcomes: English-only titles)
ALTER TABLE "outcomes" DROP COLUMN "titleAr";
