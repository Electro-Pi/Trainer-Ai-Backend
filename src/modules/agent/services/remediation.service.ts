import { NotFoundError } from '@/common/exceptions/app-error.js';
import { runWithTenant } from '@/database/tenant-context.js';
import type { ContentItem } from '@/modules/content/content.module.js';
import {
  contentItemRepository,
  contentOutcomeRepository,
} from '@/modules/content/content.module.js';
import {
  learnerAssignmentRepository,
  learnerRepository,
} from '@/modules/learners/learners.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
import { sessionContentRepository, sessionRepository } from '@/modules/sessions/sessions.module.js';

const MAX_REMEDIAL_ITEMS = 2;

export interface RemediationResult {
  contentItemId: string;
  title: string;
  contentType: string;
  textBody: string | null;
  sourceUrl: string | null;
}

/**
 * `RC-07`, ARCHITECTURE §8.3 — the in-session remediation pipeline. Target
 * < 2s, hence deterministic filtering, no scoring signals, no vector query,
 * no LLM round-trip: same outcome, excludes anything already delivered in
 * this session. `ContentItem.difficulty` was removed from the schema, so the
 * "no harder than what's already been delivered" difficulty ceiling no
 * longer applies — candidates are taken in the order `findCandidates`
 * returns them, capped at `MAX_REMEDIAL_ITEMS`.
 */
export class RemediationService {
  async find(sessionId: string, outcomeId: string): Promise<RemediationResult[]> {
    const raw = await sessionRepository.findOrganizationIdForSession(sessionId);
    if (!raw) throw new NotFoundError('Session not found');

    return runWithTenant(raw.organizationId, async () => {
      const session = await sessionRepository.findByIdScoped(sessionId);
      if (!session) throw new NotFoundError('Session not found');

      const learner = await learnerRepository.findByIdScoped(session.learnerId);
      if (!learner) throw new NotFoundError('Learner not found');

      const outcome = await outcomeRepository.findByIdScoped(outcomeId);
      if (!outcome) throw new NotFoundError('Outcome not found');

      const assignment = await learnerAssignmentRepository.findActiveByLearner(session.learnerId);
      if (!assignment) throw new NotFoundError('Learner has no active level assignment');

      const sessionContents = await sessionContentRepository.findBySession(session.id);
      const deliveredContentIds = new Set(
        sessionContents.filter((sc) => sc.deliveredAt !== null).map((sc) => sc.contentItemId),
      );

      const boundContentIds = new Set(
        (await contentOutcomeRepository.findByOutcome(outcomeId)).map((b) => b.contentItemId),
      );

      const candidates = await contentItemRepository.findCandidates({
        trackId: assignment.trackId,
        levelId: outcome.levelId,
        language: learner.preferredLanguage,
      });

      const ranked = candidates
        .filter((item) => boundContentIds.has(item.id))
        .filter((item) => !deliveredContentIds.has(item.id))
        .slice(0, MAX_REMEDIAL_ITEMS);

      return ranked.map((item) => this.toResult(item));
    });
  }

  private toResult(item: ContentItem): RemediationResult {
    return {
      contentItemId: item.id,
      title: item.title,
      contentType: item.contentType,
      textBody: item.textBody,
      sourceUrl: item.sourceUrl,
    };
  }
}
