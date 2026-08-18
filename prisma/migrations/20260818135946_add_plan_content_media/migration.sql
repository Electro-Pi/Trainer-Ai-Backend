-- CreateTable
CREATE TABLE "plan_content_media" (
    "id" TEXT NOT NULL,
    "contentSnapshotId" TEXT NOT NULL,
    "blobKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "scanStatus" "MediaScanStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_content_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "plan_content_media_contentSnapshotId_idx" ON "plan_content_media"("contentSnapshotId");

-- AddForeignKey
ALTER TABLE "plan_content_media" ADD CONSTRAINT "plan_content_media_contentSnapshotId_fkey" FOREIGN KEY ("contentSnapshotId") REFERENCES "plan_content_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
