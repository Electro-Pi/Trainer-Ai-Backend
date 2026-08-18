-- AlterTable
ALTER TABLE "tracks" DROP COLUMN "icon";

-- AlterTable
ALTER TABLE "outcomes" DROP COLUMN "trainingForm";

-- AlterTable
ALTER TABLE "content_items" DROP COLUMN "estimatedMinutes",
DROP COLUMN "difficulty",
DROP COLUMN "isMandatory";
