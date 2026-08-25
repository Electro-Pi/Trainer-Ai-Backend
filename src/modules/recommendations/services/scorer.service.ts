import { VectorService } from '@/ai/vector.service.js';
import type { ContentItem } from '@/modules/content/content.module.js';
import type { Outcome } from '@/modules/outcomes/outcomes.module.js';

import { ContentEffectivenessRepository } from '../repositories/content-effectiveness.repository.js';
import {
  SIGNAL_FNS,
  SIGNAL_WEIGHTS,
  type SignalContext,
  type SignalName,
} from '../signals/index.js';

export interface ScoredItem {
  contentItem: ContentItem;
  outcomeId: string;
  score: number;
  signalBreakdown: Record<SignalName, number>;
}

export interface ScorerInput {
  candidates: ContentItem[];
  boundOutcomesByContent: Map<string, string[]>;
  outcomesById: Map<string, Outcome>;
  outcomePriorityByOutcomeId: Map<string, { priority: number; isCarriedOver: boolean }>;
  yearsOfExperience: number | null;
  weakOutcomeIds: ReadonlySet<string>;
}

/**
 * `P6-3` — ARCHITECTURE §8.1 step 3: runs all six signals for every
 * (candidate, required-outcome) pair the candidate is bound to, combines
 * them by the fixed weight table, and keeps the full per-signal breakdown
 * for `RecommendationItem.signalBreakdown` (`RC-05`). One candidate can
 * score against more than one outcome if it's bound to several — the caller
 * picks the best (candidate, outcome) pairing per outcome.
 */
export class ScorerService {
  private readonly effectiveness = new ContentEffectivenessRepository();
  private readonly vector = new VectorService();

  async score(input: ScorerInput): Promise<ScoredItem[]> {
    const semanticDistanceByOutcome = await this.resolveSemanticDistances(input);
    const effectivenessByKey = await this.resolveEffectiveness(input.candidates);
    const results: ScoredItem[] = [];

    for (const contentItem of input.candidates) {
      const boundOutcomeIds = input.boundOutcomesByContent.get(contentItem.id) ?? [];

      for (const outcomeId of boundOutcomeIds) {
        const priorityInfo = input.outcomePriorityByOutcomeId.get(outcomeId);
        const outcomeSkillId = input.outcomesById.get(outcomeId)?.skillId;
        if (!priorityInfo || !outcomeSkillId) continue;

        const effectiveness = effectivenessByKey.get(`${contentItem.id}:${outcomeId}`) ?? null;

        const context: SignalContext = {
          contentItem,
          outcomeId,
          outcomeSkillId,
          outcomePriority: priorityInfo.priority,
          isCarriedOver: priorityInfo.isCarriedOver,
          yearsOfExperience: input.yearsOfExperience,
          weakOutcomeIds: input.weakOutcomeIds,
          effectiveness,
          semanticDistance: semanticDistanceByOutcome.get(outcomeId)?.get(contentItem.id) ?? null,
        };

        results.push(this.scoreOne(context));
      }
    }

    return results;
  }

  private scoreOne(context: SignalContext): ScoredItem {
    const signalBreakdown = {} as Record<SignalName, number>;
    let score = 0;

    for (const [name, fn] of Object.entries(SIGNAL_FNS) as [
      SignalName,
      (typeof SIGNAL_FNS)[SignalName],
    ][]) {
      const value = fn(context);
      signalBreakdown[name] = value;
      score += value * SIGNAL_WEIGHTS[name];
    }

    return {
      contentItem: context.contentItem,
      outcomeId: context.outcomeId,
      score,
      signalBreakdown,
    };
  }

  /**
   * One embedding + nearest-neighbor query per required outcome (not per
   * candidate) — embeds the outcome's own title as the query text,
   * restricted to this pool's candidate ids, then keeps each candidate's
   * closest chunk distance.
   */
  private async resolveSemanticDistances(
    input: ScorerInput,
  ): Promise<Map<string, Map<string, number>>> {
    const contentItemIds = input.candidates.map((c) => c.id);
    const result = new Map<string, Map<string, number>>();

    for (const outcome of input.outcomesById.values()) {
      const matches = await this.vector.embedAndFindNearest(outcome.titleEn, {
        contentItemIds,
        limit: contentItemIds.length,
      });

      const byContentItem = new Map<string, number>();
      for (const match of matches) {
        const existing = byContentItem.get(match.contentItemId);
        if (existing === undefined || match.distance < existing) {
          byContentItem.set(match.contentItemId, match.distance);
        }
      }
      result.set(outcome.id, byContentItem);
    }

    return result;
  }

  /** One batched query for the whole candidate pool instead of one per (candidate, outcome) pair. */
  private async resolveEffectiveness(
    candidates: ContentItem[],
  ): Promise<Map<string, SignalContext['effectiveness']>> {
    const rows = await this.effectiveness.findByContentItems(candidates.map((c) => c.id));
    const byKey = new Map<string, SignalContext['effectiveness']>();
    for (const row of rows) {
      byKey.set(`${row.contentItemId}:${row.outcomeId}`, row);
    }
    return byKey;
  }
}
