-- First-class Department model, replacing the free-text `department` strings
-- previously duplicated independently on `tracks`/`learners` with no FK
-- relationship between them (PRD v1.0 §WS-02/NV-04/PA-06).

CREATE TABLE "departments" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "isEnabled"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "departments_organizationId_name_key" ON "departments"("organizationId", "name");
CREATE INDEX "departments_organizationId_idx" ON "departments"("organizationId");

ALTER TABLE "departments" ADD CONSTRAINT "departments_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill one Department row per distinct (organizationId, department) pair
-- already present on tracks, using cuid-shaped random ids consistent with
-- the app's own id generation (gen_random_uuid() cast to text would not
-- match; a fixed-format synthetic id is fine here since these rows are
-- never referenced before this migration creates them).
INSERT INTO "departments" ("id", "organizationId", "name", "updatedAt")
SELECT DISTINCT ON (t."organizationId", t."department")
  'dept_' || substr(md5(t."organizationId" || t."department"), 1, 20),
  t."organizationId",
  t."department",
  CURRENT_TIMESTAMP
FROM "tracks" t
ON CONFLICT DO NOTHING;

-- Track.department -> Track.departmentId
ALTER TABLE "tracks" ADD COLUMN "departmentId" TEXT;

UPDATE "tracks" t
SET "departmentId" = d."id"
FROM "departments" d
WHERE d."organizationId" = t."organizationId" AND d."name" = t."department";

ALTER TABLE "tracks" ALTER COLUMN "departmentId" SET NOT NULL;
ALTER TABLE "tracks" DROP COLUMN "department";
CREATE INDEX "tracks_departmentId_idx" ON "tracks"("departmentId");
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Learner.department (free text) -> Learner.departmentId (nullable FK).
-- Ensure a Department row exists for every distinct learner department
-- string not already covered by a track's department, then backfill.
INSERT INTO "departments" ("id", "organizationId", "name", "updatedAt")
SELECT DISTINCT ON (l."organizationId", l."department")
  'dept_' || substr(md5(l."organizationId" || l."department"), 1, 20),
  l."organizationId",
  l."department",
  CURRENT_TIMESTAMP
FROM "learners" l
WHERE l."department" IS NOT NULL
ON CONFLICT ("organizationId", "name") DO NOTHING;

ALTER TABLE "learners" ADD COLUMN "departmentId" TEXT;

UPDATE "learners" l
SET "departmentId" = d."id"
FROM "departments" d
WHERE d."organizationId" = l."organizationId" AND d."name" = l."department";

ALTER TABLE "learners" DROP COLUMN "department";
CREATE INDEX "learners_departmentId_idx" ON "learners"("departmentId");
ALTER TABLE "learners" ADD CONSTRAINT "learners_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Team gains a required departmentId — no existing free-text signal to
-- backfill from, so fall back to each org's "General" department (already
-- the dominant bucket among seeded tracks), created if it doesn't exist yet.
INSERT INTO "departments" ("id", "organizationId", "name", "updatedAt")
SELECT DISTINCT ON (o."id")
  'dept_' || substr(md5(o."id" || 'General'), 1, 20),
  o."id",
  'General',
  CURRENT_TIMESTAMP
FROM "organizations" o
JOIN "teams" tm ON tm."organizationId" = o."id"
ON CONFLICT ("organizationId", "name") DO NOTHING;

ALTER TABLE "teams" ADD COLUMN "departmentId" TEXT;

UPDATE "teams" tm
SET "departmentId" = d."id"
FROM "departments" d
WHERE d."organizationId" = tm."organizationId" AND d."name" = 'General';

ALTER TABLE "teams" ALTER COLUMN "departmentId" SET NOT NULL;
CREATE INDEX "teams_departmentId_idx" ON "teams"("departmentId");
ALTER TABLE "teams" ADD CONSTRAINT "teams_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
