import type { ContentItem } from '@/modules/content/content.module.js';
import { contentItemRepository } from '@/modules/content/content.module.js';
import type { LearnerOutcome } from '@/modules/learners/learners.module.js';
import {
  learnerExperienceRepository,
  learnerOutcomeRepository,
  learnerRepository,
} from '@/modules/learners/learners.module.js';
import type {
  RecommendationItemResult,
  ScoredItem,
} from '@/modules/recommendations/recommendations.module.js';
import {
  DurationFitService,
  RecommendationService,
} from '@/modules/recommendations/recommendations.module.js';

import { PlanTrackSnapshotRepository } from '../repositories/plan-track-snapshot.repository.js';

const DEFAULT_SESSION_DURATION_MINUTES = 60;

export interface SuggestedSession {
  sequence: number;
  primaryOutcomeId: string;
  durationMinutes: number;
  contentItemIds: string[];
}

export interface SuggestedBreakdown {
  sessions: SuggestedSession[];
  /** Ranked items that didn't fit into `trainingDays` sessions — surfaced, never silently dropped. */
  deferredItemCount: number;
}

/**
 * `TP-05` — `PLAN_BUILD` trigger (ARCHITECTURE §8.2): runs the same
 * deterministic pipeline as `LEVEL_ASSIGNED` (P6) to get a full ranked,
 * ordered set covering every required outcome, then applies `DurationFitService`
 * (P6-5, deliberately unused by `LEVEL_ASSIGNED`) to split it across
 * `trainingDays` one-outcome-per-session slices — the manager adjusts the
 * result afterward via `PATCH /plans/:id`, this only proposes a starting point.
 */
export class PlanBuilderService {
  private readonly recommendations = new RecommendationService();
  private readonly durationFit = new DurationFitService();
  private readonly snapshots = new PlanTrackSnapshotRepository();

  async suggest(params: {
    organizationId: string;
    trainingPlanId: string;
    learnerId: string;
    trainingDays: number;
    sessionDurationMinutes?: number;
  }): Promise<SuggestedBreakdown> {
    const durationMinutes = params.sessionDurationMinutes ?? DEFAULT_SESSION_DURATION_MINUTES;

    const snapshotTree = await this.snapshots.findByTrainingPlanId(params.trainingPlanId);

    const { items, requiredOutcomes } = snapshotTree
      ? await this.generateFromSnapshotTree(params.learnerId, snapshotTree)
      : await this.generateFromMasterCatalogue(params.organizationId, params.learnerId);

    // No content items exist to recommend yet (the org hasn't authored any) —
    // rather than refusing to build a plan at all, fall back to one session
    // per outstanding required outcome so the manager can still schedule and
    // run real coaching sessions; content can be attached to sessions later
    // once it exists. Only content-driven building is skipped, not the plan.
    if (items.length === 0) {
      return this.suggestFromOutcomesOnly(requiredOutcomes, params.trainingDays, durationMinutes);
    }

    // Fetched once for the whole breakdown — every session slot below scores
    // against the same content set, so this must not re-query per slot.
    const contentItems = await contentItemRepository.findManyByIdsScoped(
      items.map((item) => item.contentItemId),
    );
    const contentById = new Map<string, ContentItem>(contentItems.map((item) => [item.id, item]));

    const sessions: SuggestedSession[] = [];
    let remainingItems = items;
    let sequence = 1;

    for (; sequence <= params.trainingDays && remainingItems.length > 0; sequence++) {
      const primaryOutcomeId = this.pickPrimaryOutcome(remainingItems, requiredOutcomes);
      const candidatesForSlot = remainingItems.filter(
        (item) => item.outcomeId === primaryOutcomeId,
      );
      const otherItems = remainingItems.filter((item) => item.outcomeId !== primaryOutcomeId);

      const scoredForFit = this.toScoredItems(candidatesForSlot, contentById);
      const fit = this.durationFit.fit(scoredForFit, durationMinutes);

      sessions.push({
        sequence,
        primaryOutcomeId,
        durationMinutes,
        contentItemIds: fit.fitted.map((item) => item.contentItem.id),
      });

      const deferredIds = new Set(fit.deferred.map((item) => item.contentItem.id));
      remainingItems = [
        ...otherItems,
        ...candidatesForSlot.filter((item) => deferredIds.has(item.contentItemId)),
      ];
    }

    return { sessions, deferredItemCount: remainingItems.length };
  }

  /** Master-catalogue path — today's existing `PLAN_BUILD` pipeline, unchanged. */
  private async generateFromMasterCatalogue(
    organizationId: string,
    learnerId: string,
  ): Promise<{ items: RecommendationItemResult[]; requiredOutcomes: LearnerOutcome[] }> {
    const { items } = await this.recommendations.generate({
      organizationId,
      learnerId,
      trigger: 'PLAN_BUILD',
    });
    const requiredOutcomes = await learnerOutcomeRepository.findByLearner(learnerId);
    return { items, requiredOutcomes };
  }

  /**
   * Snapshot path — this plan's track was copied via `PlanSnapshotService`
   * (wizard step2, confirmed design). Scores/ranks against the plan-scoped
   * copy instead of the master catalogue, via
   * `RecommendationService.generateFromSnapshot`. `requiredOutcomes` here is
   * a synthetic `LearnerOutcome[]`-shaped array keyed to
   * `PlanOutcomeSnapshot.id`s (not real `Outcome.id`s) — every downstream
   * consumer in this file (`pickPrimaryOutcome`, `suggestFromOutcomesOnly`)
   * only reads `.outcomeId`/`.priority`/`.status`, so this is safe.
   */
  private async generateFromSnapshotTree(
    learnerId: string,
    snapshotTree: NonNullable<
      Awaited<ReturnType<PlanTrackSnapshotRepository['findByTrainingPlanId']>>
    >,
  ): Promise<{ items: RecommendationItemResult[]; requiredOutcomes: LearnerOutcome[] }> {
    const learner = await learnerRepository.findByIdScoped(learnerId);
    if (!learner) {
      throw new Error(`Learner ${learnerId} not found`);
    }
    const experience = await learnerExperienceRepository.findByLearner(learnerId);

    const activeOutcomes = snapshotTree.skills
      .filter((skill) => !skill.isRemoved)
      .flatMap((skill) => skill.outcomes)
      .filter((outcome) => !outcome.isRemoved);

    const requiredOutcomes: LearnerOutcome[] = activeOutcomes.map(
      (outcome) =>
        ({
          id: outcome.progress?.id ?? outcome.id,
          learnerId,
          outcomeId: outcome.id,
          assignmentId: '',
          status: outcome.progress?.status ?? 'NOT_STARTED',
          priority: outcome.order,
          isCustom: false,
          attemptCount: outcome.progress?.attemptCount ?? 0,
          lastScore: outcome.progress?.lastScore ?? null,
          achievedAt: outcome.progress?.achievedAt ?? null,
          createdAt: outcome.createdAt,
          updatedAt: outcome.createdAt,
        }) as unknown as LearnerOutcome,
    );

    const { items } = await this.recommendations.generateFromSnapshot({
      snapshotTree,
      language: learner.preferredLanguage,
      yearsOfExperience: experience?.yearsOfExperience ?? null,
    });

    return { items, requiredOutcomes };
  }

  /**
   * Content-free fallback: one session per outstanding required outcome, in
   * priority order, capped at `trainingDays`. `contentItemIds` stays empty —
   * the manager runs the session as live coaching and content can be
   * attached later once the org has authored some for this track/level.
   */
  private suggestFromOutcomesOnly(
    requiredOutcomes: LearnerOutcome[],
    trainingDays: number,
    durationMinutes: number,
  ): SuggestedBreakdown {
    const outstanding = requiredOutcomes
      .filter((lo) => lo.status !== 'ACHIEVED')
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    const sessions: SuggestedSession[] = outstanding.slice(0, trainingDays).map((lo, i) => ({
      sequence: i + 1,
      primaryOutcomeId: lo.outcomeId,
      durationMinutes,
      contentItemIds: [],
    }));

    return { sessions, deferredItemCount: Math.max(0, outstanding.length - trainingDays) };
  }

  /** Earliest not-yet-scheduled outcome, in the ranked list's own order — keeps session sequencing stable with the pipeline's own priority ordering. */
  private pickPrimaryOutcome(
    items: RecommendationItemResult[],
    requiredOutcomes: LearnerOutcome[],
  ): string {
    const outcomeOrder = new Map(requiredOutcomes.map((lo) => [lo.outcomeId, lo.priority]));
    const outcomeIds = [...new Set(items.map((item) => item.outcomeId))];
    outcomeIds.sort((a, b) => (outcomeOrder.get(a) ?? 0) - (outcomeOrder.get(b) ?? 0));
    return outcomeIds[0]!;
  }

  private toScoredItems(
    items: RecommendationItemResult[],
    contentById: Map<string, ContentItem>,
  ): ScoredItem[] {
    return items
      .map((item): ScoredItem | null => {
        const contentItem = contentById.get(item.contentItemId);
        if (!contentItem) return null;
        return {
          contentItem,
          outcomeId: item.outcomeId,
          score: item.score,
          signalBreakdown: item.signalBreakdown as ScoredItem['signalBreakdown'],
        };
      })
      .filter((item): item is ScoredItem => item !== null);
  }
}
