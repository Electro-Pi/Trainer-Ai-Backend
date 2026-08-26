-- `ExternalSession.evaluationPayload`/`transcriptPayload`/`completedAt` were
-- added to schema.prisma for the AI Trainer's session-complete webhook but
-- never got a migration file — every `externalSessions.create()` call in
-- `dispatch-ai-trainer.ts` has been failing in production with "column does
-- not exist", so `Session.externalSessionId` never gets recorded and the
-- webhook 404s on every completed session.

-- AlterTable
ALTER TABLE "external_sessions" ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "evaluationPayload" JSONB,
ADD COLUMN     "transcriptPayload" JSONB;
