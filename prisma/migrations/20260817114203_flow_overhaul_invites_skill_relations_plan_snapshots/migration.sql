-- CreateEnum
CREATE TYPE "PortalInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "outcomes" ADD COLUMN     "skillId" TEXT;

-- CreateTable
CREATE TABLE "portal_invites" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "PortalRole" NOT NULL,
    "invitedById" TEXT NOT NULL,
    "status" "PortalInviteStatus" NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_skills" (
    "trackId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_skills_pkey" PRIMARY KEY ("trackId","skillId")
);

-- CreateTable
CREATE TABLE "plan_track_snapshots" (
    "id" TEXT NOT NULL,
    "trainingPlanId" TEXT NOT NULL,
    "sourceTrackId" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_track_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_skill_snapshots" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceSkillId" TEXT,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "isRemoved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_skill_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_outcome_snapshots" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "skillSnapshotId" TEXT NOT NULL,
    "sourceOutcomeId" TEXT,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isRemoved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_outcome_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_learner_outcome_snapshots" (
    "id" TEXT NOT NULL,
    "outcomeSnapshotId" TEXT NOT NULL,
    "status" "OutcomeStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastScore" INTEGER,
    "achievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_learner_outcome_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_content_snapshots" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "sourceContentId" TEXT,
    "title" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "sourceUrl" TEXT,
    "textBody" TEXT,
    "isRemoved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_content_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_invites_token_key" ON "portal_invites"("token");

-- CreateIndex
CREATE INDEX "portal_invites_organizationId_idx" ON "portal_invites"("organizationId");

-- CreateIndex
CREATE INDEX "portal_invites_email_idx" ON "portal_invites"("email");

-- CreateIndex
CREATE INDEX "track_skills_skillId_idx" ON "track_skills"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_track_snapshots_trainingPlanId_key" ON "plan_track_snapshots"("trainingPlanId");

-- CreateIndex
CREATE INDEX "plan_skill_snapshots_snapshotId_idx" ON "plan_skill_snapshots"("snapshotId");

-- CreateIndex
CREATE INDEX "plan_outcome_snapshots_snapshotId_idx" ON "plan_outcome_snapshots"("snapshotId");

-- CreateIndex
CREATE INDEX "plan_outcome_snapshots_skillSnapshotId_idx" ON "plan_outcome_snapshots"("skillSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_learner_outcome_snapshots_outcomeSnapshotId_key" ON "plan_learner_outcome_snapshots"("outcomeSnapshotId");

-- CreateIndex
CREATE INDEX "plan_content_snapshots_snapshotId_idx" ON "plan_content_snapshots"("snapshotId");

-- CreateIndex
CREATE INDEX "outcomes_skillId_idx" ON "outcomes"("skillId");

-- AddForeignKey
ALTER TABLE "portal_invites" ADD CONSTRAINT "portal_invites_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_invites" ADD CONSTRAINT "portal_invites_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_skills" ADD CONSTRAINT "track_skills_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_skills" ADD CONSTRAINT "track_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_track_snapshots" ADD CONSTRAINT "plan_track_snapshots_trainingPlanId_fkey" FOREIGN KEY ("trainingPlanId") REFERENCES "training_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_skill_snapshots" ADD CONSTRAINT "plan_skill_snapshots_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "plan_track_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_outcome_snapshots" ADD CONSTRAINT "plan_outcome_snapshots_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "plan_track_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_outcome_snapshots" ADD CONSTRAINT "plan_outcome_snapshots_skillSnapshotId_fkey" FOREIGN KEY ("skillSnapshotId") REFERENCES "plan_skill_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_learner_outcome_snapshots" ADD CONSTRAINT "plan_learner_outcome_snapshots_outcomeSnapshotId_fkey" FOREIGN KEY ("outcomeSnapshotId") REFERENCES "plan_outcome_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_content_snapshots" ADD CONSTRAINT "plan_content_snapshots_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "plan_track_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

