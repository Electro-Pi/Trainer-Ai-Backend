import { eventBus } from '@/events/event-bus.js';
import type { LearnerOutcome } from '@/modules/learners/learners.module.js';
import type { Outcome } from '@/modules/outcomes/outcomes.module.js';

import type { ScoredItem } from './scorer.service.js';

export interface CoverageGap {
  outcomeId: string;
  outcomeTitleEn: string;
  outcomeTitleAr: string;
}

/**
 * `P6-7` — ARCHITECTURE §8.1 step 7, `RC-10`/`CM-13`. A required outcome the
 * candidate pool produced zero recommendation items for (no PUBLISHED
 * content bound to it in this track/level/language) is a coverage gap. Never
 * silently dropped — surfaced on the response *and* published as an event so
 * a manager-notification handler (P9) picks it up without this service
 * needing to know how notification delivery works.
 */
export class CoverageGapService {
  detect(
    requiredOutcomes: LearnerOutcome[],
    outcomesById: Map<string, Outcome>,
    scoredItems: ScoredItem[],
  ): CoverageGap[] {
    const outstandingOutcomeIds = requiredOutcomes
      .filter((lo) => lo.status !== 'ACHIEVED')
      .map((lo) => lo.outcomeId);

    const coveredOutcomeIds = new Set(scoredItems.map((item) => item.outcomeId));

    return outstandingOutcomeIds
      .filter((outcomeId) => !coveredOutcomeIds.has(outcomeId))
      .map((outcomeId) => outcomesById.get(outcomeId))
      .filter((outcome): outcome is Outcome => outcome !== undefined)
      .map((outcome) => ({
        outcomeId: outcome.id,
        outcomeTitleEn: outcome.titleEn,
        outcomeTitleAr: outcome.titleAr,
      }));
  }

  notify(params: {
    recommendationId: string;
    organizationId: string;
    learnerId: string;
    gaps: CoverageGap[];
  }): void {
    if (params.gaps.length === 0) return;

    eventBus.publish('recommendation.coverage_gap', {
      recommendationId: params.recommendationId,
      organizationId: params.organizationId,
      learnerId: params.learnerId,
      outcomeIds: params.gaps.map((gap) => gap.outcomeId),
    });
  }
}
