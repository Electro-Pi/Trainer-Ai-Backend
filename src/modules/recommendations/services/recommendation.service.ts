import { writeAuditLog } from '@/common/interceptors/audit.interceptor.js';
import { runWithTenant } from '@/database/tenant-context.js';
import { eventBus } from '@/events/event-bus.js';
import {
  contentOutcomeRepository,
  contentPrerequisiteRepository,
} from '@/modules/content/content.module.js';
import type { LearnerOutcome } from '@/modules/learners/learners.module.js';
import {
  learnerAssignmentRepository,
  learnerExperienceRepository,
  learnerOutcomeRepository,
  learnerRepository,
} from '@/modules/learners/learners.module.js';
import type { Outcome } from '@/modules/outcomes/outcomes.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';

import type { RecommendationItemResult } from '../dto/recommendation.dto.js';
import { RecommendationItemRepository } from '../repositories/recommendation-item.repository.js';
import type { Recommendation } from '../repositories/recommendation.repository.js';
import { RecommendationRepository } from '../repositories/recommendation.repository.js';

import { CandidatePoolService } from './candidate-pool.service.js';
import { type CoverageGap, CoverageGapService } from './coverage-gap.service.js';
import { ExplainService } from './explain.service.js';
import { OrderingService } from './ordering.service.js';
import { ScorerService, type ScoredItem } from './scorer.service.js';

/**
 * Structural mirror of `training-plans`' `PlanTrackSnapshotTree` — declared
 * independently rather than imported, since `training-plans` already
 * imports this module (`PlanBuilderService` → `RecommendationService`) and
 * an import the other direction would create a module dependency cycle
 * (`import-x/no-cycle`, caught by this repo's own lint config). The caller
 * (`PlanBuilderService`) fetches the tree and passes it in.
 */
export interface SnapshotTreeInput {
  skills: {
    isRemoved: boolean;
    outcomes: {
      id: string;
      sourceOutcomeId: string | null;
      titleEn: string;
      titleAr: string;
      descriptionEn: string;
      descriptionAr: string;
      order: number;
      isRemoved: boolean;
      createdAt: Date;
      progress: {
        id: string;
        status: string;
        attemptCount: number;
        lastScore: number | null;
        achievedAt: Date | null;
      } | null;
    }[];
  }[];
  content: { sourceContentId: string | null; isRemoved: boolean }[];
}

export type RecommendationTrigger =
  'LEVEL_ASSIGNED' | 'PLAN_BUILD' | 'SESSION_ENDED' | 'OUTCOME_FAILED' | 'LEVEL_CHANGED' | 'MANUAL';

/** Max items kept per outcome after ranking — a ranked list, not every candidate that scored above zero. */
const MAX_ITEMS_PER_OUTCOME = 3;

export interface GenerateRecommendationInput {
  organizationId: string;
  learnerId: string;
  trigger: RecommendationTrigger;
  sessionId?: string;
  /** `RC-14` — content ids to exclude regardless of score. `OUTCOME_FAILED`'s caller (P8) passes what was already delivered on the failed outcome. */
  excludeContentItemIds?: ReadonlySet<string>;
}

export interface GenerateRecommendationResult {
  recommendation: Recommendation;
  items: RecommendationItemResult[];
  coverageGaps: CoverageGap[];
}

/**
 * `P6-8`, `P6-10` — the pipeline itself (ARCHITECTURE §8.1):
 * buildCandidatePool → filterHard → scoreSignals → orderByPrerequisite →
 * explain → persist(PROPOSED). Duration-fit (`P6-5`) is deliberately not run
 * here — §8.2's own trigger table says `LEVEL_ASSIGNED` produces the "full
 * content set covering every required outcome", uncapped; only `PLAN_BUILD`
 * (P7) fits a set to one session's `durationMinutes`, so `DurationFitService`
 * is called from there, not from this generic generator.
 */
export class RecommendationService {
  private readonly candidatePool = new CandidatePoolService();
  private readonly scorer = new ScorerService();
  private readonly ordering = new OrderingService();
  private readonly explainer = new ExplainService();
  private readonly coverageGaps = new CoverageGapService();

  private readonly recommendations = new RecommendationRepository();
  private readonly recommendationItems = new RecommendationItemRepository();

  async generate(input: GenerateRecommendationInput): Promise<GenerateRecommendationResult> {
    const learner = await learnerRepository.findByIdScoped(input.learnerId);
    if (!learner) {
      throw new Error(`Learner ${input.learnerId} not found`);
    }

    const assignment = await learnerAssignmentRepository.findActiveByLearner(input.learnerId);
    if (!assignment) {
      throw new Error(`Learner ${input.learnerId} has no active level assignment`);
    }

    const requiredOutcomes = await learnerOutcomeRepository.findByAssignment(assignment.id);
    const levelOutcomes = await outcomeRepository.findByLevel(assignment.levelId);
    const outcomesById = new Map(levelOutcomes.map((outcome) => [outcome.id, outcome]));

    // `RC-09` cold start — no `LearnerExperience` row recorded yet is a real,
    // expected state right after `LEVEL_ASSIGNED`, not an error; the
    // difficulty-fit signal already treats `null` as neutral (P6-2).
    const experience = await learnerExperienceRepository.findByLearner(input.learnerId);

    const pool = await this.candidatePool.buildPool({
      trackId: assignment.trackId,
      levelId: assignment.levelId,
      language: learner.preferredLanguage,
      requiredOutcomes,
      ...(input.excludeContentItemIds
        ? { excludeContentItemIds: input.excludeContentItemIds }
        : {}),
    });

    const scored = await this.scoreAndRank(
      pool,
      requiredOutcomes,
      outcomesById,
      experience?.yearsOfExperience ?? null,
    );

    const gaps = this.coverageGaps.detect(requiredOutcomes, outcomesById, scored);

    const recommendation = await this.recommendations.create({
      organizationId: input.organizationId,
      learnerId: input.learnerId,
      sessionId: input.sessionId ?? null,
      assignmentId: assignment.id,
      trigger: input.trigger,
      status: 'PROPOSED',
    } as never);

    const items = await this.persistItems(
      recommendation.id,
      scored,
      outcomesById,
      requiredOutcomes,
    );

    await writeAuditLog({
      organizationId: input.organizationId,
      actorType: 'SYSTEM',
      action: 'recommendation.generated',
      entityType: 'Recommendation',
      entityId: recommendation.id,
      after: { trigger: input.trigger, itemCount: items.length, coverageGapCount: gaps.length },
    });

    this.coverageGaps.notify({
      recommendationId: recommendation.id,
      organizationId: input.organizationId,
      learnerId: input.learnerId,
      gaps,
    });

    return { recommendation, items, coverageGaps: gaps };
  }

  private async scoreAndRank(
    pool: Awaited<ReturnType<CandidatePoolService['buildPool']>>,
    requiredOutcomes: LearnerOutcome[],
    outcomesById: Map<string, Outcome>,
    yearsOfExperience: number | null,
  ): Promise<ScoredItem[]> {
    if (pool.candidates.length === 0) return [];

    const contentOutcomes = await contentOutcomeRepository.findByContentItems(
      pool.candidates.map((item) => item.id),
    );
    const outcomePriorityByOutcomeId = new Map(
      requiredOutcomes.map((lo) => [
        lo.outcomeId,
        { priority: lo.priority, isCarriedOver: lo.attemptCount > 0 && lo.status !== 'ACHIEVED' },
      ]),
    );

    const scored = await this.scorer.score({
      candidates: pool.candidates,
      boundOutcomesByContent: pool.boundOutcomesByContent,
      outcomesById,
      contentOutcomes,
      outcomePriorityByOutcomeId,
      yearsOfExperience,
      weakOutcomeIds: new Set<string>(), // `RC` §6.7.1 gap-match source (P8 `AssessmentAnswer` history) — none exists before a session has run.
    });

    const topPerOutcome = this.keepTopPerOutcome(scored);

    const prerequisites = await contentPrerequisiteRepository.findByContentItems(
      topPerOutcome.map((item) => item.contentItem.id),
    );

    return this.ordering.order(topPerOutcome, prerequisites);
  }

  private keepTopPerOutcome(scored: ScoredItem[]): ScoredItem[] {
    const byOutcome = new Map<string, ScoredItem[]>();
    for (const item of scored) {
      const list = byOutcome.get(item.outcomeId) ?? [];
      list.push(item);
      byOutcome.set(item.outcomeId, list);
    }

    const result: ScoredItem[] = [];
    for (const list of byOutcome.values()) {
      list.sort((a, b) => b.score - a.score);
      result.push(...list.slice(0, MAX_ITEMS_PER_OUTCOME));
    }
    return result;
  }

  private async persistItems(
    recommendationId: string,
    orderedItems: ScoredItem[],
    outcomesById: Map<string, Outcome>,
    requiredOutcomes: LearnerOutcome[],
  ): Promise<RecommendationItemResult[]> {
    const explained = this.buildExplainedItems(orderedItems, outcomesById, requiredOutcomes);

    const results: RecommendationItemResult[] = [];
    let rank = 0;

    for (const { scoredItem, explanation } of explained) {
      const created = await this.recommendationItems.create({
        recommendationId,
        contentItemId: scoredItem.contentItem.id,
        outcomeId: scoredItem.outcomeId,
        rank: rank++,
        score: scoredItem.score,
        reasonCode: explanation.reasonCode,
        reasonEn: explanation.reasonEn,
        reasonAr: explanation.reasonAr,
        signalBreakdown: scoredItem.signalBreakdown,
        status: 'PROPOSED',
      } as never);

      results.push({
        id: created.id,
        contentItemId: created.contentItemId,
        outcomeId: created.outcomeId,
        rank: created.rank,
        score: created.score,
        reasonCode: created.reasonCode,
        reasonEn: created.reasonEn,
        reasonAr: created.reasonAr,
        signalBreakdown: scoredItem.signalBreakdown,
        status: created.status,
      });
    }

    return results;
  }

  /**
   * Pure explain+rank step factored out of `persistItems` so the snapshot
   * path (`generateFromSnapshot`) can reuse the exact same explain logic
   * without writing `Recommendation`/`RecommendationItem` rows — those FK to
   * master `Outcome`/`ContentItem` and a snapshot-sourced pick can't satisfy
   * that constraint (confirmed: skip persistence for snapshot-based plans).
   */
  private buildExplainedItems(
    orderedItems: ScoredItem[],
    outcomesById: Map<string, Outcome>,
    requiredOutcomes: LearnerOutcome[],
  ): { scoredItem: ScoredItem; explanation: ReturnType<ExplainService['explain']> }[] {
    const carriedOverOutcomeIds = new Set(
      requiredOutcomes
        .filter((lo) => lo.attemptCount > 0 && lo.status !== 'ACHIEVED')
        .map((lo) => lo.outcomeId),
    );

    const results: {
      scoredItem: ScoredItem;
      explanation: ReturnType<ExplainService['explain']>;
    }[] = [];

    for (const scoredItem of orderedItems) {
      const outcome = outcomesById.get(scoredItem.outcomeId);
      if (!outcome) continue;

      const isCarriedOver = carriedOverOutcomeIds.has(scoredItem.outcomeId);
      const explanation = this.explainer.explain(scoredItem, outcome, isCarriedOver);

      results.push({ scoredItem, explanation });
    }

    return results;
  }

  /**
   * Snapshot-scoped sibling of `generate()` for a plan whose track was
   * copied via `PlanSnapshotService` (wizard step2, confirmed design):
   * candidates are built from `PlanContentSnapshot`/`PlanOutcomeSnapshot`
   * (via `CandidatePoolService.buildPoolFromSnapshot`) instead of master
   * `ContentItem`/`Outcome`, outcome ids in every result are
   * `PlanOutcomeSnapshot.id`s. No `Recommendation`/`RecommendationItem` rows
   * are persisted — this returns the ranked, explained result in-memory
   * straight to the caller (`PlanBuilderService`), which is responsible for
   * turning it into `Session`/`SessionContent` rows.
   */
  async generateFromSnapshot(params: {
    snapshotTree: SnapshotTreeInput;
    language: 'EN' | 'AR';
    yearsOfExperience: number | null;
    excludeContentItemIds?: ReadonlySet<string>;
  }): Promise<{ items: RecommendationItemResult[]; coverageGaps: CoverageGap[] }> {
    const activeOutcomes = params.snapshotTree.skills
      .filter((skill) => !skill.isRemoved)
      .flatMap((skill) => skill.outcomes)
      .filter((outcome) => !outcome.isRemoved);

    const outstandingOutcomeSnapshotIds = new Set(
      activeOutcomes.filter((outcome) => outcome.progress?.status !== 'ACHIEVED').map((o) => o.id),
    );

    // Synthetic `Outcome`/`LearnerOutcome` shapes — only fields the scoring
    // pipeline actually reads (`id`, `titleEn/Ar`, `status`, `priority` via
    // `order`, `attemptCount`) are populated with real snapshot data;
    // everything else is an unused placeholder, never read by
    // `scoreAndRank`/`coverageGaps`/`explainer` (verified against every call
    // site in this file and the signal functions).
    const outcomesById = new Map<string, Outcome>(
      activeOutcomes.map((outcome) => [
        outcome.id,
        {
          id: outcome.id,
          levelId: '',
          skillId: null,
          titleEn: outcome.titleEn,
          titleAr: outcome.titleAr,
          targetSkills: [],
          order: outcome.order,
          isEnabled: true,
          createdAt: outcome.createdAt,
          updatedAt: outcome.createdAt,
        } as unknown as Outcome,
      ]),
    );

    const requiredOutcomes: LearnerOutcome[] = activeOutcomes.map(
      (outcome) =>
        ({
          id: outcome.progress?.id ?? outcome.id,
          learnerId: '',
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

    const outcomeSnapshotsWithSources = activeOutcomes.map((outcome) => ({
      ...outcome,
      sourceContentIds: [] as string[],
    }));

    // Content bound to each outcome comes from the snapshot's copied
    // ContentItem links — resolved via the ORIGINAL master ContentOutcome
    // bindings for every source outcome this snapshot outcome descended
    // from, restricted to content this snapshot actually kept a copy of.
    const contentSnapshotBySourceId = new Set(
      params.snapshotTree.content
        .filter((c) => !c.isRemoved && c.sourceContentId)
        .map((c) => c.sourceContentId!),
    );
    for (const outcome of outcomeSnapshotsWithSources) {
      if (!outcome.sourceOutcomeId) continue;
      const bindings = await contentOutcomeRepository.findByOutcome(outcome.sourceOutcomeId);
      outcome.sourceContentIds = bindings
        .map((b) => b.contentItemId)
        .filter((contentId) => contentSnapshotBySourceId.has(contentId));
    }

    const pool = await this.candidatePool.buildPoolFromSnapshot({
      outcomeSnapshots: outcomeSnapshotsWithSources,
      language: params.language,
      outstandingOutcomeSnapshotIds,
      ...(params.excludeContentItemIds
        ? { excludeContentItemIds: params.excludeContentItemIds }
        : {}),
    });

    const scored = await this.scoreAndRank(
      pool,
      requiredOutcomes,
      outcomesById,
      params.yearsOfExperience,
    );

    const gaps = this.coverageGaps.detect(requiredOutcomes, outcomesById, scored);

    const explained = this.buildExplainedItems(scored, outcomesById, requiredOutcomes);

    const items: RecommendationItemResult[] = explained.map(
      ({ scoredItem, explanation }, rank) => ({
        id: `snapshot-${scoredItem.contentItem.id}-${scoredItem.outcomeId}`,
        contentItemId: scoredItem.contentItem.id,
        outcomeId: scoredItem.outcomeId,
        rank,
        score: scoredItem.score,
        reasonCode: explanation.reasonCode,
        reasonEn: explanation.reasonEn,
        reasonAr: explanation.reasonAr,
        signalBreakdown: scoredItem.signalBreakdown,
        status: 'PROPOSED',
      }),
    );

    return { items, coverageGaps: gaps };
  }

  /** `MANUAL` trigger (`RC-16`) — same pipeline, no level change. */
  async generateManual(
    organizationId: string,
    learnerId: string,
  ): Promise<GenerateRecommendationResult> {
    return this.generate({ organizationId, learnerId, trigger: 'MANUAL' });
  }
}

/**
 * `RC-01` — the `LEVEL_ASSIGNED` trigger subscriber, registered once at
 * module load (mirrors how every other `.module.ts` wires its own side
 * effects on import). Explicitly re-enters `runWithTenant` rather than
 * relying on the publishing request's `AsyncLocalStorage` frame still being
 * live by the time this handler's microtask runs (`EventBus.subscribe`
 * schedules via its own `Promise.resolve().then()`, detached from the
 * request's bound frame) — every tenant-scoped repository call inside
 * `generate()` needs an active tenant context or it throws.
 */
export function registerRecommendationEventHandlers(service: RecommendationService): void {
  eventBus.subscribe('learner.level.assigned', async (payload) => {
    await runWithTenant(payload.organizationId, () =>
      service.generate({
        organizationId: payload.organizationId,
        learnerId: payload.learnerId,
        trigger: 'LEVEL_ASSIGNED',
      }),
    );
  });
}
