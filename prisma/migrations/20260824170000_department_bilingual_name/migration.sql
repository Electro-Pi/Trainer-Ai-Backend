-- Department.name -> Department.nameEn + Department.nameAr, matching the
-- nameEn/nameAr pattern Track/Skill/Level already use. Existing rows have no
-- Arabic translation on file, so both columns backfill from the prior single
-- "name" value; an admin can edit nameAr afterward from the Departments screen.

ALTER TABLE "departments" ADD COLUMN "nameEn" TEXT;
ALTER TABLE "departments" ADD COLUMN "nameAr" TEXT;

UPDATE "departments" SET "nameEn" = "name", "nameAr" = "name";

ALTER TABLE "departments" ALTER COLUMN "nameEn" SET NOT NULL;
ALTER TABLE "departments" ALTER COLUMN "nameAr" SET NOT NULL;

DROP INDEX "departments_organizationId_name_key";
ALTER TABLE "departments" DROP COLUMN "name";

CREATE UNIQUE INDEX "departments_organizationId_nameEn_key" ON "departments"("organizationId", "nameEn");
