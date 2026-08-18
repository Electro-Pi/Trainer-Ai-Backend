-- AlterTable
ALTER TABLE "plan_skill_snapshots"
  ADD COLUMN "descriptionEn" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "descriptionAr" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "category" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "plan_content_snapshots"
  ADD COLUMN "skillSnapshotId" TEXT;

-- CreateIndex
CREATE INDEX "plan_content_snapshots_skillSnapshotId_idx" ON "plan_content_snapshots"("skillSnapshotId");

-- AddForeignKey
ALTER TABLE "plan_content_snapshots" ADD CONSTRAINT "plan_content_snapshots_skillSnapshotId_fkey" FOREIGN KEY ("skillSnapshotId") REFERENCES "plan_skill_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
