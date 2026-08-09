import { ConflictError, NotFoundError } from '@/common/exceptions/app-error.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { eventBus } from '@/events/event-bus.js';
import {
  assessmentAnswerRepository,
  assessmentRepository,
  rubricCriterionRepository,
  rubricRepository,
} from '@/modules/assessments/assessments.module.js';
import {
  learnerAssignmentRepository,
  learnerOutcomeRepository,
} from '@/modules/learners/learners.module.js';
import { RecommendationService } from '@/modules/recommendations/recommendations.module.js';
import type { Session } from '@/modules/sessions/sessions.module.js';
import {
  sessionContentRepository,
  sessionOutcomeRepository,
  sessionRepository,
} from '@/modules/sessions/sessions.module.js';

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

    await this.updateLearnerOutcomes(
      session,
      verdict,
      totalScore,
      sessionOutcomes.map((so) => so.outcomeId),
    );

    return { session: updatedSession, verdict, totalScore };
  }

  /**
   * `OT-01`…`OT-03`, `OT-05` — every outcome this session touched (the
   * primary plus any carried-over) gets its `LearnerOutcome` row updated:
   * `ACHIEVED` locks in, anything else increments `attemptCount` and, on a
   * genuine repeat (`attemptCount > 1`), publishes `outcome.failed.repeatedly`
   * so `outcome.escalate` notifies the manager (`RC-14`'s trigger — handled
   * by the `OUTCOME_FAILED` recommendation call right here, not deferred to
   * an event handler, since it needs the just-computed verdict).
   */
  private async updateLearnerOutcomes(
    session: Session,
    verdict: 'ACHIEVED' | 'PARTIALLY_ACHIEVED' | 'NOT_ACHIEVED',
    totalScore: number,
    outcomeIds: string[],
  ): Promise<void> {
    const assignment = await learnerAssignmentRepository.findActiveByLearner(session.learnerId);
    if (!assignment) return;

    for (const outcomeId of outcomeIds) {
      const learnerOutcome = await learnerOutcomeRepository.findOne(
        session.learnerId,
        outcomeId,
        assignment.id,
      );
      if (!learnerOutcome) continue;

      const { isRepeatFailure } = await learnerOutcomeRepository.applyVerdict(
        learnerOutcome.id,
        verdict,
        totalScore,
      );

      if (isRepeatFailure) {
        eventBus.publish('outcome.failed.repeatedly', {
          learnerId: session.learnerId,
          organizationId: session.organizationId,
          outcomeId,
          attemptCount: learnerOutcome.attemptCount + 1,
        });

        // `RC-14`, `P8-9` — a repeat failure gets an *alternative* set,
        // excluding whatever this session already delivered, rather than the
        // same ranked list repeated verbatim.
        const deliveredContentIds = new Set(
          (await sessionContentRepository.findBySession(session.id))
            .filter((sc) => sc.deliveredAt !== null)
            .map((sc) => sc.contentItemId),
        );

        await new RecommendationService().generate({
          organizationId: session.organizationId,
          learnerId: session.learnerId,
          trigger: 'OUTCOME_FAILED',
          sessionId: session.id,
          excludeContentItemIds: deliveredContentIds,
        });
      }
    }
  }
}
