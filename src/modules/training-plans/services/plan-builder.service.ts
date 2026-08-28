import type { ContentItem } from '@/modules/content/content.module.js';
import { contentItemRepository } from '@/modules/content/content.module.js';
import type { LearnerOutcome } from '@/modules/learners/learners.module.js';
import {
  learnerExperienceRepository,
  learnerOutcomeRepository,
  learnerRepository,
} from '@/modules/learners/learners.module.js';
import { outcomeRepository } from '@/modules/outcomes/outcomes.module.js';
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
  /** Every outcome this session covers, including `primaryOutcomeId` — one skill's outcomes are grouped into a single session rather than one session per outcome. */
  outcomeIds: string[];
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

    const { items, requiredOutcomes, outcomeToSkill } = snapshotTree
      ? await this.generateFromSnapshotTree(params.learnerId, snapshotTree)
      : await this.generateFromMasterCatalogue(params.organizationId, params.learnerId);

    // No content items exist to recommend yet (the org hasn't authored any) —
    // rather than refusing to build a plan at all, fall back to one session
    // per outstanding required outcome so the manager can still schedule and
    // run real coaching sessions; content can be attached to sessions later
    // once it exists. Only content-driven building is skipped, not the plan.
    if (items.length === 0) {
      return this.suggestFromOutcomesOnly(
        requiredOutcomes,
        outcomeToSkill,
        params.trainingDays,
        durationMinutes,
      );
    }

    // Fetched once for the whole breakdown — every session slot below scores
    // against the same content set, so this must not re-query per slot.
    const contentItems = await contentItemRepository.findManyByIds(
      items.map((item) => item.contentItemId),
    );
    const contentById = new Map<string, ContentItem>(contentItems.map((item) => [item.id, item]));

    const sessions: SuggestedSession[] = [];
    let remainingItems = items;
    let sequence = 1;

    // Grouped by skill, not outcome — a skill with several outcomes gets one
    // session covering all of them (one manager-facing session per skill,
    // matching how the wizard's own skill editor scopes work), rather than
    // one session per outcome. `pickPrimarySkill` still ranks by the
    // required-outcomes priority order, it just resolves to a skill instead
    // of a single outcome; `primaryOutcomeId` on the resulting session is
    // the highest-priority outcome within that skill (the FK every other
    // consumer — reports, transcripts, the AI Trainer dispatch — already
    // expects one of), with the rest written to `outcomeIds` for
    // `SessionOutcome`.
    for (; sequence <= params.trainingDays && remainingItems.length > 0; sequence++) {
      const skillId = this.pickPrimarySkill(remainingItems, requiredOutcomes, outcomeToSkill);
      const candidatesForSlot = remainingItems.filter(
        (item) => (outcomeToSkill.get(item.outcomeId) ?? item.outcomeId) === skillId,
      );
      const otherItems = remainingItems.filter(
        (item) => (outcomeToSkill.get(item.outcomeId) ?? item.outcomeId) !== skillId,
      );

      const outcomeIdsForSlot = [...new Set(candidatesForSlot.map((item) => item.outcomeId))];
      const primaryOutcomeId = this.pickPrimaryOutcome(outcomeIdsForSlot, requiredOutcomes);

      const scoredForFit = this.toScoredItems(candidatesForSlot, contentById);
      const fit = this.durationFit.fit(scoredForFit, durationMinutes);

      sessions.push({
        sequence,
        primaryOutcomeId,
        outcomeIds: outcomeIdsForSlot,
        durationMinutes,
        contentItemIds: fit.fitted.map((item) => item.contentItem.id),
      });

      const deferredIds = new Set(fit.deferred.map((item) => item.contentItem.id));
      remainingItems = [
        ...otherItems,
        ...candidatesForSlot.filter((item) => deferredIds.has(item.contentItemId)),
      ];
    }

    // A skill with outstanding outcomes but zero recommended content items
    // (the org hasn't authored any content for it yet) never has any
    // `RecommendationItemResult` rows to begin with, so the content-driven
    // loop above can never select it — `remainingItems`/`items` simply never
    // contain it. Left alone, that skill silently gets no session at all
    // while another skill's content gets split across multiple slots to
    // fill the leftover `trainingDays`. Backfilling with an outcomes-only
    // session per uncovered skill (same shape `suggestFromOutcomesOnly`
    // produces for the "no content anywhere" case) keeps every selected
    // skill represented at least once, same as the code's own stated
    // "one session per skill" design.
    const coveredSkillIds = new Set(
      sessions.flatMap((s) => s.outcomeIds.map((id) => outcomeToSkill.get(id) ?? id)),
    );
    const remainingSlots = params.trainingDays - sessions.length;
    if (remainingSlots > 0) {
      const uncoveredOutcomes = requiredOutcomes.filter(
        (lo) =>
          lo.status !== 'ACHIEVED' &&
          !coveredSkillIds.has(outcomeToSkill.get(lo.outcomeId) ?? lo.outcomeId),
      );
      const fallback = this.suggestFromOutcomesOnly(
        uncoveredOutcomes,
        outcomeToSkill,
        remainingSlots,
        durationMinutes,
      );
      for (const fallbackSession of fallback.sessions) {
        sessions.push({ ...fallbackSession, sequence: sessions.length + 1 });
      }
    }

    return { sessions, deferredItemCount: remainingItems.length };
  }

  /** Master-catalogue path — today's existing `PLAN_BUILD` pipeline, unchanged. */
  private async generateFromMasterCatalogue(
    organizationId: string,
    learnerId: string,
  ): Promise<{
    items: RecommendationItemResult[];
    requiredOutcomes: LearnerOutcome[];
    outcomeToSkill: Map<string, string>;
  }> {
    const { items } = await this.recommendations.generate({
      organizationId,
      learnerId,
      trigger: 'PLAN_BUILD',
    });
    const requiredOutcomes = await learnerOutcomeRepository.findByLearner(learnerId);

    // `Outcome.skillId` is nullable during the skill-relations migration
    // window (schema.prisma) — an outcome with no resolved skill yet groups
    // alone, by its own outcome id, rather than joining any session (falling
    // back to one-outcome-per-session for just that outcome instead of
    // dropping it).
    const outcomeIds = [...new Set(items.map((item) => item.outcomeId))];
    const outcomes = await outcomeRepository.findManyByIdsScoped(outcomeIds);
    const skillByOutcomeId = new Map(outcomes.map((o) => [o.id, o.skillId]));
    const outcomeToSkill = new Map<string, string>(
      outcomeIds.map((id) => [id, skillByOutcomeId.get(id) ?? id]),
    );

    return { items, requiredOutcomes, outcomeToSkill };
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
  ): Promise<{
    items: RecommendationItemResult[];
    requiredOutcomes: LearnerOutcome[];
    outcomeToSkill: Map<string, string>;
  }> {
    const learner = await learnerRepository.findByIdScoped(learnerId);
    if (!learner) {
      throw new Error(`Learner ${learnerId} not found`);
    }
    const experience = await learnerExperienceRepository.findByLearner(learnerId);

    // `Session.primaryOutcomeId` / `SessionOutcome.outcomeId` are hard FKs
    // to the master `Outcome` table (schema.prisma:1067) — a
    // `PlanOutcomeSnapshot.id` can never satisfy that constraint, so
    // scheduling must key everything off `sourceOutcomeId` (the real
    // `Outcome.id` this snapshot row was copied from) instead of the
    // snapshot row's own id. A manager-added outcome with no master source
    // (`sourceOutcomeId: null`) has nothing valid to schedule a session
    // against under today's schema, so it's excluded here — it still shows
    // in the plan's snapshot editor/review, it just can't drive a session's
    // primaryOutcomeId until Session/SessionOutcome gain snapshot-aware FKs.
    // `PlanOutcomeSnapshot.order` is only unique *within* its own skill (the
    // wizard's snapshot editor numbers each skill's outcomes 1, 2, 3...
    // independently — see `planSnapshot.slice.ts`'s `addDraftOutcome`), so
    // every skill's outcomes collide on priority 1, 2, 3... A raw sort by
    // `outcome.order` alone leaves ties broken by array order, which is
    // skill-by-skill (`flatMap`) — so with a multi-skill plan, the first
    // skill's outcomes always fill every session slot before a later
    // skill's outcome is ever reached, no matter how few training days there
    // are. Interleaving skills round-robin here (skill index as the primary
    // sort key, in-skill order as the tiebreak) makes `trainingDays` sessions
    // sample across every chosen skill instead of exhausting the first one.
    const activeOutcomes = snapshotTree.skills
      .filter((skill) => !skill.isRemoved)
      .flatMap((skill, skillIndex) => skill.outcomes.map((outcome) => ({ ...outcome, skillIndex })))
      .filter((outcome) => !outcome.isRemoved && outcome.sourceOutcomeId)
      .sort((a, b) => a.order - b.order);

    // Groups sessions by skill, not outcome — `skillIndex` (stable per plan,
    // see the round-robin priority comment below) doubles as the grouping
    // key so every outcome under the same skill lands in the same session.
    const outcomeToSkill = new Map<string, string>(
      activeOutcomes.map((outcome) => [
        outcome.sourceOutcomeId as string,
        String(outcome.skillIndex),
      ]),
    );

    const bySkillCount = new Map<number, number>();
    const requiredOutcomes: LearnerOutcome[] = activeOutcomes.map((outcome) => {
      const withinSkillRank = bySkillCount.get(outcome.skillIndex) ?? 0;
      bySkillCount.set(outcome.skillIndex, withinSkillRank + 1);
      return {
        id: outcome.progress?.id ?? outcome.id,
        learnerId,
        outcomeId: outcome.sourceOutcomeId as string,
        assignmentId: '',
        status: outcome.progress?.status ?? 'NOT_STARTED',
        // Round-robin priority: rank 0 of every skill sorts before rank 1 of
        // any skill, etc. — `withinSkillRank * skillCount + skillIndex`
        // interleaves skills instead of exhausting one before the next.
        priority: withinSkillRank * snapshotTree.skills.length + outcome.skillIndex,
        isCustom: false,
        attemptCount: outcome.progress?.attemptCount ?? 0,
        lastScore: outcome.progress?.lastScore ?? null,
        achievedAt: outcome.progress?.achievedAt ?? null,
        createdAt: outcome.createdAt,
        updatedAt: outcome.createdAt,
      } as unknown as LearnerOutcome;
    });

    const { items } = await this.recommendations.generateFromSnapshot({
      snapshotTree,
      yearsOfExperience: experience?.yearsOfExperience ?? null,
    });
    const remapped = items.map((item) => {
      const source = activeOutcomes.find((o) => o.id === item.outcomeId)?.sourceOutcomeId;
      return source ? { ...item, outcomeId: source } : null;
    });
    const validItems = remapped.filter((item): item is RecommendationItemResult => item !== null);

    return { items: validItems, requiredOutcomes, outcomeToSkill };
  }

  /**
   * Content-free fallback: one session per outstanding skill (every one of
   * its outstanding outcomes bundled in), in priority order, capped at
   * `trainingDays`. `contentItemIds` stays empty — the manager runs the
   * session as live coaching and content can be attached later once the org
   * has authored some for this track/level.
   */
  private suggestFromOutcomesOnly(
    requiredOutcomes: LearnerOutcome[],
    outcomeToSkill: Map<string, string>,
    trainingDays: number,
    durationMinutes: number,
  ): SuggestedBreakdown {
    const outstanding = requiredOutcomes
      .filter((lo) => lo.status !== 'ACHIEVED')
      .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    const bySkill = new Map<string, LearnerOutcome[]>();
    for (const lo of outstanding) {
      const skillId = outcomeToSkill.get(lo.outcomeId) ?? lo.outcomeId;
      const group = bySkill.get(skillId) ?? [];
      group.push(lo);
      bySkill.set(skillId, group);
    }

    const sessions: SuggestedSession[] = [...bySkill.values()]
      .slice(0, trainingDays)
      .map((group, i) => ({
        sequence: i + 1,
        primaryOutcomeId: group[0]!.outcomeId,
        outcomeIds: group.map((lo) => lo.outcomeId),
        durationMinutes,
        contentItemIds: [],
      }));

    const deferredCount = [...bySkill.values()]
      .slice(trainingDays)
      .reduce((n, g) => n + g.length, 0);
    return { sessions, deferredItemCount: deferredCount };
  }

  /** Earliest not-yet-scheduled skill, ranked by its best (lowest-priority-number) outstanding outcome — keeps session sequencing stable with the pipeline's own priority ordering. */
  private pickPrimarySkill(
    items: RecommendationItemResult[],
    requiredOutcomes: LearnerOutcome[],
    outcomeToSkill: Map<string, string>,
  ): string {
    const outcomeOrder = new Map(requiredOutcomes.map((lo) => [lo.outcomeId, lo.priority]));
    const skillOrder = new Map<string, number>();
    for (const item of items) {
      const skillId = outcomeToSkill.get(item.outcomeId) ?? item.outcomeId;
      const priority = outcomeOrder.get(item.outcomeId) ?? 0;
      const best = skillOrder.get(skillId);
      if (best === undefined || priority < best) skillOrder.set(skillId, priority);
    }
    const skillIds = [...skillOrder.keys()].sort((a, b) => skillOrder.get(a)! - skillOrder.get(b)!);
    return skillIds[0]!;
  }

  /** Highest-priority outcome among a skill's own candidates, in the ranked list's own order — becomes the session's `primaryOutcomeId` FK. */
  private pickPrimaryOutcome(outcomeIds: string[], requiredOutcomes: LearnerOutcome[]): string {
    const outcomeOrder = new Map(requiredOutcomes.map((lo) => [lo.outcomeId, lo.priority]));
    const sorted = [...outcomeIds].sort(
      (a, b) => (outcomeOrder.get(a) ?? 0) - (outcomeOrder.get(b) ?? 0),
    );
    return sorted[0]!;
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
