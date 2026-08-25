import { NotFoundError } from '@/common/exceptions/app-error.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { eventBus } from '@/events/event-bus.js';
import { updateLearnerOutcomes } from '@/modules/agent/agent.module.js';
import { assessmentRepository } from '@/modules/assessments/assessments.module.js';
import { sessionOutcomeRepository, sessionRepository } from '@/modules/sessions/sessions.module.js';

import type { WebhookSessionCompleteRequestDto } from '../dto/ai-trainer.dto.js';
import { ExternalSessionRepository } from '../repositories/external-session.repository.js';

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

type Verdict = 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED';

/**
 * Score bands agreed with the user for mapping the AI Trainer's
 * `trainee_view.overall_score`/`passed` onto our verdict enum — this flow
 * has no rubric of our own to derive one from (see the service's own doc
 * comment for why).
 */
function deriveVerdict(overallScore: number, passed: boolean): Verdict {
  if (passed && overallScore >= 80) return 'ACHIEVED';
  if (passed) return 'PARTIALLY_ACHIEVED';
  return 'NOT_ACHIEVED';
}

export interface ExternalSessionCompleteResult {
  sessionId: string;
  verdict: Verdict;
}

/**
 * Backs `POST /external-sessions/:id/complete` — the AI Trainer's webhook,
 * fired once when a Teams-meeting-dispatched session ends. This is the ONLY
 * signal our backend gets that such a session is over (nothing here polls or
 * detects meeting-end on its own), so this call has to do everything
 * `CompleteSessionService.complete()` does for the other (joinToken/agent)
 * flow: persist the result, complete the `Session`, update `LearnerOutcome`
 * rows, and publish `session.completed` so the existing report pipeline
 * (`session-completed-handlers.ts`) fires.
 *
 * Deliberately bypasses `CompleteSessionService`/`VerdictService` — that
 * path requires an active `Rubric` and per-answer `criterionScores` this
 * flow never produces (there's no `submitAnswer` loop for a Teams-dispatched
 * session). The AI Trainer's own evaluation is authoritative here instead.
 */
export class ExternalSessionCompleteService {
  // Local instance, not the shared `ai-trainer.module.ts` singleton —
  // importing that module here would create a require cycle (this file is
  // itself reached from that module's route wiring).
  private readonly externalSessions = new ExternalSessionRepository();

  async complete(
    externalSessionId: string,
    payload: WebhookSessionCompleteRequestDto,
  ): Promise<ExternalSessionCompleteResult | { alreadyCompleted: true }> {
    const session = await sessionRepository.findByExternalSessionId(externalSessionId);
    if (!session) {
      throw new NotFoundError(`No session found for externalSessionId "${externalSessionId}"`);
    }

    if (TERMINAL_STATUSES.has(session.status)) {
      // Idempotent — the AI team may retry this call; a session we've
      // already completed (from a prior call) is a safe no-op, not an error.
      return { alreadyCompleted: true };
    }

    return runWithTenant(session.organizationId, async () => {
      await this.externalSessions.completeExternal(externalSessionId, {
        evaluationPayload: payload.evaluation,
        transcriptPayload: payload.transcript,
      });

      const { trainee_view: traineeView } = payload.evaluation;
      const verdict = deriveVerdict(traineeView.overall_score, traineeView.passed);

      const assessment = await assessmentRepository.findOrCreateForSession(session.id);
      const sessionOutcomes = await sessionOutcomeRepository.findBySession(session.id);
      const sessionOutcomeVerdicts = sessionOutcomes.map((so) => ({
        outcomeId: so.outcomeId,
        verdict,
        score: traineeView.overall_score,
      }));

      const updatedSession = await sessionRepository.completeSession({
        sessionId: session.id,
        assessmentId: assessment.id,
        organizationId: session.organizationId,
        verdict,
        totalScore: traineeView.overall_score,
        sessionOutcomeVerdicts,
      });

      await updateLearnerOutcomes(
        updatedSession,
        verdict,
        traineeView.overall_score,
        sessionOutcomes.map((so) => so.outcomeId),
      );

      // Publish-after-commit — everything above already committed via
      // `completeSession`/`updateLearnerOutcomes`, same non-negotiable
      // ordering as `CompleteSessionService.complete()`.
      eventBus.publish('session.completed', {
        sessionId: updatedSession.id,
        organizationId: session.organizationId,
        learnerId: updatedSession.learnerId,
        verdict,
      });

      return { sessionId: updatedSession.id, verdict };
    });
  }
}
