import { NotFoundError } from '@/common/exceptions/app-error.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { eventBus } from '@/events/event-bus.js';
import { logger } from '@/logger/logger.service.js';
import { updateLearnerOutcomes } from '@/modules/agent/agent.module.js';
import { assessmentRepository } from '@/modules/assessments/assessments.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { sessionOutcomeRepository, sessionRepository } from '@/modules/sessions/sessions.module.js';

import type {
  WebhookSessionCompleteRequestDto,
  WebhookTraineeView,
} from '../dto/ai-trainer.dto.js';
import { ExternalSessionRepository } from '../repositories/external-session.repository.js';

import { mapOutcomeResults } from './outcome-result-mapper.js';

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

  /**
   * Per-outcome verdicts from `trainee_view.outcome_results[]`, so each card
   * in the session report reflects how the learner did on THAT outcome
   * instead of every row repeating `overall_score`.
   *
   * The AI payload keys outcomes by free-text label only, so the join is a
   * normalised title match (see `mapOutcomeResults`). An outcome we can't
   * match keeps the session-level verdict/score as a fallback — a stale flat
   * score is less harmful than dropping the row, which would make the
   * outcome disappear from the report entirely — and is logged so the
   * mismatch is visible rather than silent.
   */
  private async buildOutcomeVerdicts(
    sessionId: string,
    outcomeIds: string[],
    traineeView: WebhookTraineeView,
    sessionVerdict: Verdict,
  ): Promise<Array<{ outcomeId: string; verdict: Verdict; score: number }>> {
    const aiResults = traineeView.outcome_results ?? [];
    if (aiResults.length === 0) {
      logger.warn(
        { sessionId, outcomeCount: outcomeIds.length },
        'AI Trainer evaluation carried no outcome_results; falling back to the session-level score for every outcome',
      );
      return outcomeIds.map((outcomeId) => ({
        outcomeId,
        verdict: sessionVerdict,
        score: traineeView.overall_score,
      }));
    }

    const outcomes = await outcomeRepository.findManyByIdsScoped(outcomeIds);
    const titleById = new Map(outcomes.map((o) => [o.id, o]));

    const { verdicts, unmatchedOutcomeIds, unmatchedAiLabels } = mapOutcomeResults(
      outcomeIds.map((outcomeId) => ({
        outcomeId,
        titleEn: titleById.get(outcomeId)?.titleEn ?? '',
        titleAr: titleById.get(outcomeId)?.titleAr ?? '',
      })),
      aiResults,
    );

    if (unmatchedOutcomeIds.length > 0 || unmatchedAiLabels.length > 0) {
      logger.warn(
        { sessionId, unmatchedOutcomeIds, unmatchedAiLabels },
        'Could not match every AI Trainer outcome_result to a session outcome by title; unmatched outcomes keep the session-level score',
      );
    }

    return [
      ...verdicts,
      ...unmatchedOutcomeIds.map((outcomeId) => ({
        outcomeId,
        verdict: sessionVerdict,
        score: traineeView.overall_score,
      })),
    ];
  }

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
      const sessionOutcomeVerdicts = await this.buildOutcomeVerdicts(
        session.id,
        sessionOutcomes.map((so) => so.outcomeId),
        traineeView,
        verdict,
      );

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
