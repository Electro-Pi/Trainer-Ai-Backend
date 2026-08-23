-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "externalSessionId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sessions_externalSessionId_key" ON "sessions"("externalSessionId");
