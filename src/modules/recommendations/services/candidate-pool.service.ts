import type { ContentItem } from '@/modules/content/content.module.js';
import { contentItemRepository } from '@/modules/content/content.module.js';
import type { LearnerOutcome } from '@/modules/learners/learners.module.js';
import type { Outcome } from '@/modules/outcomes/outcomes.module.js';

export type Language = 'EN' | 'AR';

export interface CandidatePoolResult {
  /** Every uploaded document belonging to a skill with at least one outstanding required outcome. */
  candidates: ContentItem[];
  /** `contentItemId → outcomeId[]` — every outstanding required outcome that shares this candidate's skill (content covers the whole skill, not individual outcomes within it). */
  boundOutcomesByContent: Map<string, string[]>;
}

/**
 * `P6-1` — ARCHITECTURE §8.1 step 1–2: builds the scorable candidate set for
 * one learner assignment. Content no longer carries its own language/status —
 * it belongs to a skill and is usable as soon as it's uploaded, so the only
 * hard filter left is "does this content's skill have any outstanding
 * required outcome" (`RC-03`) — a candidate whose skill's outcomes are all
 * already `ACHIEVED` is dropped entirely.
 */
export class CandidatePoolService {
  async buildPool(params: {
    requiredOutcomes: LearnerOutcome[];
    outcomesById: Map<string, Outcome>;
    /** `RC-14` — content ids to drop from the pool regardless of score (repeat-failure remediation excluding what was already delivered). */
    excludeContentItemIds?: ReadonlySet<string>;
  }): Promise<CandidatePoolResult> {
    const outstandingOutcomeIds = new Set(
      params.requiredOutcomes.filter((lo) => lo.status !== 'ACHIEVED').map((lo) => lo.outcomeId),
    );

    if (outstandingOutcomeIds.size === 0) {
      return { candidates: [], boundOutcomesByContent: new Map() };
    }

    // Group outstanding outcomes by the skill they belong to — content is
    // fetched per skill, then bound back to every outstanding outcome that
    // shares that skill.
    const outcomeIdsBySkill = new Map<string, string[]>();
    for (const outcomeId of outstandingOutcomeIds) {
      const skillId = params.outcomesById.get(outcomeId)?.skillId;
      if (!skillId) continue;
      const existing = outcomeIdsBySkill.get(skillId) ?? [];
      existing.push(outcomeId);
      outcomeIdsBySkill.set(skillId, existing);
    }

    const boundOutcomesByContent = new Map<string, string[]>();
    const candidates: ContentItem[] = [];
    for (const [skillId, outcomeIds] of outcomeIdsBySkill) {
      const items = await contentItemRepository.findBySkill(skillId);
      for (const item of items) {
        if (params.excludeContentItemIds?.has(item.id)) continue;
        candidates.push(item);
        boundOutcomesByContent.set(item.id, outcomeIds);
      }
    }

    return { candidates, boundOutcomesByContent };
  }

  /**
   * Snapshot-scoped equivalent of `buildPool` for a plan whose track has
   * been copied via `PlanSnapshotService` (wizard step2). `outcomeId`s in
   * the returned pool are `PlanOutcomeSnapshot.id`s, not real `Outcome.id`s
   * — every downstream consumer (scorer, ordering, coverage-gap, explain)
   * only ever treats `outcomeId` as an opaque key, so this substitution is
   * safe without touching any of that code.
   *
   * Candidates are the REAL master `ContentItem`s belonging to each snapshot
   * skill's `sourceSkillId` (confirmed direction: score using the original
   * library content when a master skill was copied, so effectiveness/
   * semantic signals reflect real data). A manager-added snapshot skill with
   * no `sourceSkillId` has no master content to resolve to and is therefore
   * not scorable by this pipeline — its outcomes still show in the wizard's
   * snapshot editor directly, just not through recommendation ranking.
   */
  async buildPoolFromSnapshot(params: {
    outcomeSnapshots: { id: string; sourceSkillId: string | null }[];
    outstandingOutcomeSnapshotIds: ReadonlySet<string>;
    excludeContentItemIds?: ReadonlySet<string>;
  }): Promise<CandidatePoolResult> {
    if (params.outstandingOutcomeSnapshotIds.size === 0) {
      return { candidates: [], boundOutcomesByContent: new Map() };
    }

    const outcomeSnapshotIdsBySkill = new Map<string, string[]>();
    for (const outcome of params.outcomeSnapshots) {
      if (!params.outstandingOutcomeSnapshotIds.has(outcome.id) || !outcome.sourceSkillId) continue;
      const existing = outcomeSnapshotIdsBySkill.get(outcome.sourceSkillId) ?? [];
      existing.push(outcome.id);
      outcomeSnapshotIdsBySkill.set(outcome.sourceSkillId, existing);
    }

    const boundOutcomesByContent = new Map<string, string[]>();
    const candidates: ContentItem[] = [];
    for (const [skillId, outcomeSnapshotIds] of outcomeSnapshotIdsBySkill) {
      const items = await contentItemRepository.findBySkill(skillId);
      for (const item of items) {
        if (params.excludeContentItemIds?.has(item.id)) continue;
        candidates.push(item);
        boundOutcomesByContent.set(item.id, outcomeSnapshotIds);
      }
    }

    return { candidates, boundOutcomesByContent };
  }
}
