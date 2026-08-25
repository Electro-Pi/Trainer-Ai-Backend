import { ConflictError, NotFoundError } from '@/common/exceptions/app-error.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { eventBus } from '@/events/event-bus.js';
import {
  assessmentAnswerRepository,
  assessmentRepository,
  rubricCriterionRepository,
  rubricRepository,
} from '@/modules/assessments/assessments.module.js';
import type { Session } from '@/modules/sessions/sessions.module.js';
import { sessionOutcomeRepository, sessionRepository } from '@/modules/sessions/sessions.module.js';

import { updateLearnerOutcomes } from './update-learner-outcomes.js';
import type { CriterionScoreInput } from './verdict.service.js';
import { VerdictService } from './verdict.service.js';

export interface CompleteSessionResult {
  session: Session;
  verdict: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED';
  totalScore: number;
}

const TERMINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'NO_SHOW']);

/**
 * `P8-8` — ARCHITECTURE §9.1, the highest-value operation in the system.
 * Computes the weighted rubric score from the AI service's per-criterion
 * judgements (D-03 — never trusting a score they compute), derives a
 * verdict, writes it atomically alongside every `SessionOutcome` and the
 * `Session` itself (`SessionRepository.completeSession`), then updates each
 * `LearnerOutcome` (a *separate* transaction, keyed differently — see that
 * method's own doc comment), and only *after* all of that commits does it
 * publish `session.completed` (non-negotiable 4d — never inside the write).
 */
export class CompleteSessionService {
  private readonly verdicts = new VerdictService();

  async complete(sessionId: string, rubricIdOverride?: string): Promise<CompleteSessionResult> {
    const raw = await sessionRepository.findOrganizationIdForSession(sessionId);
    if (!raw) throw new NotFoundError('Session not found');

    const result = await runWithTenant(raw.organizationId, () =>
      this.completeWithinTenant(sessionId, rubricIdOverride),
    );

    // Publish-after-commit (non-negotiable 4d) — everything above this line
    // already committed via `SessionRepository.completeSession` and the
    // per-outcome `applyVerdict` calls.
    eventBus.publish('session.completed', {
      sessionId: result.session.id,
      organizationId: raw.organizationId,
      learnerId: result.session.learnerId,
      verdict: result.verdict,
    });

    return result;
  }

  private async completeWithinTenant(
    sessionId: string,
    rubricIdOverride: string | undefined,
  ): Promise<CompleteSessionResult> {
    const session = await sessionRepository.findByIdScoped(sessionId);
    if (!session) throw new NotFoundError('Session not found');
    if (TERMINAL_STATUSES.has(session.status)) {
      throw new ConflictError(`Session is already in a terminal state (${session.status})`);
    }

    const assessment = await assessmentRepository.findOrCreateForSession(session.id);
    const answers = await assessmentAnswerRepository.findByAssessment(assessment.id);

    const rubric = rubricIdOverride
      ? await rubricRepository.findById(rubricIdOverride)
      : await rubricRepository.findActiveByOutcome(session.primaryOutcomeId);
    if (!rubric) {
      throw new ConflictError(
        'No active rubric for this session’s outcome — cannot derive a verdict',
      );
    }
    const criteria = await rubricCriterionRepository.findByRubric(rubric.id);

    const criterionScoresPerAnswer: CriterionScoreInput[][] = answers.map(
      (a) => a.criterionScores as unknown as CriterionScoreInput[],
    );
    const totalScore = this.verdicts.computeWeightedScore(criterionScoresPerAnswer, criteria);
    const verdict = this.verdicts.deriveVerdict(totalScore, rubric.passThreshold);

    const sessionOutcomes = await sessionOutcomeRepository.findBySession(session.id);
    const sessionOutcomeVerdicts = sessionOutcomes.map((so) => ({
      outcomeId: so.outcomeId,
      verdict,
      score: totalScore,
    }));

    const updatedSession = await sessionRepository.completeSession({
      sessionId: session.id,
      assessmentId: assessment.id,
      organizationId: session.organizationId,
      verdict,
      totalScore,
      sessionOutcomeVerdicts,
    });

    await updateLearnerOutcomes(
      session,
      verdict,
      totalScore,
      sessionOutcomes.map((so) => so.outcomeId),
    );

    return { session: updatedSession, verdict, totalScore };
  }
}
