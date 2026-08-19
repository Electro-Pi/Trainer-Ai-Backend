-- AI Trainer integration: SlideDeck + ExternalSession
-- Hand-authored (NOT applied/verified against a live DB — see note below).
--
-- `prisma migrate dev` could not run in this environment: the DB user
-- (`trainer_user`) lacks CREATE DATABASE privilege, which Prisma's shadow-DB
-- workflow requires (P3014). `prisma migrate diff --from-config-datasource`
-- was used to inspect drift against the live DB, but its raw output also
-- included unrelated pre-existing drift (a `content_chunks.embedding` column
-- add and an FK drop/recreate on `learners`/`skills`) tracked separately in
-- memory.md's pgvector recovery notes — that drift is intentionally NOT
-- included here. This file contains ONLY the new AI Trainer tables/columns
-- described in prisma/schema.prisma's `SlideDeck`/`ExternalSession` models
-- and their back-relations, hand-trimmed from that diff.

-- CreateTable
CREATE TABLE "slide_decks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "aiDeckId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "slideCount" INTEGER,
    "generationError" TEXT,
    "downloadUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "slide_decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_sessions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "slideDeckId" TEXT NOT NULL,
    "skillName" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "meetingUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dispatchError" TEXT,
    "currentSlideIndex" INTEGER,
    "maxSlideIndexReached" INTEGER,
    "questionsRecorded" INTEGER,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "external_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slide_decks_aiDeckId_key" ON "slide_decks"("aiDeckId");

-- CreateIndex
CREATE INDEX "slide_decks_skillId_idx" ON "slide_decks"("skillId");

-- CreateIndex
CREATE INDEX "external_sessions_learnerId_idx" ON "external_sessions"("learnerId");

-- CreateIndex
CREATE INDEX "external_sessions_slideDeckId_idx" ON "external_sessions"("slideDeckId");

-- AddForeignKey
ALTER TABLE "slide_decks" ADD CONSTRAINT "slide_decks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slide_decks" ADD CONSTRAINT "slide_decks_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_sessions" ADD CONSTRAINT "external_sessions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_sessions" ADD CONSTRAINT "external_sessions_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "learners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_sessions" ADD CONSTRAINT "external_sessions_slideDeckId_fkey" FOREIGN KEY ("slideDeckId") REFERENCES "slide_decks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
