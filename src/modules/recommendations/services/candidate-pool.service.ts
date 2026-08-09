import type { ContentItem } from '@/modules/content/content.module.js';
import {
  contentItemRepository,
  contentOutcomeRepository,
} from '@/modules/content/content.module.js';
import type { LearnerOutcome } from '@/modules/learners/learners.module.js';

export type Language = 'EN' | 'AR';

export interface CandidatePoolResult {
  /** Published, language-matched, not-yet-achieved candidates — may include mandatory items outside the top ranking cutoff (`RC-12`). */
  candidates: ContentItem[];
  /** `contentItemId → outcomeId[]` this candidate is bound to, restricted to the learner's required outcome set. */
  boundOutcomesByContent: Map<string, string[]>;
  /** Content ids that are `isMandatory` — force-included regardless of score (`RC-12`). */
  mandatoryContentIds: Set<string>;
}

/**
 * `P6-1` — ARCHITECTURE §8.1 step 1–2: builds the scorable candidate set for
 * one learner assignment. Hard filters are applied here, never by scoring
 * them away downstream (§8.1's own wording): published only, track/level
 * match, language match (`RC-11`), archived excluded (`CM-17`), already-
 * `ACHIEVED` outcomes excluded from the *outcome* set considered (`RC-03`) —
 * a candidate bound only to already-achieved outcomes is dropped entirely.
 */
export class CandidatePoolService {
  async buildPool(params: {
    trackId: string;
    levelId: string;
    language: Language;
    requiredOutcomes: LearnerOutcome[];
    /** `RC-14` — content ids to drop from the pool regardless of score (repeat-failure remediation excluding what was already delivered). */
    excludeContentItemIds?: ReadonlySet<string>;
  }): Promise<CandidatePoolResult> {
    const outstandingOutcomeIds = new Set(
      params.requiredOutcomes.filter((lo) => lo.status !== 'ACHIEVED').map((lo) => lo.outcomeId),
    );

    if (outstandingOutcomeIds.size === 0) {
      return { candidates: [], boundOutcomesByContent: new Map(), mandatoryContentIds: new Set() };
    }

    const published = await contentItemRepository.findCandidates({
      trackId: params.trackId,
      levelId: params.levelId,
      language: params.language,
      status: 'PUBLISHED',
    });

    const bindings = await contentOutcomeRepository.findByContentItems(published.map((c) => c.id));
    const boundOutcomesByContent = new Map<string, string[]>();
    for (const binding of bindings) {
      if (!outstandingOutcomeIds.has(binding.outcomeId)) continue;
      const existing = boundOutcomesByContent.get(binding.contentItemId) ?? [];
      existing.push(binding.outcomeId);
      boundOutcomesByContent.set(binding.contentItemId, existing);
    }

    // `CM-17`: `findCandidates` already filters to PUBLISHED, so no separate
    // archived-exclusion step is needed — ARCHIVED items never reach here.
    const candidates = published.filter(
      (item) => boundOutcomesByContent.has(item.id) && !params.excludeContentItemIds?.has(item.id),
    );
    const mandatoryContentIds = new Set(
      candidates.filter((item) => item.isMandatory).map((item) => item.id),
    );

    return { candidates, boundOutcomesByContent, mandatoryContentIds };
  }
}
