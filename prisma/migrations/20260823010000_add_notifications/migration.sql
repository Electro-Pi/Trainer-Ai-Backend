-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SESSION_SCHEDULED', 'SESSION_RESCHEDULED', 'SESSION_CANCELLED', 'PLAN_CONFIRMED', 'INVITE_SENT', 'INVITE_ACCEPTED', 'REPORT_READY');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientPortalUserId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "bodyEn" TEXT,
    "bodyAr" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_organizationId_recipientPortalUserId_readAt_c_idx" ON "notifications"("organizationId", "recipientPortalUserId", "readAt", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientPortalUserId_fkey" FOREIGN KEY ("recipientPortalUserId") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
