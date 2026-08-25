import { eventBus } from '@/events/event-bus.js';
import {
  learnerAssignmentRepository,
  learnerOutcomeRepository,
} from '@/modules/learners/learners.module.js';
import { RecommendationService } from '@/modules/recommendations/recommendations.module.js';
import type { Session } from '@/modules/sessions/sessions.module.js';
import { sessionContentRepository } from '@/modules/sessions/sessions.module.js';

/**
 * `OT-01`…`OT-03`, `OT-05` — every outcome a completed session touched (the
 * primary plus any carried-over) gets its `LearnerOutcome` row updated:
 * `ACHIEVED` locks in, anything else increments `attemptCount` and, on a
 * genuine repeat (`attemptCount > 1`), publishes `outcome.failed.repeatedly`
 * so `outcome.escalate` notifies the manager (`RC-14`'s trigger — handled by
 * the `OUTCOME_FAILED` recommendation call right here, not deferred to an
 * event handler, since it needs the just-computed verdict).
 *
 * Extracted from `CompleteSessionService` so both the rubric-scored
 * completion flow and the AI-Trainer-webhook completion flow
 * (`external-session-complete.service.ts`) share the exact same
 * outcome-tracking/escalation behavior after marking a session complete.
 */
export async function updateLearnerOutcomes(
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
