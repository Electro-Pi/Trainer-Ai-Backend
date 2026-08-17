-- AlterTable
ALTER TABLE "plan_skill_snapshots" DROP COLUMN "difficulty",
ADD COLUMN     "levels" TEXT[];

