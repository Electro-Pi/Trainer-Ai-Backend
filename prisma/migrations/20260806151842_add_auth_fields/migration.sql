-- DropIndex
DROP INDEX "content_chunks_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "portal_users" ADD COLUMN     "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "graphHomeAccountId" TEXT,
ADD COLUMN     "graphTokenCacheEncrypted" TEXT,
ADD COLUMN     "lockedUntil" TIMESTAMP(3);
