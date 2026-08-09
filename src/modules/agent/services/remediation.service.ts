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

const DIFFICULTY_RANK: Record<string, number> = { EASY: 0, MEDIUM: 1, HARD: 2 };
const DEFAULT_DIFFICULTY_CEILING = DIFFICULTY_RANK['EASY'] as number;
const MAX_REMEDIAL_ITEMS = 2;

export interface RemediationResult {
  contentItemId: string;
  title: string;
  contentType: string;
  textBody: string | null;
  sourceUrl: string | null;
  difficulty: string;
  estimatedMinutes: number;
}

/**
 * `RC-07`, ARCHITECTURE §8.3 — the in-session remediation pipeline. Target
 * < 2s, hence deterministic filtering + sort, no scoring signals, no vector
 * query, no LLM round-trip: same outcome, no harder than what's already been
 * delivered this session (defaults to `EASY`-only if nothing delivered yet
 * — the agent is reporting a failed check, so easing off is the point), and
 * excludes anything already delivered in this session.
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
      const deliveredContentItems = await contentItemRepository.findManyByIdsScoped([
        ...deliveredContentIds,
      ]);
      const difficultyCeiling = deliveredContentItems.length
        ? Math.max(...deliveredContentItems.map((c) => DIFFICULTY_RANK[c.difficulty] ?? 2))
        : DEFAULT_DIFFICULTY_CEILING;

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
        .filter((item) => (DIFFICULTY_RANK[item.difficulty] ?? 2) <= difficultyCeiling)
        .sort((a, b) => (DIFFICULTY_RANK[a.difficulty] ?? 2) - (DIFFICULTY_RANK[b.difficulty] ?? 2))
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
      difficulty: item.difficulty,
      estimatedMinutes: item.estimatedMinutes,
    };
  }
}
