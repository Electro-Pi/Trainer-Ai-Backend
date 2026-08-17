-- Skill ownership moves from Track-level (the `track_skills` join table) to
-- Level-level, matching PRD v1.0's Track->Level->Skill->Outcome hierarchy.
-- Real-data check: 0 rows in track_skills, 0 Outcome.skillId set anywhere —
-- nothing to backfill, so Skill.levelId lands nullable with no data migration.

ALTER TABLE "track_skills" DROP CONSTRAINT IF EXISTS "track_skills_trackId_fkey";
ALTER TABLE "track_skills" DROP CONSTRAINT IF EXISTS "track_skills_skillId_fkey";
DROP TABLE "track_skills";

ALTER TABLE "skills" DROP COLUMN "targetTracks";
ALTER TABLE "skills" ADD COLUMN "levelId" TEXT;

CREATE INDEX "skills_levelId_idx" ON "skills"("levelId");
ALTER TABLE "skills" ADD CONSTRAINT "skills_levelId_fkey"
  FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
