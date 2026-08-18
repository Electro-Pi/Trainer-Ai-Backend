import { describe, expect, it } from 'vitest';

import { DurationFitService } from '@/modules/recommendations/services/duration-fit.service.js';
import { OrderingService } from '@/modules/recommendations/services/ordering.service.js';
import type { ScoredItem } from '@/modules/recommendations/services/scorer.service.js';
import { difficultyFitSignal } from '@/modules/recommendations/signals/difficulty-fit.signal.js';
import { effectivenessSignal } from '@/modules/recommendations/signals/effectiveness.signal.js';
import { gapMatchSignal } from '@/modules/recommendations/signals/gap-match.signal.js';
import { SIGNAL_WEIGHTS } from '@/modules/recommendations/signals/index.js';
import { outcomePrioritySignal } from '@/modules/recommendations/signals/outcome-priority.signal.js';
import { outcomeRelevanceSignal } from '@/modules/recommendations/signals/outcome-relevance.signal.js';
import { semanticSimilaritySignal } from '@/modules/recommendations/signals/semantic-similarity.signal.js';
import type { SignalContext } from '@/modules/recommendations/signals/signal.types.js';

// Minimal stand-ins — these signals/services are pure functions over plain
// data (P11-5's whole point: no database needed), so a partial cast is
// exactly the right amount of fixture for a unit test at this altitude.
function baseContext(overrides: Partial<SignalContext> = {}): SignalContext {
  return {
    contentItem: { id: 'content-1' } as never,
    outcomeId: 'outcome-1',
    contentOutcomes: [{ contentItemId: 'content-1', outcomeId: 'outcome-1' }],
    outcomePriority: 0,
    isCarriedOver: false,
    yearsOfExperience: null,
    weakOutcomeIds: new Set(),
    effectiveness: null,
    semanticDistance: null,
    ...overrides,
  };
}

describe('SIGNAL_WEIGHTS — §8.1 weight table sums to 1.0', () => {
  it('all six weights sum to exactly 1', () => {
    const total = Object.values(SIGNAL_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('outcomeRelevanceSignal (weight 0.30)', () => {
  it('scores 1 when the candidate is bound to exactly this one outcome', () => {
    const ctx = baseContext();
    expect(outcomeRelevanceSignal(ctx)).toBe(1);
  });

  it('scores 0.6 when the candidate is bound to several outcomes (diluted focus)', () => {
    const ctx = baseContext({
      contentOutcomes: [
        { contentItemId: 'content-1', outcomeId: 'outcome-1' },
        { contentItemId: 'content-1', outcomeId: 'outcome-2' },
      ],
    });
    expect(outcomeRelevanceSignal(ctx)).toBe(0.6);
  });

  it('scores 0 when the candidate is not bound to the target outcome at all', () => {
    const ctx = baseContext({
      contentOutcomes: [{ contentItemId: 'content-1', outcomeId: 'some-other-outcome' }],
    });
    expect(outcomeRelevanceSignal(ctx)).toBe(0);
  });
});

describe('outcomePrioritySignal (weight 0.20, RC-03)', () => {
  it('scores 1 for a carried-over outcome regardless of priority', () => {
    const ctx = baseContext({ isCarriedOver: true, outcomePriority: 9 });
    expect(outcomePrioritySignal(ctx)).toBe(1);
  });

  it('scores 1 for the highest priority (0) when not carried over', () => {
    expect(outcomePrioritySignal(baseContext({ outcomePriority: 0 }))).toBe(1);
  });

  it('decays toward 0 as priority increases, floored at 0', () => {
    expect(outcomePrioritySignal(baseContext({ outcomePriority: 10 }))).toBe(0);
    expect(outcomePrioritySignal(baseContext({ outcomePriority: 20 }))).toBe(0);
  });
});

describe('difficultyFitSignal (weight 0.15) — always neutral, ContentItem.difficulty removed from schema', () => {
  it('always scores a neutral 0.5, regardless of experience or content', () => {
    expect(difficultyFitSignal(baseContext({ yearsOfExperience: null }))).toBe(0.5);
    expect(difficultyFitSignal(baseContext({ yearsOfExperience: 1 }))).toBe(0.5);
    expect(difficultyFitSignal(baseContext({ yearsOfExperience: 7 }))).toBe(0.5);
  });
});

describe('gapMatchSignal (weight 0.15, §8.1 signal 4)', () => {
  it('scores 0 before any session has run (no weak outcomes recorded)', () => {
    expect(gapMatchSignal(baseContext({ weakOutcomeIds: new Set() }))).toBe(0);
  });

  it('scores 1 when the target outcome is a recorded weak result', () => {
    const ctx = baseContext({ outcomeId: 'outcome-1', weakOutcomeIds: new Set(['outcome-1']) });
    expect(gapMatchSignal(ctx)).toBe(1);
  });

  it('scores 0 when weak outcomes exist but do not include the target outcome', () => {
    const ctx = baseContext({ outcomeId: 'outcome-1', weakOutcomeIds: new Set(['outcome-9']) });
    expect(gapMatchSignal(ctx)).toBe(0);
  });
});

describe('effectivenessSignal (weight 0.10, RC-13)', () => {
  it('scores a neutral 0.5 when never delivered (not penalized as new)', () => {
    expect(effectivenessSignal(baseContext({ effectiveness: null }))).toBe(0.5);
    expect(
      effectivenessSignal(
        baseContext({
          effectiveness: { timesDelivered: 0, effectivenessScore: 0 } as never,
        }),
      ),
    ).toBe(0.5);
  });

  it('passes through a real effectiveness score once delivered at least once', () => {
    const ctx = baseContext({
      effectiveness: { timesDelivered: 5, effectivenessScore: 0.8 } as never,
    });
    expect(effectivenessSignal(ctx)).toBe(0.8);
  });
});

describe('semanticSimilaritySignal (weight 0.10)', () => {
  it('scores a neutral 0.5 when no embedding distance is available', () => {
    expect(semanticSimilaritySignal(baseContext({ semanticDistance: null }))).toBe(0.5);
  });

  it('scores 1 for an identical embedding (distance 0)', () => {
    expect(semanticSimilaritySignal(baseContext({ semanticDistance: 0 }))).toBe(1);
  });

  it('scores 0 for a maximally dissimilar embedding (distance 2)', () => {
    expect(semanticSimilaritySignal(baseContext({ semanticDistance: 2 }))).toBe(0);
  });
});

describe('OrderingService — prerequisite topological sort (RC-02)', () => {
  const ordering = new OrderingService();

  function scoredItem(id: string, score = 0.5): ScoredItem {
    return {
      contentItem: { id } as never,
      outcomeId: 'outcome-1',
      score,
      signalBreakdown: {} as never,
    };
  }

  it('orders a simple prerequisite chain correctly (B depends on A)', () => {
    const items = [scoredItem('B'), scoredItem('A')];
    const prerequisites = [{ contentItemId: 'B', prerequisiteContentId: 'A' } as never];
    const result = ordering.order(items, prerequisites);
    expect(result.map((i) => i.contentItem.id)).toEqual(['A', 'B']);
  });

  it('falls back to score order on a genuine cycle instead of throwing (ContentItem.difficulty removed)', () => {
    const items = [scoredItem('A', 0.3), scoredItem('B', 0.9)];
    const prerequisites = [
      { contentItemId: 'A', prerequisiteContentId: 'B' } as never,
      { contentItemId: 'B', prerequisiteContentId: 'A' } as never,
    ];
    const result = ordering.order(items, prerequisites);
    // Cycle fallback sorts by score descending, not difficulty.
    expect(result.map((i) => i.contentItem.id)).toEqual(['B', 'A']);
  });

  it('ignores a prerequisite pointing outside the current candidate set', () => {
    const items = [scoredItem('A')];
    const prerequisites = [{ contentItemId: 'A', prerequisiteContentId: 'not-in-pool' } as never];
    expect(() => ordering.order(items, prerequisites)).not.toThrow();
    expect(ordering.order(items, prerequisites).map((i) => i.contentItem.id)).toEqual(['A']);
  });
});

describe('DurationFitService — greedy fit to session length (RC-04)', () => {
  const durationFit = new DurationFitService();

  // ContentItem.estimatedMinutes was removed from the schema — every item now
  // costs a flat ASSUMED_CONTENT_MINUTES (15) for bin-packing purposes.
  function scoredItem(id: string): ScoredItem {
    return {
      contentItem: { id } as never,
      outcomeId: 'outcome-1',
      score: 0.5,
      signalBreakdown: {} as never,
    };
  }

  it('fits items while the budget allows, defers the rest, and preserves order', () => {
    const items = [scoredItem('A'), scoredItem('B'), scoredItem('C')];
    const result = durationFit.fit(items, 30);
    expect(result.fitted.map((i) => i.contentItem.id)).toEqual(['A', 'B']);
    expect(result.deferred.map((i) => i.contentItem.id)).toEqual(['C']);
  });

  it('does not re-sort — prerequisite order from OrderingService survives', () => {
    const items = [scoredItem('first'), scoredItem('second'), scoredItem('third')];
    const result = durationFit.fit(items, 15);
    expect(result.fitted.map((i) => i.contentItem.id)).toEqual(['first']);
    expect(result.deferred.map((i) => i.contentItem.id)).toEqual(['second', 'third']);
  });

  it('no items fit when the budget is smaller than one item', () => {
    const items = [scoredItem('A')];
    const result = durationFit.fit(items, 5);
    expect(result.fitted).toHaveLength(0);
    expect(result.deferred.map((i) => i.contentItem.id)).toEqual(['A']);
  });
});
