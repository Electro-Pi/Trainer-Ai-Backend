-- CreateEnum
CREATE TYPE "PortalRole" AS ENUM ('MANAGER', 'HR', 'CONTENT_MANAGER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('DOCUMENT', 'SLIDES', 'TEXT', 'LINK', 'IMAGE');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'AR');

-- CreateEnum
CREATE TYPE "TrainingForm" AS ENUM ('CONVERSATION', 'CASE', 'SIMULATION', 'ROLEPLAY');

-- CreateEnum
CREATE TYPE "OutcomeStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'NOT_ACHIEVED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'INVITED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "SessionVerdict" AS ENUM ('ACHIEVED', 'PARTIALLY_ACHIEVED', 'NOT_ACHIEVED');

-- CreateEnum
CREATE TYPE "RsvpStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'TENTATIVE');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'OVERRIDDEN', 'REJECTED');

-- CreateEnum
CREATE TYPE "RecommendationTrigger" AS ENUM ('LEVEL_ASSIGNED', 'PLAN_BUILD', 'SESSION_ENDED', 'OUTCOME_FAILED', 'LEVEL_CHANGED', 'MANUAL');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MediaScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'GENERATED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('SESSION', 'PLAN_SUMMARY');

-- CreateEnum
CREATE TYPE "LearnerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "SessionContentSource" AS ENUM ('RECOMMENDED', 'MANUAL', 'IN_SESSION_REMEDIAL');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM', 'AGENT');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "entraTenantId" TEXT,
    "name" TEXT NOT NULL,
    "defaultLanguage" "Language" NOT NULL DEFAULT 'EN',
    "logoUrl" TEXT,
    "reportBranding" JSONB,
    "transcriptRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "auditRetentionDays" INTEGER NOT NULL DEFAULT 730,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portal_users" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entraObjectId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT NOT NULL,
    "role" "PortalRole" NOT NULL,
    "locale" "Language" NOT NULL DEFAULT 'EN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portal_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learners" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "entraObjectId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "jobTitle" TEXT,
    "department" TEXT,
    "preferredLanguage" "Language" NOT NULL DEFAULT 'EN',
    "status" "LearnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_experiences" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "yearsOfExperience" INTEGER NOT NULL,
    "priorTraining" TEXT,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learner_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "targetSkills" TEXT[],
    "trainingForm" "TrainingForm" NOT NULL,
    "impactIndicators" TEXT[],
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outcomes" (
    "id" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL,
    "descriptionAr" TEXT NOT NULL,
    "targetSkills" TEXT[],
    "trainingForm" "TrainingForm" NOT NULL,
    "order" INTEGER NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_assignments" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "learner_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learner_outcomes" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "status" "OutcomeStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastScore" INTEGER,
    "achievedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learner_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "textBody" TEXT,
    "sourceUrl" TEXT,
    "language" "Language" NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "parentVersionId" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "skillTags" TEXT[],
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_outcomes" (
    "contentItemId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,

    CONSTRAINT "content_outcomes_pkey" PRIMARY KEY ("contentItemId","outcomeId")
);

-- CreateTable
CREATE TABLE "content_prerequisites" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "prerequisiteContentId" TEXT,
    "prerequisiteOutcomeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_prerequisites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "blobKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "caption" TEXT,
    "altTextEn" TEXT,
    "altTextAr" TEXT,
    "extractedText" TEXT,
    "pageCount" INTEGER,
    "scanStatus" "MediaScanStatus" NOT NULL DEFAULT 'PENDING',
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_chunks" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "mediaAssetId" TEXT,
    "chunkIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_banks" (
    "id" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "language" "Language" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_banks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "questionBankId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "expectedAnswer" TEXT,
    "modelAnswer" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubrics" (
    "id" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passThreshold" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rubrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rubric_criteria" (
    "id" TEXT NOT NULL,
    "rubricId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "rubric_criteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "sessionId" TEXT,
    "assignmentId" TEXT NOT NULL,
    "trigger" "RecommendationTrigger" NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_items" (
    "id" TEXT NOT NULL,
    "recommendationId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonEn" TEXT NOT NULL,
    "reasonAr" TEXT NOT NULL,
    "signalBreakdown" JSONB NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'PROPOSED',
    "overriddenWithId" TEXT,

    CONSTRAINT "recommendation_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_effectiveness" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "timesDelivered" INTEGER NOT NULL DEFAULT 0,
    "timesAchieved" INTEGER NOT NULL DEFAULT 0,
    "effectivenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastComputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_effectiveness_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_plans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "trainingDays" INTEGER NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "structure" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "primaryOutcomeId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "scheduledStart" TIMESTAMP(3) NOT NULL,
    "scheduledEnd" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "verdict" "SessionVerdict",
    "score" INTEGER,
    "graphEventId" TEXT,
    "joinUrl" TEXT,
    "joinToken" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_outcomes" (
    "sessionId" TEXT NOT NULL,
    "outcomeId" TEXT NOT NULL,
    "isCarriedOver" BOOLEAN NOT NULL DEFAULT false,
    "verdict" "SessionVerdict",
    "score" INTEGER,

    CONSTRAINT "session_outcomes_pkey" PRIMARY KEY ("sessionId","outcomeId")
);

-- CreateTable
CREATE TABLE "session_contents" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "source" "SessionContentSource" NOT NULL DEFAULT 'RECOMMENDED',
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "session_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "graphEventId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rsvpStatus" "RsvpStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),
    "attendanceMinutes" INTEGER,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rubricId" TEXT,
    "totalScore" INTEGER NOT NULL,
    "verdict" "SessionVerdict" NOT NULL,
    "strengths" TEXT NOT NULL,
    "gaps" TEXT NOT NULL,
    "agentNotes" TEXT NOT NULL,
    "transcriptUrl" TEXT,
    "transcriptRetentionUntil" TIMESTAMP(3),
    "recordingConsentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_answers" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "questionId" TEXT,
    "outcomeId" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "criterionScores" JSONB NOT NULL,
    "feedback" TEXT,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT,
    "planId" TEXT,
    "type" "ReportType" NOT NULL,
    "language" "Language" NOT NULL,
    "blobKey" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "generatedAt" TIMESTAMP(3),
    "recipients" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demo_requests" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT,
    "locale" "Language" NOT NULL DEFAULT 'EN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "demo_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" "AuditActorType" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_entraTenantId_key" ON "organizations"("entraTenantId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_entraObjectId_key" ON "portal_users"("entraObjectId");

-- CreateIndex
CREATE INDEX "portal_users_organizationId_idx" ON "portal_users"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_organizationId_email_key" ON "portal_users"("organizationId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_replacedById_key" ON "refresh_tokens"("replacedById");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "teams_organizationId_idx" ON "teams"("organizationId");

-- CreateIndex
CREATE INDEX "teams_managerId_idx" ON "teams"("managerId");

-- CreateIndex
CREATE INDEX "learners_organizationId_idx" ON "learners"("organizationId");

-- CreateIndex
CREATE INDEX "learners_teamId_idx" ON "learners"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "learners_organizationId_entraObjectId_key" ON "learners"("organizationId", "entraObjectId");

-- CreateIndex
CREATE UNIQUE INDEX "learner_experiences_learnerId_key" ON "learner_experiences"("learnerId");

-- CreateIndex
CREATE INDEX "tracks_organizationId_idx" ON "tracks"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_organizationId_key_key" ON "tracks"("organizationId", "key");

-- CreateIndex
CREATE INDEX "levels_trackId_idx" ON "levels"("trackId");

-- CreateIndex
CREATE UNIQUE INDEX "levels_trackId_order_key" ON "levels"("trackId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "levels_trackId_key_key" ON "levels"("trackId", "key");

-- CreateIndex
CREATE INDEX "outcomes_levelId_idx" ON "outcomes"("levelId");

-- CreateIndex
CREATE UNIQUE INDEX "outcomes_levelId_order_key" ON "outcomes"("levelId", "order");

-- CreateIndex
CREATE INDEX "learner_assignments_learnerId_idx" ON "learner_assignments"("learnerId");

-- CreateIndex
CREATE INDEX "learner_assignments_levelId_idx" ON "learner_assignments"("levelId");

-- CreateIndex
CREATE INDEX "learner_outcomes_learnerId_status_idx" ON "learner_outcomes"("learnerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "learner_outcomes_learnerId_outcomeId_assignmentId_key" ON "learner_outcomes"("learnerId", "outcomeId", "assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_parentVersionId_key" ON "content_items"("parentVersionId");

-- CreateIndex
CREATE INDEX "content_items_organizationId_status_trackId_levelId_languag_idx" ON "content_items"("organizationId", "status", "trackId", "levelId", "language");

-- CreateIndex
CREATE INDEX "content_outcomes_outcomeId_idx" ON "content_outcomes"("outcomeId");

-- CreateIndex
CREATE INDEX "content_prerequisites_contentItemId_idx" ON "content_prerequisites"("contentItemId");

-- CreateIndex
CREATE INDEX "media_assets_contentItemId_idx" ON "media_assets"("contentItemId");

-- CreateIndex
CREATE INDEX "content_chunks_contentItemId_idx" ON "content_chunks"("contentItemId");

-- CreateIndex
CREATE INDEX "question_banks_outcomeId_idx" ON "question_banks"("outcomeId");

-- CreateIndex
CREATE UNIQUE INDEX "question_banks_outcomeId_language_key" ON "question_banks"("outcomeId", "language");

-- CreateIndex
CREATE INDEX "questions_questionBankId_idx" ON "questions"("questionBankId");

-- CreateIndex
CREATE INDEX "rubrics_outcomeId_idx" ON "rubrics"("outcomeId");

-- CreateIndex
CREATE INDEX "rubric_criteria_rubricId_idx" ON "rubric_criteria"("rubricId");

-- CreateIndex
CREATE INDEX "recommendations_organizationId_idx" ON "recommendations"("organizationId");

-- CreateIndex
CREATE INDEX "recommendations_learnerId_idx" ON "recommendations"("learnerId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_items_overriddenWithId_key" ON "recommendation_items"("overriddenWithId");

-- CreateIndex
CREATE INDEX "recommendation_items_recommendationId_idx" ON "recommendation_items"("recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "content_effectiveness_contentItemId_outcomeId_key" ON "content_effectiveness"("contentItemId", "outcomeId");

-- CreateIndex
CREATE INDEX "training_plans_organizationId_idx" ON "training_plans"("organizationId");

-- CreateIndex
CREATE INDEX "training_plans_learnerId_idx" ON "training_plans"("learnerId");

-- CreateIndex
CREATE INDEX "plan_templates_organizationId_idx" ON "plan_templates"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_joinToken_key" ON "sessions"("joinToken");

-- CreateIndex
CREATE INDEX "sessions_organizationId_scheduledStart_idx" ON "sessions"("organizationId", "scheduledStart");

-- CreateIndex
CREATE INDEX "sessions_planId_sequence_idx" ON "sessions"("planId", "sequence");

-- CreateIndex
CREATE INDEX "session_contents_sessionId_idx" ON "session_contents"("sessionId");

-- CreateIndex
CREATE INDEX "invitations_sessionId_idx" ON "invitations"("sessionId");

-- CreateIndex
CREATE INDEX "invitations_learnerId_idx" ON "invitations"("learnerId");

-- CreateIndex
CREATE INDEX "assessments_sessionId_idx" ON "assessments"("sessionId");

-- CreateIndex
CREATE INDEX "assessment_answers_assessmentId_idx" ON "assessment_answers"("assessmentId");

-- CreateIndex
CREATE INDEX "reports_organizationId_idx" ON "reports"("organizationId");

-- CreateIndex
CREATE INDEX "reports_sessionId_idx" ON "reports"("sessionId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_entityType_entityId_createdAt_idx" ON "audit_logs"("organizationId", "entityType", "entityId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learners" ADD CONSTRAINT "learners_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learners" ADD CONSTRAINT "learners_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_experiences" ADD CONSTRAINT "learner_experiences_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_experiences" ADD CONSTRAINT "learner_experiences_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "levels" ADD CONSTRAINT "levels_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_assignments" ADD CONSTRAINT "learner_assignments_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_assignments" ADD CONSTRAINT "learner_assignments_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_assignments" ADD CONSTRAINT "learner_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_outcomes" ADD CONSTRAINT "learner_outcomes_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_outcomes" ADD CONSTRAINT "learner_outcomes_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learner_outcomes" ADD CONSTRAINT "learner_outcomes_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "learner_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_parentVersionId_fkey" FOREIGN KEY ("parentVersionId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_outcomes" ADD CONSTRAINT "content_outcomes_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_outcomes" ADD CONSTRAINT "content_outcomes_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_prerequisites" ADD CONSTRAINT "content_prerequisites_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_prerequisites" ADD CONSTRAINT "content_prerequisites_prerequisiteContentId_fkey" FOREIGN KEY ("prerequisiteContentId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_prerequisites" ADD CONSTRAINT "content_prerequisites_prerequisiteOutcomeId_fkey" FOREIGN KEY ("prerequisiteOutcomeId") REFERENCES "outcomes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_chunks" ADD CONSTRAINT "content_chunks_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_chunks" ADD CONSTRAINT "content_chunks_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_banks" ADD CONSTRAINT "question_banks_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_questionBankId_fkey" FOREIGN KEY ("questionBankId") REFERENCES "question_banks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "rubrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "learner_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "portal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_items" ADD CONSTRAINT "recommendation_items_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_items" ADD CONSTRAINT "recommendation_items_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_items" ADD CONSTRAINT "recommendation_items_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_items" ADD CONSTRAINT "recommendation_items_overriddenWithId_fkey" FOREIGN KEY ("overriddenWithId") REFERENCES "recommendation_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_effectiveness" ADD CONSTRAINT "content_effectiveness_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_effectiveness" ADD CONSTRAINT "content_effectiveness_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "learner_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "plan_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "training_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_primaryOutcomeId_fkey" FOREIGN KEY ("primaryOutcomeId") REFERENCES "outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_outcomes" ADD CONSTRAINT "session_outcomes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_outcomes" ADD CONSTRAINT "session_outcomes_outcomeId_fkey" FOREIGN KEY ("outcomeId") REFERENCES "outcomes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_contents" ADD CONSTRAINT "session_contents_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_contents" ADD CONSTRAINT "session_contents_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "rubrics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_answers" ADD CONSTRAINT "assessment_answers_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_planId_fkey" FOREIGN KEY ("planId") REFERENCES "training_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
