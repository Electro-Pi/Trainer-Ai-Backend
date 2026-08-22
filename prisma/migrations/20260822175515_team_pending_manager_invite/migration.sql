-- AlterTable
ALTER TABLE "teams" ALTER COLUMN "managerId" DROP NOT NULL,
ADD COLUMN     "pendingManagerInviteId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "teams_pendingManagerInviteId_key" ON "teams"("pendingManagerInviteId");
