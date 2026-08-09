import { ConflictError, NotFoundError } from '@/common/exceptions/app-error.js';
import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { runWithTenant } from '@/database/tenant-context.js';
import {
  assessmentAnswerRepository,
  assessmentRepository,
} from '@/modules/assessments/assessments.module.js';
import type { Session } from '@/modules/sessions/sessions.module.js';
import { sessionContentRepository, sessionRepository } from '@/modules/sessions/sessions.module.js';

export interface SubmitAnswerInput {
  questionId?: string | undefined;
  outcomeId: string;
  questionText: string;
  answerText: string;
  score: number;
  maxScore: number;
  criterionScores: { criterionId: string; score: number; maxScore: number; judgement: string }[];
  feedback?: string | undefined;
}

export interface SubmitNotesInput {
  strengths: string;
  gaps: string;
  agentNotes: string;
}

/**
 * `P8-4`…`P8-7` — the Agent Session API's write path once the AI service has
 * pulled context (`P8-3`) and starts reporting back. Every method resolves
 * the session by id (not `joinToken` — the token was already spent to fetch
 * context, ARCHITECTURE §7.5) inside `runWithTenant`, since the service-token
 * guard has no `req.auth.orgId` to seed the tenant context with the way a
 * portal-user JWT would (only the session row itself carries `organizationId`).
 */
export class AgentSessionService {
  private async withSession<T>(
    sessionId: string,
    fn: (session: Session) => Promise<T>,
  ): Promise<T> {
    const raw = await sessionRepository.findOrganizationIdForSession(sessionId);
    if (!raw) throw new NotFoundError('Session not found');

    return runWithTenant(raw.organizationId, async () => {
      const session = await sessionRepository.findByIdScoped(sessionId);
      if (!session) throw new NotFoundError('Session not found');
      return fn(session);
    });
  }

  async start(sessionId: string): Promise<Session> {
    return this.withSession(sessionId, async (session) => {
      if (session.status === 'IN_PROGRESS') return session;
      if (session.status !== 'INVITED' && session.status !== 'SCHEDULED') {
        throw new ConflictError(`Cannot start a session in status ${session.status}`);
      }

      const updated = await sessionRepository.update(session.id, {
        status: 'IN_PROGRESS',
        startedAt: new Date(),
      } as never);

      await writeAuditLog({
        organizationId: session.organizationId,
        actorType: 'AGENT',
        action: 'session.started',
        entityType: 'Session',
        entityId: session.id,
      });

      return updated;
    });
  }

  async markContentDelivered(sessionId: string, sessionContentId: string): Promise<void> {
    await this.withSession(sessionId, async (session) => {
      const items = await sessionContentRepository.findBySession(session.id);
      const item = items.find((i) => i.id === sessionContentId);
      if (!item) {
        throw new NotFoundError('Session content item not found for this session');
      }
      await sessionContentRepository.markDelivered(sessionContentId);
    });
  }

  /** `LS-05`, `LS-06` — persists the agent's answer + per-criterion judgements as-is (§9.11 D-03: we don't re-derive anything here, `complete` computes the weighted total). */
  async submitAnswer(sessionId: string, input: SubmitAnswerInput): Promise<void> {
    await this.withSession(sessionId, async (session) => {
      const assessment = await assessmentRepository.findOrCreateForSession(session.id);
      await assessmentAnswerRepository.create({
        assessmentId: assessment.id,
        questionId: input.questionId ?? null,
        outcomeId: input.outcomeId,
        questionText: input.questionText,
        answerText: input.answerText,
        score: input.score,
        maxScore: input.maxScore,
        criterionScores: input.criterionScores,
        feedback: input.feedback ?? null,
      } as never);

      await writeAuditLog({
        organizationId: session.organizationId,
        actorType: 'AGENT',
        action: 'session.answer_submitted',
        entityType: 'Session',
        entityId: session.id,
        after: { outcomeId: input.outcomeId, score: input.score, maxScore: input.maxScore },
      });
    });
  }

  async submitNotes(sessionId: string, input: SubmitNotesInput): Promise<void> {
    await this.withSession(sessionId, async (session) => {
      const assessment = await assessmentRepository.findOrCreateForSession(session.id);
      await assessmentRepository.update(assessment.id, {
        strengths: input.strengths,
        gaps: input.gaps,
        agentNotes: input.agentNotes,
      } as never);

      await writeAuditLog({
        organizationId: session.organizationId,
        actorType: 'AGENT',
        action: 'session.notes_submitted',
        entityType: 'Session',
        entityId: session.id,
      });
    });
  }

  /**
   * `LS-10` — stores the transcript text directly on `Assessment.transcriptUrl`
   * would be wrong (that field is a blob pointer, not inline text); the
   * transcript is uploaded to storage by the caller (controller) and only the
   * resulting key/consent timestamp land here. `recordingConsentAt` is set
   * only when consent was actually given (NFR *Privacy* — no lawful basis to
   * retain a transcript otherwise); `transcriptRetentionUntil` is computed
   * from the org's retention window so `cleanup` (§10.1) knows when to purge it.
   */
  async submitTranscript(
    sessionId: string,
    transcriptUrl: string,
    recordingConsentGiven: boolean,
    retentionDays: number,
  ): Promise<void> {
    await this.withSession(sessionId, async (session) => {
      const assessment = await assessmentRepository.findOrCreateForSession(session.id);
      const now = new Date();
      await assessmentRepository.update(assessment.id, {
        transcriptUrl,
        recordingConsentAt: recordingConsentGiven ? now : null,
        transcriptRetentionUntil: recordingConsentGiven
          ? new Date(now.getTime() + retentionDays * 86_400_000)
          : null,
      } as never);

      await writeAuditLog({
        organizationId: session.organizationId,
        actorType: 'AGENT',
        action: 'session.transcript_submitted',
        entityType: 'Session',
        entityId: session.id,
        after: { recordingConsentGiven },
      });
    });
  }
}
