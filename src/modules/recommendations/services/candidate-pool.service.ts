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

  /**
   * Snapshot-scoped equivalent of `buildPool` for a plan whose track has
   * been copied via `PlanSnapshotService` (wizard step2). `outcomeId`s in
   * the returned pool are `PlanOutcomeSnapshot.id`s, not real `Outcome.id`s
   * — every downstream consumer (scorer, ordering, coverage-gap, explain)
   * only ever treats `outcomeId` as an opaque key, so this substitution is
   * safe without touching any of that code.
   *
   * Candidates are the REAL master `ContentItem`s behind each snapshot
   * content row's `sourceContentId` (confirmed direction: score using the
   * original library content when one was copied, so difficulty/duration/
   * effectiveness/mandatory all reflect real data). A manager-authored
   * snapshot content row with no `sourceContentId` has nothing to resolve
   * to a real `ContentItem` and is therefore not scorable by this pipeline
   * — it's surfaced separately by `PlanSnapshotService.getTree()` for the
   * wizard to show directly, not through recommendation ranking.
   */
  async buildPoolFromSnapshot(params: {
    outcomeSnapshots: { id: string; sourceContentIds: string[] }[];
    language: Language;
    outstandingOutcomeSnapshotIds: ReadonlySet<string>;
    excludeContentItemIds?: ReadonlySet<string>;
  }): Promise<CandidatePoolResult> {
    if (params.outstandingOutcomeSnapshotIds.size === 0) {
      return { candidates: [], boundOutcomesByContent: new Map(), mandatoryContentIds: new Set() };
    }

    const contentIdToOutcomeSnapshotIds = new Map<string, string[]>();
    for (const outcome of params.outcomeSnapshots) {
      if (!params.outstandingOutcomeSnapshotIds.has(outcome.id)) continue;
      for (const contentId of outcome.sourceContentIds) {
        const existing = contentIdToOutcomeSnapshotIds.get(contentId) ?? [];
        existing.push(outcome.id);
        contentIdToOutcomeSnapshotIds.set(contentId, existing);
      }
    }

    const allContentIds = [...contentIdToOutcomeSnapshotIds.keys()];
    const items = await contentItemRepository.findManyByIdsScoped(allContentIds);
    const itemsById = new Map(items.map((item) => [item.id, item]));

    const boundOutcomesByContent = new Map<string, string[]>();
    const candidates: ContentItem[] = [];
    for (const [contentId, outcomeSnapshotIds] of contentIdToOutcomeSnapshotIds) {
      const item = itemsById.get(contentId);
      if (!item) continue;
      if (item.language !== params.language) continue;
      if (params.excludeContentItemIds?.has(contentId)) continue;

      candidates.push(item);
      boundOutcomesByContent.set(contentId, outcomeSnapshotIds);
    }

    const mandatoryContentIds = new Set(
      candidates.filter((item) => item.isMandatory).map((item) => item.id),
    );

    return { candidates, boundOutcomesByContent, mandatoryContentIds };
  }
}
